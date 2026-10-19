// Level layouts and per-level rules.

import { BearState, Blocker, Bruno, Gait, Person, PersonState, Vec } from "./actors.js";

export const WIDTH = 1280;
export const HEIGHT = 720;
const SHOUT_RADIUS = 350;
const TWIG_RADIUS = 18;
const TWIG_NOISE = { radius: 300, strength: 0.7 };

export class Level {
  constructor({
    number, title, intro, tip = null, bruno, people, blockers,
    props = [], twigs = [], lights = [], dark = false, canGrowl = false, ground = "meadow",
  }) {
    this.number = number;
    this.title = title;
    this.intro = intro;
    this.tip = tip; // shown on the intro card when a level adds something new
    this.bruno = bruno;
    this.people = people;
    this.blockers = blockers;
    this.props = props; // scenery: { type: "blanket" | "trail" | "fire" | "tent" | "log" | "woodpile", ... }
    this.twigs = twigs.map((pos) => ({ pos, snapped: false }));
    this.lights = lights; // [{ pos, radius }]
    this.dark = dark;
    this.canGrowl = canGrowl;
    this.ground = ground;
    this.bounds = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    this.events = []; // things that happened this frame, for sound effects
    this.noises = [];
    this.lure = null;
    this.growlFx = null; // { pos, age } for the expanding growl ring
    this.t = 0;
  }

  isLit(pos) {
    return this.lights.some((light) => pos.dist(light.pos) < light.radius);
  }

  growl() {
    if (!this.canGrowl || !this.bruno.growl()) return;
    this.lure = this.bruno.pos;
    this.growlFx = { pos: this.bruno.pos, age: 0 };
    this.events.push({ type: "growl", pos: this.bruno.pos });
  }

