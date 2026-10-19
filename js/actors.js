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
  constructor(pos, radius, hideable, solid = 0) {
    this.pos = pos;
    this.radius = radius;
    this.hideable = hideable;
    this.solid = solid;
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
export const BearState = { FREE: "free", POUNCING: "pouncing", TUSSLING: "tussling", LICKING: "licking" };
export const PersonState = {
  WANDER: "wander",
  INVESTIGATE: "investigate",
  FLEE: "flee",
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
  static TUSSLE_TIME = 1.8;
  static LICK_TIME = 1.6;

  constructor(pos) {
    this.pos = pos;
    this.facing = new Vec(1, 0);
    this.gait = Gait.WALK;
    this.moving = false;
    this.state = BearState.FREE;
    this.timer = 0;
    this.cooldown = 0;
    this.victim = null;
  }

  get noiseRadius() {
    if (this.state === BearState.POUNCING) return Bruno.POUNCE_NOISE;
    if (this.state !== BearState.FREE || !this.moving) return 0;
    return Bruno.NOISE[this.gait];
  }

  hidingIn(blockers) {
    return blockers.find((b) => b.hideable && this.pos.dist(b.pos) < b.radius - Bruno.RADIUS * 0.5) ?? null;
  }

  // `aim` is an optional direction (mouse click / screen tap); otherwise pounce the way he's facing.
  pounce(aim = null) {
    if (this.state !== BearState.FREE || this.cooldown > 0) return;
    if (aim && aim.length > 0) this.facing = aim.normalize();
    this.state = BearState.POUNCING;
    this.timer = Bruno.POUNCE_TIME;
  }

  update(dt, move, gait, bounds, people, blockers) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.state === BearState.FREE) {
      this.gait = gait;
      this.moving = move.length > 0;
      if (this.moving) {
        this.facing = move.normalize();
        this.pos = this.pos.add(this.facing.scale(Bruno.SPEEDS[gait] * dt));
      }
    } else if (this.state === BearState.POUNCING) {
      this.pos = this.pos.add(this.facing.scale((Bruno.POUNCE_DISTANCE / Bruno.POUNCE_TIME) * dt));
      const victim = people.find((p) => p.catchable && this.pos.dist(p.pos) < Bruno.RADIUS + p.radius + 6);
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

const HUH_LINES = ["Huh?", "Hello…?", "What was that?", "Is someone there?"];
const RUSTLE_LINES = ["Did that bush just move?", "Bushes don't walk…", "Weird bush."];
const CALM_LINES = ["Must've been the wind.", "Oh well!", "Probably a squirrel."];

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
    this.idleLines = opts.idleLines ?? [];
    this.shirt = opts.shirt ?? "#f078a0";
    this.hair = opts.hair ?? "#e6be5a";

    this.angle = 0;
    this.state = PersonState.WANDER;
    this.suspicion = 0;
    this.interest = null;
    this.quietTime = 0;
    this.pauseTimer = 0;
    this.lookTimer = 0;
    this.lookTarget = 0;
    this.speech = "";
    this.speechTimer = 0;
  }

  get facing() { return Vec.fromAngle(this.angle); }

  get catchable() {
    return [PersonState.WANDER, PersonState.INVESTIGATE, PersonState.FLEE].includes(this.state);
  }

  get calmOrCurious() {
    return this.state === PersonState.WANDER || this.state === PersonState.INVESTIGATE;
  }

  say(text, duration = 2.2) {
    this.speech = text;
    this.speechTimer = duration;
  }

  spot(line = "BEAR!!!") {
    this.suspicion = 1;
    this.state = PersonState.FLEE;
    this.say(line, 3.0);
  }

  // "clear" if Bruno is in plain view, "rustle" if the bush he's in is shaking, else null.
  canSee(bruno, blockers) {
    const to = bruno.pos.sub(this.pos);
    const dist = to.length;
    if (dist > this.viewDistance + Bruno.RADIUS) return null;
    if (dist > 1 && Math.abs(wrapAngle(to.angle - this.angle)) > this.viewAngle / 2) return null;
    const hidingIn = bruno.hidingIn(blockers);
    for (const b of blockers) {
      if (b === hidingIn || this.pos.dist(b.pos) < b.radius) continue;
      if (segmentHitsCircle(this.pos, bruno.pos, b.pos, b.radius * 0.85)) return null;
    }
    if (hidingIn) return bruno.moving && bruno.gait !== Gait.SNEAK ? "rustle" : null;
    return "clear";
  }

  // Advance one frame. Returns true on the frame this person spots Bruno.
  update(dt, bruno, blockers, bounds) {
    this.speechTimer -= dt;
    if (!this.catchable) return false;

    if (this.state === PersonState.FLEE) {
      let away = this.pos.sub(bruno.pos);
      if (away.length === 0) away = new Vec(1, 0);
      away = away.normalize().scale(this.fleeSpeed * dt);
      this.pos = pushOut(this.pos.add(away), this.radius, blockers, null);
      this.angle = away.angle;
      if (!inBounds(this.pos, bounds)) this.state = PersonState.ESCAPED;
      return false;
    }

    let noticed = false;
    const dist = this.pos.dist(bruno.pos);
    const sight = this.canSee(bruno, blockers);
    if (sight === "clear") {
      if (bruno.state === BearState.TUSSLING || bruno.state === BearState.LICKING) this.suspicion = 1;
      const closeness = 1 - Math.min(dist / this.viewDistance, 1);
      this.suspicion += dt * (0.5 + 2.0 * closeness);
      noticed = true;
    } else if (sight === "rustle") {
      this.suspicion += dt * 0.3;
      noticed = true;
      if (this.speechTimer <= 0 && this.suspicion > 0.2) this.say(choice(RUSTLE_LINES));
    }

    const hearingRange = bruno.noiseRadius * this.hearing;
    if (dist < hearingRange) {
      this.suspicion += dt * 0.6 * (1 - dist / hearingRange);
      if (bruno.state === BearState.POUNCING) this.suspicion += dt * 3;
      noticed = true;
    }

    if (noticed) {
      this.interest = bruno.pos;
      this.quietTime = 0;
    } else {
      this.quietTime += dt;
      if (this.quietTime > 1.5) this.suspicion -= dt * 0.15;
    }
    this.suspicion = clamp(this.suspicion, 0, 1);

    if (this.suspicion >= 1) {
      this.spot();
      return true;
    }
    if (this.state === PersonState.WANDER && this.suspicion >= SUSPICIOUS_AT) {
      this.state = PersonState.INVESTIGATE;
      if (this.speechTimer <= 0) this.say(choice(HUH_LINES));
    } else if (this.state === PersonState.INVESTIGATE && this.suspicion < CALM_AT) {
      this.state = PersonState.WANDER;
      this.say(choice(CALM_LINES));
    }

    if (this.state === PersonState.INVESTIGATE) {
      if (this.interest) this.turnToward(this.interest.sub(this.pos).angle, dt);
    } else {
      this.wander(dt);
    }
    this.pos = pushOut(this.pos, this.radius, blockers, bounds);
    return false;
  }

  wander(dt) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = this.angle + rand(-1.6, 1.6);
        this.lookTimer = rand(0.8, 1.6);
      }
      this.turnToward(this.lookTarget, dt);
      return;
    }
    const target = this.route[this.routeIndex];
    const to = target.sub(this.pos);
    if (to.length < 4) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.pauseTimer = rand(...this.pause);
      this.lookTimer = 0;
      if (this.idleLines.length && Math.random() < 0.5) this.say(choice(this.idleLines));
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
