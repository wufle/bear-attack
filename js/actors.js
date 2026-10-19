// Bruno and the people wandering through his territory.

const TAU = Math.PI * 2;

export class Vec {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  static fromAngle(a, len = 1) { return new Vec(Math.cos(a) * len, Math.sin(a) * len); }
  add(o) { return new Vec(this.x + o.x, this.y + o.y); }
  sub(o) { return new Vec(this.x - o.x, this.y - o.y); }
  scale(k) { return new Vec(this.x * k, this.y * k); }
  dot(o) { return this.x * o.x + this.y * o.y; }
  perp() { return new Vec(-this.y, this.x); }
  dist(o) { return Math.hypot(this.x - o.x, this.y - o.y); }
  get length() { return Math.hypot(this.x, this.y); }
  get angle() { return Math.atan2(this.y, this.x); }
  normalize() {
    const len = this.length;
    return len ? this.scale(1 / len) : new Vec();
  }
}

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const choice = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// Something round that blocks line of sight: a bush (Bruno can hide inside)
// or a tree (only behind). `solid` is the radius nobody can walk through.
export class Blocker {
  constructor(pos, radius, hideable, solid = 0, invisible = false) {
    this.pos = pos;
    this.radius = radius;
    this.hideable = hideable;
    this.solid = solid;
    this.invisible = invisible; // part of a building or truck, which is drawn as a prop
  }
}

export function segmentHitsCircle(a, b, center, radius) {
  const ab = b.sub(a);
  const lengthSq = ab.dot(ab);
  if (lengthSq === 0) return a.dist(center) < radius;
  const t = clamp(center.sub(a).dot(ab) / lengthSq, 0, 1);
  return a.add(ab.scale(t)).dist(center) < radius;
}

function pushOut(pos, radius, blockers, bounds) {
  for (const b of blockers) {
    if (b.solid <= 0) continue;
    const away = pos.sub(b.pos);
    const minDist = b.solid + radius;
    if (away.length > 0 && away.length < minDist) pos = b.pos.add(away.normalize().scale(minDist));
  }
  if (bounds) {
    pos = new Vec(
      clamp(pos.x, bounds.x + radius, bounds.x + bounds.w - radius),
      clamp(pos.y, bounds.y + radius, bounds.y + bounds.h - radius),
    );
  }
  return pos;
}

const inBounds = (pos, b) => pos.x >= b.x && pos.y >= b.y && pos.x < b.x + b.w && pos.y < b.y + b.h;

export const Gait = { SNEAK: "sneak", WALK: "walk", RUN: "run" };
export const BearState = {
  FREE: "free",
  POUNCING: "pouncing",
  TUSSLING: "tussling",
  LICKING: "licking",
  ASLEEP: "asleep", // too many sleepy darts
};
export const PersonState = {
  WANDER: "wander",
  INVESTIGATE: "investigate",
  FLEE: "flee",
  FIGHT: "fight", // armed: stands their ground and shoots sleepy darts
  CAUGHT: "caught",
  EATEN: "eaten",
  ESCAPED: "escaped",
};

export class Bruno {
  static RADIUS = 24;
  static SPEEDS = { sneak: 60, walk: 130, run: 215 };
  static NOISE = { sneak: 0, walk: 110, run: 280 };
  static POUNCE_DISTANCE = 110;
  static POUNCE_TIME = 0.22;
  static POUNCE_NOISE = 220;
  static POUNCE_COOLDOWN = 0.7;
  static TUSSLE_TIME = 2.2; // matches the eating sound
  static TUSSLE_NOISE = 250; // people nearby hear the commotion
  static LICK_TIME = 1.2; // a quick lick of the lips, then he can run (the "Mmm" plays on as he goes)
  static GROWL_RADIUS = 420;
  static GROWL_COOLDOWN = 3;
  static HEELS_NOISE = 200; // the Queen's royal shoes clip-clop, even when sneaking
  // Disguises slow Bruno down (and none of them can sprint).
  static COSTUME_SPEED = { grandma: 0.7, queen: 0.55, snowman: 0.45, mascot: 0.8, soldier: 0.9 };
  static MAX_HEALTH = 3; // honey pots, on levels where people shoot back

