// Minecraft-style controls.
//
// Keyboard + mouse (like Minecraft Java):
//   WASD / arrows   move
//   Shift (hold)    sneak
//   Ctrl (hold) or double-tap a move key   sprint (stops when you stop moving)
//   Left click      pounce toward the cursor (Space also pounces, like a jump)
//   Esc             pause
//   M               sound on/off
//
// Touch (like Minecraft Bedrock):
//   Left side of the screen    joystick
//   Tap anywhere on the right  pounce toward that spot
//   Buttons                    Pounce, Sneak (toggle), Sprint (toggle)

import { Gait, Vec } from "./actors.js";

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const DOUBLE_TAP_MS = 300;
const STICK_RADIUS = 60; // CSS pixels
const STICK_DEADZONE = 0.2;

export class Input {
  constructor(canvas, toWorld) {
    this.toWorld = toWorld;
    this.keys = new Set();
    this.events = [];
    this.sprintLatched = false;
    this.lastPress = { code: null, time: 0 };
    this.stick = { id: null, origin: null, vec: new Vec() };
    this.sneakToggle = false;
    this.sprintToggle = false;
    this.stickEl = document.getElementById("stick");
    this.knobEl = document.getElementById("knob");
    this.setTouchMode(matchMedia("(pointer: coarse)").matches);

    addEventListener("keydown", (e) => this.onKeyDown(e));
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e, canvas));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));

    this.bindButton("btn-pounce", () => this.events.push({ type: "pounce" }));
    this.bindButton("btn-pause", () => this.events.push({ type: "pause" }));
    this.bindButton("btn-fullscreen", () => this.events.push({ type: "fullscreen" }));
    this.bindButton("btn-mute", () => this.events.push({ type: "mute" }));
    this.bindButton("btn-sneak", () => {
      this.sneakToggle = !this.sneakToggle;
      if (this.sneakToggle) this.sprintToggle = false;
    });
    this.bindButton("btn-sprint", () => {
      this.sprintToggle = !this.sprintToggle;
      if (this.sprintToggle) this.sneakToggle = false;
    });
  }

  bindButton(id, onPress) {
    document.getElementById(id).addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    });
  }

  setTouchMode(on) {
    this.touchMode = on;
    document.body.classList.toggle("touch", on);
  }

  onKeyDown(e) {
    if (e.code in MOVE_KEYS || e.code === "Space") e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code in MOVE_KEYS) {
      const now = performance.now();
      if (this.lastPress.code === e.code && now - this.lastPress.time < DOUBLE_TAP_MS) this.sprintLatched = true;
      this.lastPress = { code: e.code, time: now };
    } else if (e.code === "Space") {
      this.events.push({ type: "pounce" });
    } else if (e.code === "Enter") {
      this.events.push({ type: "confirm" });
    } else if (e.code === "Escape") {
      this.events.push({ type: "pause" });
    } else if (e.code === "KeyM") {
      this.events.push({ type: "mute" });
    } else if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) {
      this.events.push({ type: "restart" });
    }
  }

  onPointerDown(e, canvas) {
    e.preventDefault();
    if (e.pointerType === "mouse") {
      this.setTouchMode(false);
      if (e.button === 0) this.events.push({ type: "pounce", at: this.toWorld(e.clientX, e.clientY) });
      return;
    }
    this.setTouchMode(true);
    if (e.clientX < innerWidth * 0.45 && this.stick.id === null) {
      this.stick = { id: e.pointerId, origin: new Vec(e.clientX, e.clientY), vec: new Vec() };
      canvas.setPointerCapture(e.pointerId);
      this.stickEl.classList.add("active");
      this.stickEl.style.left = `${e.clientX - STICK_RADIUS}px`;
      this.stickEl.style.top = `${e.clientY - STICK_RADIUS}px`;
      this.moveKnob(new Vec());
    } else {
      this.events.push({ type: "pounce", at: this.toWorld(e.clientX, e.clientY) });
    }
  }

  onPointerMove(e) {
    if (e.pointerId !== this.stick.id) return;
    const delta = new Vec(e.clientX, e.clientY).sub(this.stick.origin);
    const amount = Math.min(delta.length, STICK_RADIUS) / STICK_RADIUS;
    this.stick.vec = amount < STICK_DEADZONE ? new Vec() : delta.normalize().scale(amount);
    this.moveKnob(delta.normalize().scale(amount * STICK_RADIUS));
  }

  onPointerUp(e) {
    if (e.pointerId !== this.stick.id) return;
    this.stick = { id: null, origin: null, vec: new Vec() };
    this.stickEl.classList.remove("active");
    this.stickEl.style.left = "";
    this.stickEl.style.top = "";
    this.moveKnob(new Vec());
  }

  moveKnob(offset) {
    this.knobEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  // Movement direction this frame. Stopping cancels sprint, like in Minecraft.
  move() {
    let move = this.stick.vec;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) move = move.add(new Vec(...dir));
    }
    if (move.length === 0) {
      this.sprintLatched = false;
      this.sprintToggle = false;
    }
    return move;
  }

  gait() {
    const held = (...codes) => codes.some((c) => this.keys.has(c));
    if (held("ShiftLeft", "ShiftRight") || this.sneakToggle) return Gait.SNEAK;
    if (held("ControlLeft", "ControlRight") || this.sprintLatched || this.sprintToggle) return Gait.RUN;
    return Gait.WALK;
  }

  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