  update(dt, move, gait) {
    this.t += dt;
    const bruno = this.bruno;
    bruno.update(dt, move, gait, this.bounds, this.people, this.blockers);

    const stomping = bruno.state === BearState.POUNCING || (bruno.state === BearState.FREE && bruno.gait !== Gait.SNEAK);
    for (const twig of this.twigs) {
      if (!twig.snapped && stomping && bruno.pos.dist(twig.pos) < TWIG_RADIUS + Bruno.RADIUS * 0.5) {
        twig.snapped = true;
        this.noises.push({ pos: twig.pos, ...TWIG_NOISE });
        this.events.push({ type: "twig", pos: twig.pos });
      }
    }

    const env = { dark: this.dark, brunoLit: this.isLit(bruno.pos), noises: this.noises, lure: this.lure };
    for (const person of this.people) {
      if (person.update(dt, bruno, this.blockers, this.bounds, env)) this.alertEarshot(person);
    }
    this.noises = [];
    this.lure = null;
    if (this.growlFx) {
      this.growlFx.age += dt;
      if (this.growlFx.age > 0.8) this.growlFx = null;
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

const v = (x, y) => new Vec(x, y);
const bush = (x, y, r = 46) => new Blocker(v(x, y), r, true);
const tree = (x, y, r = 70) => new Blocker(v(x, y), r, false, 18);
const route = (...points) => points.map(([x, y]) => v(x, y));

function picnic() {
  const kid = new Person(v(880, 330), route([880, 330], [1010, 250], [960, 450], [800, 410]), {
    voice: "kid",
    idleLines: ["Ooh, a flower!", "La la la…", "Sandwich time!", "A butterfly!"],
  });
  return new Level({
    number: 1,
    title: "The Picnic",
    intro: "A kid is having a picnic all alone in Bruno's meadow. Hide in the bushes, sneak up close, and POUNCE!",
    bruno: new Bruno(v(70, 620)),
    people: [kid],
    blockers: [
      bush(250, 560), bush(380, 470), bush(520, 530, 50), bush(560, 360, 44),
      bush(700, 470), bush(690, 250, 44), bush(820, 570, 42), bush(1100, 480),
      bush(1120, 160, 44), bush(300, 250, 50),
      tree(450, 150), tree(1190, 640), tree(140, 110, 64),
    ],
    props: [{ type: "blanket", x: 820, y: 290, w: 130, h: 90 }],
  });
}

function hiker() {
  // The hiker walks the trail back and forth, stopping at the lookouts to
  // take in the view - and he looks all the way around, even behind him.
  const trail = [[60, 150], [330, 210], [560, 330], [760, 300], [960, 420], [1220, 560]];
  const hikerPerson = new Person(
    v(560, 330),
    route([560, 330], [760, 300], [960, 420], [1220, 560], [960, 420], [760, 300], [560, 330], [330, 210], [60, 150], [330, 210]),
    {
      voice: "man",
      walkSpeed: 58,
      fleeSpeed: 255,
      viewDistance: 270,
      viewAngle: 110,
      hearing: 1.25,
      turnSpeed: 3.0,
      lookRange: 2.8,
      pause: [0.4, 1.0],
      pauses: { 0: [3, 5], 2: [3, 5], 3: [1.5, 2.5], 8: [1.5, 2.5] },
      idleLines: ["What a view!", "Nice day for a hike!", "♪ ♫ ♪", "Ahh, fresh air."],
      shirt: "#3c78d8",
      hair: "#5a3c22",
    },
  );
  return new Level({
    number: 2,
    title: "The Hiker",
    intro: "A hiker is walking the forest trail. He stops to look all around - even behind him! Grown-ups are faster than kids, so don't get seen.",
    tip: "NEW: Twigs! They SNAP if you walk or run on them. Sneak (Shift) over them quietly.",
    bruno: new Bruno(v(80, 640)),
    people: [hikerPerson],
    ground: "forest",
    props: [{ type: "trail", points: trail.map(([x, y]) => v(x, y)) }],
    blockers: [
      bush(200, 520), bush(330, 380, 48), bush(470, 470), bush(640, 520, 50), bush(760, 420, 40),
      bush(850, 610), bush(1060, 330, 44), bush(1120, 650, 40), bush(470, 120, 44), bush(860, 180, 48),
      bush(180, 300, 42),
      tree(120, 420, 66), tree(420, 600, 64), tree(640, 160, 74), tree(1000, 600, 66),
      tree(1180, 220, 72), tree(260, 80, 60), tree(880, 300, 56),
    ],
    twigs: [
      v(250, 470), v(390, 430), v(420, 520), v(540, 500), v(590, 420), v(700, 480),
      v(720, 370), v(810, 560), v(900, 500), v(1010, 380), v(1100, 470), v(300, 330),
      v(150, 580), v(520, 260), v(1150, 600),
    ],
  });
}

function campfire() {
  const fire = v(700, 380);
  const dad = new Person(v(640, 410), route([640, 410], [290, 170], [640, 410]), {
    voice: "man",
    walkSpeed: 50,
    fleeSpeed: 250,
    viewDistance: 260,
    nightVision: 90,
    pauses: { 0: [9, 13], 1: [2, 3] },
    idleLines: ["Need more firewood.", "Ha ha ha!", "Marshmallow, anyone?"],
    shirt: "#c0392b",
    hair: "#3b2a1a",
  });
  const mum = new Person(v(770, 350), route([770, 350], [880, 250], [1080, 590], [770, 350]), {
    voice: "woman",
    walkSpeed: 48,
    fleeSpeed: 245,
    viewDistance: 260,
    nightVision: 90,
    pauses: { 0: [12, 16], 1: [3, 4], 2: [2, 3] },
    idleLines: ["What a lovely night.", "Look at the stars!", "Brr, it's chilly."],
    shirt: "#8e44ad",
    hair: "#d4a04c",
  });
  dad.angle = -0.4;
  mum.angle = Math.PI;
  return new Level({
    number: 3,
    title: "Campfire Night",
    intro: "Two campers are sitting by the fire. Stay in the dark - they can only see you up close, or if you step into the firelight. Wait for one to wander off!",
    tip: "NEW: GROWL (G key, right-click, or the Growl button) makes people come and look. Growl from a hiding spot, then pounce!",
    bruno: new Bruno(v(80, 650)),
    people: [dad, mum],
    dark: true,
    canGrowl: true,
    ground: "night",
    lights: [{ pos: fire, radius: 230 }],
    props: [
      { type: "fire", pos: fire },
      { type: "tent", pos: v(890, 220), w: 120, h: 90 },
      { type: "log", pos: v(630, 440), angle: 0.5 },
      { type: "log", pos: v(780, 320), angle: -0.3 },
      { type: "woodpile", pos: v(270, 150) },
    ],
    blockers: [
      bush(220, 560), bush(380, 620), bush(420, 300, 44), bush(520, 160), bush(1000, 440, 44),
      bush(1150, 300), bush(1180, 630, 44), bush(860, 620, 48), bush(150, 300, 42), bush(1080, 120, 44),
      tree(100, 120, 66), tree(560, 640, 64), tree(1220, 460, 64), tree(380, 450, 58), tree(1180, 90, 60),
    ],
  });
}

export const LEVELS = [picnic, hiker, campfire];