  constructor(pos) {
    this.pos = pos;
    this.facing = new Vec(1, 0);
    this.gait = Gait.WALK;
    this.moving = false;
    this.state = BearState.FREE;
    this.timer = 0;
    this.cooldown = 0;
    this.growlCooldown = 0;
    this.victim = null;
    this.costume = null; // "grandma", "queen", ... while disguised
    this.health = Bruno.MAX_HEALTH;
    this.stunTimer = 0; // briefly stuck: hit by a dart, or caught in a trap
    this.dropped = null; // a disguise someone just saw through (the soldier's mustache)
    this.velocity = new Vec(); // hunters aim a little ahead of a running bear
  }

  get canPounce() {
    return this.state === BearState.FREE && this.cooldown <= 0;
  }

  get noiseRadius() {
    if (this.state === BearState.POUNCING) return Bruno.POUNCE_NOISE;
    if (this.state === BearState.TUSSLING) return Bruno.TUSSLE_NOISE;
    if (this.state !== BearState.FREE || !this.moving) return 0;
    if (this.costume === "queen") return Math.max(Bruno.NOISE[this.gait], Bruno.HEELS_NOISE);
    return Bruno.NOISE[this.gait];
  }

  hidingIn(blockers) {
    return blockers.find((b) => b.hideable && this.pos.dist(b.pos) < b.radius - Bruno.RADIUS * 0.5) ?? null;
  }

  // `aim` is an optional direction (mouse click / screen tap); otherwise pounce the way he's facing.
  pounce(aim = null) {
    if (!this.canPounce) return;
    if (aim && aim.length > 0) this.facing = aim.normalize();
    this.state = BearState.POUNCING;
    this.timer = Bruno.POUNCE_TIME;
  }

  // Returns true if Bruno growled (he can't while busy, or too soon after the last one).
  growl() {
    if (this.state !== BearState.FREE || this.growlCooldown > 0) return false;
    this.growlCooldown = Bruno.GROWL_COOLDOWN;
    return true;
  }

  // A sleepy dart. Returns true if that one put him to sleep.
  hit() {
    if (this.state === BearState.ASLEEP) return false;
    this.health -= 1;
    this.stunTimer = Math.max(this.stunTimer, 0.5);
    if (this.health > 0) return false;
    this.state = BearState.ASLEEP;
    if (this.victim) this.victim.state = PersonState.WANDER; // they wriggle free
    this.victim = null;
    this.costume = null;
    return true;
  }

  update(dt, move, gait, bounds, people, blockers) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.growlCooldown = Math.max(0, this.growlCooldown - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    if (this.stunTimer > 0) move = new Vec();

    if (this.state === BearState.FREE) {
      // In a disguise Bruno can't sprint, and walks slowly.
      this.gait = this.costume && gait === Gait.RUN ? Gait.WALK : gait;
      this.moving = move.length > 0;
      if (this.moving) {
        this.facing = move.normalize();
        const speed = Bruno.SPEEDS[this.gait] * (Bruno.COSTUME_SPEED[this.costume] ?? 1);
        this.pos = this.pos.add(this.facing.scale(speed * dt));
      }
      this.velocity = this.moving ? this.facing.scale(Bruno.SPEEDS[this.gait] * (Bruno.COSTUME_SPEED[this.costume] ?? 1)) : new Vec();
    } else if (this.state === BearState.POUNCING) {
      this.pos = this.pos.add(this.facing.scale((Bruno.POUNCE_DISTANCE / Bruno.POUNCE_TIME) * dt));
      const victim = people.find(
        (p) => p.catchable && !p.animal && this.pos.dist(p.pos) < Bruno.RADIUS + p.radius + 6,
      );
      if (victim) {
        this.startTussle(victim);
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = BearState.FREE;
          this.cooldown = Bruno.POUNCE_COOLDOWN;
        }
      }
    } else if (this.state === BearState.TUSSLING) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.victim.state = PersonState.EATEN;
        this.victim = null;
        this.state = BearState.LICKING;
        this.timer = Bruno.LICK_TIME;
      }
    } else if (this.state === BearState.LICKING) {
      this.timer -= dt;
      if (this.timer <= 0) this.state = BearState.FREE;
    }

    this.pos = pushOut(this.pos, Bruno.RADIUS, blockers, bounds);
  }

  startTussle(victim) {
    this.state = BearState.TUSSLING;
    this.timer = Bruno.TUSSLE_TIME;
    this.victim = victim;
    this.moving = false;
    victim.state = PersonState.CAUGHT;
    this.pos = this.pos.add(victim.pos).scale(0.5);
    victim.pos = this.pos;
  }
}

