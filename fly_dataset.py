"""Download and load the full male-CNS fly connectome dataset.

Two files make up the dataset:

    connectome-weights-...feather   every synaptic connection (body_pre, body_post, weight)
    body-annotations-...feather     every neuron's annotations (bodyId, instance, type, ...)

Run this file directly to download whatever is missing:

    python fly_dataset.py

Then use it from your own scripts:

    from fly_dataset import load_edges, load_neurons

    edges = load_edges()
    neurons = load_neurons()
"""

from pathlib import Path

import pandas as pd
import requests

BASE_URL = (
    "https://storage.googleapis.com/flyem-male-cns/v1.0"
    "/connectome-data/flat-connectome"
)

DATA_DIR = Path(__file__).parent / "data"

EDGES_FILE = "connectome-weights-male-cns-v1.0-minconf-0.5.feather"
NEURONS_FILE = "body-annotations-male-cns-v1.0-minconf-0.5.feather"


def download(filename):
    """Fetch filename into data/ unless it is already there."""

    target = DATA_DIR / filename

    if target.exists():
        print(f"Already have {filename}")
        return target

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Write to .part first so an interrupted download can never be
    # mistaken for a complete file.
    partial = target.with_suffix(target.suffix + ".part")

    print(f"Downloading {filename} ...")

    response = requests.get(f"{BASE_URL}/{filename}", stream=True)
    response.raise_for_status()

    with open(partial, "wb") as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)

    partial.replace(target)

    print(f"Saved {target}")

    return target


def load_edges():
    """All connections in the dataset: body_pre, body_post, weight."""
    return pd.read_feather(download(EDGES_FILE))


def load_neurons():
    """Annotations for every neuron: bodyId, instance, type, superclass, ..."""
    return pd.read_feather(download(NEURONS_FILE))


if __name__ == "__main__":
    download(NEURONS_FILE)
    download(EDGES_FILE)
    print("\nDataset ready in", DATA_DIR.resolve())
