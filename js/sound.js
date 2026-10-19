// Procedural sound effects, synthesized live with Web Audio (no audio files).
//
// Sound owns the AudioContext and knows how to make each noise.
// SoundDirector watches the level each frame and decides when to make them,
// so the game logic in actors.js doesn't need to know sound exists.

import { BearState, Bruno, Gait, PersonState } from "./actors.js";
import { WIDTH } from "./level.js";

const MUTE_KEY = "bear-attack-muted";
const MASTER_VOLUME = 0.9;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private browsing etc. - mute just won't be remembered.
  }
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = loadMuted();
    this.paused = false;
    this.nextBird = 0;
  }

  // Browsers only allow audio after the player taps or presses a key.
  unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.attach(new AudioContext());
    }
    if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume();
  }

  attach(ctx) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(compressor);
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  get ready() {
    if (!this.ctx) return false;
    return this.ctx.state === "running" || (typeof OfflineAudioContext !== "undefined" && this.ctx instanceof OfflineAudioContext);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) this.ctx.suspend();
    else this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
  }

  // --- Building blocks ---

  channel(pan = 0, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      g.connect(panner).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  envelope(param, t, peak, attack, dur) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  noise(dest, t, dur, { type = "bandpass", freq = 1000, freqEnd = null, q = 1, gain = 1, attack = 0.005 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.filter(type, freq, q);
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    this.envelope(g.gain, t, gain, attack, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  tone(dest, t, dur, { type = "sine", freq, freqEnd = null, gain = 1, attack = 0.005, filter = null, vibrato = null }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    let node = osc;
    if (filter) node = osc.connect(this.filter(filter.type, filter.freq, filter.q ?? 1));
    const g = this.ctx.createGain();
    this.envelope(g.gain, t, gain, attack, dur);
    node.connect(g).connect(dest);
    if (vibrato) this.wobble(osc.frequency, t, dur, vibrato.rate, vibrato.depth);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  wobble(param, t, dur, rate, depth) {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const depthGain = this.ctx.createGain();
    depthGain.gain.value = depth;
    lfo.connect(depthGain).connect(param);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  // A rough, rumbling bear voice: two detuned saws, rattled by a fast tremolo.
  growl(dest, t, dur, freq, freqEnd, gain) {
    const f = this.filter("lowpass", 650, 5);
    const rattle = this.ctx.createGain();
    rattle.gain.value = 0.6;
    this.wobble(rattle.gain, t, dur, rand(18, 26), 0.4);
    const g = this.ctx.createGain();
    this.envelope(g.gain, t, gain, 0.05, dur);
    f.connect(rattle).connect(g).connect(dest);
    for (const detune of [1, 1.07]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq * detune, t);
      osc.frequency.exponentialRampToValueAtTime(freqEnd * detune, t + dur);
      osc.connect(f);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    this.noise(dest, t, dur, { type: "lowpass", freq: 500, gain: gain * 0.5, attack: 0.05 });
  }

  // --- Footsteps ---

  brunoStep(gait, inBush, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = { [Gait.SNEAK]: 0.12, [Gait.WALK]: 0.35, [Gait.RUN]: 0.6 }[gait];
    const ch = this.channel(pan);
    this.noise(ch, t, 0.11, { type: "lowpass", freq: 380, q: 0.7, gain: v * 1.4 });
    this.tone(ch, t, 0.12, { freq: 75, freqEnd: 42, gain: v });
    if (inBush) this.noise(ch, t, 0.3, { type: "bandpass", freq: 3200, freqEnd: 2000, q: 0.8, gain: v * 0.9, attack: 0.03 });
  }

  personStep(running, pan, vol) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const ch = this.channel(pan, vol);
    this.noise(ch, t, 0.05, { type: "bandpass", freq: running ? 900 : 1300, q: 1.2, gain: running ? 0.3 : 0.12 });
  }

  // --- Voices ---

  // Cartoon babble: one little blip per syllable, pitched and shaped by the letters.
  babble(text, pitch, pan, vol) {
    if (!this.ready) return;
    const ch = this.channel(pan, vol);
    const asks = text.trim().endsWith("?");
    const loud = text.includes("!");
    let t = this.ctx.currentTime + 0.02;
    const words = text.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(Boolean);
    words.forEach((word, w) => {
      const syllables = Math.max(1, Math.round(word.length / 2.5));
      for (let i = 0; i < syllables; i++) {
        const code = word.charCodeAt(Math.min(i * 2, word.length - 1));
        const freq = pitch * (0.85 + (code % 9) / 20);
        const last = w === words.length - 1 && i === syllables - 1;
        this.tone(ch, t, 0.075, {
          type: "square",
          freq,
          freqEnd: last && asks ? freq * 1.4 : freq * 0.97,
          gain: loud ? 0.4 : 0.28,
          attack: 0.01,
          filter: { type: "bandpass", freq: 700 + (code % 5) * 350, q: 3 },
        });
        t += 0.085;
      }
      t += 0.06;
    });
  }

  scream(pitch, pan, vol) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const ch = this.channel(pan, vol);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(pitch * 1.8, t);
    osc.frequency.linearRampToValueAtTime(pitch * 2.7, t + 0.15);
    osc.frequency.linearRampToValueAtTime(pitch * 2.4, t + 0.6);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.4, t + 0.95);
    this.wobble(osc.frequency, t, 0.95, 9, pitch * 0.08);
    const g = this.ctx.createGain();
    this.envelope(g.gain, t, 0.9, 0.03, 0.95);
    osc.connect(this.filter("bandpass", 1400, 1.2)).connect(this.filter("lowpass", 3500)).connect(g).connect(ch);
    osc.start(t);
    osc.stop(t + 1);
    this.noise(ch, t, 0.9, { type: "bandpass", freq: 2000, gain: 0.15, attack: 0.03 });
  }

  // --- Bruno ---

  pounce(pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const ch = this.channel(pan);
    this.noise(ch, t, 0.25, { type: "bandpass", freq: 300, freqEnd: 2500, q: 1.5, gain: 0.5, attack: 0.03 });
    this.growl(ch, t, 0.5, 110, 75, 0.5);
  }

  // The tussle: snarling the whole time, with chomps and crunches on top.
  eat(pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dur = Bruno.TUSSLE_TIME;
    const ch = this.channel(pan);
    this.growl(ch, t, dur - 0.05, 85, 70, 0.4);
    this.growl(ch, t + 0.45, 0.4, 130, 90, 0.45);
    this.growl(ch, t + 1.1, 0.35, 120, 85, 0.4);
    for (let c = t + 0.05; c < t + dur - 0.15; c += rand(0.14, 0.28)) this.chomp(ch, c);
  }

  chomp(ch, t) {
    this.tone(ch, t, 0.09, { freq: 140, freqEnd: 50, gain: 0.6 });
    this.noise(ch, t, 0.05, { type: "lowpass", freq: 900, gain: 0.5 });
    let c = t + 0.01;
    for (let i = 0; i < 4; i++) {
      this.noise(ch, c, 0.018, { type: "bandpass", freq: rand(1800, 4000), q: 1.5, gain: 0.35 });
      c += rand(0.008, 0.018);
    }
    this.noise(ch, t + 0.03, 0.08, { type: "bandpass", freq: 700, freqEnd: 300, q: 3, gain: 0.25 });
  }

  // Three big wet licks, then a satisfied "Mmm".
  lick(pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const ch = this.channel(pan);
    for (let i = 0; i < 3; i++) {
      const s = t + 0.1 + i * 0.28;
      this.noise(ch, s, 0.2, { type: "bandpass", freq: 700, freqEnd: 2600, q: 5, gain: 0.5, attack: 0.04 });
      this.noise(ch, s + 0.19, 0.03, { type: "highpass", freq: 3500, gain: 0.25 });
    }
    this.tone(ch, t + 0.95, 0.6, {
      type: "triangle",
      freq: 140,
      freqEnd: 175,
      gain: 0.35,
      attack: 0.08,
      filter: { type: "lowpass", freq: 500 },
      vibrato: { rate: 6, depth: 4 },
    });
  }

  // --- Ambience: wind all the time, birds now and then ---

  startAmbient() {
    const ctx = this.ctx;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const low = this.filter("lowpass", 500, 0.5);
    const windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    wind.connect(low).connect(windGain).connect(this.master);

    const gust = ctx.createBufferSource();
    gust.buffer = this.noiseBuffer;
    gust.loop = true;
    const whistle = this.filter("bandpass", 900, 0.7);
    const gustGain = ctx.createGain();
    gustGain.gain.value = 0.012;
    gust.connect(whistle).connect(gustGain).connect(this.master);

    const t = ctx.currentTime;
    this.wobble(windGain.gain, t, 1e6, 0.08, 0.02);
    this.wobble(low.frequency, t, 1e6, 0.05, 250);
    this.wobble(gustGain.gain, t, 1e6, 0.13, 0.011);
    this.wobble(whistle.frequency, t, 1e6, 0.07, 300);
    wind.start(t);
    gust.start(t, 0.7);
    this.nextBird = t + rand(0.5, 2);
  }

  updateAmbient() {
    if (!this.ready || this.ctx.currentTime < this.nextBird) return;
    this.bird();
    this.nextBird = this.ctx.currentTime + rand(1.5, 5);
  }

  bird() {
    const t = this.ctx.currentTime;
    const vol = rand(0.03, 0.07);
    const ch = this.channel(rand(-0.9, 0.9));
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) {
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        this.tone(ch, t + i * 0.09, 0.06, { freq: rand(3200, 4200), freqEnd: rand(4500, 5500), gain: vol });
      }
    } else if (kind === 1) {
      this.tone(ch, t, 0.35, { freq: 2600, freqEnd: 1900, gain: vol, vibrato: { rate: 28, depth: 120 } });
      this.tone(ch, t + 0.4, 0.25, { freq: 2000, freqEnd: 2600, gain: vol });
    } else {
      this.tone(ch, t, 0.6, { freq: rand(3500, 4200), gain: vol * 0.8, attack: 0.05, vibrato: { rate: 35, depth: 400 } });
    }
  }
}

