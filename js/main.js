// Bear Attack - Bruno the bear sneaks up on people in his territory.

import { Vec } from "./actors.js";
import { drawCard, drawHud, drawScene, makeBackground } from "./draw.js";
import { Input } from "./input.js";
import { HEIGHT, LEVELS, WIDTH } from "./level.js";
import { Sound, SoundDirector } from "./sound.js";

const CARD_INPUT_DELAY = 0.6; // seconds before a card accepts a tap, so mashing pounce doesn't skip it

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  view.dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * view.dpr);
  canvas.height = Math.round(h * view.dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  view.scale = Math.min(w / WIDTH, h / HEIGHT);
  view.ox = (w - WIDTH * view.scale) / 2;
  view.oy = (h - HEIGHT * view.scale) / 2;
}
addEventListener("resize", resize);
resize();

const input = new Input(canvas, (x, y) => new Vec((x - view.ox) / view.scale, (y - view.oy) / view.scale));
const backgrounds = {};
const backgroundFor = (lvl) => (backgrounds[lvl.ground] ??= makeBackground(lvl.ground));
const buttons = {
  growl: document.getElementById("btn-growl"),
  prev: document.getElementById("btn-prev"),
  next: document.getElementById("btn-next"),
  sneak: document.getElementById("btn-sneak"),
  sprint: document.getElementById("btn-sprint"),
  fullscreen: document.getElementById("btn-fullscreen"),
  mute: document.getElementById("btn-mute"),
};
if (!document.fullscreenEnabled) buttons.fullscreen.hidden = true;

const sound = new Sound();
const director = new SoundDirector(sound);
const showMute = () => (buttons.mute.textContent = sound.muted ? "🔇" : "🔊");
showMute();
// Audio can only start from a tap/click/keypress; any of them will do.
for (const type of ["pointerdown", "pointerup", "touchend", "keydown"]) {
  addEventListener(type, () => sound.unlock(), { capture: true });
}

// Remember how far the player has got, so they can pick any level they've reached.
const PROGRESS_KEY = "bear-attack-unlocked";
let unlocked = 0;
try {
  unlocked = Math.min(LEVELS.length - 1, Math.max(0, parseInt(localStorage.getItem(PROGRESS_KEY), 10) || 0));
} catch {
  // no storage - everyone starts at level 1
}
function unlock(index) {
  unlocked = Math.max(unlocked, Math.min(index, LEVELS.length - 1));
  try {
    localStorage.setItem(PROGRESS_KEY, String(unlocked));
  } catch {
    // progress just won't be saved
  }
}

let levelIndex = unlocked;
let level = LEVELS[levelIndex]();
let mode = "intro"; // intro | playing | paused | won | escaped
let modeTime = 0;
let t = 0;
let last = performance.now();

function setMode(next) {
  mode = next;
  modeTime = 0;
  if ((mode === "paused") !== sound.paused) sound.setPaused(mode === "paused");
}

function goToLevel(index) {
  levelIndex = index;
  level = LEVELS[levelIndex]();
  setMode("intro");
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    // In fullscreen, Chrome lets the game keep Ctrl+W (sprint forward) instead of closing the tab.
    await navigator.keyboard?.lock?.();
    await screen.orientation?.lock?.("landscape");
  } catch {
    // Not supported here (e.g. iPhone Safari) - the game still works without it.
  }
}

function handleEvents() {
  for (const ev of input.drain()) {
    if (ev.type === "fullscreen") {
      toggleFullscreen();
    } else if (ev.type === "mute") {
      sound.toggleMute();
      showMute();
    } else if (ev.type === "restart") {
      level = LEVELS[levelIndex]();
      setMode("playing");
    } else if ((ev.type === "pick" || ev.type === "step-level") && mode !== "playing") {
      const index = ev.type === "pick" ? ev.index : levelIndex + ev.by;
      if (index >= 0 && index <= unlocked) goToLevel(index);
    } else if (mode === "playing") {
      if (ev.type === "pounce") level.bruno.pounce(ev.at ? ev.at.sub(level.bruno.pos) : null);
      else if (ev.type === "growl") level.growl();
      else if (ev.type === "pause") setMode("paused");
    } else if (modeTime < CARD_INPUT_DELAY) {
      continue;
    } else if (mode === "paused") {
      if (["pause", "pounce", "confirm"].includes(ev.type)) setMode("playing");
    } else if (ev.type === "pounce" || ev.type === "confirm") {
      if (mode === "won") {
        goToLevel((levelIndex + 1) % LEVELS.length);
      } else {
        if (mode !== "intro") level = LEVELS[levelIndex]();
        setMode("playing");
      }
    }
  }
}

function drawCards() {
  const tap = input.touchMode ? "Tap" : "Click or press Space";
  if (mode === "intro") {
    const pick = unlocked > 0 ? (input.touchMode ? "  ·  ◀ ▶ change level" : `  ·  keys 1-${unlocked + 1} change level`) : "";
    drawCard(ctx, `Level ${level.number}: ${level.title}`, level.intro, `${tap} to start${pick}`, level.tip);
  } else if (mode === "paused") {
    drawCard(ctx, "Paused", "Bruno is taking a little nap.", `${tap} to keep playing`);
  } else if (mode === "won") {
    const more = levelIndex + 1 < LEVELS.length;
    drawCard(ctx, "Mmm! Delicious.", "Bruno licks his lips. Level complete!",
      more ? `${tap} for the next level` : `More levels coming soon! ${tap} to play again`);
  } else if (mode === "escaped") {
    drawCard(ctx, "They got away!", "Somebody spotted Bruno and ran off. Try again!", `${tap} to restart the level`);
  }
}

// Room the 48px corner buttons (plus margins) take up, in world units.
const cornerInset = () => Math.max(0, 66 - view.ox) / view.scale;

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d2a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = view.dpr * view.scale;
  ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HEIGHT);
  ctx.clip();
  drawScene(ctx, backgroundFor(level), level, t);
  drawHud(ctx, level, input.touchMode, {
    left: input.touchMode ? cornerInset() : 0,
    right: buttons.fullscreen.hidden ? 0 : cornerInset(),
  });
  drawCards();
  ctx.restore();
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  t += dt;
  modeTime += dt;
  handleEvents();
  const move = input.move();
  const gait = input.gait();
  if (mode === "playing") {
    level.update(dt, move, gait);
    director.update(level);
    if (level.outcome) {
      if (level.outcome === "won") unlock(levelIndex + 1);
      setMode(level.outcome);
    }
  }
  director.ambience(level);
  buttons.growl.hidden = !level.canGrowl;
  buttons.prev.hidden = mode !== "intro" || levelIndex === 0;
  buttons.next.hidden = mode !== "intro" || levelIndex >= unlocked;
  buttons.sneak.classList.toggle("on", input.sneakToggle);
  buttons.sprint.classList.toggle("on", input.sprintToggle);
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") setMode("paused");
});

// Ctrl+W (sprint forward, Minecraft-style) closes the tab in most browsers.
// Ask before leaving mid-level so a sprint doesn't lose the game.
addEventListener("beforeunload", (e) => {
  if (mode === "playing" || mode === "paused") {
    e.preventDefault();
    e.returnValue = "";
  }
});

requestAnimationFrame(frame);
