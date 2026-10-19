// Level layouts and per-level rules.

import { BearState, Blocker, Bruno, Gait, Person, PersonState, Vec, choice } from "./actors.js";

export const WIDTH = 1280;
export const HEIGHT = 720;
const SHOUT_RADIUS = 350;
const TWIG_RADIUS = 18;
const TWIG_NOISE = { radius: 300, strength: 0.7 };
const FISH_THROW = 230; // how far Bruno throws a fish
const FISH_FLIGHT = 0.45; // seconds in the air
const FISH_LIFE = 15; // seconds a fish lies there before it's forgotten
const FISH_NOISE = { radius: 320, strength: 0, lines: ["…why is there a salmon here?", "Is that… a fish?", "Where did that fish come from?"] };

export class Level {
  constructor({
    number, title, intro, tip = null, bruno, people, blockers,
    props = [], twigs = [], lights = [], dark = false, canGrowl = false, ground = "meadow",
    water = [], docks = [], wind = null, fish = 0, costumes = [], ambience = { amb_day: 0.45 },
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
    this.water = water; // ellipses Bruno can't walk into: [{ cx, cy, rx, ry }]
    this.docks = docks; // rectangles over water that he can walk on
    this.wind = wind; // direction the wind blows (dogs smell Bruno downwind of him)
    this.fishMax = fish;
    this.fishLeft = fish;
    this.fish = []; // thrown fish: { from, pos, age, landed, eaten }
    this.costumes = costumes;
    this.ambience = ambience; // background loops and their volumes
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

  // People Bruno has to catch (dogs don't count).
  get targets() {
    return this.people.filter((p) => !p.animal);
  }

  inWater(pos) {
    const onDock = this.docks.some((d) => pos.x >= d.x && pos.x <= d.x + d.w && pos.y >= d.y && pos.y <= d.y + d.h);
    return !onDock && this.water.some((w) => ((pos.x - w.cx) / w.rx) ** 2 + ((pos.y - w.cy) / w.ry) ** 2 < 1);
  }

  pounce(aim) {
    const bruno = this.bruno;
    if (!bruno.canPounce) return;
    if (bruno.costume) {
      bruno.costume = null; // the disguise flies off mid-pounce
      this.events.push({ type: "costume-off", pos: bruno.pos });
    }
    bruno.pounce(aim);
  }

  toggleCostume() {
    const bruno = this.bruno;
    if (!this.costumes.length || bruno.state !== BearState.FREE) return;
    bruno.costume = bruno.costume ? null : this.costumes[0];
    this.events.push({ type: "costume", pos: bruno.pos });
  }

  throwFish() {
    const bruno = this.bruno;
    if (this.fishLeft <= 0 || bruno.state !== BearState.FREE) return;
    this.fishLeft--;
    const b = this.bounds;
    let pos = bruno.pos.add(bruno.facing.scale(FISH_THROW));
    pos = new Vec(Math.max(b.x + 20, Math.min(b.x + b.w - 20, pos.x)), Math.max(b.y + 20, Math.min(b.y + b.h - 20, pos.y)));
    this.fish.push({ from: bruno.pos, pos, age: 0, landed: false, eaten: false });
    this.events.push({ type: "throw", pos: bruno.pos });
  }

  updateFish(dt) {
    for (const fish of this.fish) {
      fish.age += dt;
      if (!fish.landed && fish.age >= FISH_FLIGHT) {
        fish.landed = true;
        if (this.inWater(fish.pos)) {
          fish.eaten = true; // sploosh - gone
          this.events.push({ type: "splash", pos: fish.pos });
        } else {
          this.events.push({ type: "flop", pos: fish.pos });
          this.noises.push({ pos: fish.pos, radius: FISH_NOISE.radius, strength: FISH_NOISE.strength, line: choice(FISH_NOISE.lines) });
        }
      }
    }
    this.fish = this.fish.filter((f) => !f.eaten && f.age < FISH_FLIGHT + FISH_LIFE);
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
    const before = bruno.pos;
    bruno.update(dt, move, gait, this.bounds, this.people, this.blockers);
    if (this.inWater(bruno.pos)) {
      // Slide along the shore instead of stopping dead.
      const slideX = new Vec(bruno.pos.x, before.y);
      const slideY = new Vec(before.x, bruno.pos.y);
      bruno.pos = !this.inWater(slideX) ? slideX : !this.inWater(slideY) ? slideY : before;
    }
    this.updateFish(dt);

    const stomping = bruno.state === BearState.POUNCING || (bruno.state === BearState.FREE && bruno.gait !== Gait.SNEAK);
    for (const twig of this.twigs) {
      if (!twig.snapped && stomping && bruno.pos.dist(twig.pos) < TWIG_RADIUS + Bruno.RADIUS * 0.5) {
        twig.snapped = true;
        this.noises.push({ pos: twig.pos, ...TWIG_NOISE });
        this.events.push({ type: "twig", pos: twig.pos });
      }
    }

    const env = {
      dark: this.dark,
      brunoLit: this.isLit(bruno.pos),
      noises: this.noises,
      lure: this.lure,
      wind: this.wind,
      fish: this.fish,
    };
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
        other.spot(choice(other.lines.alert));
      }
    }
  }

