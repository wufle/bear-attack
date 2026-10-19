"""Drawing: the meadow, Bruno, people, and the HUD."""

from __future__ import annotations

import math
import random

import pygame

from .actors import BearState, Blocker, Bruno, Gait, Person, PersonState, Vec
from .level import Level

GRASS = (98, 156, 72)
GRASS_DARK = (82, 138, 62)
BUSH = (44, 104, 52)
BUSH_LIGHT = (66, 132, 68)
TRUNK = (110, 78, 48)
CANOPY = (52, 116, 58)
CANOPY_LIGHT = (70, 140, 72)
FUR = (126, 80, 44)
FUR_DARK = (88, 54, 28)
SNOUT = (200, 156, 108)
TONGUE = (236, 110, 132)
SKIN = (246, 204, 170)
TEXT = (252, 248, 236)
INK = (30, 26, 22)
CONE_COLORS = {
    PersonState.WANDER: (255, 245, 160, 55),
    PersonState.INVESTIGATE: (255, 170, 60, 85),
    PersonState.FLEE: (255, 70, 60, 70),
}


def make_background(size: tuple[int, int], seed: int = 1) -> pygame.Surface:
    rng = random.Random(seed)
    surf = pygame.Surface(size)
    surf.fill(GRASS)
    for _ in range(900):
        x, y = rng.randrange(size[0]), rng.randrange(size[1])
        pygame.draw.line(surf, GRASS_DARK, (x, y), (x + rng.randint(-2, 2), y - rng.randint(4, 8)), 2)
    for _ in range(70):
        x, y = rng.randrange(size[0]), rng.randrange(size[1])
        color = rng.choice([(255, 255, 255), (255, 220, 80), (240, 140, 200)])
        pygame.draw.circle(surf, color, (x, y), 3)
    return surf


def draw_blanket(surf: pygame.Surface, rect: pygame.Rect) -> None:
    square = 16
    for i, x in enumerate(range(rect.left, rect.right, square)):
        for j, y in enumerate(range(rect.top, rect.bottom, square)):
            color = (220, 60, 60) if (i + j) % 2 else (250, 245, 240)
            pygame.draw.rect(surf, color, (x, y, min(square, rect.right - x), min(square, rect.bottom - y)))
    pygame.draw.rect(surf, (180, 40, 40), rect, 2)


def draw_cones(surf: pygame.Surface, people: list[Person]) -> None:
    overlay = pygame.Surface(surf.get_size(), pygame.SRCALPHA)
    for p in people:
        color = CONE_COLORS.get(p.state)
        if color is None:
            continue
        points = [p.pos]
        steps = 18
        for i in range(steps + 1):
            a = p.angle - p.view_angle / 2 + p.view_angle * i / steps
            points.append(p.pos + Vec(math.cos(a), math.sin(a)) * p.view_distance)
        pygame.draw.polygon(overlay, color, points)
    surf.blit(overlay, (0, 0))


def draw_trunks(surf: pygame.Surface, blockers: list[Blocker]) -> None:
    for b in blockers:
        if b.solid:
            pygame.draw.circle(surf, TRUNK, b.pos, b.solid)


def draw_bush(surf: pygame.Surface, b: Blocker, see_through: bool) -> None:
    r = int(b.radius)
    layer = pygame.Surface((r * 2 + 8, r * 2 + 8), pygame.SRCALPHA)
    c = Vec(r + 4, r + 4)
    for dx, dy, k in [(-0.4, -0.2, 0.65), (0.4, -0.3, 0.6), (0.3, 0.35, 0.62), (-0.35, 0.35, 0.6), (0, 0, 0.7)]:
        pygame.draw.circle(layer, BUSH, c + Vec(dx, dy) * r, r * k)
    for dx, dy in [(-0.3, -0.35), (0.25, -0.15), (-0.05, 0.25)]:
        pygame.draw.circle(layer, BUSH_LIGHT, c + Vec(dx, dy) * r, r * 0.22)
    if see_through:
        layer.set_alpha(150)
    surf.blit(layer, b.pos - c)


