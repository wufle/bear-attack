// Sound: recorded clips (all CC0, see sounds/CREDITS.md), played with Web Audio.
//
// Sound loads the clips and plays them. SoundDirector watches the level each
// frame and decides what to play, so the game logic doesn't know sound exists.

import { BearState, Bruno, Gait, PersonState } from "./actors.js";
import { WIDTH } from "./level.js";

const MUTE_KEY = "bear-attack-muted";
const MASTER_VOLUME = 1.0;

// Clip groups and how many numbered variants each has (sounds/<group><n>.mp3).
const GROUPS = {
  bruno_step: 4, step: 4, run: 3, rustle: 3, twig: 3,
  pounce: 2, growl: 2, eat: 3, crunch: 3, lick: 2, smack: 2, mmm: 3,
  kid_giggle: 3, kid_laugh: 2, kid_hum: 1, kid_huh: 2, kid_gasp: 2, kid_hello: 1, kid_scream: 3,
  man_whistle: 3, man_laugh: 1, man_hmm: 2, man_huh: 1, man_hm: 1, man_scream: 3,
  woman_huh: 3, woman_scream: 3,
  bark: 4, sniff: 2, whine: 2, dog_eat: 1,
  throw: 1, flop: 2, splash: 2, reel: 1, cloth: 2,
  radio: 3, click: 2, owl: 3, fanfare: 1, clink: 2, shovel: 3, sizzle: 1, snow_step: 4,
};
const LOOPS = ["amb_day", "amb_crickets", "amb_campfire", "amb_lake", "amb_kids", "amb_winter"];

// Which clips each kind of voice line uses.
const VOICES = {
  kid: {
    idle: ["kid_giggle", "kid_laugh", "kid_hum"],
    huh: ["kid_huh", "kid_gasp", "kid_hello"],
    rustle: ["kid_gasp"],
    calm: ["kid_giggle"],
    scream: ["kid_scream"],
  },
  man: {
    idle: ["man_whistle", "man_whistle", "man_laugh"],
    huh: ["man_hmm", "man_huh"],
    rustle: ["man_hmm"],
    calm: ["man_hm"],
    scream: ["man_scream"],
  },
  fisher: {
    idle: ["reel", "man_whistle"],
    huh: ["man_hmm", "man_huh"],
    rustle: ["man_hmm"],
    calm: ["man_hm"],
    scream: ["man_scream"],
  },
  ranger: {
    idle: ["radio", "radio", "man_whistle"],
    huh: ["click", "man_hmm"],
    rustle: ["man_hmm"],
    calm: ["radio"],
    scream: ["man_scream"],
  },
  shoveler: {
    idle: ["shovel", "shovel", "man_whistle"],
    huh: ["man_hmm", "man_huh"],
    rustle: ["man_hmm"],
    calm: ["man_hm"],
    scream: ["man_scream"],
  },
  dog: {
    idle: ["sniff"],
    huh: ["sniff", "whine"],
    rustle: ["sniff"],
    calm: ["whine"],
    scream: ["bark"],
    eat: ["dog_eat", "crunch"],
  },
  woman: {
    idle: ["kid_giggle"],
    huh: ["woman_huh"],
    rustle: ["woman_huh"],
    calm: [],
    scream: ["woman_scream"],
  },
};

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const choice = (items) => items[Math.floor(Math.random() * items.length)];
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
    this.muted = loadMuted();
    this.paused = false;
    this.buffers = {}; // group -> [AudioBuffer]
    this.loops = {}; // name -> { source, gain }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    // The context starts suspended until the first tap/keypress, but we can load clips now.
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    const compressor = this.ctx.createDynamicsCompressor();
    this.master.connect(compressor).connect(this.ctx.destination);
    this.load();
  }

  async load() {
    const fetchOne = async (file) => {
      const data = await (await fetch(`sounds/${file}.mp3`)).arrayBuffer();
      return new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
    };
    const jobs = [];
    for (const [group, count] of Object.entries(GROUPS)) {
      this.buffers[group] = [];
      for (let i = 0; i < count; i++) {
        jobs.push(fetchOne(`${group}${i}`).then((b) => this.buffers[group].push(b)).catch(() => {}));
      }
    }
    for (const name of LOOPS) {
      jobs.push(fetchOne(name).then((b) => (this.buffers[name] = [b])).catch(() => {}));
    }
    await Promise.all(jobs);
  }

  // Browsers only allow audio after the player taps or presses a key.
  unlock() {
    if (this.ctx?.state === "suspended" && !this.paused) this.ctx.resume();
  }

  get ready() {
    return this.ctx?.state === "running";
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

  // Play a random clip from `group`. `delay` is seconds from now; `rate` changes speed and pitch.
  play(group, { vol = 1, pan = 0, delay = 0, rate = rand(0.94, 1.06) } = {}) {
    const buffers = this.buffers[group];
    if (!this.ready || !buffers?.length) return 0;
    const source = this.ctx.createBufferSource();
    source.buffer = choice(buffers);
    source.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    let node = source.connect(gain);
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      node = node.connect(panner);
    }
    node.connect(this.master);
    source.start(this.ctx.currentTime + delay);
    return source.buffer.duration / rate;
  }

  // Background loops. `levels` maps loop name -> volume; loops not listed fade out.
  setAmbience(levels) {
    if (!this.ctx) return;
    for (const name of LOOPS) {
      const want = levels[name] ?? 0;
      let loop = this.loops[name];
      if (!loop && want > 0 && this.buffers[name]?.length) {
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name][0];
        source.loop = true;
        // skip the mp3 encoder's silent padding so the loop doesn't click
        source.loopStart = 0.05;
        source.loopEnd = source.buffer.duration - 0.05;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        source.connect(gain);
        if (panner) gain.connect(panner).connect(this.master);
        else gain.connect(this.master);
        source.start(0, 0.05);
        loop = this.loops[name] = { source, gain, panner };
      }
      if (loop) loop.gain.gain.setTargetAtTime(want, this.ctx.currentTime, 0.4);
    }
  }

  panLoop(name, pan) {
    const loop = this.loops[name];
    if (loop?.panner) loop.panner.pan.setTargetAtTime(clamp(pan, -1, 1), this.ctx.currentTime, 0.1);
  }
}

