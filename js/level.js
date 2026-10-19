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
const TRAP_TIME = 3; // seconds stuck in a bear trap
const TRAP_NOISE = { radius: 400, strength: 0.8 };
const STAGE_TIME = 2; // seconds on stage in the mascot suit to win the costume contest
const DRESS_TIME = 1.5; // seconds to put a costume on - anyone who sees him changing knows it's a bear
const PICKUP_RADIUS = 30;
// What someone shouts if they catch Bruno getting changed.
const CHANGING_LINES = {
  grandma: "The bear is putting on a DRESS?!",
  queen: "Is that bear putting on a CROWN?!",
  snowman: "That bear is dressing up as a SNOWMAN!",
  mascot: "A bear putting on a BEAR suit?!",
  soldier: "A bear… putting on a UNIFORM?!",
};
// Where each costume is found: a washing line, a dressing-up trunk, ...
export const COSTUME_ITEMS = {
  grandma: "Granny's dress",
  queen: "the Queen costume",
  snowman: "a snowman kit",
  mascot: "a Benny suit",
  soldier: "a soldier uniform",
};
const FISH_NOISE = { radius: 320, strength: 0, lines: ["…why is there a salmon here?", "Is that… a fish?", "Where did that fish come from?"] };

export class Level {
  constructor({
    number, title, intro, tip = null, bruno, people, blockers,
    props = [], twigs = [], lights = [], dark = false, canGrowl = false, ground = "meadow",
    water = [], docks = [], wind = null, fish = 0, costumes = [], ambience = { amb_day: 0.45 },
    snow = false, roads = [], goal = null, armed = false, traps = [], honey = [], stage = null, ending = false,
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
    // Costumes are found lying around the level (`{ type, pos }`), carried in Bruno's bag,
    // and put on somewhere nobody can see. Each one is ruined once it comes off in a hurry.
    this.pickups = costumes.map((c) => ({ ...c, taken: false }));
    this.bag = []; // costume types he's carrying, not wearing
    this.dressing = null; // { costume, time } while he's getting changed
    this.ambience = ambience; // background loops and their volumes
    this.snow = snow; // Bruno leaves footprints...
    this.roads = roads; // ...except on ploughed roads: [{ points, width }]
    this.footprints = []; // { id, pos, angle, side, age }
    this.printId = 0;
    this.printStride = 0;
    this.fires = props.filter((p) => p.type === "fire" && p.lit !== false).map((p) => p.pos);
    this.crownFx = null; // the Queen's crown tumbling off
    this.goal = goal; // how many people to catch (default: all of them)
    this.armed = armed; // people shoot back, so Bruno has health
    this.darts = [];
    this.traps = traps.map((pos) => ({ pos, sprung: false }));
    this.honey = honey.map((pos) => ({ pos, eaten: false })); // each one heals a honey pot
    this.stage = stage; // the festival's costume-contest stage: { x, y, w, h }
    this.stageTime = 0;
    this.contestWon = false;
    this.alarm = false;
    this.ending = ending; // the last level
    this.fx = []; // floating messages: { text, pos, age }
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

  // People Bruno has to catch (dogs and soldiers don't count).
  get targets() {
    return this.people.filter((p) => !p.animal && p.target);
  }

  get needed() {
    return this.goal ?? this.targets.length;
  }

  inWater(pos) {
    const onDock = this.docks.some((d) => pos.x >= d.x && pos.x <= d.x + d.w && pos.y >= d.y && pos.y <= d.y + d.h);
    return !onDock && this.water.some((w) => ((pos.x - w.cx) / w.rx) ** 2 + ((pos.y - w.cy) / w.ry) ** 2 < 1);
  }

  get hasCostumes() {
    return this.pickups.length > 0;
  }

  pounce(aim) {
    const bruno = this.bruno;
    if (!bruno.canPounce) return;
    this.dressing = null;
    if (bruno.costume === "queen") {
      this.loseCrown(); // pouncing knocks the crown off for good
    } else if (bruno.costume) {
      bruno.costume = null; // the disguise rips to shreds mid-pounce
      this.fx.push({ text: "Rrrip! Costume ruined!", pos: bruno.pos, age: 0 });
      this.events.push({ type: "costume-off", pos: bruno.pos });
    }
    bruno.pounce(aim);
  }

  // C cycles: no disguise -> each disguise in the bag -> no disguise. Taking one off is
  // instant (it goes back in the bag); putting one on takes a moment, standing still.
  toggleCostume() {
    const bruno = this.bruno;
    if (bruno.state !== BearState.FREE) return;
    const current = this.dressing?.costume ?? bruno.costume;
    const options = [null, ...new Set([...this.bag, ...(bruno.costume ? [bruno.costume] : [])])];
    const next = options[(options.indexOf(current) + 1) % options.length];
    this.dressing = null;
    if (bruno.costume) {
      this.bag.push(bruno.costume);
      bruno.costume = null;
      this.events.push({ type: "costume-off", pos: bruno.pos });
    }
    if (next) {
      this.dressing = { costume: next, time: 0 };
      this.events.push({ type: "dressing", pos: bruno.pos });
    }
  }

  loseCrown() {
    this.bruno.costume = null;
    this.crownFx = { pos: this.bruno.pos, age: 0 };
    this.events.push({ type: "crown-off", pos: this.bruno.pos });
  }

  updatePickups() {
    const bruno = this.bruno;
    if (bruno.state !== BearState.FREE) return;
    for (const item of this.pickups) {
      if (item.taken || bruno.pos.dist(item.pos) > PICKUP_RADIUS + Bruno.RADIUS * 0.5) continue;
      item.taken = true;
      this.bag.push(item.type);
      this.fx.push({ text: `Got ${COSTUME_ITEMS[item.type]}!`, pos: item.pos, age: 0 });
      this.events.push({ type: "pickup", pos: item.pos });
    }
  }

  // Getting changed: standing still for a moment. Anyone who sees it raises the alarm.
  updateDressing(dt, env) {
    const bruno = this.bruno;
    if (!this.dressing) return;
    if (bruno.state !== BearState.FREE) {
      this.dressing = null;
      return;
    }
    const watcher = this.people.find((p) => p.calmOrCurious && !p.bowing && p.canSee(bruno, this.blockers, env) === "clear");
    if (watcher) {
      this.fx.push({ text: "Caught getting changed!", pos: bruno.pos, age: 0 });
      watcher.spot(watcher.animal ? undefined : CHANGING_LINES[this.dressing.costume], bruno.pos);
      this.alertEarshot(watcher);
      this.dressing = null;
      return;
    }
    this.dressing.time += dt;
    if (this.dressing.time >= DRESS_TIME) {
      const costume = this.dressing.costume;
      this.bag.splice(this.bag.indexOf(costume), 1);
      bruno.costume = costume;
      this.dressing = null;
      this.events.push({ type: "costume", costume, pos: bruno.pos });
    }
  }

  get dressProgress() {
    return this.dressing ? this.dressing.time / DRESS_TIME : 0;
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
    if (this.dressing && move.length > 0) this.dressing = null; // walked off half-dressed: try again later
    // Running in the Queen costume knocks the crown off.
    if (bruno.costume === "queen" && gait === Gait.RUN && move.length > 0 && bruno.state === BearState.FREE) {
      this.loseCrown();
    }
    // A snowman doesn't last long next to a fire.
    if (bruno.costume === "snowman" && this.fires.some((f) => f.dist(bruno.pos) < MELT_RADIUS)) {
      bruno.costume = null;
      this.fx.push({ text: "The snowman melted!", pos: bruno.pos, age: 0 });
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
    this.updateHazards(dt);
    this.updatePickups();
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
      darts: this.darts,
    };
    this.updateDressing(dt, env);
    for (const person of this.people) {
      if (person.update(dt, bruno, this.blockers, this.bounds, env)) this.alertEarshot(person);
    }
    for (const dart of this.darts) {
      if (dart.fresh) {
        dart.fresh = false;
        this.events.push({ type: "shoot", pos: dart.pos });
      }
    }
    if (bruno.dropped) {
      this.fx.push({ text: "The mustache fell off!", pos: bruno.pos, age: 0 });
      this.events.push({ type: "mustache-off", pos: bruno.pos });
      bruno.dropped = null;
    }
    for (const fx of this.fx) fx.age += dt;
    this.fx = this.fx.filter((fx) => fx.age < 1.6);
    this.noises = [];
    this.lure = null;
    if (this.growlFx) {
      this.growlFx.age += dt;
      if (this.growlFx.age > 0.8) this.growlFx = null;
    }
  }

  alertEarshot(spotter) {
    // The drill sergeant's alarm reaches everyone. Heavy sleepers sleep through ordinary shouting.
    if (spotter.alarm && !this.alarm) {
      this.alarm = true;
      this.events.push({ type: "alarm", pos: spotter.pos });
    }
    const radius = spotter.alarm ? Infinity : SHOUT_RADIUS;
    for (const other of this.people) {
      if (other === spotter || !other.calmOrCurious || other.pos.dist(spotter.pos) > radius) continue;
      if (other.asleep && !spotter.alarm) continue;
      other.spot(other.armed ? undefined : choice(other.lines.alert), this.bruno.pos);
    }
  }

  // Sleepy darts, bear traps, honey pots and the contest stage.
  updateHazards(dt) {
    const bruno = this.bruno;
    for (const dart of this.darts) {
      dart.pos = dart.pos.add(dart.vel.scale(dt));
      dart.life -= dt;
      dart.age = (dart.age ?? 0) + dt;
      if (bruno.state !== BearState.ASLEEP && dart.pos.dist(bruno.pos) < Bruno.RADIUS + 4) {
        dart.life = 0;
        const out = bruno.hit();
        this.events.push({ type: out ? "asleep" : "hit", pos: bruno.pos });
      } else if (dart.age > 0.08 && this.blockers.some((b) => b.solid && dart.pos.dist(b.pos) < b.solid)) {
        dart.life = 0; // thunk, into a tree
        this.events.push({ type: "thunk", pos: dart.pos });
      }
    }
    this.darts = this.darts.filter((d) => d.life > 0);

    if (bruno.state !== BearState.FREE) return;
    for (const trap of this.traps) {
      if (!trap.sprung && bruno.pos.dist(trap.pos) < 20) {
        trap.sprung = true;
        bruno.pos = trap.pos;
        bruno.stunTimer = TRAP_TIME;
        this.noises.push({ pos: trap.pos, ...TRAP_NOISE });
        this.events.push({ type: "trap", pos: trap.pos });
        this.fx.push({ text: "SNAP! Stuck!", pos: trap.pos, age: 0 });
      }
    }
    for (const pot of this.honey) {
      if (!pot.eaten && this.armed && bruno.health < Bruno.MAX_HEALTH && bruno.pos.dist(pot.pos) < 28) {
        pot.eaten = true;
        bruno.health += 1;
        this.events.push({ type: "honey", pos: pot.pos });
        this.fx.push({ text: "+1 honey!", pos: pot.pos, age: 0 });
      }
    }
    const s = this.stage;
    const onStage = s && bruno.pos.x > s.x && bruno.pos.x < s.x + s.w && bruno.pos.y > s.y && bruno.pos.y < s.y + s.h;
    if (onStage && bruno.costume === "mascot" && !this.contestWon) {
      this.stageTime += dt;
      if (this.stageTime >= STAGE_TIME) {
        this.contestWon = true;
        this.events.push({ type: "cheer", pos: bruno.pos });
        this.fx.push({ text: "🏆 Benny wins the costume contest!", pos: bruno.pos, age: 0 });
      }
    } else {
      this.stageTime = 0;
    }
  }

  get caught() {
    return this.targets.filter((p) => p.state === PersonState.EATEN).length;
  }

  get outcome() {
    if (this.bruno.state === BearState.ASLEEP && !this.darts.length) return "asleep";
    if (this.targets.some((p) => p.state === PersonState.ESCAPED)) return "escaped";
    if (this.caught >= this.needed && this.bruno.state === BearState.FREE) return "won";
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
    intro: "Grab the dress, change where nobody can see. Kids aren't fooled!",
    tip: "NEW: Granny's dress is on the washing line!",
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
    costumes: [{ type: "grandma", pos: v(120, 390) }],
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
    tip: "NEW: Find the Queen costume!",
    bruno: new Bruno(v(60, 690)),
    people: [tower, patrol, desk],
    dark: true,
    canGrowl: true,
    fish: 2,
    costumes: [{ type: "grandma", pos: v(240, 560) }, { type: "queen", pos: v(1060, 640) }],
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
    tip: "NEW: Find the Snowman kit!",
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
    costumes: [{ type: "snowman", pos: v(190, 500) }, { type: "grandma", pos: v(1090, 340) }, { type: "queen", pos: v(160, 150) }],
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

function festival() {
  const visitor = (kidOrNot, start, points, look) =>
    new Person(v(...start), route(start, ...points), {
      voice: kidOrNot === "kid" ? "kid" : look.voice ?? "man",
      walkSpeed: kidOrNot === "kid" ? 55 : 45,
      viewDistance: 220,
      pause: [2, 5],
      shirt: look.shirt,
      hair: look.hair,
      idleLines: kidOrNot === "kid"
        ? ["Cotton candy!", "Can we go on that?", "Wheee!", "Balloons!"]
        : ["Lovely festival!", "Ooh, honey cakes.", "Who's winning the contest?"],
    });
  return new Level({
    number: 8,
    title: "Forest Festival",
    intro: "Catch 3 people - don't start a stampede!",
    tip: "NEW: Find the Mascot suits!",
    bruno: new Bruno(v(40, 690)),
    people: [
      visitor("kid", [250, 300], [[420, 290], [330, 380]], { shirt: "#f078a0", hair: "#e6be5a" }),
      visitor("kid", [900, 300], [[1060, 330], [980, 420]], { shirt: "#3cb371", hair: "#5a3c22" }),
      visitor("kid", [600, 560], [[720, 600], [820, 540]], { shirt: "#f1c40f", hair: "#3b2a1a" }),
      visitor("kid", [180, 520], [[300, 600], [420, 520]], { shirt: "#9b59b6", hair: "#c0392b" }),
      visitor("adult", [520, 260], [[700, 250], [760, 330]], { shirt: "#2e86ab", hair: "#3b2a1a" }),
      visitor("adult", [1120, 470], [[1000, 560], [1150, 600]], { shirt: "#c0392b", hair: "#7a5a3a", voice: "woman" }),
      visitor("adult", [380, 450], [[520, 470], [470, 560]], { shirt: "#e67e22", hair: "#d4a04c", voice: "woman" }),
      visitor("adult", [860, 470], [[920, 560], [800, 600]], { shirt: "#556b2f", hair: "#3b2a1a" }),
      visitor("adult", [1150, 300], [[1220, 380], [1100, 400]], { shirt: "#8e44ad", hair: "#f0d080", voice: "woman" }),
    ],
    goal: 3,
    fish: 2,
    canGrowl: true,
    costumes: [
      { type: "mascot", pos: v(120, 420) }, { type: "mascot", pos: v(1200, 600) },
      { type: "grandma", pos: v(640, 620) }, { type: "queen", pos: v(1215, 200) },
    ],
    ambience: { amb_organ: 0.3, amb_crowd: 0.35, amb_day: 0.15 },
    stage: { x: 560, y: 380, w: 170, h: 100 },
    props: [
      { type: "bunting", points: [v(150, 120), v(640, 200), v(1130, 120)] },
      { type: "stall", pos: v(240, 170), color: "#e74c3c" },
      { type: "stall", pos: v(470, 140), color: "#3498db" },
      { type: "stall", pos: v(820, 140), color: "#f1c40f" },
      { type: "stall", pos: v(1060, 180), color: "#2ecc71" },
      { type: "stage", x: 560, y: 380, w: 170, h: 100 },
      { type: "balloons", pos: v(330, 220) },
      { type: "balloons", pos: v(950, 220) },
      { type: "balloons", pos: v(760, 520) },
    ],
    blockers: [
      wall(240, 170, 48), wall(470, 140, 48), wall(820, 140, 48), wall(1060, 180, 48),
      bush(60, 330), bush(70, 520, 44), bush(1230, 520, 44), bush(1220, 680, 42), bush(640, 690, 44),
      bush(930, 690, 42), bush(330, 690, 44), bush(40, 90, 42), bush(1240, 90, 42), bush(640, 40, 40),
      tree(140, 30, 56), tree(1150, 30, 56), tree(1250, 300, 50), tree(20, 420, 50), tree(480, 700, 46), tree(800, 700, 46),
    ],
  });
}

function lodge() {
  const hunter = (start, points, extra) =>
    new Person(v(...start), route(start, ...points), {
      voice: "man",
      walkSpeed: 50,
      viewDistance: 280,
      armed: { range: 380, aim: 0.9, reload: 1.6 },
      shirt: "#5b6b2e",
      hair: "#e67e22", // blaze-orange cap
      idleLines: ["Quiet woods today.", "Any bears around here?", "*yawn*"],
      ...extra,
    });
  return new Level({
    number: 9,
    title: "Hunting Lodge",
    intro: "Dodge the red aim lines!",
    tip: "NEW: Hunters fight back! Watch for bear traps.",
    bruno: new Bruno(v(60, 690)),
    people: [
      hunter([360, 250], [], { pause: [30, 40], lookRange: 2.6, turnSpeed: 0.8, viewDistance: 330 }), // in the deer stand
      hunter([700, 560], [[1000, 600], [1150, 420], [760, 420], [520, 480]], { pause: [1.5, 3], lookRange: 1.4 }),
      new Person(v(980, 330), route([980, 330], [1180, 220], [980, 330]), {
        voice: "man",
        pauses: { 0: [6, 9], 1: [3, 4] },
        shirt: "#c0392b",
        hair: "#888888",
        idleLines: ["Stew's almost ready!", "More firewood…", "Lovely day."],
      }),
    ],
    armed: true,
    fish: 2,
    canGrowl: true,
    costumes: [{ type: "grandma", pos: v(1180, 600) }, { type: "queen", pos: v(100, 200) }],
    ground: "forest",
    ambience: { amb_day: 0.4 },
    traps: [v(250, 560), v(430, 420), v(560, 300), v(640, 520), v(880, 470), v(1080, 520), v(200, 330), v(820, 650)],
    honey: [v(470, 400), v(860, 680), v(150, 180)],
    props: [
      { type: "cabin", pos: v(980, 210), w: 240, h: 150 },
      { type: "tower", pos: v(360, 250) },
      { type: "woodpile", pos: v(1190, 250) },
      { type: "trail", points: [v(0, 520), v(300, 470), v(520, 480), v(760, 420), v(980, 330)] },
    ],
    blockers: [
      wall(910, 210, 75), wall(1050, 210, 75),
      bush(180, 600), bush(340, 520, 44), bush(470, 640), bush(620, 380, 44), bush(700, 660, 44), bush(900, 560, 44),
      bush(1100, 640, 44), bush(1220, 520, 42), bush(560, 200, 44), bush(200, 420, 42), bush(760, 270, 40), bush(120, 80, 42),
      tree(60, 300, 60), tree(260, 120, 60), tree(480, 560, 52), tree(780, 560, 52), tree(1230, 360, 56), tree(660, 120, 60),
      tree(1000, 470, 50),
    ],
  });
}

function armyCamp() {
  const soldier = (start, points, extra) =>
    new Person(v(...start), route(start, ...points), {
      voice: "soldier",
      soldier: true,
      target: false,
      walkSpeed: 55,
      fleeSpeed: 250,
      nightVision: 95,
      armed: { range: 400, aim: 0.8, reload: 1.4 },
      shirt: "#4b5320",
      hair: "#3d4a1e", // helmet
      lines: {
        spot: ["Intruder!"],
        alert: ["Intruder!"],
        bow: ["*salutes* Your Majesty!", "Ten-hut! The Queen!"],
        huh: ["Who goes there?", "Halt! Who's there?", "Huh?"],
        calm: ["All clear.", "Just the wind."],
      },
      idleLines: ["Hup, two, three, four!", "Quiet night.", "*yawn*"],
      ...extra,
    });
  const towerA = soldier([200, 150], [], { flashlight: { range: 480, angle: 22 }, nightVision: 70, pause: [30, 40], lookRange: 2.8, turnSpeed: 0.6 });
  const towerB = soldier([1080, 150], [], { flashlight: { range: 480, angle: 22 }, nightVision: 70, pause: [30, 40], lookRange: 2.8, turnSpeed: 0.6 });
  towerA.angle = 0.8;
  towerB.angle = Math.PI - 0.8;
  const patrolA = soldier([300, 560], [[620, 640], [900, 560], [620, 480]], { flashlight: { range: 290, angle: 38 }, pause: [1, 2] });
  const patrolB = soldier([1100, 420], [[1180, 640], [900, 680], [1000, 420]], { flashlight: { range: 290, angle: 38 }, pause: [1, 2] });
  const sergeant = soldier([640, 420], [[480, 330], [640, 420], [800, 330]], {
    voice: "sergeant",
    alarm: true,
    notFooled: ["soldier", "grandma"],
    flashlight: { range: 300, angle: 40 },
    pause: [2, 3],
    shirt: "#6b4e2a",
    lines: {
      spot: ["SOUND THE ALARM!"],
      alert: ["SOUND THE ALARM!"],
      bow: ["*salutes* Your Majesty!"],
      huh: ["WHO GOES THERE?!", "Private?!"],
      notGranny: ["Ma'am, this is a MILITARY camp!"],
      calm: ["As you were."],
    },
    idleLines: ["LEFT! RIGHT! LEFT!", "Ten-HUT!", "Shape up, soldiers!"],
  });
  const general = new Person(v(640, 290), route([640, 290]), {
    voice: "general",
    asleep: true,
    hearing: 0.6,
    pause: [30, 40],
    lookRange: 0,
    shirt: "#2f3a1a",
    hair: "#bbbbbb",
    idleLines: ["Zzz…", "Zzz… *snort*… zzz…"],
  });
  general.angle = Math.PI / 2;
  return new Level({
    number: 10,
    title: "The Army Camp",
    intro: "Catch the sleeping General. Don't let the Sergeant spot you!",
    tip: "NEW: Find the Soldier uniform!",
    bruno: new Bruno(v(60, 690)),
    people: [general, towerA, towerB, patrolA, patrolB, sergeant],
    goal: 1,
    armed: true,
    dark: true,
    ending: true,
    fish: 2,
    canGrowl: true,
    costumes: [{ type: "soldier", pos: v(1000, 600) }, { type: "grandma", pos: v(60, 470) }, { type: "queen", pos: v(1215, 250) }],
    ground: "night",
    ambience: { amb_crickets: 0.25, amb_march: 0.12 },
    lights: [{ pos: v(640, 250), radius: 110 }, { pos: v(640, 700), radius: 120 }],
    honey: [v(120, 420), v(1180, 300)],
    props: [
      { type: "armytent", pos: v(640, 190), w: 190, h: 120, star: true },
      { type: "cot", pos: v(640, 290) },
      { type: "lamp", pos: v(700, 270) },
      { type: "armytent", pos: v(380, 420), w: 140, h: 90 },
      { type: "armytent", pos: v(900, 420), w: 140, h: 90 },
      { type: "tower", pos: v(200, 150) },
      { type: "tower", pos: v(1080, 150) },
      { type: "truck", pos: v(1150, 560), color: "#4b5320" },
      { type: "sandbags", from: v(470, 560), to: v(810, 560) },
      { type: "flagpole", pos: v(640, 640) },
    ],
    blockers: [
      wall(580, 185, 62), wall(700, 185, 62), wall(345, 420, 50), wall(415, 420, 50), wall(865, 420, 50), wall(935, 420, 50),
      wall(1150, 560, 44), wall(500, 560, 26), wall(560, 560, 26), wall(620, 560, 26), wall(680, 560, 26), wall(740, 560, 26), wall(790, 560, 26),
      bush(140, 560), bush(260, 680, 44), bush(440, 650, 44), bush(860, 660, 44), bush(1230, 680, 42), bush(40, 300, 42),
      bush(460, 250, 44), bush(820, 250, 44), bush(1240, 420, 42), bush(320, 300, 42), bush(960, 300, 42),
      tree(30, 60, 56), tree(1250, 60, 56), tree(420, 60, 50), tree(860, 60, 50),
    ],
  });
}

export const LEVELS = [picnic, hiker, campfire, fishing, scouts, rangers, cabins, festival, lodge, armyCamp];
