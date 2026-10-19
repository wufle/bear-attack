// Drawing: the meadow, Bruno, people, and the HUD. Everything is in world
// coordinates (1280x720); main.js sets up the scaling to fit the screen.

import { BearState, Bruno, Gait, PersonState, Vec } from "./actors.js";
import { HEIGHT, WIDTH } from "./level.js";

const GROUNDS = {
  meadow: { grass: "#629c48", tufts: "#528a3e", flowers: ["#ffffff", "#ffdc50", "#f08cc8"], flowerCount: 70 },
  forest: { grass: "#4f8a3c", tufts: "#3f7330", flowers: ["#e8d8a0", "#c86a3c"], flowerCount: 25 },
  night: { grass: "#4a7a3c", tufts: "#3c6830", flowers: ["#ffffff"], flowerCount: 20 },
  snow: { grass: "#eef3f6", tufts: "#d3dfe7", flowers: ["#ffffff"], flowerCount: 0 },
};
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
  [PersonState.FIGHT]: "rgba(255,40,40,0.3)",
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

export function makeBackground(ground = "meadow", resolution = 2) {
  const { grass, tufts, flowers, flowerCount } = GROUNDS[ground];
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * resolution;
  canvas.height = HEIGHT * resolution;
  const ctx = canvas.getContext("2d");
  ctx.scale(resolution, resolution);
  const rng = seeded(1);
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = tufts;
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
  for (let i = 0; i < flowerCount; i++) {
    circle(ctx, new Vec(rng() * WIDTH, rng() * HEIGHT), 3, flowers[Math.floor(rng() * flowers.length)]);
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

function drawTrail(ctx, points) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [width, color] of [[50, "#8a6a44"], [40, "#b8956a"]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
}

function drawLog(ctx, pos, angle, length = 80) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#6e4a2a";
  ctx.beginPath();
  ctx.roundRect(-length / 2, -11, length, 22, 10);
  ctx.fill();
  ctx.strokeStyle = "#4e321a";
  ctx.lineWidth = 2;
  ctx.stroke();
  circle(ctx, new Vec(length / 2 - 4, 0), 9, "#c8a070");
  ctx.restore();
}

function drawFire(ctx, pos, t, lit = true) {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    circle(ctx, pos.add(new Vec(Math.cos(a), Math.sin(a)).scale(30)), 8, "#8a8a8a");
  }
  drawLog(ctx, pos, 0.6, 50);
  drawLog(ctx, pos, -0.6, 50);
  if (!lit) return;
  const flicker = (k) => 1 + 0.15 * Math.sin(t * (9 + k) + k * 2);
  circle(ctx, pos, 22 * flicker(1), "#e8541e");
  circle(ctx, pos.add(new Vec(0, -2)), 15 * flicker(2), "#ffa628");
  circle(ctx, pos.add(new Vec(0, -4)), 8 * flicker(3), "#fff0a0");
}