  get caught() {
    return this.targets.filter((p) => p.state === PersonState.EATEN).length;
  }

  get outcome() {
    if (this.targets.some((p) => p.state === PersonState.ESCAPED)) return "escaped";
    if (this.caught === this.targets.length && this.bruno.state === BearState.FREE) return "won";
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

const DOG_LINES = {
  huh: ["*sniff sniff*", "*sniff*… Grrr?", "Rrrr?"],
  growl: ["*ears perk up*", "Rrrruff?"],
  rustle: ["*sniff sniff*"],
  calm: ["*wags tail*", "*yawn*"],
  spot: ["WOOF! WOOF! WOOF!"],
  alert: ["WOOF?!"],
};

function fishing() {
  const lake = { cx: 820, cy: 220, rx: 380, ry: 200 };
  const fisherman = new Person(v(782, 305), route([782, 305], [782, 470], [845, 488], [782, 470]), {
    voice: "fisher",
    walkSpeed: 45,
    fleeSpeed: 245,
    viewDistance: 250,
    lookRange: 0.5, // mostly watching his float
    pauses: { 0: [10, 14], 2: [3, 5] },
    idleLines: ["Come on, fishy fishy…", "I think I got a bite!", "Nothing's biting today."],
    shirt: "#2e86ab",
    hair: "#7a5a3a",
  });
  fisherman.angle = -Math.PI / 2;
  const dog = new Person(v(620, 500), route([620, 500], [900, 540], [1080, 470], [760, 610], [560, 620]), {
    voice: "dog",
    radius: 12,
    walkSpeed: 75,
    fleeSpeed: 290,
    viewDistance: 200,
    viewAngle: 140,
    hearing: 1.4,
    smellRange: 340,
    lookRange: 2.0,
    pause: [1, 3],
    lines: DOG_LINES,
    idleLines: ["*sniff*", "*chases tail*", "*scratches ear*"],
  });
  return new Level({
    number: 4,
    title: "Gone Fishin'",
    intro: "A fisherman is fishing off the dock with his dog. The dog can SMELL you when the wind blows your scent his way - keep out of the purple smell zone!",
    tip: "NEW: Fish! Press Q (or the Fish button) to throw one. The dog runs off to eat it, and people stop and stare. You have 3.",
    bruno: new Bruno(v(70, 640)),
    people: [fisherman, dog],
    ground: "forest",
    water: [lake],
    docks: [{ x: 760, y: 290, w: 44, h: 150 }],
    wind: v(1, 0),
    fish: 3,
    canGrowl: true,
    ambience: { amb_day: 0.3, amb_lake: 0.55 },
    props: [
      { type: "dock", x: 760, y: 290, w: 44, h: 150 },
      { type: "bobber", pos: v(782, 190) },
      { type: "tacklebox", pos: v(850, 505) },
    ],
    blockers: [
      bush(260, 560), bush(420, 650), bush(540, 520), bush(300, 330), bush(180, 190), bush(640, 470, 44),
      bush(660, 665, 44), bush(960, 650), bush(1120, 600), bush(1010, 470, 42), bush(1210, 470, 40),
      tree(110, 90, 64), tree(370, 110, 60), tree(120, 430, 62), tree(1230, 660, 64), tree(840, 700, 56),
    ],
  });
}

function scouts() {
  const kid = (start, points, extra = {}) =>
    new Person(v(...start), route(start, ...points), {
      voice: "kid",
      walkSpeed: 50,
      viewDistance: 210,
      pause: [2, 4],
      shirt: "#7a9a3a",
      idleLines: ["Look, a cool leaf!", "I'm gonna get my badge!", "Hee hee!", "Wanna race?"],
      ...extra,
    });
  const leader = new Person(v(640, 340), route([640, 340], [420, 380], [640, 560], [860, 380]), {
    voice: "man",
    walkSpeed: 50,
    fleeSpeed: 250,
    viewDistance: 240,
    pause: [2, 4],
    shirt: "#556b2f",
    hair: "#3b2a1a",
    idleLines: ["Okay scouts, stay together!", "Who wants to earn a badge?", "Don't wander off!"],
  });
  return new Level({
    number: 5,
    title: "Scout Troop",
    intro: "A scout troop is camping in Bruno's woods: five kids and their troop leader. If anyone spots you, everyone nearby runs - catch them one at a time!",
    tip: "NEW: Grandma disguise! Press C (or the Disguise button). Grown-ups think you're a sweet old granny, but kids aren't fooled. Pouncing makes it fly off!",
    bruno: new Bruno(v(50, 690)),
    people: [
      kid([230, 170], [[320, 140], [300, 230]], { hair: "#e6be5a" }),
      kid([600, 110], [[690, 120]], { pause: [4, 7], lookRange: 1.0, hair: "#3b2a1a", idleLines: ["A blue jay!", "Ooh, a woodpecker!"] }),
      kid([1050, 170], [[1130, 230], [1060, 250]], { hair: "#c0392b" }),
      kid([290, 570], [[390, 620], [330, 520]], { hair: "#5a3c22" }),
      kid([970, 580], [[1060, 630], [1000, 520]], { hair: "#f0d080" }),
      leader,
    ],
    fish: 2,
    canGrowl: true,
    costumes: ["grandma"],
    ambience: { amb_day: 0.4, amb_kids: 0.18 },
    props: [
      { type: "tent", pos: v(120, 330), w: 100, h: 76 },
      { type: "tent", pos: v(120, 450), w: 100, h: 76 },
      { type: "tent", pos: v(1160, 330), w: 100, h: 76 },
      { type: "tent", pos: v(1160, 450), w: 100, h: 76 },
      { type: "fire", pos: v(640, 470), lit: false },
      { type: "flagpole", pos: v(640, 320) },
    ],
    blockers: [
      bush(450, 200), bush(820, 200), bush(470, 480), bush(810, 480), bush(180, 645), bush(560, 660),
      bush(740, 660), bush(1110, 680), bush(1230, 230, 42), bush(960, 100, 42), bush(330, 380, 44),
      bush(950, 380, 44), bush(40, 200, 42),
      tree(40, 60, 60), tree(1240, 60, 60), tree(1245, 620, 60), tree(640, 30, 50),
    ],
    twigs: [v(390, 520), v(880, 520), v(520, 260), v(760, 260), v(200, 520), v(1080, 520)],
  });
}

export const LEVELS = [picnic, hiker, campfire, fishing, scouts];
