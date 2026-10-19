"""Bruno and the people wandering through his territory."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from enum import Enum, auto

import pygame

Vec = pygame.Vector2


@dataclass
class Blocker:
    """Something round that blocks line of sight: a bush or a tree."""

    pos: Vec
    radius: float
    hideable: bool  # bushes: Bruno can hide inside. Trees: only behind.
    solid: float = 0.0  # radius nobody can walk through (tree trunks)


def segment_hits_circle(a: Vec, b: Vec, center: Vec, radius: float) -> bool:
    ab = b - a
    length_sq = ab.length_squared()
    if length_sq == 0:
        return a.distance_to(center) < radius
    t = max(0.0, min(1.0, (center - a).dot(ab) / length_sq))
    return (a + ab * t).distance_to(center) < radius


def push_out(pos: Vec, radius: float, blockers: list[Blocker], bounds: pygame.Rect | None) -> None:
    for b in blockers:
        if b.solid <= 0:
            continue
        away = pos - b.pos
        min_dist = b.solid + radius
        if 0 < away.length() < min_dist:
            pos.update(b.pos + away.normalize() * min_dist)
    if bounds is not None:
        pos.x = max(bounds.left + radius, min(bounds.right - radius, pos.x))
        pos.y = max(bounds.top + radius, min(bounds.bottom - radius, pos.y))


class Gait(Enum):
    SNEAK = auto()
    WALK = auto()
    RUN = auto()


class BearState(Enum):
    FREE = auto()
    POUNCING = auto()
    TUSSLING = auto()
    LICKING = auto()


class Bruno:
    RADIUS = 24
    SPEEDS = {Gait.SNEAK: 60, Gait.WALK: 130, Gait.RUN: 215}
    NOISE = {Gait.SNEAK: 0, Gait.WALK: 110, Gait.RUN: 280}
    POUNCE_DISTANCE = 110
    POUNCE_TIME = 0.22
    POUNCE_NOISE = 220
    POUNCE_COOLDOWN = 0.7
    TUSSLE_TIME = 1.8
    LICK_TIME = 1.6

    def __init__(self, pos: tuple[float, float]) -> None:
        self.pos = Vec(pos)
        self.facing = Vec(1, 0)
        self.gait = Gait.WALK
        self.moving = False
        self.state = BearState.FREE
        self.timer = 0.0
        self.cooldown = 0.0
        self.victim: Person | None = None

    @property
    def noise_radius(self) -> float:
        if self.state is BearState.POUNCING:
            return self.POUNCE_NOISE
        if self.state is not BearState.FREE or not self.moving:
            return 0
        return self.NOISE[self.gait]

    def hiding_in(self, blockers: list[Blocker]) -> Blocker | None:
        for b in blockers:
            if b.hideable and self.pos.distance_to(b.pos) < b.radius - self.RADIUS * 0.5:
                return b
        return None

    def pounce(self) -> None:
        if self.state is BearState.FREE and self.cooldown <= 0:
            self.state = BearState.POUNCING
            self.timer = self.POUNCE_TIME

    def update(
        self,
        dt: float,
        move: Vec,
        gait: Gait,
        bounds: pygame.Rect,
        people: list[Person],
        blockers: list[Blocker],
    ) -> None:
        self.cooldown = max(0.0, self.cooldown - dt)

        if self.state is BearState.FREE:
            self.gait = gait
            self.moving = move.length_squared() > 0
            if self.moving:
                self.facing = move.normalize()
                self.pos += self.facing * self.SPEEDS[gait] * dt
        elif self.state is BearState.POUNCING:
            self.pos += self.facing * (self.POUNCE_DISTANCE / self.POUNCE_TIME) * dt
            victim = next(
                (p for p in people
                 if p.catchable and self.pos.distance_to(p.pos) < self.RADIUS + p.radius + 6),
                None,
            )
            if victim is not None:
                self._start_tussle(victim)
            else:
                self.timer -= dt
                if self.timer <= 0:
                    self.state = BearState.FREE
                    self.cooldown = self.POUNCE_COOLDOWN
        elif self.state is BearState.TUSSLING:
            self.timer -= dt
            if self.timer <= 0:
                assert self.victim is not None
                self.victim.state = PersonState.EATEN
                self.victim = None
                self.state = BearState.LICKING
                self.timer = self.LICK_TIME
        elif self.state is BearState.LICKING:
            self.timer -= dt
            if self.timer <= 0:
                self.state = BearState.FREE

        push_out(self.pos, self.RADIUS, blockers, bounds)

    def _start_tussle(self, victim: Person) -> None:
        self.state = BearState.TUSSLING
        self.timer = self.TUSSLE_TIME
        self.victim = victim
        self.moving = False
        victim.state = PersonState.CAUGHT
        self.pos = (self.pos + victim.pos) / 2
        victim.pos = Vec(self.pos)


class PersonState(Enum):
    WANDER = auto()
    INVESTIGATE = auto()
    FLEE = auto()
    CAUGHT = auto()
    EATEN = auto()
    ESCAPED = auto()


SUSPICIOUS_AT = 0.35
CALM_AT = 0.12

HUH_LINES = ["Huh?", "Hello…?", "What was that?", "Is someone there?"]
RUSTLE_LINES = ["Did that bush just move?", "Bushes don't walk…", "Weird bush."]
CALM_LINES = ["Must've been the wind.", "Oh well!", "Probably a squirrel."]


class Person:
    def __init__(
        self,
        pos: tuple[float, float],
        route: list[tuple[float, float]],
        *,
        radius: float = 15,
        walk_speed: float = 45,
        flee_speed: float = 235,
        view_distance: float = 230,
        view_angle: float = 100,
        hearing: float = 1.0,
        turn_speed: float = 2.5,
        pause: tuple[float, float] = (2.5, 5.0),
        idle_lines: list[str] | None = None,
        shirt: tuple[int, int, int] = (240, 120, 160),
        hair: tuple[int, int, int] = (230, 190, 90),
    ) -> None:
        self.pos = Vec(pos)
        self.route = [Vec(p) for p in route]
        self.route_index = 0
        self.radius = radius
        self.walk_speed = walk_speed
        self.flee_speed = flee_speed
        self.view_distance = view_distance
        self.view_angle = math.radians(view_angle)
        self.hearing = hearing
        self.turn_speed = turn_speed
        self.pause = pause
        self.idle_lines = idle_lines or []
        self.shirt = shirt
        self.hair = hair

        self.angle = 0.0
        self.state = PersonState.WANDER
        self.suspicion = 0.0
        self.interest: Vec | None = None
        self.quiet_time = 0.0
        self.pause_timer = 0.0
        self.look_timer = 0.0
        self.look_target = 0.0
        self.speech = ""
        self.speech_timer = 0.0

    @property
    def facing(self) -> Vec:
        return Vec(1, 0).rotate_rad(self.angle)

    @property
    def catchable(self) -> bool:
        return self.state in (PersonState.WANDER, PersonState.INVESTIGATE, PersonState.FLEE)

    @property
    def calm_or_curious(self) -> bool:
        return self.state in (PersonState.WANDER, PersonState.INVESTIGATE)

    def say(self, text: str, duration: float = 2.2) -> None:
        self.speech = text
        self.speech_timer = duration

    def spot(self, line: str = "BEAR!!!") -> None:
        self.suspicion = 1.0
        self.state = PersonState.FLEE
        self.say(line, 3.0)

    def can_see(self, bruno: Bruno, blockers: list[Blocker]) -> str | None:
        """Return "clear" if Bruno is in plain view, "rustle" if his bush is shaking."""
        to = bruno.pos - self.pos
        dist = to.length()
        if dist > self.view_distance + bruno.RADIUS:
            return None
        if dist > 1 and abs((self.facing.angle_to(to) + 180) % 360 - 180) > math.degrees(self.view_angle) / 2:
            return None
        hiding_in = bruno.hiding_in(blockers)
        for b in blockers:
            if b is hiding_in or self.pos.distance_to(b.pos) < b.radius:
                continue
            if segment_hits_circle(self.pos, bruno.pos, b.pos, b.radius * 0.85):
                return None
        if hiding_in is not None:
            return "rustle" if bruno.moving and bruno.gait is not Gait.SNEAK else None
        return "clear"

    def update(self, dt: float, bruno: Bruno, blockers: list[Blocker], bounds: pygame.Rect) -> bool:
        """Advance one frame. Returns True on the frame this person spots Bruno."""
        self.speech_timer -= dt
        if not self.catchable:
            return False

        if self.state is PersonState.FLEE:
            away = self.pos - bruno.pos
            if away.length_squared() == 0:
                away = Vec(1, 0)
            away.scale_to_length(self.flee_speed * dt)
            self.pos += away
            self.angle = math.atan2(away.y, away.x)
            push_out(self.pos, self.radius, blockers, None)
            if not bounds.collidepoint(self.pos):
                self.state = PersonState.ESCAPED
            return False

        noticed = False
        dist = self.pos.distance_to(bruno.pos)
        sight = self.can_see(bruno, blockers)
        if sight == "clear":
            if bruno.state in (BearState.TUSSLING, BearState.LICKING):
                self.suspicion = 1.0
            closeness = 1 - min(dist / self.view_distance, 1)
            self.suspicion += dt * (0.5 + 2.0 * closeness)
            noticed = True
        elif sight == "rustle":
            self.suspicion += dt * 0.3
            noticed = True
            if self.speech_timer <= 0 and self.suspicion > 0.2:
                self.say(random.choice(RUSTLE_LINES))

        hearing_range = bruno.noise_radius * self.hearing
        if dist < hearing_range:
            self.suspicion += dt * 0.6 * (1 - dist / hearing_range)
            if bruno.state is BearState.POUNCING:
                self.suspicion += dt * 3
            noticed = True

        if noticed:
            self.interest = Vec(bruno.pos)
            self.quiet_time = 0.0
        else:
            self.quiet_time += dt
            if self.quiet_time > 1.5:
                self.suspicion -= dt * 0.15
        self.suspicion = max(0.0, min(1.0, self.suspicion))

        if self.suspicion >= 1.0:
            self.spot()
            return True
        if self.state is PersonState.WANDER and self.suspicion >= SUSPICIOUS_AT:
            self.state = PersonState.INVESTIGATE
            if self.speech_timer <= 0:
                self.say(random.choice(HUH_LINES))
        elif self.state is PersonState.INVESTIGATE and self.suspicion < CALM_AT:
            self.state = PersonState.WANDER
            self.say(random.choice(CALM_LINES))

        if self.state is PersonState.INVESTIGATE:
            if self.interest is not None:
                to = self.interest - self.pos
                self._turn_toward(math.atan2(to.y, to.x), dt)
        else:
            self._wander(dt)
        push_out(self.pos, self.radius, blockers, bounds)
        return False

    def _wander(self, dt: float) -> None:
        if self.pause_timer > 0:
            self.pause_timer -= dt
            self.look_timer -= dt
            if self.look_timer <= 0:
                self.look_target = self.angle + random.uniform(-1.6, 1.6)
                self.look_timer = random.uniform(0.8, 1.6)
            self._turn_toward(self.look_target, dt)
            return
        target = self.route[self.route_index]
        to = target - self.pos
        if to.length() < 4:
            self.route_index = (self.route_index + 1) % len(self.route)
            self.pause_timer = random.uniform(*self.pause)
            self.look_timer = 0.0
            if self.idle_lines and random.random() < 0.5:
                self.say(random.choice(self.idle_lines))
            return
        self._turn_toward(math.atan2(to.y, to.x), dt)
        step = min(self.walk_speed * dt, to.length())
        self.pos += to.normalize() * step

    def _turn_toward(self, target: float, dt: float) -> None:
        diff = (target - self.angle + math.pi) % math.tau - math.pi
        step = self.turn_speed * dt
        self.angle += max(-step, min(step, diff))