const BRUNO_STRIDE = { [Gait.SNEAK]: 26, [Gait.WALK]: 40, [Gait.RUN]: 54 };
const BRUNO_STEP_VOLUME = { [Gait.SNEAK]: 0.12, [Gait.WALK]: 0.45, [Gait.RUN]: 0.8 };
const WALK_STRIDE = 30;
const FLEE_STRIDE = 50;
const panFor = (x) => clamp((x - WIDTH / 2) / (WIDTH * 0.6), -1, 1);

export class SoundDirector {
  constructor(sound) {
    this.sound = sound;
    this.level = null;
  }

  // Background sound for whatever level is on screen (call every frame).
  ambience(level) {
    const s = this.sound;
    // A lit fire crackles louder as Bruno gets closer.
    const fire = level.fires[0];
    const near = fire ? clamp(1 - level.bruno.pos.dist(fire) / 700, 0.08, 1) : 0;
    s.setAmbience({ ...level.ambience, amb_campfire: 0.6 * near });
    if (fire) s.panLoop("amb_campfire", panFor(fire.x) - panFor(level.bruno.pos.x));
    // Owls hoot now and then at night.
    if (level.dark && s.ready) {
      const now = s.ctx.currentTime;
      if (!this.nextOwl || this.nextOwl > now + 30) this.nextOwl = now + rand(4, 10);
      if (now >= this.nextOwl) {
        s.play("owl", { vol: rand(0.25, 0.45), pan: rand(-0.9, 0.9) });
        this.nextOwl = now + rand(8, 18);
      }
    }
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

    for (const ev of level.events) {
      const at = panFor(ev.pos.x);
      if (ev.type === "twig") s.play("twig", { vol: 1, pan: at });
      else if (ev.type === "growl") s.play("growl", { vol: 1, pan });
      else if (ev.type === "throw") s.play("throw", { vol: 0.7, pan });
      else if (ev.type === "flop") s.play("flop", { vol: 0.8, pan: at });
      else if (ev.type === "splash") s.play("splash", { vol: 0.9, pan: at });
      else if (ev.type === "costume" && ev.costume === "queen") s.play("fanfare", { vol: 0.7, pan, rate: 1 });
      else if (ev.type === "costume" || ev.type === "costume-off") s.play("cloth", { vol: 0.8, pan });
      else if (ev.type === "crown-off") s.play("clink", { vol: 0.9, pan });
      else if (ev.type === "melt") s.play("sizzle", { vol: 0.9, pan });
    }
    level.events.length = 0;

    if (bruno.state !== this.brunoState) {
      if (bruno.state === BearState.POUNCING) s.play("pounce", { vol: 0.9, pan });
      else if (bruno.state === BearState.TUSSLING) this.eat(pan);
      else if (bruno.state === BearState.LICKING) this.lick(pan);
      this.brunoState = bruno.state;
    }
    if (bruno.state === BearState.FREE && bruno.moving) {
      this.stride += bruno.pos.dist(this.lastPos);
      if (this.stride >= BRUNO_STRIDE[bruno.gait]) {
        this.stride = 0;
        s.play(level.snow ? "snow_step" : "bruno_step", { vol: BRUNO_STEP_VOLUME[bruno.gait], pan, rate: rand(0.75, 0.85) });
        if (bruno.costume === "queen") s.play("click", { vol: 0.6, pan, rate: rand(0.9, 1.1) }); // clip-clop
        if (bruno.hidingIn(level.blockers) && bruno.gait !== Gait.SNEAK) s.play("rustle", { vol: 0.5, pan });
      }
    }
    this.lastPos = bruno.pos;

    for (const p of level.people) {
      let rec = this.people.get(p);
      if (!rec) {
        rec = { speechTimer: p.speechTimer, pos: p.pos, stride: 0 };
        this.people.set(p, rec);
      }
      const vol = clamp(1.15 - p.pos.dist(bruno.pos) / 900, 0.3, 1);
      const personPan = panFor(p.pos.x);
      if (p.speechTimer > rec.speechTimer + 0.01) {
        const voice = VOICES[p.voice] ?? VOICES.man;
        const groups = voice[p.speechKind] ?? voice.huh; // e.g. bowing uses their "huh?" sounds
        if (groups.length) s.play(choice(groups), { vol: 0.85 * vol, pan: personPan, rate: rand(0.97, 1.03) });
        // a dog keeps barking as it runs off
        if (p.animal && p.speechKind === "scream") s.play("bark", { vol: 0.8 * vol, pan: personPan, delay: 0.9 });
      }
      rec.speechTimer = p.speechTimer;
      if (p.catchable) {
        rec.stride += p.pos.dist(rec.pos);
        const fleeing = p.state === PersonState.FLEE;
        if (rec.stride >= (fleeing ? FLEE_STRIDE : WALK_STRIDE)) {
          rec.stride = 0;
          const clip = level.snow ? "snow_step" : fleeing ? "run" : "step";
          s.play(clip, { vol: (fleeing ? 0.5 : 0.25) * vol, pan: personPan });
        }
      }
      rec.pos = p.pos;
    }
  }

  // The tussle: Bruno growling and chomping, with crunches on top.
  eat(pan) {
    const s = this.sound;
    s.play("eat", { vol: 1, pan, rate: 1 });
    for (let t = 0.15; t < Bruno.TUSSLE_TIME - 0.3; t += rand(0.35, 0.6)) {
      s.play("crunch", { vol: 0.55, pan, delay: t });
    }
  }

  // Afterwards: licks, a lip smack, then a happy "Mmm".
  lick(pan) {
    const s = this.sound;
    // Sped up so it fits the short pause before Bruno can move again.
    const lickTime = Math.min(s.play("lick", { vol: 0.9, pan, rate: 1.3 }) || 1, 0.9);
    s.play("smack", { vol: 0.8, pan, delay: lickTime });
    s.play("mmm", { vol: 0.95, pan, delay: lickTime + 0.2, rate: rand(1.05, 1.12) });
  }
}