const SUSPICIOUS_AT = 0.35;
const CALM_AT = 0.12;

// What people say. Each person can override any of these (see the dog in level.js).
const LINES = {
  huh: ["Huh?", "Hello…?", "What was that?", "Is someone there?"],
  growl: ["What was that noise?", "Here, puppy puppy?", "Is that a doggy?", "Hello? Who's there?"],
  rustle: ["Did that bush just move?", "Bushes don't walk…", "Weird bush."],
  calm: ["Must've been the wind.", "Oh well!", "Probably a squirrel."],
  spot: ["BEAR!!!"],
  alert: ["AAAAH!"],
  granny: ["Evening, ma'am!", "Hello, granny!", "Lovely dress!"], // grown-ups fooled by the disguise
  notGranny: ["THAT'S A BEAR IN A DRESS!", "Granny?! That's a BEAR!"], // kids are not
  bow: ["Your Majesty! *bows*", "*curtsies* Your Majesty!", "The Queen?! *bows deeply*"],
  notQueen: ["Wait… why is the Queen so HAIRY?", "That's no Queen!"],
  snowman: ["A snowman! Let's hug it!", "Ooh, a snowman!"], // kids run over to a snowman
  snowmanMoved: ["Did that snowman just MOVE?!", "Snowmen can't walk…"],
  tracks: ["Huh? Bear tracks!", "Are those… paw prints?", "Something big walked here…"],
  mascot: ["It's Benny the Bear!!", "Benny! Benny!", "Hug, Benny!"], // kids run to the mascot
  mascotHi: ["Hi Benny!", "Great costume!", "Ha! Love the suit!"],
  salute: ["Evening, private!", "*salutes*", "As you were, soldier."],
  mustache: ["That's a BEAR with a mustache!", "Your mustache fell off… BEAR!"],
  fight: ["Freeze, bear!", "Hold still!", "Got you now!"],
  lost: ["Where'd it go?", "Lost him…", "Keep your eyes open."],
  gotHim: ["Got him!", "Sweet dreams, bear!"],
  wake: ["Wha—? Who's there?", "Huh? I'm awake!"],
  heels: ["Who's that clip-clopping?", "Fancy shoes I hear…", "Click, clack… who's there?"],
};
const DOG_EAT_TIME = 6;
const BOW_TIME = 2.5; // how long people bow to the Queen - each person only bows once
const DART_SPEED = 520;
const MUSTACHE_RANGE = 150; // soldiers see through the fake mustache closer than this
const GIVE_UP_TIME = 7; // armed people stop hunting after losing Bruno this long
const PRINT_FOLLOW = 170; // how far apart footprints can be and still be followed

export class Person {
  constructor(pos, route, opts = {}) {
    this.pos = pos;
    this.route = route;
    this.routeIndex = 0;
    this.radius = opts.radius ?? 15;
    this.walkSpeed = opts.walkSpeed ?? 45;
    this.fleeSpeed = opts.fleeSpeed ?? 235;
    this.viewDistance = opts.viewDistance ?? 230;
    this.viewAngle = ((opts.viewAngle ?? 100) * Math.PI) / 180;
    this.hearing = opts.hearing ?? 1.0;
    this.turnSpeed = opts.turnSpeed ?? 2.5;
    this.pause = opts.pause ?? [2.5, 5.0];
    this.pauses = opts.pauses ?? []; // per-stop override: pauses[i] = [min, max] seconds at route[i]
    this.lookRange = opts.lookRange ?? 1.6; // how far they turn when looking around (radians)
    this.nightVision = opts.nightVision ?? 90; // how far they see in the dark
    this.idleLines = opts.idleLines ?? [];
    this.shirt = opts.shirt ?? "#f078a0";
    this.hair = opts.hair ?? "#e6be5a";
    this.voice = opts.voice ?? "man"; // kid | man | woman | fisher | dog - picks which sound clips play
    this.lines = { ...LINES, ...opts.lines };
    this.animal = this.voice === "dog"; // can't be caught and doesn't count, but raises the alarm
    this.isKid = this.voice === "kid"; // kids see through disguises
    this.smellRange = opts.smellRange ?? 0; // dogs smell Bruno from downwind of him
    this.eatTimer = 0;
    this.greeted = false;
    // A flashlight lets them see far in the dark, but only where it points: { range, angle (degrees) }.
    this.flashlight = opts.flashlight
      ? { range: opts.flashlight.range, angle: (opts.flashlight.angle * Math.PI) / 180 }
      : null;
    this.notFooled = opts.notFooled ?? []; // disguises this person sees straight through
    this.bowTimer = 0;
    this.bowed = false; // fooled by the Queen once already; never again
    this.hugCooldown = 0;
    this.tracking = false;
    this.lastPrintId = -1; // newest footprint they've already looked at
    // Armed people fight back with sleepy darts: { range, aim (seconds to aim), reload }.
    this.armed = opts.armed ?? null;
    this.aimTimer = 0;
    this.reload = 0;
    this.lostTimer = 0;
    this.lastSeen = null;
    this.target = opts.target ?? true; // false: doesn't need catching (soldiers), and can't "escape"
    this.asleep = opts.asleep ?? false; // can't see; only noise wakes them
    this.soldier = opts.soldier ?? false; // fooled by the soldier uniform from a distance
    this.alarm = opts.alarm ?? false; // spotting Bruno alerts the whole level (the drill sergeant)

    this.angle = 0;
    this.state = PersonState.WANDER;
    this.suspicion = 0;
    this.interest = null;
    this.quietTime = 0;
    this.pauseTimer = 0;
    this.lookTimer = 0;
    this.lookTarget = 0;
    this.speech = "";
    this.speechKind = "idle";
    this.speechTimer = 0;
    this.lureTarget = null;
  }

  get facing() { return Vec.fromAngle(this.angle); }

  get catchable() {
    return [PersonState.WANDER, PersonState.INVESTIGATE, PersonState.FLEE, PersonState.FIGHT].includes(this.state);
  }

  get calmOrCurious() {
    return this.state === PersonState.WANDER || this.state === PersonState.INVESTIGATE;
  }

  // `kind` (idle | huh | rustle | calm | scream) decides which voice clip plays.
  say(text, kind = "idle", duration = 2.2) {
    this.speech = text;
    this.speechKind = kind;
    this.speechTimer = duration;
  }

  // `at` is where they think the bear is (armed people go and look there).
  spot(line = undefined, at = null) {
    this.suspicion = 1;
    this.lureTarget = null;
    this.asleep = false;
    if (this.armed) {
      this.state = PersonState.FIGHT;
      this.lastSeen = at ?? this.interest;
      this.lostTimer = 0;
      this.aimTimer = 0;
      this.reload = 0.3;
      this.say(line ?? choice(this.lines.fight), "fight", 2.5);
    } else {
      this.state = PersonState.FLEE;
      this.say(line ?? choice(this.lines.spot), "scream", 3.0);
    }
  }

  // How far this person can see Bruno right now: not far in the dark, unless he's
  // in the light or in their flashlight beam.
  sightRange(env, inBeam = false) {
    if (!env.dark || env.brunoLit) return this.viewDistance;
    return inBeam ? this.flashlight.range : this.nightVision;
  }

