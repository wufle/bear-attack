// Bear Attack - Bruno the bear sneaks up on people in his territory.

import { Vec } from "./actors.js";
import { COSTUME_NAMES, drawCard, drawHud, drawScene, makeBackground } from "./draw.js";
import { Input } from "./input.js";
import { HEIGHT, LEVELS, WIDTH } from "./level.js";
import { BearHead, button, drawLevelSelect, drawMenu, hitButton } from "./menu.js";
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
  fish: document.getElementById("btn-fish"),
  costume: document.getElementById("btn-costume"),
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

// Saved progress: the furthest level reached (any of those can be picked), and the
// level being played, so Continue picks up where you left off.
const PROGRESS_KEY = "bear-attack-unlocked";
const LEVEL_KEY = "bear-attack-level";
const loadIndex = (key) => {
  try {
    const value = parseInt(localStorage.getItem(key), 10);
    return Number.isNaN(value) ? null : Math.min(LEVELS.length - 1, Math.max(0, value));
  } catch {
    return null; // no storage - everyone starts at level 1
  }
};
const store = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // progress just won't be saved
  }
};
let unlocked = loadIndex(PROGRESS_KEY) ?? 0;
let savedLevel = loadIndex(LEVEL_KEY) ?? (unlocked > 0 ? unlocked : null);
function unlock(index) {
  unlocked = Math.max(unlocked, Math.min(index, LEVELS.length - 1));
  store(PROGRESS_KEY, unlocked);
}
const LEVEL_INFO = LEVELS.map((make) => {
  const { number, title } = make();
  return { number, title };
});

let levelIndex = Math.min(savedLevel ?? 0, unlocked);
let level = LEVELS[levelIndex]();
let mode = "menu"; // menu | levels | intro | playing | paused | won | escaped | asleep
let modeTime = 0;
const head = new BearHead();
let ui = []; // on-screen buttons drawn this frame: { x, y, w, h, action }
let confirmReset = 0; // seconds left to tap "Reset progress" again
let t = 0;
let last = performance.now();

function setMode(next) {
  if (mode === "menu" && next !== "menu") head.calm();
  mode = next;
  modeTime = 0;
  if ((mode === "paused") !== sound.paused) sound.setPaused(mode === "paused");
}

function goToLevel(index) {
  levelIndex = index;
  level = LEVELS[levelIndex]();
  savedLevel = index;
  store(LEVEL_KEY, index);
  setMode("intro");
}

function restartLevel() {
  level = LEVELS[levelIndex]();
  setMode("playing");
}

function uiAction(action) {
  if (action === "continue") goToLevel(Math.min(savedLevel ?? 0, unlocked));
  else if (action === "levels") setMode("levels");
  else if (action === "menu") setMode("menu");
  else if (action === "resume") setMode("playing");
  else if (action === "restart") restartLevel();
  else if (action.startsWith("level:")) goToLevel(Number(action.slice(6)));
  else if (action === "reset") {
    if (confirmReset > 0) {
      unlocked = 0;
      savedLevel = null;
      store(PROGRESS_KEY, null);
      store(LEVEL_KEY, null);
      levelIndex = 0;
      level = LEVELS[0]();
      confirmReset = 0;
    } else {
      confirmReset = 3;
    }
  }
}