def draw_canopy(surf: pygame.Surface, b: Blocker) -> None:
    r = int(b.radius)
    layer = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
    pygame.draw.circle(layer, CANOPY, (r, r), r)
    pygame.draw.circle(layer, CANOPY_LIGHT, (r - r // 4, r - r // 4), r // 2)
    layer.set_alpha(225)
    surf.blit(layer, b.pos - Vec(r, r))


def draw_person(surf: pygame.Surface, p: Person) -> None:
    if p.state in (PersonState.CAUGHT, PersonState.EATEN, PersonState.ESCAPED):
        return
    f = p.facing
    side = Vec(-f.y, f.x)
    pygame.draw.circle(surf, SKIN, p.pos + side * p.radius * 0.9, p.radius * 0.35)
    pygame.draw.circle(surf, SKIN, p.pos - side * p.radius * 0.9, p.radius * 0.35)
    pygame.draw.circle(surf, INK, p.pos, p.radius + 2)
    pygame.draw.circle(surf, p.shirt, p.pos, p.radius)
    pygame.draw.circle(surf, SKIN, p.pos + f * 2, p.radius * 0.6)
    pygame.draw.circle(surf, p.hair, p.pos - f * 2, p.radius * 0.55)


def draw_meter(surf: pygame.Surface, p: Person, font: pygame.font.Font) -> None:
    if not p.catchable:
        return
    top = p.pos - Vec(0, p.radius + 14)
    if p.state is PersonState.FLEE:
        icon, color = "!", (255, 70, 60)
    elif p.state is PersonState.INVESTIGATE:
        icon, color = "?", (255, 170, 60)
    else:
        icon, color = None, (255, 245, 160)
    if p.suspicion > 0.02 and p.state is not PersonState.FLEE:
        bar = pygame.Rect(0, 0, 34, 6)
        bar.center = (int(top.x), int(top.y))
        pygame.draw.rect(surf, INK, bar.inflate(2, 2))
        pygame.draw.rect(surf, color, (bar.x, bar.y, int(bar.w * p.suspicion), bar.h))
    if icon:
        text = font.render(icon, True, color)
        surf.blit(text, text.get_rect(midbottom=(top.x, top.y - 6)))


def draw_speech(surf: pygame.Surface, p: Person, font: pygame.font.Font) -> None:
    if p.speech_timer <= 0 or p.state in (PersonState.EATEN, PersonState.ESCAPED, PersonState.CAUGHT):
        return
    text = font.render(p.speech, True, INK)
    box = text.get_rect().inflate(16, 10)
    box.midbottom = (int(p.pos.x), int(p.pos.y - p.radius - 40))
    box.clamp_ip(surf.get_rect())
    pygame.draw.rect(surf, (255, 255, 255), box, border_radius=8)
    pygame.draw.rect(surf, INK, box, 2, border_radius=8)
    surf.blit(text, text.get_rect(center=box.center))


def draw_noise(surf: pygame.Surface, bruno: Bruno) -> None:
    r = bruno.noise_radius
    if r <= 0:
        return
    overlay = pygame.Surface(surf.get_size(), pygame.SRCALPHA)
    pygame.draw.circle(overlay, (255, 255, 255, 45), bruno.pos, r, 2)
    surf.blit(overlay, (0, 0))


def draw_bruno(surf: pygame.Surface, bruno: Bruno, t: float, font: pygame.font.Font) -> None:
    if bruno.state is BearState.TUSSLING:
        return  # drawn on top of the bushes by draw_scene
    f = bruno.facing
    side = Vec(-f.y, f.x)
    pos = bruno.pos
    r = bruno.RADIUS
    for s in (1, -1):
        pygame.draw.circle(surf, FUR_DARK, pos + f * 8 + side * s * 17, 9)
    pygame.draw.circle(surf, FUR, pos, r)
    pygame.draw.circle(surf, SNOUT, pos + f * 19, 10)
    pygame.draw.circle(surf, INK, pos + f * 27, 4)
    for s in (1, -1):
        pygame.draw.circle(surf, INK, pos + f * 9 + side * s * 8, 3)

    if bruno.state is BearState.LICKING:
        wiggle = math.sin(t * 14) * 7
        pygame.draw.circle(surf, TONGUE, pos + f * 24 + side * wiggle, 7)
        text = font.render("*lick lick*  Mmm!", True, TEXT)
        surf.blit(text, text.get_rect(midbottom=(pos.x, pos.y - r - 10)))


def draw_tussle(surf: pygame.Surface, pos: Vec, t: float, font: pygame.font.Font) -> None:
    rng = random.Random(int(t * 14))
    for _ in range(9):
        offset = Vec(rng.uniform(-34, 34), rng.uniform(-28, 28))
        pygame.draw.circle(surf, (200, 190, 175), pos + offset, rng.uniform(16, 28))
    for _ in range(4):
        offset = Vec(rng.uniform(-40, 40), rng.uniform(-36, 36))
        color = rng.choice([FUR, SKIN, (240, 120, 160)])
        pygame.draw.circle(surf, color, pos + offset, rng.uniform(5, 9))
    for _ in range(3):
        star = pos + Vec(rng.uniform(-50, 50), rng.uniform(-46, 46))
        pygame.draw.polygon(surf, (255, 230, 60), [
            star + Vec(0, -8).rotate(k * 36) * (1 if k % 2 == 0 else 0.45) for k in range(10)
        ])
    word = font.render(rng.choice(["POW!", "BONK!", "OOF!", "RAWR!"]), True, (255, 240, 120))
    surf.blit(word, word.get_rect(center=(pos.x + rng.uniform(-10, 10), pos.y - 52)))


def draw_scene(surf: pygame.Surface, bg: pygame.Surface, level: Level, t: float, fonts: dict) -> None:
    surf.blit(bg, (0, 0))
    for rect in level.blankets:
        draw_blanket(surf, rect)
    draw_cones(surf, level.people)
    draw_trunks(surf, level.blockers)
    draw_noise(surf, level.bruno)
    for p in level.people:
        draw_person(surf, p)
    draw_bruno(surf, level.bruno, t, fonts["small"])
    hiding_in = level.bruno.hiding_in(level.blockers)
    for b in level.blockers:
        if b.hideable:
            draw_bush(surf, b, see_through=b is hiding_in)
    for b in level.blockers:
        if not b.hideable:
            draw_canopy(surf, b)
    if level.bruno.state is BearState.TUSSLING:
        draw_tussle(surf, level.bruno.pos, t, fonts["medium"])
    for p in level.people:
        draw_meter(surf, p, fonts["medium"])
        draw_speech(surf, p, fonts["small"])
    draw_hud(surf, level, fonts)


def draw_hud(surf: pygame.Surface, level: Level, fonts: dict) -> None:
    w, h = surf.get_size()
    title = fonts["medium"].render(f"Level {level.number}: {level.title}", True, TEXT)
    surf.blit(title, (16, 12))
    count = fonts["medium"].render(f"Caught {level.caught}/{len(level.people)}", True, TEXT)
    surf.blit(count, count.get_rect(topright=(w - 16, 12)))

    bruno = level.bruno
    if bruno.hiding_in(level.blockers):
        status = "Hiding in a bush"
    elif bruno.moving:
        status = {Gait.SNEAK: "Sneaking (silent)", Gait.WALK: "Walking", Gait.RUN: "Running (LOUD!)"}[bruno.gait]
    else:
        status = "Standing still"
    surf.blit(fonts["small"].render(status, True, TEXT), (16, h - 58))
    help_text = "Arrows/WASD move   Ctrl sneak   Shift run   Space pounce   R restart   Esc quit"
    surf.blit(fonts["small"].render(help_text, True, TEXT), (16, h - 32))


def draw_card(surf: pygame.Surface, fonts: dict, heading: str, body: str, prompt: str) -> None:
    w, h = surf.get_size()
    shade = pygame.Surface((w, h), pygame.SRCALPHA)
    shade.fill((0, 0, 0, 150))
    surf.blit(shade, (0, 0))
    y = h // 2 - 110
    head = fonts["big"].render(heading, True, (255, 220, 120))
    surf.blit(head, head.get_rect(center=(w // 2, y)))
    y += 80
    for line in wrap(body, fonts["medium"], w - 300):
        text = fonts["medium"].render(line, True, TEXT)
        surf.blit(text, text.get_rect(center=(w // 2, y)))
        y += 36
    hint = fonts["small"].render(prompt, True, (200, 200, 200))
    surf.blit(hint, hint.get_rect(center=(w // 2, y + 40)))


def wrap(text: str, font: pygame.font.Font, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if font.size(trial)[0] > width and line:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines
