// Drawing: the meadow, Bruno, people, and the HUD. Everything is in world
// coordinates (1280x720); main.js sets up the scaling to fit the screen.

import { BearState, Bruno, Gait, PersonState, Vec } from "./actors.js";
import { HEIGHT, WIDTH } from "./level.js";

const GRASS = "#629c48";
const GRASS_DARK = "#528a3e";
const BUSH = "#2c6834";
const BUSH_LIGHT = "#428444";
const TRUNK = "#6e4e30";
const CANOPY = "#34743a";
const CANOPY_LIGHT = "#468c48";
const FUR = "#7e502c";
const FUR_DARK = "#58361c";
const SNOUT = "#c89c6c";
const TONGUE = "#ec6e84";
const SKIN = "#f6ccaa";
const TEXT = "#fcf8ec";
const INK = "#1e1a16";
const CONE_COLORS = {
  [PersonState.WANDER]: "rgba(255,245,160,0.22)",
  [PersonState.INVESTIGATE]: "rgba(255,170,60,0.33)",
  [PersonState.FLEE]: "rgba(255,70,60,0.28)",
};

const font = (px) => `bold ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// Small seeded RNG so the meadow and the tussle cloud look the same each time.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(ctx, pos, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, Math.max(r, 0), 0, Math.PI * 2);
  ctx.fill();
}

export function makeBackground(resolution = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * resolution;
  canvas.height = HEIGHT * resolution;
  const ctx = canvas.getContext("2d");
  ctx.scale(resolution, resolution);
  const rng = seeded(1);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = GRASS_DARK;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 900; i++) {
    const x = rng() * WIDTH;
    const y = rng() * HEIGHT;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() * 4 - 2), y - 4 - rng() * 4);
    ctx.stroke();
  }
  const flowers = ["#ffffff", "#ffdc50", "#f08cc8"];
  for (let i = 0; i < 70; i++) {
    circle(ctx, new Vec(rng() * WIDTH, rng() * HEIGHT), 3, flowers[Math.floor(rng() * 3)]);
  }
  return canvas;
}

function drawBlanket(ctx, rect) {
  const square = 16;
  for (let i = 0, x = rect.x; x < rect.x + rect.w; i++, x += square) {
    for (let j = 0, y = rect.y; y < rect.y + rect.h; j++, y += square) {
      ctx.fillStyle = (i + j) % 2 ? "#dc3c3c" : "#faf5f0";
      ctx.fillRect(x, y, Math.min(square, rect.x + rect.w - x), Math.min(square, rect.y + rect.h - y));
    }
  }
  ctx.strokeStyle = "#b42828";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

function drawCones(ctx, people) {
  for (const p of people) {
    const color = CONE_COLORS[p.state];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.arc(p.pos.x, p.pos.y, p.viewDistance, p.angle - p.viewAngle / 2, p.angle + p.viewAngle / 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBush(ctx, b, seeThrough) {
  const r = b.radius;
  ctx.globalAlpha = seeThrough ? 0.6 : 1;
  for (const [dx, dy, k] of [[-0.4, -0.2, 0.65], [0.4, -0.3, 0.6], [0.3, 0.35, 0.62], [-0.35, 0.35, 0.6], [0, 0, 0.7]]) {
    circle(ctx, b.pos.add(new Vec(dx, dy).scale(r)), r * k, BUSH);
  }
  for (const [dx, dy] of [[-0.3, -0.35], [0.25, -0.15], [-0.05, 0.25]]) {
    circle(ctx, b.pos.add(new Vec(dx, dy).scale(r)), r * 0.22, BUSH_LIGHT);
  }
  ctx.globalAlpha = 1;
}

function drawCanopy(ctx, b) {
  ctx.globalAlpha = 0.9;
  circle(ctx, b.pos, b.radius, CANOPY);
  circle(ctx, b.pos.sub(new Vec(b.radius / 4, b.radius / 4)), b.radius / 2, CANOPY_LIGHT);
  ctx.globalAlpha = 1;
}

function drawPerson(ctx, p) {
  if (!p.catchable) return;
  const f = p.facing;
  const side = f.perp();
  circle(ctx, p.pos.add(side.scale(p.radius * 0.9)), p.radius * 0.35, SKIN);
  circle(ctx, p.pos.sub(side.scale(p.radius * 0.9)), p.radius * 0.35, SKIN);
  circle(ctx, p.pos, p.radius + 2, INK);
  circle(ctx, p.pos, p.radius, p.shirt);
  circle(ctx, p.pos.add(f.scale(2)), p.radius * 0.6, SKIN);
  circle(ctx, p.pos.sub(f.scale(2)), p.radius * 0.55, p.hair);
}

function drawMeter(ctx, p) {
  if (!p.catchable) return;
  const top = p.pos.sub(new Vec(0, p.radius + 14));
  let icon = null;
  let color = "#fff5a0";
  if (p.state === PersonState.FLEE) [icon, color] = ["!", "#ff463c"];
  else if (p.state === PersonState.INVESTIGATE) [icon, color] = ["?", "#ffaa3c"];
  if (p.suspicion > 0.02 && p.state !== PersonState.FLEE) {
    ctx.fillStyle = INK;
    ctx.fillRect(top.x - 18, top.y - 4, 36, 8);
    ctx.fillStyle = color;
    ctx.fillRect(top.x - 17, top.y - 3, 34 * p.suspicion, 6);
  }
  if (icon) {
    ctx.font = font(30);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = color;
    ctx.fillText(icon, top.x, top.y - 6);
  }
}

function drawSpeech(ctx, p) {
  if (p.speechTimer <= 0 || !p.catchable) return;
  ctx.font = font(20);
  const w = ctx.measureText(p.speech).width + 18;
  const h = 32;
  const x = Math.max(4, Math.min(WIDTH - w - 4, p.pos.x - w / 2));
  const y = Math.max(4, p.pos.y - p.radius - 44 - h);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.speech, x + w / 2, y + h / 2 + 1);
}

function drawNoise(ctx, bruno) {
  const r = bruno.noiseRadius;
  if (r <= 0) return;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bruno.pos.x, bruno.pos.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBruno(ctx, bruno, t) {
  if (bruno.state === BearState.TUSSLING) return; // drawn on top of the bushes instead
  const f = bruno.facing;
  const side = f.perp();
  const pos = bruno.pos;
  for (const s of [1, -1]) circle(ctx, pos.add(f.scale(8)).add(side.scale(s * 17)), 9, FUR_DARK);
  circle(ctx, pos, Bruno.RADIUS, FUR);
  circle(ctx, pos.add(f.scale(19)), 10, SNOUT);
  circle(ctx, pos.add(f.scale(27)), 4, INK);
  for (const s of [1, -1]) circle(ctx, pos.add(f.scale(9)).add(side.scale(s * 8)), 3, INK);

  if (bruno.state === BearState.LICKING) {
    const wiggle = Math.sin(t * 14) * 7;
    circle(ctx, pos.add(f.scale(24)).add(side.scale(wiggle)), 7, TONGUE);
    ctx.font = font(22);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = TEXT;
    ctx.fillText("*lick lick*  Mmm!", pos.x, pos.y - Bruno.RADIUS - 10);
  }
}

function drawTussle(ctx, pos, t) {
  const rng = seeded(Math.floor(t * 14));
  const between = (lo, hi) => lo + rng() * (hi - lo);
  for (let i = 0; i < 9; i++) {
    circle(ctx, pos.add(new Vec(between(-34, 34), between(-28, 28))), between(16, 28), "#c8beaf");
  }
  for (let i = 0; i < 4; i++) {
    const color = [FUR, SKIN, "#f078a0"][Math.floor(rng() * 3)];
    circle(ctx, pos.add(new Vec(between(-40, 40), between(-36, 36))), between(5, 9), color);
  }
  ctx.fillStyle = "#ffe63c";
  for (let i = 0; i < 3; i++) {
    const star = pos.add(new Vec(between(-50, 50), between(-46, 46)));
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2;
      const r = k % 2 === 0 ? 8 : 3.6;
      ctx.lineTo(star.x + Math.cos(a) * r, star.y + Math.sin(a) * r);
    }
    ctx.fill();
  }
  const words = ["POW!", "BONK!", "OOF!", "RAWR!"];
  ctx.font = font(32);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff078";
  ctx.fillText(words[Math.floor(rng() * words.length)], pos.x + between(-10, 10), pos.y - 52);
}

export function drawScene(ctx, background, level, t) {
  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
  for (const rect of level.blankets) drawBlanket(ctx, rect);
  drawCones(ctx, level.people);
  for (const b of level.blockers) if (b.solid) circle(ctx, b.pos, b.solid, TRUNK);
  drawNoise(ctx, level.bruno);
  for (const p of level.people) drawPerson(ctx, p);
  drawBruno(ctx, level.bruno, t);
  const hidingIn = level.bruno.hidingIn(level.blockers);
  for (const b of level.blockers) if (b.hideable) drawBush(ctx, b, b === hidingIn);
  for (const b of level.blockers) if (!b.hideable) drawCanopy(ctx, b);
  if (level.bruno.state === BearState.TUSSLING) drawTussle(ctx, level.bruno.pos, t);
  for (const p of level.people) {
    drawMeter(ctx, p);
    drawSpeech(ctx, p);
  }
}

const STATUS = { [Gait.SNEAK]: "Sneaking (silent)", [Gait.WALK]: "Walking", [Gait.RUN]: "Sprinting (LOUD!)" };

// `inset` keeps the HUD clear of the corner buttons: { left, right } in world units.
export function drawHud(ctx, level, touch, inset) {
  const shadowed = (text, x, y, align) => {
    ctx.textAlign = align;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = TEXT;
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = "top";
  ctx.font = font(30);
  const left = 18 + inset.left;
  shadowed(`Level ${level.number}: ${level.title}`, left, 14, "left");
  shadowed(`Caught ${level.caught}/${level.people.length}`, WIDTH - 18 - inset.right, 14, "right");

  const bruno = level.bruno;
  let status = "Standing still";
  if (bruno.hidingIn(level.blockers)) status = "Hiding in a bush";
  else if (bruno.moving) status = STATUS[bruno.gait];
  ctx.font = font(22);
  shadowed(status, left, 52, "left");

  if (!touch) {
    ctx.textBaseline = "bottom";
    ctx.font = font(20);
    shadowed(
      "WASD move · Shift sneak · Ctrl or double-tap W sprint · Click/Space pounce · Esc pause · R restart",
      18, HEIGHT - 12, "left",
    );
  }
}

export function drawCard(ctx, heading, body, prompt) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = HEIGHT / 2 - 110;
  ctx.font = font(72);
  ctx.fillStyle = "#ffdc78";
  ctx.fillText(heading, WIDTH / 2, y);
  y += 84;
  ctx.font = font(30);
  ctx.fillStyle = TEXT;
  for (const line of wrap(ctx, body, WIDTH - 300)) {
    ctx.fillText(line, WIDTH / 2, y);
    y += 40;
  }
  ctx.font = font(24);
  ctx.fillStyle = "#c8c8c8";
  ctx.fillText(prompt, WIDTH / 2, y + 40);
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}