function playHeadSounds() {
  for (const ev of head.events) {
    if (ev === "growl") sound.play("growl", { vol: 1, rate: 0.95 });
    else if (ev === "boop") sound.play("squeak", { vol: 0.7, rate: 1.3 });
    else if (ev === "lick") {
      sound.play("lick", { vol: 0.8, rate: 1.2 });
      sound.play("smack", { vol: 0.5, delay: 0.55 });
    } else if (ev === "costume") {
      sound.play(head.costumeName === "queen" ? "fanfare" : head.costumeName === "mascot" ? "squeak" : "cloth", { vol: 0.8 });
    }
  }
  head.events = [];
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
      if (mode !== "menu" && mode !== "levels") restartLevel();
    } else if (mode === "menu" || mode === "levels") {
      if (ev.type === "press") {
        if (mode === "menu" && head.press(ev.at)) continue;
        const hit = hitButton(ui, ev.at);
        if (hit) uiAction(hit.action);
      } else if (ev.type === "drag" && mode === "menu") {
        head.drag(ev.at);
      } else if (ev.type === "release") {
        head.release();
      } else if (ev.type === "pick" && mode === "levels" && ev.index <= unlocked) {
        goToLevel(ev.index);
      } else if (ev.type === "pause") {
        setMode("menu"); // Esc backs out of the level picker
      } else if ((ev.type === "confirm" || ev.type === "pounce") && mode === "menu") {
        uiAction("continue");
      }
    } else if ((ev.type === "pick" || ev.type === "step-level") && mode !== "playing") {
      const index = ev.type === "pick" ? ev.index : levelIndex + ev.by;
      if (index >= 0 && index <= unlocked) goToLevel(index);
    } else if (mode === "playing") {
      if (ev.type === "pounce") level.pounce(ev.at ? ev.at.sub(level.bruno.pos) : null);
      else if (ev.type === "growl") level.growl();
      else if (ev.type === "fish") level.throwFish();
      else if (ev.type === "costume") level.toggleCostume();
      else if (ev.type === "pause") setMode("paused");
    } else if (ev.type === "drag" || ev.type === "release") {
      continue;
    } else if (ev.type === "press" && hitButton(ui, ev.at)) {
      uiAction(hitButton(ui, ev.at).action); // card buttons work straight away
    } else if (modeTime < CARD_INPUT_DELAY) {
      continue;
    } else if (mode === "paused") {
      if (["pause", "pounce", "confirm"].includes(ev.type)) setMode("playing");
    } else if (ev.type === "pause") {
      setMode("menu"); // Esc on a card goes back to the main menu
    } else if (ev.type === "pounce" || ev.type === "confirm" || ev.type === "press") {
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
  if (mode === "paused") {
    drawCard(ctx, "Paused", "Bruno is taking a little nap.", "");
    const y = HEIGHT / 2 + 70;
    button(ctx, ui, { x: WIDTH / 2 - 400, y, w: 250, h: 76, label: "▶ Keep playing", action: "resume", hot: true });
    button(ctx, ui, { x: WIDTH / 2 - 125, y, w: 250, h: 76, label: "↺ Restart level", action: "restart" });
    button(ctx, ui, { x: WIDTH / 2 + 150, y, w: 250, h: 76, label: "☰ Main menu", action: "menu" });
    return;
  }
  if (mode === "intro") {
    const keys = unlocked >= 9 ? "1-9, 0" : `1-${unlocked + 1}`;
    const pick = unlocked > 0 ? (input.touchMode ? "  ·  ◀ ▶ change level" : `  ·  keys ${keys} change level`) : "";
    drawCard(ctx, `Level ${level.number}: ${level.title}`, level.intro, `${tap} to start${pick}`, level.tip);
  } else if (mode === "won" && level.ending) {
    drawCard(ctx, "THE END", "Bruno caught the General! He is now King of the Forest!", `${tap} to play again from Level 1`,
      "🐻👑 You beat Bear Attack!");
  } else if (mode === "won") {
    const trophy = level.contestWon ? "🏆 And Benny won the costume contest!" : null;
    drawCard(ctx, "Mmm! Delicious.", "Level complete!", `${tap} for the next level`, trophy);
  } else if (mode === "escaped") {
    drawCard(ctx, "They got away!", "Somebody spotted Bruno and ran off. Try again!", `${tap} to restart the level`);
  } else if (mode === "asleep") {
    drawCard(ctx, "Zzz…", "Too many sleepy darts! Bruno took a nap.", `${tap} to restart the level`);
  }
  // every card has a way back to the main menu
  if (mode !== "playing") button(ctx, ui, { x: 18, y: 18, w: 150, h: 54, label: "☰ Menu", action: "menu" });
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
  ui = [];
  if (mode === "menu") {
    const saved = savedLevel !== null ? { index: Math.min(savedLevel, unlocked), title: LEVEL_INFO[Math.min(savedLevel, unlocked)].title } : null;
    ui = drawMenu(ctx, backgrounds.forest ??= makeBackground("forest"), head, t, input.pointer, { saved, unlocked, confirmReset: confirmReset > 0 });
    ctx.restore();
    return;
  }
  if (mode === "levels") {
    ui = drawLevelSelect(ctx, backgrounds.forest ??= makeBackground("forest"), LEVEL_INFO, unlocked, levelIndex);
    ctx.restore();
    return;
  }
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
      if (level.outcome === "won") {
        unlock(levelIndex + 1);
        savedLevel = Math.min(levelIndex + 1, LEVELS.length - 1); // Continue goes on to the next one
        store(LEVEL_KEY, savedLevel);
      }
      setMode(level.outcome);
    }
  }
  input.uiMode = mode !== "playing";
  document.body.classList.toggle("in-menu", mode !== "playing");
  confirmReset = Math.max(0, confirmReset - dt);
  if (mode === "menu") {
    head.update(dt);
    playHeadSounds();
    sound.setAmbience({ amb_day: 0.35 });
  } else {
    director.ambience(level);
  }
  buttons.growl.hidden = !level.canGrowl;
  buttons.fish.hidden = !level.fishMax;
  buttons.fish.textContent = `Fish ×${level.fishLeft}`;
  buttons.costume.hidden = !(level.bag.length || level.bruno.costume || level.dressing);
  buttons.costume.classList.toggle("on", Boolean(level.bruno.costume));
  buttons.costume.textContent = level.bruno.costume ? COSTUME_NAMES[level.bruno.costume].replace(/^(the|a) /, "") : `Disguise ×${level.bag.length}`;
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