  get bowing() {
    return this.bowTimer > 0;
  }

  // "clear" if Bruno is in plain view, "rustle" if the bush he's in is shaking, else null.
  canSee(bruno, blockers, env) {
    if (this.asleep) return null;
    const to = bruno.pos.sub(this.pos);
    const dist = to.length;
    const off = dist > 1 ? Math.abs(wrapAngle(to.angle - this.angle)) : 0;
    if (off > this.viewAngle / 2) return null;
    const inBeam = Boolean(this.flashlight) && off <= this.flashlight.angle / 2;
    this.lastSightRange = this.sightRange(env, inBeam);
    if (dist > this.lastSightRange + Bruno.RADIUS) return null;
    const hidingIn = bruno.hidingIn(blockers);
    for (const b of blockers) {
      if (b === hidingIn || this.pos.dist(b.pos) < b.radius) continue;
      if (segmentHitsCircle(this.pos, bruno.pos, b.pos, b.radius * 0.85)) return null;
    }
    if (hidingIn) return bruno.moving && bruno.gait !== Gait.SNEAK ? "rustle" : null;
    return "clear";
  }

  // Advance one frame. Returns true on the frame this person spots Bruno.
  // `env` describes the level this frame: { dark, brunoLit, noises: [{pos, radius, strength}], lure }.
  update(dt, bruno, blockers, bounds, env) {
    this.speechTimer -= dt;
    if (!this.catchable) return false;

    if (this.state === PersonState.FIGHT) return this.fight(dt, bruno, blockers, bounds, env);
    if (this.state === PersonState.FLEE) {
      let away = this.pos.sub(bruno.pos);
      if (away.length === 0) away = new Vec(1, 0);
      away = away.normalize().scale(this.fleeSpeed * dt);
      this.pos = pushOut(this.pos.add(away), this.radius, blockers, null);
      this.angle = away.angle;
      if (!inBounds(this.pos, bounds)) this.state = PersonState.ESCAPED;
      return false;
    }

    // Bowing to the Queen: frozen, eyes on the ground.
    if (this.bowTimer > 0) {
      this.bowTimer -= dt;
      if (this.bowTimer <= 0) this.bowed = true;
      return false;
    }
    this.hugCooldown = Math.max(0, this.hugCooldown - dt);

    if (this.animal && this.chaseFish(dt, env)) return false;

    let noticed = false;
    const dist = this.pos.dist(bruno.pos);
    const sight = this.canSee(bruno, blockers, env);
    const reaction = this.costumeReaction(bruno, sight);
    if (reaction === "bow") {
      this.bowTimer = BOW_TIME;
      this.lureTarget = null;
      this.say(choice(this.lines.bow), "bow", BOW_TIME);
      return false;
    }
    const fooled = reaction === "fooled";
    if (fooled) {
      this.suspicion -= dt * 0.3;
      const greeting = { grandma: this.lines.granny, mascot: this.lines.mascotHi, soldier: this.lines.salute }[bruno.costume];
      const huggable = bruno.costume === "snowman" || bruno.costume === "mascot";
      if (huggable && this.isKid && this.hugCooldown <= 0 && dist > 60) {
        // Kids can't resist a snowman, or Benny the Bear.
        this.hugCooldown = 10;
        this.greeted = true;
        this.lureTarget = bruno.pos;
        this.tracking = false;
        this.state = PersonState.INVESTIGATE;
        this.say(choice(bruno.costume === "mascot" ? this.lines.mascot : this.lines.snowman), "idle");
      } else if (greeting && !this.greeted && dist < 220) {
        this.greeted = true;
        this.say(choice(greeting), "calm");
      }
    } else if (reaction === "mustache") {
      // Close up, the fake mustache falls off.
      bruno.costume = null;
      bruno.dropped = "soldier";
      this.suspicion = Math.max(this.suspicion, 0.8);
      this.interest = bruno.pos;
      this.say(choice(this.lines.mustache), "huh");
      noticed = true;
    } else if (reaction === "moving-snowman") {
      this.suspicion += dt * 0.5;
      noticed = true;
      if (this.speechTimer <= 0) this.say(choice(this.lines.snowmanMoved), "rustle");
    } else if (sight === "clear") {
      if (bruno.state === BearState.TUSSLING || bruno.state === BearState.LICKING) this.suspicion = 1;
      const closeness = 1 - Math.min(dist / this.lastSightRange, 1);
      // A bear in a dress, or a "Queen" they've already bowed to, is extra alarming.
      const rate = (bruno.costume && this.isKid) || (bruno.costume === "queen" && this.bowed) ? 1.6 : 1;
      this.suspicion += dt * (0.5 + 2.0 * closeness) * rate;
      const seeThrough = { grandma: this.lines.notGranny, queen: this.lines.notQueen }[bruno.costume];
      if (seeThrough && this.speechTimer <= 0) this.say(choice(seeThrough), "huh");
      noticed = true;
    } else if (sight === "rustle") {
      this.suspicion += dt * 0.3;
      noticed = true;
      if (this.speechTimer <= 0 && this.suspicion > 0.2) this.say(choice(this.lines.rustle), "rustle");
    }

    // Dogs smell Bruno when the wind blows from him to them - bushes and disguises don't help.
    if (this.smellRange && env.wind && dist < this.smellRange && dist > 1) {
      const downwind = this.pos.sub(bruno.pos).normalize().dot(env.wind);
      if (downwind > 0.6) {
        this.suspicion += dt * (0.4 + 1.4 * (1 - dist / this.smellRange));
        noticed = true;
      }
    }

    // Footprints in the snow: they follow the trail.
    if (!noticed && !this.tracking && env.footprints?.length) {
      const print = this.spotPrint(env.footprints, blockers, env);
      if (print) {
        this.tracking = true;
        this.lastPrintId = print.id;
        this.lureTarget = print.pos;
        this.interest = print.pos;
        this.suspicion = Math.max(this.suspicion, SUSPICIOUS_AT + 0.1);
        this.state = PersonState.INVESTIGATE;
        this.say(choice(this.lines.tracks), "huh");
        noticed = true;
      }
    }

    // One-off noises, like a twig snapping under Bruno's paw.
    for (const noise of env.noises) {
      const d = this.pos.dist(noise.pos);
      if (d < noise.radius) {
        // Any snap they can hear makes them stop and look; a close one is worse.
        this.suspicion = Math.max(this.suspicion + noise.strength * (1 - d / noise.radius), SUSPICIOUS_AT + 0.05);
        this.interest = noise.pos;
        if (noise.line) this.say(noise.line, "huh");
        noticed = true;
      }
    }

    // A growl lures people over to see what made it.
    if (env.lure && this.pos.dist(env.lure) < Bruno.GROWL_RADIUS) {
      this.lureTarget = env.lure;
      this.interest = env.lure;
      this.suspicion = Math.max(this.suspicion, SUSPICIOUS_AT + 0.1);
      this.state = PersonState.INVESTIGATE;
      this.say(choice(this.lines.growl), "huh");
      noticed = true;
    }

    const hearingRange = bruno.noiseRadius * this.hearing;
    if (!fooled && dist < hearingRange) {
      this.suspicion += dt * 0.6 * (1 - dist / hearingRange);
      if (bruno.state === BearState.POUNCING) this.suspicion += dt * 3;
      noticed = true;
      // Clip-clop: they turn round right away to see who's coming (and then bow, too early).
      if (bruno.costume === "queen" && this.state === PersonState.WANDER) {
        this.interest = bruno.pos;
        this.suspicion = Math.max(this.suspicion, SUSPICIOUS_AT);
        this.state = PersonState.INVESTIGATE;
        this.say(choice(this.lines.heels), "huh");
      }
    }

    if (noticed) {
      if (sight || dist < hearingRange) this.interest = bruno.pos;
      this.quietTime = 0;
    } else if (!this.lureTarget) {
      this.quietTime += dt;
      if (this.quietTime > 1.5) this.suspicion -= dt * 0.15;
    }
    this.suspicion = clamp(this.suspicion, 0, 1);

    if (this.suspicion >= 1) {
      this.spot(bruno.costume && this.isKid ? choice(this.lines.notGranny) : undefined);
      return true;
    }
    if (this.asleep && this.suspicion >= SUSPICIOUS_AT) {
      this.asleep = false;
      this.say(choice(this.lines.wake), "huh");
    }
    if (this.state === PersonState.WANDER && this.suspicion >= SUSPICIOUS_AT) {
      this.state = PersonState.INVESTIGATE;
      if (this.speechTimer <= 0) this.say(choice(this.lines.huh), "huh");
    } else if (this.state === PersonState.INVESTIGATE && this.suspicion < CALM_AT && !this.lureTarget) {
      this.state = PersonState.WANDER;
      this.say(choice(this.lines.calm), "calm");
    }

    if (this.state === PersonState.INVESTIGATE) {
      if (this.lureTarget) {
        const to = this.lureTarget.sub(this.pos);
        if (to.length < 50) {
          // got there - follow the next footprint if there is one, otherwise nothing to see... yet
          const next = this.tracking ? this.nextPrint(env.footprints) : null;
          if (next) {
            this.lastPrintId = next.id;
            this.lureTarget = next.pos;
            this.interest = next.pos;
          } else {
            this.lureTarget = null;
            this.tracking = false;
          }
        } else {
          this.turnToward(to.angle, dt);
          this.pos = this.pos.add(to.normalize().scale(this.walkSpeed * dt));
        }
      } else if (this.interest) {
        this.turnToward(this.interest.sub(this.pos).angle, dt);
      }
    } else {
      this.wander(dt);
    }
    this.pos = pushOut(this.pos, this.radius, blockers, bounds);
    return false;
  }

