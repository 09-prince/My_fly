"""Watch the T-Rex environment play, to check what the fly will see.

    python watch.py            # scripted agent, in the terminal
    python watch.py --window   # same, in a matplotlib window
"""

import argparse
import os
import time

from trex_env import TRexEnv


def scripted(info):
    return 1 if info["dist"] < 8.0 * info["speed"] else 0


def run_terminal(seed, steps, fps):
    env = TRexEnv(render_mode="ansi")
    obs, info = env.reset(seed=seed)

    for _ in range(steps):
        obs, reward, terminated, truncated, info = env.step(scripted(info))

        os.system("cls" if os.name == "nt" else "clear")
        print(env.render())
        print(f"step {info['steps']}  speed {info['speed']:.2f}  dist {info['dist']:.1f}")

        time.sleep(1.0 / fps)

        if terminated or truncated:
            print("crashed" if terminated else "survived")
            break


def run_window(seed, steps, fps):
    import matplotlib.pyplot as plt

    env = TRexEnv(render_mode="rgb_array")
    obs, info = env.reset(seed=seed)

    fig, ax = plt.subplots(figsize=(10, 3))
    im = ax.imshow(obs, cmap="gray", vmin=0, vmax=1, interpolation="nearest")
    ax.axis("off")

    for _ in range(steps):
        obs, reward, terminated, truncated, info = env.step(scripted(info))

        im.set_data(obs)
        ax.set_title(f"step {info['steps']}   dist {info['dist']:.1f}")

        plt.pause(1.0 / fps)

        if terminated or truncated:
            break

    plt.show()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", action="store_true")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--steps", type=int, default=400)
    parser.add_argument("--fps", type=int, default=30)

    args = parser.parse_args()

    if args.window:
        run_window(args.seed, args.steps, args.fps)
    else:
        run_terminal(args.seed, args.steps, args.fps)