const BRUNO_STRIDE = { [Gait.SNEAK]: 22, [Gait.WALK]: 38, [Gait.RUN]: 52 };
const WALK_STRIDE = 24;
const FLEE_STRIDE = 48;
const panFor = (x) => clamp((x - WIDTH / 2) / (WIDTH * 0.6), -1, 1);

export class SoundDirector {
  constructor(sound) {
    this.sound = sound;
    this.level = null;
  }

  // Call once per frame while the level is being played.
  update(level) {
    if (level !== this.level) {
      this.level = level;
      this.people = new Map();
      this.brunoState = level.bruno.state;
      this.lastPos = level.bruno.pos;
      this.stride = 0;
    }
    const s = this.sound;
    const bruno = level.bruno;
    const pan = panFor(bruno.pos.x);

    if (bruno.state !== this.brunoState) {
      if (bruno.state === BearState.POUNCING) s.pounce(pan);
      else if (bruno.state === BearState.TUSSLING) s.eat(pan);
      else if (bruno.state === BearState.LICKING) s.lick(pan);
      this.brunoState = bruno.state;
    }
    if (bruno.state === BearState.FREE && bruno.moving) {
      this.stride += bruno.pos.dist(this.lastPos);
      if (this.stride >= BRUNO_STRIDE[bruno.gait]) {
        this.stride = 0;
        s.brunoStep(bruno.gait, Boolean(bruno.hidingIn(level.blockers)), pan);
      }
    }
    this.lastPos = bruno.pos;

    for (const p of level.people) {
      let rec = this.people.get(p);
      if (!rec) {
        rec = { speechTimer: p.speechTimer, pos: p.pos, stride: 0 };
        this.people.set(p, rec);
      }
      const vol = clamp(1.2 - p.pos.dist(bruno.pos) / 900, 0.3, 1);
      const personPan = panFor(p.pos.x);
      if (p.speechTimer > rec.speechTimer + 0.01) {
        if (p.state === PersonState.FLEE) s.scream(p.voice, personPan, vol);
        else s.babble(p.speech, p.voice, personPan, vol);
      }
      rec.speechTimer = p.speechTimer;
      if (p.catchable) {
        rec.stride += p.pos.dist(rec.pos);
        const fleeing = p.state === PersonState.FLEE;
        if (rec.stride >= (fleeing ? FLEE_STRIDE : WALK_STRIDE)) {
          rec.stride = 0;
          s.personStep(fleeing, personPan, vol);
        }
      }
      rec.pos = p.pos;
    }
  }
}