  // How they react to Bruno's disguise when they can see him clearly:
  // "fooled" (no suspicion), "bow" (the Queen!), "moving-snowman", or null (they see a bear).
  costumeReaction(bruno, sight) {
    const costume = bruno.costume;
    if (sight !== "clear" || !costume || bruno.state !== BearState.FREE || this.animal) return null;
    if (this.notFooled.includes(costume)) return null;
    if (costume === "grandma") return this.isKid ? null : "fooled";
    if (costume === "queen") return this.bowed ? null : "bow";
    if (costume === "snowman") return bruno.moving ? "moving-snowman" : "fooled";
    if (costume === "mascot") return "fooled"; // everyone loves Benny the Bear
    if (costume === "soldier") {
      if (!this.soldier) return null;
      return this.pos.dist(bruno.pos) > MUSTACHE_RANGE ? "fooled" : "mustache";
    }
    return null;
  }

  // Armed and alert: aim (shown as a red line), fire a sleepy dart, reload. If Bruno
  // gets out of sight they go to where they last saw him, and give up after a while.
  fight(dt, bruno, blockers, bounds, env) {
    if (bruno.state === BearState.ASLEEP) {
      if (this.speechTimer <= -1) this.say(choice(this.lines.gotHim), "calm", 3);
      return false;
    }
    this.reload -= dt;
    const to = bruno.pos.sub(this.pos);
    const sight = this.canSee(bruno, blockers, env);
    if (sight === "clear") {
      this.lastSeen = bruno.pos;
      this.lostTimer = 0;
      this.turnToward(to.angle, dt * 2.5);
      if (to.length < this.armed.range) {
        this.aimTimer += dt;
        if (this.aimTimer >= this.armed.aim && this.reload <= 0) {
          // They guess how far ahead to aim, so a moving bear is sometimes missed, a still
          // one never is - and swerving after the "pfft" is the surest dodge.
          const lead = bruno.velocity.scale((to.length / DART_SPEED) * Math.random());
          const dir = to.add(lead).normalize();
          env.darts.push({ pos: this.pos.add(dir.scale(this.radius + 6)), vel: dir.scale(DART_SPEED), life: this.armed.range / DART_SPEED + 0.3, fresh: true });
          this.aimTimer = 0;
          this.reload = this.armed.reload;
        }
      } else {
        this.aimTimer = 0;
        this.pos = this.pos.add(to.normalize().scale(this.walkSpeed * 1.3 * dt));
      }
    } else {
      this.aimTimer = 0;
      this.lostTimer += dt;
      const toLast = this.lastSeen ? this.lastSeen.sub(this.pos) : new Vec();
      if (toLast.length > 30) {
        this.turnToward(toLast.angle, dt);
        this.pos = this.pos.add(toLast.normalize().scale(this.walkSpeed * 1.3 * dt));
      } else {
        this.turnToward(this.angle + 2, dt * 0.6); // look around
      }
      if (this.lostTimer > GIVE_UP_TIME) {
        this.state = PersonState.INVESTIGATE;
        this.suspicion = 0.5;
        this.say(choice(this.lines.lost), "calm");
      }
    }
    this.pos = pushOut(this.pos, this.radius, blockers, bounds);
    return false;
  }

