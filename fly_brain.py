"""Run the fly's escape circuit as leaky integrate-and-fire neurons.

Every weight and sign here comes from the connectome. What is invented is
the front end: we skip the optic lobe and compute the looming signals it
would deliver straight from the game frame.

LC4 and LPLC2 are looming detectors. The Giant Fiber combines angular
size with angular velocity, so:

    LPLC2  <-  theta        how big the obstacle looks
    LC4    <-  d(theta)/dt  how fast it is growing

Only the frame is read. The env's `info` (true distance) is never used.

    python fly_brain.py          # score the fly against random and scripted
"""

import json
from pathlib import Path

import numpy as np

from trex_env import DINO_W, DINO_X, WORLD_W, TRexEnv

DINO_FRONT = DINO_X + DINO_W

CIRCUIT = Path(__file__).parent / "circuit.json"


class FlyBrain:
    def __init__(self, params=None, path=CIRCUIT):
        data = json.loads(Path(path).read_text())

        self.nodes = data["nodes"]
        self.n = len(self.nodes)

        p = dict(
            theta_gain=0.30,   # theta      -> fraction of LPLC2 recruited
            dtheta_gain=4.0,   # d(theta)dt -> fraction of LC4 recruited
            drive=1.6,         # current delivered to a recruited neuron
            tau=0.72,          # membrane leak per step
            threshold=1.0,     # spike threshold
            w_scale=0.0005,     # synapse weight -> current
            inhibition=2.6,    # extra strength for GABA/glutamate
            jump_rate=0.50,    # DNp01 firing rate that triggers a jump
            rate_tau=0.55,     # smoothing of that firing rate
            smooth=0.6,        # EMA on d(theta)/dt, columns are integers
        )
        p.update(params or {})
        self.p = p

        # Signed weight matrix, straight from the connectome.
        W = np.zeros((self.n, self.n), dtype=np.float32)
        sign = np.array([nd["sign"] for nd in self.nodes], dtype=np.float32)

        for src, dst, w in data["edges"]:
            s = sign[src]
            if s < 0:
                s *= p["inhibition"]
            W[src, dst] += w * s

        self.W = W * p["w_scale"]

        self.is_input = np.array([nd["role"] == "input" for nd in self.nodes])
        self.is_output = np.array([nd["role"] == "output" for nd in self.nodes])

        self._build_retina()
        self.reset()

    def _build_retina(self):
        """Split the input neurons into the two looming channels.

        LC4 and LPLC2 have no retinotopic coordinates in this dataset, so
        there is no meaningful way to give each one a patch of the visual
        field. Instead the signal sets how many of them fire: a bigger,
        faster-growing obstacle recruits more detectors. The order is
        fixed and seeded so a run is reproducible.
        """
        types = np.array([nd["type"] for nd in self.nodes])

        rng = np.random.default_rng(0)

        self.lc4 = np.where(self.is_input & (types == "LC4"))[0]
        self.lplc2 = np.where(self.is_input & (types == "LPLC2"))[0]

        rng.shuffle(self.lc4)
        rng.shuffle(self.lplc2)

        self.n_input = len(self.lc4) + len(self.lplc2)

    def reset(self):
        self.v = np.zeros(self.n, dtype=np.float32)
        self.spikes = np.zeros(self.n, dtype=np.float32)
        self.rate = 0.0
        self.theta = 0.0
        self.dtheta = 0.0

    def look(self, frame):
        """Angular size and growth rate of the nearest obstacle ahead."""

        bright = frame > 0.8                      # obstacles only, not the dino
        height, width = frame.shape

        cols = bright.sum(axis=0)                 # obstacle height per column

        dino_front = int(DINO_FRONT / WORLD_W * width)

        ahead = np.where(cols[dino_front:] > 0)[0]

        if len(ahead) == 0:
            theta = 0.0
        else:
            col = dino_front + ahead[0]
            h = float(cols[col])
            d = max(float(col - dino_front), 0.5)

            theta = h / d

        raw = theta - self.theta

        self.dtheta = self.dtheta * self.p["smooth"] + raw * (1 - self.p["smooth"])
        self.theta = theta

        return self.theta, self.dtheta

    def step(self, frame):
        p = self.p

        # --- looming front-end -> recruited detectors -----------------
        theta, dtheta = self.look(frame)

        drive = np.zeros(self.n, dtype=np.float32)

        def recruit(pool, signal, gain):
            k = int(np.clip(signal * gain, 0.0, 1.0) * len(pool))
            if k:
                drive[pool[:k]] = p["drive"]

        recruit(self.lplc2, theta, p["theta_gain"])
        recruit(self.lc4, max(dtheta, 0.0), p["dtheta_gain"])

        # --- LIF update ----------------------------------------------
        recurrent = self.spikes @ self.W

        self.v = self.v * p["tau"] + drive + recurrent

        self.spikes = (self.v >= p["threshold"]).astype(np.float32)
        self.v[self.spikes > 0] = 0.0
        self.v = np.maximum(self.v, -2.0)

        # --- read out the Giant Fiber --------------------------------
        out = self.spikes[self.is_output].mean()
        self.rate = self.rate * p["rate_tau"] + out * (1 - p["rate_tau"])

        return self.rate

    def act(self, frame):
        return 1 if self.step(frame) >= self.p["jump_rate"] else 0


# --------------------------------------------------------------------
# scoring
# --------------------------------------------------------------------


def evaluate(policy, seeds=range(20), reset=None):
    scores = []

    for s in seeds:
        env = TRexEnv()
        obs, info = env.reset(seed=s)

        if reset:
            reset()

        steps = 0

        while True:
            obs, reward, terminated, truncated, info = env.step(policy(obs, info))
            steps += 1

            if terminated or truncated:
                break

        scores.append(steps)

    return np.array(scores)


if __name__ == "__main__":
    rng = np.random.default_rng(0)

    random_score = evaluate(lambda o, i: int(rng.random() < 0.05))
    scripted = evaluate(lambda o, i: 1 if i["dist"] < 8 * i["speed"] else 0)

    fly = FlyBrain()
    fly_score = evaluate(lambda o, i: fly.act(o), reset=fly.reset)

    print(f"neurons {fly.n}, LC inputs {fly.n_input}")
    print()
    print(f"random    {random_score.mean():8.1f}")
    print(f"fly       {fly_score.mean():8.1f}   min {fly_score.min()}  solved {(fly_score >= 3000).sum()}/20")
    print(f"scripted  {scripted.mean():8.1f}")
