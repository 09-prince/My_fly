"""T-Rex runner as a gymnasium environment.

Pure numpy, no window, so it runs fast enough for evolution strategies.
The observation is a grayscale frame: this is what the fly's visual
neurons will eventually see. Nothing here knows about the fly.

    env = TRexEnv()
    obs, info = env.reset(seed=0)
    obs, reward, terminated, truncated, info = env.step(1)
"""

import gymnasium as gym
import numpy as np
from gymnasium import spaces

# World is measured in the same units as the observation width, so the
# rendering below is a straight copy rather than a scaling.
WORLD_W = 64.0
WORLD_H = 16.0

DINO_X = 8.0
DINO_W = 3.0
DINO_H = 4.0

# Tuned so that the time spent above the tallest obstacle always exceeds
# the time an obstacle takes to pass the dino, even at the slowest speed.
# Without that margin the dino clips the trailing edge on the way down.
GRAVITY = 0.139
JUMP_V = 1.67

SPEED_START = 0.55
SPEED_MAX = 1.10
SPEED_RAMP = 0.00008


class TRexEnv(gym.Env):
    metadata = {"render_modes": ["ansi", "rgb_array"]}

    def __init__(self, height=16, width=64, max_steps=3000, render_mode=None):
        super().__init__()

        self.height = height
        self.width = width
        self.max_steps = max_steps
        self.render_mode = render_mode

        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=(height, width),
            dtype=np.float32,
        )

        # 0 = do nothing, 1 = jump
        self.action_space = spaces.Discrete(2)

    # ----------------------------------------------------------------
    # episode control
    # ----------------------------------------------------------------

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        self.y = 0.0
        self.vy = 0.0
        self.speed = SPEED_START
        self.steps = 0

        # (x, width, height)
        self.obstacles = []
        self._spawn(at=WORLD_W)

        return self._observe(), self._info()

    def step(self, action):
        self.steps += 1

        # Jumping is only possible from the ground.
        if action == 1 and self.y <= 0.0:
            self.vy = JUMP_V

        self.y += self.vy
        self.vy -= GRAVITY

        if self.y < 0.0:
            self.y = 0.0
            self.vy = 0.0

        self.speed = min(SPEED_MAX, self.speed + SPEED_RAMP)

        for ob in self.obstacles:
            ob[0] -= self.speed

        self.obstacles = [ob for ob in self.obstacles if ob[0] + ob[1] > 0.0]

        # Keep one obstacle ahead at all times.
        last_x = max((ob[0] for ob in self.obstacles), default=0.0)
        if last_x < WORLD_W:
            self._spawn(at=WORLD_W + self._gap())

        terminated = self._collided()
        truncated = self.steps >= self.max_steps

        return self._observe(), 1.0, terminated, truncated, self._info()

    # ----------------------------------------------------------------
    # world
    # ----------------------------------------------------------------

    def _gap(self):
        """Spacing between obstacles.

        The floor is what a single jump covers at top speed, so the game
        always stays winnable however fast it gets.
        """
        jump_steps = 2.0 * JUMP_V / GRAVITY
        reach = jump_steps * SPEED_MAX

        return reach * self.np_random.uniform(1.25, 2.4)

    def _spawn(self, at):
        w = float(self.np_random.integers(2, 4))
        h = float(self.np_random.integers(3, 6))

        self.obstacles.append([float(at), w, h])

    def _collided(self):
        for x, w, h in self.obstacles:
            overlap_x = x < DINO_X + DINO_W and x + w > DINO_X
            overlap_y = self.y < h

            if overlap_x and overlap_y:
                return True

        return False

    # ----------------------------------------------------------------
    # observation
    # ----------------------------------------------------------------

    def _observe(self):
        """Bright shapes on a dark background, origin at bottom-left."""

        frame = np.zeros((self.height, self.width), dtype=np.float32)

        sx = self.width / WORLD_W
        sy = self.height / WORLD_H

        def draw(x, w, y, h, value):
            c0 = int(np.floor(x * sx))
            c1 = int(np.ceil((x + w) * sx))
            r0 = int(np.floor(y * sy))
            r1 = int(np.ceil((y + h) * sy))

            c0, c1 = max(0, c0), min(self.width, c1)
            r0, r1 = max(0, r0), min(self.height, r1)

            if c1 > c0 and r1 > r0:
                # Rows are flipped so row 0 is the top of the image.
                frame[self.height - r1:self.height - r0, c0:c1] = value

        for x, w, h in self.obstacles:
            draw(x, w, 0.0, h, 1.0)

        draw(DINO_X, DINO_W, self.y, DINO_H, 0.6)

        return frame

    def _info(self):
        ahead = [ob for ob in self.obstacles if ob[0] + ob[1] > DINO_X]

        if ahead:
            x, w, h = min(ahead, key=lambda ob: ob[0])
            dist = x - (DINO_X + DINO_W)
        else:
            dist, w, h = WORLD_W, 0.0, 0.0

        return {
            "dist": float(dist),
            "obstacle_w": float(w),
            "obstacle_h": float(h),
            "speed": float(self.speed),
            "dino_y": float(self.y),
            "steps": self.steps,
        }

    # ----------------------------------------------------------------
    # rendering
    # ----------------------------------------------------------------

    def render(self):
        """Text art for the terminal, or the raw frame for an animation."""

        frame = self._observe()

        if self.render_mode == "rgb_array":
            return (frame * 255).astype(np.uint8)

        chars = np.full(frame.shape, " ", dtype="<U1")
        chars[frame > 0.8] = "#"
        chars[(frame > 0.3) & (frame <= 0.8)] = "T"

        rows = ["|" + "".join(row) + "|" for row in chars]
        rows.append("+" + "-" * self.width + "+")

        return "\n".join(rows)