  // The freshest footprint they haven't followed yet that they can see.
  spotPrint(prints, blockers, env) {
    const range = env.dark ? this.nightVision : this.viewDistance * 0.8;
    let best = null;
    for (const print of prints) {
      if (print.id <= this.lastPrintId || (best && print.id < best.id)) continue;
      const to = print.pos.sub(this.pos);
      if (to.length > range || Math.abs(wrapAngle(to.angle - this.angle)) > this.viewAngle / 2) continue;
      if (blockers.some((b) => this.pos.dist(b.pos) > b.radius && segmentHitsCircle(this.pos, print.pos, b.pos, b.radius * 0.85))) continue;
      best = print;
    }
    return best;
  }

  // While following a trail: the next newer footprint near the one they're standing on.
  nextPrint(prints) {
    let best = null;
    for (const print of prints ?? []) {
      if (print.id <= this.lastPrintId || this.pos.dist(print.pos) > PRINT_FOLLOW) continue;
      if (!best || print.id < best.id) best = print;
    }
    return best;
  }

  // Dogs drop everything for a fish. Returns true while the dog is busy with one.
  chaseFish(dt, env) {
    if (this.eatTimer > 0) {
      this.eatTimer -= dt;
      this.suspicion = Math.max(0, this.suspicion - dt * 0.3);
      return true;
    }
    const fish = env.fish.find((f) => f.landed && !f.eaten && this.pos.dist(f.pos) < 520);
    if (!fish) return false;
    const to = fish.pos.sub(this.pos);
    if (to.length < 16) {
      fish.eaten = true;
      this.eatTimer = DOG_EAT_TIME;
      this.state = PersonState.WANDER;
      this.say("*munch munch*", "eat", 3);
      return true;
    }
    this.turnToward(to.angle, dt);
    this.pos = this.pos.add(to.normalize().scale(Math.min(this.fleeSpeed * 0.55 * dt, to.length)));
    return true;
  }

  wander(dt) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = this.angle + rand(-this.lookRange, this.lookRange);
        this.lookTimer = rand(0.8, 1.6);
      }
      this.turnToward(this.lookTarget, dt);
      return;
    }
    const target = this.route[this.routeIndex];
    const to = target.sub(this.pos);
    if (to.length < 4) {
      this.pauseTimer = rand(...(this.pauses[this.routeIndex] ?? this.pause));
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.lookTimer = 0;
      if (this.idleLines.length && Math.random() < 0.5) this.say(choice(this.idleLines), "idle");
      return;
    }
    this.turnToward(to.angle, dt);
    const step = Math.min(this.walkSpeed * dt, to.length);
    this.pos = this.pos.add(to.normalize().scale(step));
  }

  turnToward(target, dt) {
    const diff = wrapAngle(target - this.angle);
    const step = this.turnSpeed * dt;
    this.angle += clamp(diff, -step, step);
  }
}