function drawTent(ctx, prop) {
  const { pos, w, h } = prop;
  ctx.fillStyle = "#e07b39";
  ctx.beginPath();
  ctx.moveTo(pos.x - w / 2, pos.y - h / 2);
  ctx.lineTo(pos.x + w / 2, pos.y - h / 2);
  ctx.lineTo(pos.x + w / 2 + 12, pos.y + h / 2);
  ctx.lineTo(pos.x - w / 2 - 12, pos.y + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c4602a";
  ctx.fillRect(pos.x - w / 2, pos.y - 3, w, 6);
  ctx.fillStyle = "#3a2a1a";
  ctx.beginPath();
  ctx.moveTo(pos.x - 14, pos.y + h / 2);
  ctx.lineTo(pos.x, pos.y + 4);
  ctx.lineTo(pos.x + 14, pos.y + h / 2);
  ctx.fill();
}

function drawWoodpile(ctx, pos) {
  for (const [dx, dy, a] of [[-10, 8, 0.1], [10, 8, -0.1], [0, -6, 0.05]]) drawLog(ctx, pos.add(new Vec(dx, dy)), a, 60);
}

function drawWater(ctx, water, t) {
  for (const w of water) {
    ctx.fillStyle = "#c8b48a"; // sandy shore
    ctx.beginPath();
    ctx.ellipse(w.cx, w.cy, w.rx + 14, w.ry + 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d7ec4";
    ctx.beginPath();
    ctx.ellipse(w.cx, w.cy, w.rx, w.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4f92d6";
    ctx.beginPath();
    ctx.ellipse(w.cx - w.rx * 0.1, w.cy - w.ry * 0.1, w.rx * 0.75, w.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // little ripples drifting across
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    const rng = seeded(7);
    for (let i = 0; i < 14; i++) {
      const x = w.cx + (rng() - 0.5) * w.rx * 1.4 + Math.sin(t * 0.5 + i) * 6;
      const y = w.cy + (rng() - 0.5) * w.ry * 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.quadraticCurveTo(x, y - 4, x + 10, y);
      ctx.stroke();
    }
  }
}

function drawDock(ctx, d) {
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.strokeStyle = "#5e4024";
  ctx.lineWidth = 2;
  for (let y = d.y; y < d.y + d.h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(d.x, y);
    ctx.lineTo(d.x + d.w, y);
    ctx.stroke();
  }
  ctx.strokeRect(d.x, d.y, d.w, d.h);
}

function drawBobber(ctx, pos, t) {
  const bob = Math.sin(t * 3) * 2;
  circle(ctx, pos.add(new Vec(0, bob)), 6, "#e33");
  circle(ctx, pos.add(new Vec(0, bob - 2)), 3, "#fff");
}

function drawTackleBox(ctx, pos) {
  ctx.fillStyle = "#2a7a4a";
  ctx.fillRect(pos.x - 16, pos.y - 10, 32, 20);
  ctx.fillStyle = "#c8c8c8";
  ctx.fillRect(pos.x - 6, pos.y - 13, 12, 4);
}

function drawFlagpole(ctx, pos, t) {
  circle(ctx, pos, 6, "#9a9a9a");
  const wave = Math.sin(t * 4) * 4;
  ctx.fillStyle = "#d63c3c";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.quadraticCurveTo(pos.x + 22, pos.y - 6 + wave, pos.x + 44, pos.y + wave);
  ctx.lineTo(pos.x + 44, pos.y + 22 + wave);
  ctx.quadraticCurveTo(pos.x + 22, pos.y + 16 + wave, pos.x, pos.y + 22);
  ctx.fill();
}

function drawRoad(ctx, prop) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#b9c5cf";
  ctx.lineWidth = prop.width;
  ctx.beginPath();
  prop.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = "#a6b4c0";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCabin(ctx, prop) {
  const { pos, w, h } = prop;
  const x = pos.x - w / 2;
  const y = pos.y - h / 2;
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  // roof seen from above: two slopes and a ridge
  ctx.fillStyle = prop.snowy ? "#f2f6f8" : "#7a4a2a";
  ctx.fillRect(x, y, w, h / 2);
  ctx.fillStyle = prop.snowy ? "#dde6ec" : "#6a3e22";
  ctx.fillRect(x, y + h / 2, w, h / 2);
  ctx.fillStyle = "#4a3020";
  ctx.fillRect(x, y + h / 2 - 2, w, 4);
  ctx.fillStyle = "#8a5a3a";
  ctx.fillRect(x + w * 0.72, y + 12, 18, 18); // chimney
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(x + w * 0.72 + 4, y + 16, 10, 10);
}

function drawLamp(ctx, pos, t) {
  circle(ctx, pos, 7, "#3a3a3a");
  circle(ctx, pos, 4.5, `rgba(255,236,160,${0.85 + 0.15 * Math.sin(t * 7)})`);
}

function drawTower(ctx, pos) {
  ctx.strokeStyle = "#5e4024";
  ctx.lineWidth = 5;
  for (const [dx, dy] of [[-30, -30], [30, -30], [30, 30], [-30, 30]]) {
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + dx * 1.3, pos.y + dy * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(pos.x - 30, pos.y - 30, 60, 60);
  ctx.strokeStyle = "#5e4024";
  ctx.lineWidth = 3;
  ctx.strokeRect(pos.x - 30, pos.y - 30, 60, 60);
}

function drawTruck(ctx, pos, color = "#4f6b2e") {
  ctx.fillStyle = "#1e1e1e";
  for (const [dx, dy] of [[-30, -26], [26, -26], [-30, 20], [26, 20]]) ctx.fillRect(pos.x + dx, pos.y + dy, 10, 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(pos.x - 44, pos.y - 24, 88, 48, 8);
  ctx.fill();
  ctx.fillStyle = "#9ec3d6";
  ctx.fillRect(pos.x + 4, pos.y - 18, 14, 36);
  ctx.fillStyle = "#3b5222";
  ctx.fillRect(pos.x - 40, pos.y - 20, 40, 40);
}

function drawStall(ctx, pos, color) {
  // striped awning seen from above
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : color;
    ctx.fillRect(pos.x - 60 + i * 20, pos.y - 40, 20, 80);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pos.x - 60, pos.y - 40, 120, 80);
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(pos.x - 62, pos.y + 40, 124, 12); // counter
}

function drawStage(ctx, s) {
  ctx.fillStyle = "#9a6a3a";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = "#6e4a26";
  ctx.lineWidth = 2;
  for (let x = s.x; x < s.x + s.w; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, s.y);
    ctx.lineTo(x, s.y + s.h);
    ctx.stroke();
  }
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(s.x - 6, s.y - 22, s.w + 12, 22);
  ctx.font = font(15);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe48a";
  ctx.fillText("COSTUME CONTEST", s.x + s.w / 2, s.y - 11);
}

function drawBalloons(ctx, pos, t) {
  const colors = ["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#2ecc71"];
  ctx.strokeStyle = "rgba(60,60,60,0.6)";
  ctx.lineWidth = 1;
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2 + Math.sin(t + i) * 0.1;
    const at = pos.add(Vec.fromAngle(a, 18));
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    circle(ctx, at, 10, c);
    circle(ctx, at.add(new Vec(-3, -3)), 3, "rgba(255,255,255,0.6)");
  });
}

function drawBunting(ctx, points) {
  const colors = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"];
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  let k = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (let s = 0.05; s < 1; s += 0.09) {
      const p = a.add(b.sub(a).scale(s));
      ctx.fillStyle = colors[k++ % colors.length];
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y);
      ctx.lineTo(p.x + 7, p.y);
      ctx.lineTo(p.x, p.y + 13);
      ctx.fill();
    }
  }
}

function drawArmyTent(ctx, prop) {
  const { pos, w, h } = prop;
  ctx.fillStyle = "#3d4a1e";
  ctx.fillRect(pos.x - w / 2 - 4, pos.y - h / 2 - 4, w + 8, h + 8);
  ctx.fillStyle = "#56662a";
  ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h / 2);
  ctx.fillStyle = "#4b5a24";
  ctx.fillRect(pos.x - w / 2, pos.y, w, h / 2);
  if (prop.star) {
    ctx.fillStyle = "#f2c230";
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2;
      const r = k % 2 === 0 ? 16 : 7;
      ctx.lineTo(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r);
    }
    ctx.fill();
  }
}

function drawCot(ctx, pos) {
  ctx.fillStyle = "#6b7d3a";
  ctx.fillRect(pos.x - 34, pos.y - 16, 68, 32);
  ctx.strokeStyle = "#3d4a1e";
  ctx.lineWidth = 2;
  ctx.strokeRect(pos.x - 34, pos.y - 16, 68, 32);
}

function drawSandbags(ctx, from, to) {
  const n = Math.round(from.dist(to) / 26);
  for (let i = 0; i <= n; i++) {
    const p = from.add(to.sub(from).scale(i / n));
    ctx.fillStyle = "#b8a070";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a7448";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawTraps(ctx, traps) {
  for (const { pos, sprung } of traps) {
    ctx.strokeStyle = sprung ? "#5a5a5a" : "#7d7d7d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, sprung ? 9 : 14, 0, Math.PI * 2);
    ctx.stroke();
    if (!sprung) {
      ctx.lineWidth = 2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const inner = pos.add(Vec.fromAngle(a, 8));
        const outer = pos.add(Vec.fromAngle(a, 14));
        ctx.beginPath();
        ctx.moveTo(outer.x, outer.y);
        ctx.lineTo(inner.x, inner.y);
        ctx.stroke();
      }
      circle(ctx, pos, 3, "#9a9a9a");
    }
  }
}

function drawHoneyPot(ctx, pos, scale = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#c98a2a";
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a5a1a";
  ctx.fillRect(-8, -12, 16, 6);
  ctx.fillStyle = "#ffd75a";
  ctx.fillRect(-9, -1, 18, 6);
  ctx.restore();
}

function drawDarts(ctx, darts) {
  for (const d of darts) {
    const dir = d.vel.normalize();
    const tail = d.pos.sub(dir.scale(14));
    ctx.strokeStyle = "#cfcfcf";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(d.pos.x, d.pos.y);
    ctx.stroke();
    circle(ctx, tail, 3.5, "#ff5ab4"); // fluffy pink tail
  }
}

// A red line from each armed person to Bruno while they aim: move!
function drawAim(ctx, level) {
  for (const p of level.people) {
    if (p.state !== PersonState.FIGHT || p.aimTimer <= 0.05) continue;
    const k = Math.min(1, p.aimTimer / p.armed.aim);
    ctx.strokeStyle = `rgba(255,40,40,${0.25 + 0.6 * k})`;
    ctx.lineWidth = 1 + 2 * k;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(level.bruno.pos.x, level.bruno.pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawFx(ctx, fxs) {
  for (const fx of fxs) {
    ctx.globalAlpha = Math.max(0, 1 - fx.age / 1.6);
    ctx.font = font(24);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(20,20,20,0.7)";
    const y = fx.pos.y - 40 - fx.age * 25;
    ctx.strokeText(fx.text, fx.pos.x, y);
    ctx.fillStyle = "#ffe48a";
    ctx.fillText(fx.text, fx.pos.x, y);
  }
  ctx.globalAlpha = 1;
}

// Costumes waiting to be stolen, with a little twinkle so they're easy to spot.
function drawPickups(ctx, pickups, t) {
  for (const item of pickups) {
    if (item.taken) continue;
    const { x, y } = item.pos;
    if (item.type === "grandma" || item.type === "soldier") {
      // a washing line between two poles, with the outfit pegged on it
      ctx.strokeStyle = "#8a6a44";
      ctx.lineWidth = 4;
      for (const dx of [-30, 30]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y - 22);
        ctx.lineTo(x + dx, y + 16);
        ctx.stroke();
      }
      ctx.strokeStyle = "#e8e2d0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 30, y - 18);
      ctx.quadraticCurveTo(x, y - 10, x + 30, y - 18);
      ctx.stroke();
      ctx.fillStyle = item.type === "grandma" ? "#b56bb5" : "#556b2f";
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 14);
      ctx.lineTo(x + 9, y - 14);
      ctx.lineTo(x + 15, y + 12);
      ctx.lineTo(x - 15, y + 12);
      ctx.closePath();
      ctx.fill();
      if (item.type === "grandma") for (const [dx, dy] of [[-5, -6], [5, 0], [-6, 6], [7, 8]]) circle(ctx, new Vec(x + dx, y + dy), 2.2, "#ffd6f0");
      else for (const dy of [-6, 0, 6]) circle(ctx, new Vec(x, y + dy), 1.6, "#d8c060");
    } else if (item.type === "snowman") {
      // a carrot, a scarf and a bucket hat in the snow
      ctx.fillStyle = "#f08a24";
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 8);
      ctx.lineTo(x + 2, y - 13);
      ctx.lineTo(x + 2, y - 3);
      ctx.fill();
      ctx.strokeStyle = "#d6203a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 8);
      ctx.quadraticCurveTo(x, y + 2, x + 16, y + 12);
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.fillRect(x + 6, y - 14, 14, 12);
    } else {
      // a dressing-up trunk, lid open
      ctx.fillStyle = "#7a4a26";
      ctx.fillRect(x - 22, y - 6, 44, 22);
      ctx.fillStyle = "#5a3418";
      ctx.fillRect(x - 22, y - 18, 44, 10);
      ctx.fillStyle = "#d8b040";
      ctx.fillRect(x - 3, y - 2, 6, 6);
      if (item.type === "queen") drawCrown(ctx, new Vec(x, y - 20), 0, 1);
      else {
        circle(ctx, new Vec(x - 8, y - 14), 7, FUR); // Benny's big head peeking out
        circle(ctx, new Vec(x + 8, y - 14), 7, "#f1c40f");
      }
    }
  }
}

