"""Bear Attack - Bruno the bear sneaks up on people in his territory.

Controls:
  Arrow keys / WASD   move
  Ctrl (hold)         sneak - slow and silent
  Shift (hold)        run - fast but loud
  Space               pounce
  R                   restart level
  Esc / Q             quit
"""

from __future__ import annotations

import sys

import pygame

from .actors import Gait, Vec
from .draw import draw_card, draw_scene, make_background
from .level import HEIGHT, LEVELS, WIDTH

FPS = 60


def read_input() -> tuple[Vec, Gait]:
    keys = pygame.key.get_pressed()
    move = Vec(
        (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a]),
        (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w]),
    )
    mods = pygame.key.get_mods()
    if mods & pygame.KMOD_CTRL:
        gait = Gait.SNEAK
    elif mods & pygame.KMOD_SHIFT:
        gait = Gait.RUN
    else:
        gait = Gait.WALK
    return move, gait


def main() -> None:
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Bear Attack")
    clock = pygame.time.Clock()
    fonts = {
        "small": pygame.font.Font(None, 26),
        "medium": pygame.font.Font(None, 36),
        "big": pygame.font.Font(None, 84),
    }
    background = make_background((WIDTH, HEIGHT))

    level_index = 0
    level = LEVELS[level_index]()
    mode = "intro"
    t = 0.0

    running = True
    while running:
        dt = min(clock.tick(FPS) / 1000, 0.05)
        t += dt
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    running = False
                elif mode == "playing" and event.key == pygame.K_SPACE:
                    level.bruno.pounce()
                elif event.key == pygame.K_r:
                    level = LEVELS[level_index]()
                    mode = "playing"
                elif mode != "playing" and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    if mode == "won":
                        level_index = (level_index + 1) % len(LEVELS)
                    level = LEVELS[level_index]()
                    mode = "playing"

        if mode == "playing":
            level.update(dt, *read_input())
            outcome = level.outcome
            if outcome is not None:
                mode = outcome

        draw_scene(screen, background, level, t, fonts)
        if mode == "intro":
            draw_card(screen, fonts, f"Level {level.number}: {level.title}", level.intro, "Press Space to start")
        elif mode == "won":
            draw_card(screen, fonts, "Mmm! Delicious.", "Bruno licks his lips. Level complete!", "Press Enter to continue")
        elif mode == "escaped":
            draw_card(screen, fonts, "They got away!", "Somebody spotted Bruno and ran off. Try again!", "Press Enter to restart the level")
        pygame.display.flip()

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()
