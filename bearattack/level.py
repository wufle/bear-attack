"""Level layouts and per-level rules."""

from __future__ import annotations

from dataclasses import dataclass, field

import pygame

from .actors import BearState, Blocker, Bruno, Gait, Person, PersonState, Vec

WIDTH, HEIGHT = 1280, 720
SHOUT_RADIUS = 350


@dataclass
class Level:
    number: int
    title: str
    intro: str
    bruno: Bruno
    people: list[Person]
    blockers: list[Blocker]
    blankets: list[pygame.Rect] = field(default_factory=list)
    bounds: pygame.Rect = field(default_factory=lambda: pygame.Rect(0, 0, WIDTH, HEIGHT))

    def update(self, dt: float, move: Vec, gait: Gait) -> None:
        self.bruno.update(dt, move, gait, self.bounds, self.people, self.blockers)
        for person in self.people:
            if person.update(dt, self.bruno, self.blockers, self.bounds):
                self._alert_earshot(person)

    def _alert_earshot(self, spotter: Person) -> None:
        for other in self.people:
            if other is not spotter and other.calm_or_curious:
                if other.pos.distance_to(spotter.pos) < SHOUT_RADIUS:
                    other.spot("AAAAH!")

    @property
    def caught(self) -> int:
        return sum(p.state is PersonState.EATEN for p in self.people)

    @property
    def outcome(self) -> str | None:
        if any(p.state is PersonState.ESCAPED for p in self.people):
            return "escaped"
        if self.caught == len(self.people) and self.bruno.state is BearState.FREE:
            return "won"
        return None


def bush(x: float, y: float, r: float = 46) -> Blocker:
    return Blocker(Vec(x, y), r, hideable=True)


def tree(x: float, y: float, r: float = 70) -> Blocker:
    return Blocker(Vec(x, y), r, hideable=False, solid=18)


def picnic() -> Level:
    kid = Person(
        (880, 330),
        [(880, 330), (1010, 250), (960, 450), (800, 410)],
        idle_lines=["Ooh, a flower!", "La la la…", "Sandwich time!", "A butterfly!"],
    )
    return Level(
        number=1,
        title="The Picnic",
        intro="A kid is having a picnic all alone in Bruno's meadow. "
              "Hide in the bushes, sneak up close, and POUNCE!",
        bruno=Bruno((70, 620)),
        people=[kid],
        blockers=[
            bush(250, 560), bush(380, 470), bush(520, 530, 50), bush(560, 360, 44),
            bush(700, 470), bush(690, 250, 44), bush(820, 570, 42), bush(1100, 480),
            bush(1120, 160, 44), bush(300, 250, 50),
            tree(450, 150), tree(1190, 640), tree(140, 110, 64),
        ],
        blankets=[pygame.Rect(820, 290, 130, 90)],
    )


LEVELS = [picnic]