// Drawn over the darkness so costumes can be found at night too.
function drawPickupSparkles(ctx, pickups, t) {
  ctx.fillStyle = "#fff6b0";
  ctx.font = font(18);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { pos, taken } of pickups) {
    if (taken) continue;
    const twinkle = 0.5 + 0.5 * Math.sin(t * 4 + pos.x);
    ctx.globalAlpha = 0.4 + 0.6 * twinkle;
    ctx.fillText("✦", pos.x + 26, pos.y - 26 - twinkle * 4);
    ctx.fillText("✦", pos.x - 24, pos.y + 4 + twinkle * 3);
  }
  ctx.globalAlpha = 1;
}

// Getting changed: a spinning flurry of clothes and a progress ring.
function drawDressing(ctx, level, t) {
  if (!level.dressing) return;
  const pos = level.bruno.pos;
  const r = Bruno.RADIUS + 10;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ffe48a";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + level.dressProgress * Math.PI * 2);
  ctx.stroke();
  const colors = { grandma: "#b56bb5", queen: "#b3122e", snowman: "#ffffff", mascot: "#f1c40f", soldier: "#556b2f" };
  for (let k = 0; k < 3; k++) {
    circle(ctx, pos.add(Vec.fromAngle(t * 9 + (k * Math.PI * 2) / 3, r - 12)), 6, colors[level.dressing.costume]);
  }
  ctx.font = font(20);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = TEXT;
  ctx.fillText("Changing…", pos.x, pos.y - r - 6);
}

function drawSnowmanProp(ctx, pos) {
  circle(ctx, pos, 22, "#c9d6de");
  circle(ctx, pos, 20, "#ffffff");
  circle(ctx, pos.add(new Vec(0, -20)), 13, "#c9d6de");
  circle(ctx, pos.add(new Vec(0, -20)), 11.5, "#ffffff");
  circle(ctx, pos.add(new Vec(-4, -23)), 2, INK);
  circle(ctx, pos.add(new Vec(4, -23)), 2, INK);
}

function drawSledHill(ctx, pos) {
  ctx.strokeStyle = "rgba(150,170,185,0.6)";
  ctx.lineWidth = 3;
  for (const dx of [-12, 12]) {
    ctx.beginPath();
    ctx.moveTo(pos.x + dx - 20, pos.y - 120);
    ctx.lineTo(pos.x + dx + 20, pos.y + 130);
    ctx.stroke();
  }
}

function drawProps(ctx, props, t) {
  for (const prop of props) {
    if (prop.type === "blanket") drawBlanket(ctx, prop);
    else if (prop.type === "trail") drawTrail(ctx, prop.points);
    else if (prop.type === "fire") drawFire(ctx, prop.pos, t, prop.lit ?? true);
    else if (prop.type === "dock") drawDock(ctx, prop);
    else if (prop.type === "bobber") drawBobber(ctx, prop.pos, t);
    else if (prop.type === "tacklebox") drawTackleBox(ctx, prop.pos);
    else if (prop.type === "flagpole") drawFlagpole(ctx, prop.pos, t);
    else if (prop.type === "road") drawRoad(ctx, prop);
    else if (prop.type === "cabin") drawCabin(ctx, prop);
    else if (prop.type === "lamp") drawLamp(ctx, prop.pos, t);
    else if (prop.type === "tower") drawTower(ctx, prop.pos);
    else if (prop.type === "truck") drawTruck(ctx, prop.pos, prop.color);
    else if (prop.type === "stall") drawStall(ctx, prop.pos, prop.color);
    else if (prop.type === "stage") drawStage(ctx, prop);
    else if (prop.type === "balloons") drawBalloons(ctx, prop.pos, t);
    else if (prop.type === "bunting") drawBunting(ctx, prop.points);
    else if (prop.type === "armytent") drawArmyTent(ctx, prop);
    else if (prop.type === "cot") drawCot(ctx, prop.pos);
    else if (prop.type === "sandbags") drawSandbags(ctx, prop.from, prop.to);
    else if (prop.type === "snowman") drawSnowmanProp(ctx, prop.pos);
    else if (prop.type === "sledhill") drawSledHill(ctx, prop.pos);
    else if (prop.type === "tent") drawTent(ctx, prop);
    else if (prop.type === "log") drawLog(ctx, prop.pos, prop.angle);
    else if (prop.type === "woodpile") drawWoodpile(ctx, prop.pos);
  }
}

function drawTwigs(ctx, twigs) {
  ctx.lineCap = "round";
  for (const { pos, snapped } of twigs) {
    ctx.strokeStyle = snapped ? "#a08460" : "#5a3c20";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (snapped) {
      ctx.moveTo(pos.x - 12, pos.y + 2);
      ctx.lineTo(pos.x - 2, pos.y - 3);
      ctx.moveTo(pos.x + 2, pos.y + 4);
      ctx.lineTo(pos.x + 12, pos.y);
    } else {
      ctx.moveTo(pos.x - 12, pos.y + 4);
      ctx.lineTo(pos.x + 12, pos.y - 4);
      ctx.moveTo(pos.x + 2, pos.y - 1);
      ctx.lineTo(pos.x + 6, pos.y - 9);
    }
    ctx.stroke();
  }
}

