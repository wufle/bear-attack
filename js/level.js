// Level layouts and per-level rules.

import { BearState, Blocker, Bruno, Person, PersonState, Vec } from "./actors.js";

export const WIDTH = 1280;
export const HEIGHT = 720;
const SHOUT_RADIUS = 350;

export class Level {
  constructor({ number, title, intro, bruno, people, blockers, blankets = [] }) {
    this.number = number;
    this.title = title;
    this.intro = intro;
    this.bruno = bruno;
    this.people = people;
    this.blockers = blockers;
    this.blankets = blankets;
    this.bounds = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
  }

  update(dt, move, gait) {
    this.bruno.update(dt, move, gait, this.bounds, this.people, this.blockers);
    for (const person of this.people) {
      if (person.update(dt, this.bruno, this.blockers, this.bounds)) this.alertEarshot(person);
    }
  }

  alertEarshot(spotter) {
    for (const other of this.people) {
      if (other !== spotter && other.calmOrCurious && other.pos.dist(spotter.pos) < SHOUT_RADIUS) {
        other.spot("AAAAH!");
      }
    }
  }

  get caught() {
    return this.people.filter((p) => p.state === PersonState.EATEN).length;
  }

  get outcome() {
    if (this.people.some((p) => p.state === PersonState.ESCAPED)) return "escaped";
    if (this.caught === this.people.length && this.bruno.state === BearState.FREE) return "won";
    return null;
  }
}

const bush = (x, y, r = 46) => new Blocker(new Vec(x, y), r, true);
const tree = (x, y, r = 70) => new Blocker(new Vec(x, y), r, false, 18);
const route = (...points) => points.map(([x, y]) => new Vec(x, y));

function picnic() {
  const kid = new Person(new Vec(880, 330), route([880, 330], [1010, 250], [960, 450], [800, 410]), {
    idleLines: ["Ooh, a flower!", "La la la…", "Sandwich time!", "A butterfly!"],
    voice: 460,
  });
  return new Level({
    number: 1,
    title: "The Picnic",
    intro: "A kid is having a picnic all alone in Bruno's meadow. Hide in the bushes, sneak up close, and POUNCE!",
    bruno: new Bruno(new Vec(70, 620)),
    people: [kid],
    blockers: [
      bush(250, 560), bush(380, 470), bush(520, 530, 50), bush(560, 360, 44),
      bush(700, 470), bush(690, 250, 44), bush(820, 570, 42), bush(1100, 480),
      bush(1120, 160, 44), bush(300, 250, 50),
      tree(450, 150), tree(1190, 640), tree(140, 110, 64),
    ],
    blankets: [{ x: 820, y: 290, w: 130, h: 90 }],
  });
}

export const LEVELS = [picnic];
