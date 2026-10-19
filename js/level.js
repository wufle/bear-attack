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
const PRINT_STRIDE = 30; // Bruno leaves a paw print this often in the snow
const PRINT_LIFE = 30; // seconds before snow covers a print
const MELT_RADIUS = 170; // a snowman melts this close to a fire
const FISH_NOISE = { radius: 320, strength: 0, lines: ["…why is there a salmon here?", "Is that… a fish?", "Where did that fish come from?"] };

export class Level {
  constructor({
    number, title, intro, tip = null, bruno, people, blockers,
    props = [], twigs = [], lights = [], dark = false, canGrowl = false, ground = "meadow",
    water = [], docks = [], wind = null, fish = 0, costumes = [], ambience = { amb_day: 0.45 },
    snow = false, roads = [],
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
    this.snow = snow; // Bruno leaves footprints...
    this.roads = roads; // ...except on ploughed roads: [{ points, width }]
    this.footprints = []; // { id, pos, angle, side, age }
    this.printId = 0;
    this.printStride = 0;
    this.fires = props.filter((p) => p.type === "fire" && p.lit !== false).map((p) => p.pos);
    this.crownFx = null; // the Queen's crown tumbling off
    this.lostCostumes = new Set(); // there's only one crown: once it's off, it's gone
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
    if (bruno.costume === "queen") {
      this.loseCrown(); // pouncing knocks the crown off for good
    } else if (bruno.costume) {
      bruno.costume = null; // the disguise flies off mid-pounce
      this.events.push({ type: "costume-off", pos: bruno.pos });
    }
    bruno.pounce(aim);
  }

  // C cycles: no disguise -> each disguise this level has -> no disguise.
  toggleCostume() {
    const bruno = this.bruno;
    if (!this.costumes.length || bruno.state !== BearState.FREE) return;
    const options = [null, ...this.costumes.filter((c) => !this.lostCostumes.has(c))];
    bruno.costume = options[(options.indexOf(bruno.costume) + 1) % options.length];
    this.events.push({ type: "costume", costume: bruno.costume, pos: bruno.pos });
  }

  loseCrown() {
    this.bruno.costume = null;
    this.lostCostumes.add("queen");
    this.crownFx = { pos: this.bruno.pos, age: 0 };
    this.events.push({ type: "crown-off", pos: this.bruno.pos });
  }

  onRoad(pos) {
    return this.roads.some(({ points, width }) =>
      points.slice(1).some((b, i) => {
        const a = points[i];
        const ab = b.sub(a);
        const t = Math.max(0, Math.min(1, pos.sub(a).dot(ab) / ab.dot(ab)));
        return a.add(ab.scale(t)).dist(pos) < width / 2;
      }),
    );
  }

  updateSnow(dt, before) {
    for (const print of this.footprints) print.age += dt;
    this.footprints = this.footprints.filter((p) => p.age < PRINT_LIFE);
    const bruno = this.bruno;
    if (!this.snow || bruno.costume === "snowman") return; // snowmen glide, apparently
    this.printStride += bruno.pos.dist(before);
    if (this.printStride < PRINT_STRIDE) return;
    this.printStride = 0;
    if (this.onRoad(bruno.pos)) return;
    this.footprints.push({ id: this.printId++, pos: bruno.pos, angle: bruno.facing.angle, side: this.printId % 2 ? 1 : -1, age: 0 });
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
    // Running in the Queen costume knocks the crown off.
    if (bruno.costume === "queen" && gait === Gait.RUN && move.length > 0 && bruno.state === BearState.FREE) {
      this.loseCrown();
    }
    // A snowman doesn't last long next to a fire.
    if (bruno.costume === "snowman" && this.fires.some((f) => f.dist(bruno.pos) < MELT_RADIUS)) {
      bruno.costume = null;
      this.events.push({ type: "melt", pos: bruno.pos });
    }
    bruno.update(dt, move, gait, this.bounds, this.people, this.blockers);
    if (this.inWater(bruno.pos)) {
      // Slide along the shore instead of stopping dead.
      const slideX = new Vec(bruno.pos.x, before.y);
      const slideY = new Vec(before.x, bruno.pos.y);
      bruno.pos = !this.inWater(slideX) ? slideX : !this.inWater(slideY) ? slideY : before;
    }
    this.updateFish(dt);
    this.updateSnow(dt, before);
    if (this.crownFx && (this.crownFx.age += dt) > 1.2) this.crownFx = null;

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
      footprints: this.footprints,
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
// Buildings and trucks: drawn as props, blocking like a solid round thing you can't see through.
const wall = (x, y, r) => new Blocker(v(x, y), r, false, r * 0.9, true);

function picnic() {
  const kid = new Person(v(880, 330), route([880, 330], [1010, 250], [960, 450], [800, 410]), {
    voice: "kid",
    idleLines: ["Ooh, a flower!", "La la la…", "Sandwich time!", "A butterfly!"],
  });
  return new Level({
    number: 1,
    title: "The Picnic",
    intro: "Sneak up and POUNCE!",
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
    intro: "Sneak over twigs - they SNAP!",
    tip: "NEW: Twigs!",
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
    intro: "Stay out of the firelight.",
    tip: "NEW: Growl unlocked!",
    bruno: new Bruno(v(80, 650)),
    people: [dad, mum],
    dark: true,
    canGrowl: true,
    ground: "night",
    lights: [{ pos: fire, radius: 230 }],
    ambience: { amb_crickets: 0.35 },
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
    intro: "The dog can smell you downwind.",
    tip: "NEW: Fish unlocked!",
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
    intro: "Kids aren't fooled by Granny.",
    tip: "NEW: Granny disguise unlocked!",
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

const RANGER_LINES = {
  notGranny: ["Ma'am, the park is CLOSED!", "That's no granny!"],
  huh: ["Who's out there?", "Hello? Park's closed!", "Huh?"],
  calm: ["Just a raccoon.", "All clear."],
};

function rangers() {
  const ranger = (start, points, extra) =>
    new Person(v(...start), route(start, ...points), {
      voice: "ranger",
      walkSpeed: 52,
      fleeSpeed: 250,
      nightVision: 90,
      notFooled: ["grandma"],
      lines: RANGER_LINES,
      shirt: "#6b7d3a",
      hair: "#8a6a3a",
      idleLines: ["Ranger 2, all quiet?", "*radio crackles*", "Long night…"],
      ...extra,
    });
  const tower = ranger([380, 200], [], {
    flashlight: { range: 520, angle: 22 }, // the tower searchlight
    nightVision: 70,
    turnSpeed: 0.6,
    lookRange: 3.0,
    pause: [30, 40],
    idleLines: ["Tower to base: all clear.", "*radio crackles*"],
  });
  tower.angle = Math.PI / 2;
  const patrol = ranger([1050, 120], [[640, 330], [180, 600], [620, 640], [1050, 680], [1220, 380]], {
    flashlight: { range: 280, angle: 38 },
    walkSpeed: 55,
    pause: [1, 2],
    lookRange: 1.2,
  });
  const desk = ranger([900, 360], [[1090, 560], [900, 360]], {
    flashlight: { range: 240, angle: 40 },
    pauses: { 0: [8, 12], 1: [3, 4] },
    lookRange: 0.8,
  });
  desk.angle = Math.PI / 2;
  return new Level({
    number: 6,
    title: "Ranger Station",
    intro: "Only one crown - don't run!",
    tip: "NEW: Queen costume unlocked!",
    bruno: new Bruno(v(60, 690)),
    people: [tower, patrol, desk],
    dark: true,
    canGrowl: true,
    fish: 2,
    costumes: ["grandma", "queen"],
    ground: "night",
    ambience: { amb_crickets: 0.3 },
    lights: [{ pos: v(900, 340), radius: 160 }],
    props: [
      { type: "cabin", pos: v(900, 240), w: 220, h: 140 },
      { type: "lamp", pos: v(900, 322) },
      { type: "tower", pos: v(380, 200) },
      { type: "truck", pos: v(1150, 560) },
    ],
    blockers: [
      wall(840, 240, 72), wall(960, 240, 72), wall(1150, 560, 44),
      bush(200, 450), bush(300, 640), bush(460, 520), bush(560, 380, 44), bush(700, 520), bush(820, 640, 44),
      bush(1000, 470, 44), bush(1200, 220, 44), bush(640, 160, 44), bush(160, 260, 44), bush(1230, 680, 40),
      tree(120, 120, 62), tree(560, 60, 56), tree(780, 420, 52), tree(1100, 80, 56), tree(420, 680, 58),
      tree(260, 360, 54), tree(1240, 480, 56),
    ],
  });
}

function cabins() {
  const kid = (start, points, extra) =>
    new Person(v(...start), route(start, ...points), { voice: "kid", walkSpeed: 55, viewDistance: 210, pause: [3, 5], ...extra });
  return new Level({
    number: 7,
    title: "Snowy Cabins",
    intro: "Watch your paw prints!",
    tip: "NEW: Snowman costume unlocked!",
    bruno: new Bruno(v(40, 615)),
    people: [
      new Person(v(300, 560), route([300, 560], [300, 380]), {
        voice: "shoveler",
        walkSpeed: 30,
        pause: [1, 2],
        shirt: "#c0392b",
        hair: "#3b2a1a",
        idleLines: ["*shovel shovel*", "Phew! So much snow.", "*shovel shovel*"],
      }),
      new Person(v(1150, 430), route([1150, 430], [720, 440], [980, 330]), {
        voice: "woman",
        pause: [2, 4],
        shirt: "#2e86ab",
        hair: "#d4a04c",
        idleLines: ["Brr! Chilly!", "Who wants hot cocoa?", "More firewood…"],
      }),
      kid([560, 490], [[610, 530]], { hair: "#e6be5a", shirt: "#f078a0", idleLines: ["My snowman needs a nose!", "Snowball fight!"] }),
      kid([840, 90], [[880, 330]], { hair: "#5a3c22", shirt: "#e67e22", walkSpeed: 75, pause: [1, 2], idleLines: ["Wheee!", "Again! Again!"] }),
    ],
    snow: true,
    ground: "snow",
    canGrowl: true,
    fish: 2,
    costumes: ["grandma", "queen", "snowman"],
    ambience: { amb_winter: 0.5, amb_day: 0.1 },
    roads: [
      { points: [v(0, 615), v(400, 600), v(800, 640), v(1280, 600)], width: 70 },
      { points: [v(300, 600), v(300, 330)], width: 46 },
    ],
    props: [
      { type: "road", points: [v(0, 615), v(400, 600), v(800, 640), v(1280, 600)], width: 70 },
      { type: "road", points: [v(300, 600), v(300, 330)], width: 46 },
      { type: "cabin", pos: v(300, 230), w: 200, h: 130, snowy: true },
      { type: "cabin", pos: v(980, 220), w: 220, h: 140, snowy: true },
      { type: "fire", pos: v(700, 400) },
      { type: "log", pos: v(650, 450), angle: 0.4 },
      { type: "woodpile", pos: v(1170, 450) },
      { type: "snowman", pos: v(520, 470) },
      { type: "sledhill", pos: v(860, 200) },
    ],
    blockers: [
      wall(245, 230, 68), wall(355, 230, 68), wall(920, 225, 72), wall(1040, 225, 72),
      bush(120, 420), bush(170, 250, 44), bush(460, 360, 44), bush(520, 680, 44), bush(760, 520, 44),
      bush(1000, 470, 44), bush(1160, 680, 44), bush(1220, 300, 44), bush(620, 160, 44), bush(1100, 110, 40),
      tree(60, 80, 58), tree(540, 70, 56), tree(1220, 80, 58), tree(80, 690, 50), tree(700, 700, 50), tree(1000, 690, 50),
      tree(440, 520, 50),
    ],
  });
}

export const LEVELS = [picnic, hiker, campfire, fishing, scouts, rangers, cabins];