// Night: darken everything except the firelight. Bruno and the people glow
// faintly so you can still see where they are.
function drawDarkness(ctx, level, t) {
  if (!level.dark) return;
  if (!drawDarkness.canvas) {
    drawDarkness.canvas = document.createElement("canvas");
    drawDarkness.canvas.width = WIDTH;
    drawDarkness.canvas.height = HEIGHT;
  }
  const c = drawDarkness.canvas.getContext("2d");
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = "rgba(6, 10, 32, 0.84)";
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.globalCompositeOperation = "destination-out";
  const hole = (pos, radius, strength) => {
    const g = c.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.8})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    c.fill();
  };
  for (const light of level.lights) hole(light.pos, light.radius * (1 + 0.03 * Math.sin(t * 11)), 1);
  hole(level.bruno.pos, 80, 0.55);
  for (const p of level.people) if (p.catchable) hole(p.pos, 45, 0.5);
  for (const p of level.people) {
    if (!p.flashlight || !p.calmOrCurious && p.state !== PersonState.FLEE || p.bowing) continue;
    const g = c.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.flashlight.range);
    g.addColorStop(0, "rgba(0,0,0,0.9)");
    g.addColorStop(0.75, "rgba(0,0,0,0.7)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(p.pos.x, p.pos.y);
    c.arc(p.pos.x, p.pos.y, p.flashlight.range, p.angle - p.flashlight.angle / 2, p.angle + p.flashlight.angle / 2);
    c.closePath();
    c.fill();
  }
  ctx.drawImage(drawDarkness.canvas, 0, 0);
  // warm glow on top of the firelight
  ctx.globalCompositeOperation = "lighter";
  for (const light of level.lights) {
    const g = ctx.createRadialGradient(light.pos.x, light.pos.y, 0, light.pos.x, light.pos.y, light.radius);
    g.addColorStop(0, "rgba(255,140,40,0.25)");
    g.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(light.pos.x, light.pos.y, light.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawGrowl(ctx, fx) {
  if (!fx) return;
  const k = fx.age / 0.8;
  ctx.strokeStyle = `rgba(255,120,80,${0.6 * (1 - k)})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, Bruno.GROWL_RADIUS * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = font(28);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = `rgba(255,200,160,${1 - k})`;
  ctx.fillText("GRRRR!", fx.pos.x, fx.pos.y - 40 - 20 * k);
}

function drawCones(ctx, people, dark) {
  const wedge = (p, range, spread) => {
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.arc(p.pos.x, p.pos.y, range, p.angle - spread / 2, p.angle + spread / 2);
    ctx.closePath();
    ctx.fill();
  };
  for (const p of people) {
    const color = CONE_COLORS[p.state];
    if (!color || p.bowing) continue; // bowing: eyes on the ground
    ctx.fillStyle = color;
    wedge(p, dark ? p.nightVision : p.viewDistance, p.viewAngle);
    if (dark && p.flashlight) wedge(p, p.flashlight.range, p.flashlight.angle);
  }
}

function drawBush(ctx, b, seeThrough, snowy) {
  const r = b.radius;
  ctx.globalAlpha = seeThrough ? 0.6 : 1;
  for (const [dx, dy, k] of [[-0.4, -0.2, 0.65], [0.4, -0.3, 0.6], [0.3, 0.35, 0.62], [-0.35, 0.35, 0.6], [0, 0, 0.7]]) {
    circle(ctx, b.pos.add(new Vec(dx, dy).scale(r)), r * k, BUSH);
  }
  for (const [dx, dy] of [[-0.3, -0.35], [0.25, -0.15], [-0.05, 0.25]]) {
    circle(ctx, b.pos.add(new Vec(dx, dy).scale(r)), r * 0.22, snowy ? "#f4f8fa" : BUSH_LIGHT);
  }
  if (snowy) for (const [dx, dy] of [[-0.4, -0.3], [0.35, -0.4]]) circle(ctx, b.pos.add(new Vec(dx, dy).scale(r)), r * 0.3, "#f4f8fa");
  ctx.globalAlpha = 1;
}

function drawCanopy(ctx, b, snowy) {
  ctx.globalAlpha = 0.9;
  circle(ctx, b.pos, b.radius, snowy ? "#2f5d3a" : CANOPY);
  circle(ctx, b.pos.sub(new Vec(b.radius / 4, b.radius / 4)), b.radius / 2, snowy ? "#f0f5f8" : CANOPY_LIGHT);
  if (snowy) circle(ctx, b.pos.add(new Vec(b.radius / 3, b.radius / 4)), b.radius / 4, "#f0f5f8");
  ctx.globalAlpha = 1;
}

function drawDog(ctx, p, t) {
  const f = p.facing;
  const side = f.perp();
  const wag = Math.sin(t * 16) * 6;
  ctx.strokeStyle = "#a0703c";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.pos.x - f.x * 16, p.pos.y - f.y * 16);
  const tail = p.pos.sub(f.scale(28)).add(side.scale(wag));
  ctx.lineTo(tail.x, tail.y);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(p.pos.x, p.pos.y, 20, 12, f.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8945a";
  ctx.beginPath();
  ctx.ellipse(p.pos.x, p.pos.y, 18, 10, f.angle, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, p.pos.add(f.scale(10)).add(side.scale(4)), 5, "#f4e6d0"); // white patch
  const head = p.pos.add(f.scale(19));
  circle(ctx, head, 9, "#c8945a");
  for (const s of [1, -1]) circle(ctx, head.sub(f.scale(3)).add(side.scale(s * 8)), 4, "#7a4e24");
  circle(ctx, head.add(f.scale(8)), 3, INK);
}

function drawPerson(ctx, p, t) {
  if (!p.catchable) return;
  if (p.animal) {
    drawDog(ctx, p, t);
    return;
  }
  const f = p.facing;
  const side = f.perp();
  circle(ctx, p.pos.add(side.scale(p.radius * 0.9)), p.radius * 0.35, SKIN);
  circle(ctx, p.pos.sub(side.scale(p.radius * 0.9)), p.radius * 0.35, SKIN);
  if (p.armed) {
    const muzzle = p.pos.add(f.scale(p.radius + 14)).add(side.scale(6));
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.pos.x + side.x * 6, p.pos.y + side.y * 6);
    ctx.lineTo(muzzle.x, muzzle.y);
    ctx.stroke();
  }
  circle(ctx, p.pos, p.radius + 2, INK);
  circle(ctx, p.pos, p.radius, p.shirt);
  if (p.asleep) {
    circle(ctx, p.pos.add(f.scale(-10)), p.radius * 0.6, SKIN); // head on the pillow
    ctx.font = font(18);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText("z z Z", p.pos.x + 12, p.pos.y - 14);
    return;
  }
  if (p.bowing) {
    // head down, so we see the top of it
    circle(ctx, p.pos.add(f.scale(7)), p.radius * 0.55, p.hair);
    return;
  }
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

function drawFishShape(ctx, pos, angle, scale = 1) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#e08a5a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-20, -7);
  ctx.lineTo(-20, 7);
  ctx.fill();
  circle(ctx, new Vec(8, -1.5), 1.6, INK);
  ctx.restore();
}

function drawFish(ctx, fishes, t) {
  for (const fish of fishes) {
    if (fish.landed) {
      drawFishShape(ctx, fish.pos, Math.sin(t * 10 + fish.age) * 0.25); // flopping
    } else {
      const k = fish.age / 0.45;
      const at = fish.from.add(fish.pos.sub(fish.from).scale(k));
      const lift = Math.sin(k * Math.PI) * 50;
      drawFishShape(ctx, at.sub(new Vec(0, lift)), k * Math.PI * 4, 1 + Math.sin(k * Math.PI) * 0.4);
    }
  }
}

// Where a dog can smell Bruno from: upwind of the dog.
function drawSmell(ctx, level) {
  if (!level.wind) return;
  for (const p of level.people) {
    if (!p.smellRange || !p.calmOrCurious || p.eatTimer > 0) continue;
    const a = level.wind.angle + Math.PI;
    const spread = Math.acos(0.6);
    ctx.fillStyle = "rgba(160,80,255,0.24)";
    ctx.strokeStyle = "rgba(200,140,255,0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.arc(p.pos.x, p.pos.y, p.smellRange, a - spread, a + spread);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
  if (bruno.costume === "snowman") {
    drawSnowmanBruno(ctx, bruno, t);
    return;
  }
  if (bruno.state === BearState.ASLEEP) {
    for (const s of [1, -1]) circle(ctx, pos.add(f.scale(8)).add(side.scale(s * 17)), 9, FUR_DARK);
    circle(ctx, pos, Bruno.RADIUS, FUR);
    circle(ctx, pos.add(f.scale(19)), 10, SNOUT);
    circle(ctx, pos.add(f.scale(27)), 4, INK);
    ctx.font = font(26);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText("Z z z", pos.x + 10 + Math.sin(t * 2) * 4, pos.y - Bruno.RADIUS - 8);
    return;
  }
  for (const s of [1, -1]) circle(ctx, pos.add(f.scale(8)).add(side.scale(s * 17)), 9, FUR_DARK);
  circle(ctx, pos, Bruno.RADIUS, FUR);
  if (bruno.costume === "queen") {
    // red royal robe with an ermine collar
    circle(ctx, pos.sub(f.scale(2)), Bruno.RADIUS + 4, "#b3122e");
    ctx.strokeStyle = "#f6f2ea";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Bruno.RADIUS - 6, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 8; k++) circle(ctx, pos.add(Vec.fromAngle((k * Math.PI) / 4, Bruno.RADIUS - 6)), 1.6, INK);
  }
  if (bruno.costume === "grandma") {
    // flowery dress and shawl, grey bun, specs - very convincing
    circle(ctx, pos.sub(f.scale(2)), Bruno.RADIUS + 3, "#b56bb5");
    for (const [dx, dy] of [[-10, -8], [8, -12], [12, 8], [-6, 12], [-14, 4]]) {
      circle(ctx, pos.add(new Vec(dx, dy)), 3, "#ffd6f0");
    }
    ctx.strokeStyle = "#7d3f8a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Bruno.RADIUS - 4, f.angle + 1.2, f.angle + Math.PI * 2 - 1.2);
    ctx.stroke();
    circle(ctx, pos.sub(f.scale(10)), 9, "#d8d8d8"); // bun
  }
  if (bruno.costume === "mascot") circle(ctx, pos.sub(f.scale(3)), Bruno.RADIUS + 2, "#f1c40f"); // jersey
  if (bruno.costume === "soldier") circle(ctx, pos.sub(f.scale(2)), Bruno.RADIUS + 3, "#556b2f"); // uniform
  circle(ctx, pos.add(f.scale(19)), 10, SNOUT);
  circle(ctx, pos.add(f.scale(27)), 4, INK);
  for (const s of [1, -1]) circle(ctx, pos.add(f.scale(9)).add(side.scale(s * 8)), 3, INK);
  if (bruno.costume === "queen") drawCrown(ctx, pos.sub(f.scale(4)), 0, 1);
  if (bruno.costume === "mascot") {
    // Benny the Bear: a bear dressed as a bear, in a jersey, with big googly eyes
    for (const s of [1, -1]) {
      const eye = pos.add(f.scale(10)).add(side.scale(s * 8));
      circle(ctx, eye, 6, "#ffffff");
      circle(ctx, eye.add(f.scale(2)), 3, INK);
    }
    const tie = pos.sub(f.scale(4));
    ctx.fillStyle = "#e74c3c";
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(tie.x, tie.y);
      const a = tie.add(side.scale(s * 9)).add(f.scale(5));
      const b = tie.add(side.scale(s * 9)).sub(f.scale(5));
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.fill();
    }
  }
  if (bruno.costume === "soldier") {
    // a fake mustache under the nose and a helmet
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const lip = pos.add(f.scale(22));
    ctx.beginPath();
    ctx.moveTo(lip.x + side.x * 9, lip.y + side.y * 9);
    ctx.lineTo(lip.x - side.x * 9, lip.y - side.y * 9);
    ctx.stroke();
    circle(ctx, pos.sub(f.scale(4)), 15, "#4b5320");
    circle(ctx, pos.sub(f.scale(6)), 9, "#5a6628");
  }
  if (bruno.costume === "grandma") {
    ctx.strokeStyle = "#e6c34a";
    ctx.lineWidth = 2;
    for (const s of [1, -1]) {
      const eye = pos.add(f.scale(9)).add(side.scale(s * 8));
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

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

function drawCrown(ctx, pos, angle, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#f2c230";
  ctx.strokeStyle = "#a07a10";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-13, 7);
  ctx.lineTo(-13, -6);
  ctx.lineTo(-7, 1);
  ctx.lineTo(0, -10);
  ctx.lineTo(7, 1);
  ctx.lineTo(13, -6);
  ctx.lineTo(13, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  circle(ctx, new Vec(0, 2), 2.5, "#d6203a");
  ctx.restore();
}

function drawSnowmanBruno(ctx, bruno, t) {
  const f = bruno.facing;
  const side = f.perp();
  const wobble = bruno.moving ? Math.sin(t * 12) * 2 : 0;
  const pos = bruno.pos.add(side.scale(wobble));
  // bear ears poking out the back... nobody will notice
  for (const s of [1, -1]) circle(ctx, pos.sub(f.scale(12)).add(side.scale(s * 15)), 7, FUR_DARK);
  circle(ctx, pos.sub(f.scale(8)), 28, "#c9d6de");
  circle(ctx, pos.sub(f.scale(8)), 26, "#ffffff");
  circle(ctx, pos.add(f.scale(12)), 17, "#c9d6de");
  circle(ctx, pos.add(f.scale(12)), 15.5, "#ffffff");
  for (const k of [-10, -2, 6]) circle(ctx, pos.add(f.scale(k - 8)), 2.2, INK); // coal buttons... from above
  const head = pos.add(f.scale(12));
  for (const s of [1, -1]) circle(ctx, head.add(f.scale(4)).add(side.scale(s * 6)), 2.4, INK);
  ctx.fillStyle = "#f08a24";
  ctx.beginPath();
  const tip = head.add(f.scale(26));
  const baseA = head.add(f.scale(9)).add(side.scale(3.5));
  const baseB = head.add(f.scale(9)).sub(side.scale(3.5));
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseA.x, baseA.y);
  ctx.lineTo(baseB.x, baseB.y);
  ctx.fill();
}

function drawFootprints(ctx, prints) {
  for (const p of prints) {
    const fade = Math.max(0, 1 - p.age / 30);
    ctx.globalAlpha = 0.55 * fade;
    const f = Vec.fromAngle(p.angle);
    const at = p.pos.add(f.perp().scale(p.side * 9));
    circle(ctx, at, 6, "#8fa6b6");
    for (const s of [-1, 0, 1]) circle(ctx, at.add(f.scale(8)).add(f.perp().scale(s * 4.5)), 2.3, "#8fa6b6");
  }
  ctx.globalAlpha = 1;
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
  drawWater(ctx, level.water, t);
  drawProps(ctx, level.props, t);
  drawFootprints(ctx, level.footprints);
  drawTwigs(ctx, level.twigs);
  drawTraps(ctx, level.traps);
  drawPickups(ctx, level.pickups, t);
  for (const pot of level.honey) if (!pot.eaten) drawHoneyPot(ctx, pot.pos);
  drawSmell(ctx, level);
  drawCones(ctx, level.people, level.dark);
  for (const b of level.blockers) if (b.solid && !b.invisible) circle(ctx, b.pos, b.solid, TRUNK);
  drawNoise(ctx, level.bruno);
  for (const p of level.people) drawPerson(ctx, p, t);
  drawFish(ctx, level.fish.filter((f) => f.landed), t);
  drawBruno(ctx, level.bruno, t);
  const hidingIn = level.bruno.hidingIn(level.blockers);
  const snowy = level.ground === "snow";
  for (const b of level.blockers) if (b.hideable) drawBush(ctx, b, b === hidingIn, snowy);
  for (const b of level.blockers) if (!b.hideable && !b.invisible) drawCanopy(ctx, b, snowy);
  drawDarkness(ctx, level, t);
  drawPickupSparkles(ctx, level.pickups, t);
  if (level.bruno.state === BearState.TUSSLING) drawTussle(ctx, level.bruno.pos, t);
  drawGrowl(ctx, level.growlFx);
  drawDressing(ctx, level, t);
  if (level.crownFx) {
    const { pos, age } = level.crownFx;
    const fade = Math.max(0, 1 - age / 1.2);
    drawCrown(ctx, pos.add(new Vec(age * 60, -40 * Math.sin(age * 3) + age * 30)), age * 9, fade);
    ctx.globalAlpha = fade;
    ctx.font = font(22);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#ffd75a";
    ctx.fillText("The crown rolled away!", pos.x, pos.y - 46);
    ctx.globalAlpha = 1;
  }
  drawFish(ctx, level.fish.filter((f) => !f.landed), t);
  drawAim(ctx, level);
  drawDarts(ctx, level.darts);
  drawFx(ctx, level.fx);
  for (const p of level.people) {
    drawMeter(ctx, p);
    drawSpeech(ctx, p);
  }
}

export const COSTUME_NAMES = { grandma: "Granny", queen: "the Queen", snowman: "a Snowman", mascot: "Benny", soldier: "a Soldier" };
const STATUS = { [Gait.SNEAK]: "Sneaking (silent)", [Gait.WALK]: "Walking", [Gait.RUN]: "Sprinting (LOUD!)" };

// `inset` keeps the HUD clear of the corner buttons: { left, right } in world units.
export function drawHud(ctx, level, touch, inset) {
  // Dark outline so the text reads on grass, at night and on snow.
  const shadowed = (text, x, y, align) => {
    ctx.textAlign = align;
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(20,24,20,0.7)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = TEXT;
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = "top";
  ctx.font = font(30);
  const left = 18 + inset.left;
  shadowed(`Level ${level.number}: ${level.title}`, left, 14, "left");
  shadowed(`Caught ${level.caught}/${level.needed}`, WIDTH - 18 - inset.right, 14, "right");

  const bruno = level.bruno;
  let status = "Standing still";
  if (bruno.hidingIn(level.blockers)) status = "Hiding in a bush";
  else if (bruno.moving) status = STATUS[bruno.gait];
  if (bruno.costume) status = `Disguised as ${COSTUME_NAMES[bruno.costume]} · ${status}`;
  else if (level.dressing) status = `Changing into ${COSTUME_NAMES[level.dressing.costume]} - don't get seen!`;
  else if (level.bag.length) status = `${status} · Press C to put on a disguise`;
  ctx.font = font(22);
  shadowed(status, left, 52, "left");

  if (level.wind) drawWind(ctx, level.wind);
  if (level.armed) {
    // health: honey pots under the status line
    for (let i = 0; i < Bruno.MAX_HEALTH; i++) {
      ctx.globalAlpha = i < bruno.health ? 1 : 0.25;
      drawHoneyPot(ctx, new Vec(left + 14 + i * 32, 98), 0.95);
    }
    ctx.globalAlpha = 1;
  }

  if (!touch) {
    ctx.textBaseline = "bottom";
    ctx.font = font(19);
    shadowed(
      "WASD move · Shift sneak · Ctrl/double-tap W sprint · Click/Space pounce · Esc pause · R restart · M sound",
      18, HEIGHT - 12, "left",
    );
    drawHotbar(ctx, level);
  }
}

function drawWind(ctx, wind) {
  const c = new Vec(WIDTH / 2, 34);
  ctx.font = font(20);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = TEXT;
  ctx.fillText("Wind", c.x - 34, c.y);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(wind.angle);
  ctx.fillStyle = "#bfe3ff";
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(4, -12);
  ctx.lineTo(4, -5);
  ctx.lineTo(-22, -5);
  ctx.lineTo(-22, 5);
  ctx.lineTo(4, 5);
  ctx.lineTo(4, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Minecraft-style hotbar of this level's extras, with their keys.
function drawHotbar(ctx, level) {
  const slots = [];
  if (level.canGrowl) slots.push({ key: "G", label: "Growl", on: false });
  if (level.fishMax) slots.push({ key: "Q", label: `Fish ×${level.fishLeft}`, on: false, empty: !level.fishLeft });
  if (level.hasCostumes) {
    const costume = level.bruno.costume;
    const empty = !costume && !level.bag.length && !level.dressing;
    slots.push({ key: "C", label: costume ? COSTUME_NAMES[costume].replace(/^(the|a) /, "") : `Disguise ×${level.bag.length}`, on: Boolean(costume), empty });
  }
  if (!slots.length) return;
  const w = 118;
  const h = 40;
  let x = WIDTH / 2 - (slots.length * (w + 8) - 8) / 2;
  const y = HEIGHT - 84;
  for (const slot of slots) {
    ctx.fillStyle = slot.on ? "rgba(255,220,120,0.75)" : "rgba(30,26,22,0.6)";
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = slot.empty ? 0.4 : 1;
    ctx.font = font(15);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = slot.on ? INK : "#ffdc78";
    ctx.fillText(slot.key, x + 8, y + h / 2);
    ctx.font = font(19);
    ctx.fillStyle = slot.on ? INK : TEXT;
    ctx.fillText(slot.label, x + 26, y + h / 2 + 1);
    ctx.globalAlpha = 1;
    x += w + 8;
  }
}

export function drawCard(ctx, heading, body, prompt, tip = null) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = HEIGHT / 2 - (tip ? 120 : 90);
  ctx.font = font(72);
  ctx.fillStyle = "#ffdc78";
  ctx.fillText(heading, WIDTH / 2, y);
  y += 84;
  if (tip) {
    ctx.font = font(40);
    ctx.fillStyle = "#9fe08a";
    ctx.fillText(tip, WIDTH / 2, y);
    y += 52;
  }
  ctx.font = font(30);
  ctx.fillStyle = TEXT;
  for (const line of wrap(ctx, body, WIDTH - 300)) {
    ctx.fillText(line, WIDTH / 2, y);
    y += 40;
  }
  ctx.font = font(24);
  ctx.fillStyle = "#c8c8c8";
  ctx.fillText(prompt, WIDTH / 2, y + 30);
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
