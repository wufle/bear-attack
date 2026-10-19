// The main menu: a big interactive Bruno head, Continue / Choose Level, and the level picker.
// Pull his nose to make him growl, tap the top of his head to change his hat.

import { Vec } from "./actors.js";
import { HEIGHT, WIDTH } from "./level.js";

const FUR = "#7e502c";
const FUR_DARK = "#58361c";
const FUR_LIGHT = "#9a6a40";
const SNOUT = "#c89c6c";
const TONGUE = "#ec6e84";
const INK = "#1e1a16";
const TEXT = "#fcf8ec";
const GOLD = "#ffdc78";

const font = (px) => `bold ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function circle(ctx, pos, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, Math.max(r, 0), 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx, pos, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const HEAD_CENTER = new Vec(380, 420);
const HEAD_RADIUS = 190;
const NOSE_HOME = new Vec(0, 40); // relative to the head centre
const NOSE_GRAB = 48; // how close to the nose a press has to be to grab it
const NOSE_MAX_PULL = 130;
const GROWL_PULL = 65; // pull the nose this far and he growls
const GROWL_TIME = 1.3;
const LICK_TIME = 1.0;
const HEAD_COSTUMES = [null, "grandma", "queen", "snowman", "mascot", "soldier"];

export class BearHead {
  constructor() {
    this.center = HEAD_CENTER;
    this.pull = new Vec(); // how far the nose is stretched out
    this.grabbing = false;
    this.growlTime = 0;
    this.growled = false; // one growl per pull
    this.lickTime = 0;
    this.nextLick = rand(1.5, 3);
    this.costume = 0;
    this.costumePop = 0; // little bounce when the hat changes
    this.events = []; // sounds to play: "growl" | "lick" | "boop" | "costume"
  }

  get costumeName() {
    return HEAD_COSTUMES[this.costume];
  }

  // Returns true if the press landed on the head (so the menu buttons ignore it).
  press(at) {
    const rel = at.sub(this.center);
    if (rel.dist(NOSE_HOME) < NOSE_GRAB) {
      this.grabbing = true;
      this.growled = false;
      this.pull = rel.sub(NOSE_HOME);
      return true;
    }
    // The top of his head (or the hat on it): change costume.
    const onTop = rel.y < -95 && rel.y > -HEAD_RADIUS - 150 && Math.abs(rel.x) < HEAD_RADIUS + 20;
    if (onTop && (rel.length < HEAD_RADIUS + 60 || rel.y < -HEAD_RADIUS)) {
      this.costume = (this.costume + 1) % HEAD_COSTUMES.length;
      this.costumePop = 1;
      this.events.push("costume");
      return true;
    }
    return rel.length < HEAD_RADIUS;
  }

  drag(at) {
    if (!this.grabbing) return;
    let pull = at.sub(this.center).sub(NOSE_HOME);
    if (pull.length > NOSE_MAX_PULL) pull = pull.normalize().scale(NOSE_MAX_PULL);
    this.pull = pull;
    if (!this.growled && pull.length > GROWL_PULL) {
      this.growled = true;
      this.growlTime = GROWL_TIME;
      this.lickTime = 0;
      this.events.push("growl");
    }
  }

  // Leaving the menu: let go of his nose and stop growling.
  calm() {
    this.grabbing = false;
    this.growlTime = 0;
    this.pull = new Vec();
  }

  release() {
    if (!this.grabbing) return;
    this.grabbing = false;
    if (!this.growled) this.events.push("boop"); // just a little boop on the nose
  }

  update(dt) {
    this.growlTime = Math.max(0, this.growlTime - dt);
    this.costumePop = Math.max(0, this.costumePop - dt * 3);
    if (!this.grabbing) this.pull = this.pull.scale(Math.max(0, 1 - dt * 12)); // boing back
    if (this.lickTime > 0) {
      this.lickTime = Math.max(0, this.lickTime - dt);
    } else if (this.growlTime <= 0 && !this.grabbing) {
      this.nextLick -= dt;
      if (this.nextLick <= 0) {
        this.lickTime = LICK_TIME;
        this.nextLick = rand(2.5, 6);
        this.events.push("lick");
      }
    }
  }

  draw(ctx, t, pointer) {
    const shake = this.growlTime > 0 ? Math.sin(t * 70) * 7 * Math.min(1, this.growlTime * 2) : 0;
    const bob = Math.sin(t * 1.6) * 4;
    const c = this.center.add(new Vec(shake, bob));
    const at = (x, y) => c.add(new Vec(x, y));
    const R = HEAD_RADIUS;
    const angry = this.growlTime > 0;

    // ears
    for (const s of [-1, 1]) {
      circle(ctx, at(s * 140, -140), 64, FUR_DARK);
      circle(ctx, at(s * 140, -140), 36, "#b07a52");
    }
    if (this.costumeName === "mascot") {
      // Benny's jersey and bow tie peeking in under his chin
      ellipse(ctx, at(0, R - 10), 170, 60, "#f1c40f");
    }
    circle(ctx, c, R, FUR);
    ellipse(ctx, at(0, 30), 150, 140, FUR_LIGHT);

    // eyes, following the pointer
    const look = pointer ? pointer.sub(at(0, -40)) : new Vec();
    const lookOffset = look.length > 1 ? look.normalize().scale(Math.min(10, look.length / 30)) : new Vec();
    const googly = this.costumeName === "mascot";
    for (const s of [-1, 1]) {
      const eye = at(s * 72, -45);
      circle(ctx, eye, googly ? 38 : 27, "#ffffff");
      const wobble = googly ? Vec.fromAngle(t * 6 * s, 8) : new Vec();
      circle(ctx, eye.add(lookOffset).add(wobble), googly ? 15 : 13, INK);
      circle(ctx, eye.add(lookOffset).add(new Vec(-4, -5)), 4, "#ffffff");
      // eyebrows: cross when he's growling
      ctx.strokeStyle = FUR_DARK;
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eye.x - s * 30, eye.y - 42 + (angry ? 16 : 0)); // inner end dips when angry
      ctx.lineTo(eye.x + s * 30, eye.y - 44 - (angry ? 8 : 0));
      ctx.stroke();
    }
    if (this.costumeName === "grandma") {
      // granny specs
      ctx.strokeStyle = "#e6c34a";
      ctx.lineWidth = 6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(c.x + s * 72, c.y - 45, 36, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(c.x - 36, c.y - 45);
      ctx.lineTo(c.x + 36, c.y - 45);
      ctx.stroke();
    }

    // snout and mouth
    const snout = at(0, 80);
    ellipse(ctx, snout, 100, 76, SNOUT);
    if (angry) {
      // open, toothy GRRR
      ellipse(ctx, at(0, 120), 66, 36, "#5a1420");
      ctx.fillStyle = "#ffffff";
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(c.x + k * 17 - 8, c.y + 92);
        ctx.lineTo(c.x + k * 17 + 8, c.y + 92);
        ctx.lineTo(c.x + k * 17, c.y + 108);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(c.x + k * 17 - 7, c.y + 150);
        ctx.lineTo(c.x + k * 17 + 7, c.y + 150);
        ctx.lineTo(c.x + k * 17, c.y + 136);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + 70);
      ctx.lineTo(c.x, c.y + 100);
      ctx.moveTo(c.x - 48, c.y + 104);
      ctx.quadraticCurveTo(c.x - 24, c.y + 124, c.x, c.y + 100);
      ctx.quadraticCurveTo(c.x + 24, c.y + 124, c.x + 48, c.y + 104);
      ctx.stroke();
      if (this.lickTime > 0) {
        // the tongue slides out and swipes across his lips
        const p = 1 - this.lickTime / LICK_TIME;
        const out = Math.sin(p * Math.PI);
        const swipe = Math.sin(p * Math.PI * 2.5) * 46;
        ellipse(ctx, at(swipe, 112 + out * 6), 22 * out + 4, 16 * out + 3, TONGUE);
        ctx.strokeStyle = "#c04a60";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.x + swipe, c.y + 106);
        ctx.lineTo(c.x + swipe, c.y + 112 + out * 14);
        ctx.stroke();
      }
    }
    if (this.costumeName === "soldier") {
      // the fake mustache
      ctx.fillStyle = INK;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(c.x + s * 34, c.y + 82, 36, 12, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the nose: stretchy when you pull it
    const nose = at(NOSE_HOME.x, NOSE_HOME.y).add(this.pull);
    if (this.pull.length > 4) {
      ctx.strokeStyle = SNOUT;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(26, 60 - this.pull.length * 0.25);
      ctx.beginPath();
      ctx.moveTo(c.x + NOSE_HOME.x, c.y + NOSE_HOME.y + 10);
      ctx.lineTo(nose.x, nose.y);
      ctx.stroke();
    }
    if (this.costumeName === "snowman") {
      // a carrot nose over the top of his own
      ctx.fillStyle = "#f08a24";
      ctx.beginPath();
      ctx.moveTo(nose.x - 18, nose.y - 10);
      ctx.lineTo(nose.x + 18, nose.y - 10);
      ctx.lineTo(nose.x, nose.y + 40);
      ctx.fill();
    }
    ellipse(ctx, nose, 38, 27, INK);
    ellipse(ctx, nose.add(new Vec(-12, -9)), 10, 6, "#55504a");

    // scarf / collar under his chin
    if (this.costumeName === "snowman") {
      ctx.fillStyle = "#d6203a";
      ctx.fillRect(c.x - 150, c.y + R - 60, 300, 36);
      ctx.fillRect(c.x + 70, c.y + R - 40, 36, 80);
    }
    if (this.costumeName === "mascot") {
      ctx.fillStyle = "#e74c3c";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + R - 12);
        ctx.lineTo(c.x + s * 40, c.y + R - 34);
        ctx.lineTo(c.x + s * 40, c.y + R + 10);
        ctx.fill();
      }
      circle(ctx, at(0, R - 12), 10, "#c0392b");
    }
    if (this.costumeName === "queen") {
      // royal ermine collar
      ctx.fillStyle = "#f6f2ea";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + R - 16, 170, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = -6; k <= 6; k++) circle(ctx, at(k * 24, R - 16 + (k % 2) * 10), 4, INK);
    }

    // hats
    const pop = 1 + this.costumePop * 0.25;
    ctx.save();
    ctx.translate(c.x, c.y - R + 30);
    ctx.scale(pop, pop);
    this.drawHat(ctx);
    ctx.restore();

    if (angry) {
      ctx.font = font(64);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(40,10,10,0.8)";
      const y = 70 + Math.sin(t * 30) * 4;
      ctx.strokeText("GRRRRR!", c.x, y);
      ctx.fillStyle = "#ff6a4a";
      ctx.fillText("GRRRRR!", c.x, y);
    }
  }

  // Drawn with (0, 0) at the top of his head.
  drawHat(ctx) {
    const name = this.costumeName;
    if (name === "grandma") {
      circle(ctx, new Vec(0, -20), 58, "#cfcfcf");
      circle(ctx, new Vec(0, -20), 46, "#dedede");
      for (const [x, y] of [[-30, -40], [28, -10], [6, -55]]) circle(ctx, new Vec(x, y), 9, "#bdbdbd");
      circle(ctx, new Vec(42, -40), 14, "#ff8fc8"); // a flower
      circle(ctx, new Vec(42, -40), 5, "#ffe066");
    } else if (name === "queen") {
      ctx.fillStyle = "#f2c230";
      ctx.strokeStyle = "#a07a10";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-95, 10);
      ctx.lineTo(-95, -70);
      ctx.lineTo(-50, -25);
      ctx.lineTo(0, -100);
      ctx.lineTo(50, -25);
      ctx.lineTo(95, -70);
      ctx.lineTo(95, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const [x, y, col] of [[0, -20, "#d6203a"], [-55, -5, "#2e86de"], [55, -5, "#2ecc71"]]) circle(ctx, new Vec(x, y), 12, col);
      for (const x of [-95, 0, 95]) circle(ctx, new Vec(x, x === 0 ? -100 : -70), 10, "#fff6c0");
    } else if (name === "snowman") {
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(-110, -8, 220, 22);
      ctx.fillRect(-70, -130, 140, 126);
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(-70, -34, 140, 18);
    } else if (name === "mascot") {
      // a propeller cap
      ctx.fillStyle = "#3498db";
      ctx.beginPath();
      ctx.arc(0, 10, 90, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(-4, -100, 8, 26);
      ctx.save();
      ctx.translate(0, -100);
      ctx.rotate(performance.now() / 80);
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(-60, -6, 120, 12);
      ctx.restore();
    } else if (name === "soldier") {
      ctx.fillStyle = "#4b5320";
      ctx.beginPath();
      ctx.ellipse(0, 10, 150, 110, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#3d4a1e";
      ctx.fillRect(-160, 4, 320, 18);
      ctx.strokeStyle = "#5f6b2c";
      ctx.lineWidth = 4;
      for (const x of [-80, -20, 40, 100]) {
        ctx.beginPath();
        ctx.moveTo(x, -60);
        ctx.lineTo(x + 20, -10);
        ctx.stroke();
      }
    }
  }
}

// A clickable button on the canvas. Pushes its hit box onto `ui`.
export function button(ctx, ui, { x, y, w, h, label, action, big = false, disabled = false, hot = false }) {
  ctx.fillStyle = disabled ? "rgba(60,60,60,0.6)" : hot ? "rgba(255,220,120,0.92)" : "rgba(30,26,22,0.78)";
  ctx.strokeStyle = disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();
  ctx.font = font(big ? 34 : 24);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#999" : hot ? INK : TEXT;
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  if (!disabled) ui.push({ x, y, w, h, action });
}

export function hitButton(ui, at) {
  return ui.find((b) => at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h) ?? null;
}

function outlined(ctx, text, x, y, size, color) {
  ctx.font = font(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size / 6;
  ctx.strokeStyle = "rgba(20,14,8,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// `state`: { saved: { index, title } | null, unlocked, confirmReset }
export function drawMenu(ctx, background, head, t, pointer, state) {
  const ui = [];
  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(10,20,10,0.35)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  head.draw(ctx, t, pointer);

  const cx = 930;
  ctx.save();
  ctx.translate(cx, 120);
  ctx.rotate(Math.sin(t * 1.3) * 0.03);
  outlined(ctx, "BEAR", 0, -18, 92, GOLD);
  outlined(ctx, "ATTACK!", 0, 66, 92, "#ff8a5a");
  ctx.restore();

  const w = 420;
  const x = cx - w / 2;
  if (state.saved) {
    button(ctx, ui, { x, y: 290, w, h: 96, label: `▶ Continue`, action: "continue", big: true, hot: true });
    ctx.font = font(20);
    ctx.fillStyle = TEXT;
    ctx.textAlign = "center";
    ctx.fillText(`Level ${state.saved.index + 1}: ${state.saved.title}`, cx, 404);
  } else {
    button(ctx, ui, { x, y: 290, w, h: 96, label: "▶ Play", action: "continue", big: true, hot: true });
  }
  button(ctx, ui, { x, y: 436, w, h: 76, label: "Choose Level", action: "levels" });
  if (state.unlocked > 0 || state.saved) {
    button(ctx, ui, {
      x: cx - 150, y: 560, w: 300, h: 56,
      label: state.confirmReset ? "Tap again to reset!" : "Reset progress",
      action: "reset",
    });
  }
  ctx.globalAlpha = 0.85;
  outlined(ctx, "Pull my nose! · Tap my head!", head.center.x, HEIGHT - 26, 22, TEXT);
  ctx.globalAlpha = 1;
  return ui;
}

// `levels`: [{ number, title }], `unlocked`: highest index the player may pick.
export function drawLevelSelect(ctx, background, levels, unlocked, current) {
  const ui = [];
  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  outlined(ctx, "Choose a Level", WIDTH / 2, 90, 60, GOLD);
  const w = 212;
  const h = 150;
  const gap = 24;
  const left = (WIDTH - 5 * w - 4 * gap) / 2;
  levels.forEach((lvl, i) => {
    const x = left + (i % 5) * (w + gap);
    const y = 170 + Math.floor(i / 5) * (h + gap);
    const locked = i > unlocked;
    ctx.fillStyle = locked ? "rgba(50,50,50,0.75)" : i === current ? "rgba(255,220,120,0.9)" : "rgba(40,60,30,0.88)";
    ctx.strokeStyle = locked ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ink = i === current && !locked ? INK : TEXT;
    ctx.font = font(56);
    ctx.fillStyle = locked ? "#777" : ink;
    ctx.fillText(locked ? "🔒" : String(lvl.number), x + w / 2, y + 58);
    ctx.font = font(20);
    ctx.fillStyle = locked ? "#888" : ink;
    ctx.fillText(lvl.title, x + w / 2, y + 118);
    if (!locked) ui.push({ x, y, w, h, action: `level:${i}` });
  });
  button(ctx, ui, { x: WIDTH / 2 - 130, y: 560, w: 260, h: 70, label: "◀ Back", action: "menu" });
  return ui;
}
