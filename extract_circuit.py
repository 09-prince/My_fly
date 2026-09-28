"""Pull the looming-escape circuit out of the full connectome.

The fly's real answer to "something is rushing at me" is:

    LC4 + LPLC2  (looming detectors)  ->  interneurons  ->  DNp01 (Giant Fiber)

DNp01 firing is what makes a fly jump. That is the same decision the
T-Rex has to make, so this circuit is the one we wire to the game.

The 152M-edge file is streamed batch by batch; it never goes into pandas
whole.

    python extract_circuit.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.ipc as ipc

DATA = Path(__file__).parent / "data"
OUT = Path(__file__).parent / "circuit.json"

EDGES = DATA / "connectome-weights-male-cns-v1.0-minconf-0.5.feather"
ANNOT = DATA / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
NT = DATA / "body-neurotransmitters-male-cns-v1.0.feather"

INPUT_TYPES = ["LC4", "LPLC2"]
OUTPUT_TYPE = "DNp01"

# Minimum synapse count for an edge to be kept.
MIN_WEIGHT = 5

# An interneuron must be this strongly connected on both sides to count
# as part of the pathway.
MIN_TO_OUTPUT = 5
MIN_FROM_INPUT = 5

# Acetylcholine excites; GABA and glutamate inhibit. This is the standard
# sign convention used by whole-brain fly models.
NT_SIGN = {
    "acetylcholine": 1.0,
    "gaba": -1.0,
    "glutamate": -1.0,
    "serotonin": 0.0,
    "dopamine": 0.0,
    "octopamine": 0.0,
    "histamine": -1.0,
    "unclear": 0.0,
}


def scan_edges(keep):
    """Stream the edge file, yielding the batches that survive `keep`."""

    reader = ipc.open_file(EDGES)

    for i in range(reader.num_record_batches):
        batch = reader.get_batch(i)

        mask = keep(batch)
        filtered = batch.filter(mask)

        if filtered.num_rows:
            yield filtered.to_pandas()


def main():
    print("Loading annotations...")

    neurons = pd.read_feather(ANNOT)
    traced = neurons[neurons["status"] == "Traced"]

    inputs = traced[traced["type"].isin(INPUT_TYPES)]
    outputs = traced[traced["type"] == OUTPUT_TYPE]

    input_ids = set(inputs["bodyId"])
    output_ids = set(outputs["bodyId"])

    print(f"  inputs  : {len(input_ids)} ({', '.join(INPUT_TYPES)})")
    print(f"  output  : {len(output_ids)} ({OUTPUT_TYPE})")

    # ----------------------------------------------------------------
    # Pass 1: everything leaving the inputs, everything entering DNp01
    # ----------------------------------------------------------------

    print("\nPass 1 of 2: scanning 152M edges...")

    in_arr = pa.array(sorted(input_ids), type=pa.int64())
    out_arr = pa.array(sorted(output_ids), type=pa.int64())

    def touches_circuit(batch):
        heavy = pc.greater_equal(batch["weight"], MIN_WEIGHT)

        from_input = pc.is_in(batch["body_pre"], value_set=in_arr)
        to_output = pc.is_in(batch["body_post"], value_set=out_arr)

        return pc.and_(heavy, pc.or_(from_input, to_output))

    touching = pd.concat(scan_edges(touches_circuit), ignore_index=True)

    print(f"  edges touching the circuit: {len(touching)}")

    # ----------------------------------------------------------------
    # Interneurons: strongly driven by the inputs AND driving DNp01
    # ----------------------------------------------------------------

    driven = touching[touching["body_pre"].isin(input_ids)]
    driving = touching[touching["body_post"].isin(output_ids)]

    from_input = driven.groupby("body_post")["weight"].sum()
    to_output = driving.groupby("body_pre")["weight"].sum()

    candidates = (
        set(from_input[from_input >= MIN_FROM_INPUT].index)
        & set(to_output[to_output >= MIN_TO_OUTPUT].index)
    )

    traced_ids = set(traced["bodyId"])

    interneurons = (candidates & traced_ids) - input_ids - output_ids

    print(f"  interneurons on the pathway: {len(interneurons)}")

    nodes = sorted(input_ids | interneurons | output_ids)

    print(f"  total neurons in circuit   : {len(nodes)}")

    # ----------------------------------------------------------------
    # Pass 2: every edge inside the circuit
    # ----------------------------------------------------------------

    print("\nPass 2 of 2: collecting internal edges...")

    node_arr = pa.array(nodes, type=pa.int64())

    def inside_circuit(batch):
        heavy = pc.greater_equal(batch["weight"], MIN_WEIGHT)

        pre_in = pc.is_in(batch["body_pre"], value_set=node_arr)
        post_in = pc.is_in(batch["body_post"], value_set=node_arr)

        return pc.and_(heavy, pc.and_(pre_in, post_in))

    edges = pd.concat(scan_edges(inside_circuit), ignore_index=True)

    print(f"  internal edges: {len(edges)}")

    # ----------------------------------------------------------------
    # Attach metadata
    # ----------------------------------------------------------------

    print("\nAttaching types, neurotransmitters and soma positions...")

    meta = neurons[neurons["bodyId"].isin(nodes)].set_index("bodyId")

    nt = pd.read_feather(NT).set_index("body")["consensus_nt"]

    index = {body: i for i, body in enumerate(nodes)}

    out_nodes = []

    for body in nodes:
        row = meta.loc[body]

        ntype = str(nt.get(body, "unclear")).lower()
        soma = row["somaLocation"]

        if body in input_ids:
            role = "input"
        elif body in output_ids:
            role = "output"
        else:
            role = "inter"

        out_nodes.append(
            {
                "id": int(body),
                "type": str(row["type"]),
                "side": str(row["somaSide"]),
                "role": role,
                "nt": ntype,
                "sign": NT_SIGN.get(ntype, 0.0),
                "pos": [int(v) for v in soma] if soma is not None else None,
            }
        )

    out_edges = [
        [index[int(r.body_pre)], index[int(r.body_post)], int(r.weight)]
        for r in edges.itertuples()
    ]

    payload = {
        "meta": {
            "dataset": "male-cns:v1.0",
            "input_types": INPUT_TYPES,
            "output_type": OUTPUT_TYPE,
            "min_weight": MIN_WEIGHT,
        },
        "nodes": out_nodes,
        "edges": out_edges,
    }

    OUT.write_text(json.dumps(payload, separators=(",", ":")))

    print(f"\nSaved {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)")

    signs = pd.Series([n["nt"] for n in out_nodes]).value_counts()
    print("\nNeurotransmitters:")
    print(signs.to_string())


if __name__ == "__main__":
    main()
