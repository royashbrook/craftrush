// Procedural WebAudio: chiptune sfx + tiny sequenced music loops. No audio files.
let ctx = null, master = null, musicGain = null;
let enabled = true;
let unlocked = false; // becomes true on first user gesture (autoplay policy)
let currentTrack = null, seqTimer = null, seqStep = 0, nextNoteTime = 0;
let musicNodes = []; // scheduled music sources, stoppable on track switch
const sfxThrottle = new Map();

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ f = 440, f2 = null, type = 'square', dur = 0.1, vol = 0.2, delay = 0, out = null }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(out || master);
  o.start(t0); o.stop(t0 + dur + 0.02);
  if (out === musicGain) {
    musicNodes.push(o);
    o.onended = () => { const i = musicNodes.indexOf(o); if (i >= 0) musicNodes.splice(i, 1); };
  }
}

function noise({ dur = 0.15, vol = 0.2, freq = 1200, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

const SFX = {
  shoot()    { tone({ f: 760, f2: 420, type: 'square', dur: 0.06, vol: 0.05 }); },
  hit()      { noise({ dur: 0.05, vol: 0.08, freq: 2400 }); },
  pop()      { tone({ f: 320, f2: 90, type: 'square', dur: 0.12, vol: 0.16 }); noise({ dur: 0.08, vol: 0.1, freq: 900 }); },
  emerald()  { tone({ f: 1175, type: 'square', dur: 0.07, vol: 0.1 }); tone({ f: 1568, type: 'square', dur: 0.1, vol: 0.1, delay: 0.07 }); },
  gate_good(){ [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', dur: 0.09, vol: 0.12, delay: i * 0.05 })); },
  gate_bad() { [392, 330, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.12, vol: 0.12, delay: i * 0.07 })); },
  boom()     { noise({ dur: 0.5, vol: 0.42, freq: 500 }); tone({ f: 150, f2: 40, type: 'sine', dur: 0.5, vol: 0.5 }); },
  bigboom()  { noise({ dur: 0.9, vol: 0.5, freq: 400 }); tone({ f: 120, f2: 30, type: 'sine', dur: 0.9, vol: 0.6 }); tone({ f: 90, f2: 25, type: 'sawtooth', dur: 0.7, vol: 0.25, delay: 0.05 }); },
  golem()    { tone({ f: 90, f2: 55, type: 'sawtooth', dur: 0.5, vol: 0.4 }); noise({ dur: 0.3, vol: 0.25, freq: 300, delay: 0.1 }); },
  powerup()  { [440, 554, 659, 880].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.1, vol: 0.16, delay: i * 0.06 })); },
  apple()    { tone({ f: 660, f2: 990, type: 'triangle', dur: 0.18, vol: 0.2 }); },
  hurt()     { tone({ f: 220, f2: 110, type: 'sawtooth', dur: 0.15, vol: 0.18 }); },
  arrow_in() { tone({ f: 520, f2: 260, type: 'triangle', dur: 0.1, vol: 0.12 }); },
  boss_roar(){ tone({ f: 70, f2: 45, type: 'sawtooth', dur: 0.9, vol: 0.45 }); noise({ dur: 0.6, vol: 0.2, freq: 250, delay: 0.15 }); },
  fanfare()  { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'square', dur: 0.16, vol: 0.18, delay: i * 0.13 })); },
  defeat()   { [392, 370, 349, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.3, vol: 0.18, delay: i * 0.22 })); },
  click()    { tone({ f: 880, f2: 660, type: 'square', dur: 0.05, vol: 0.1 }); },
  buy()      { [659, 880, 1319].forEach((f, i) => tone({ f, type: 'square', dur: 0.1, vol: 0.15, delay: i * 0.07 })); },
  chest()    { [523, 784, 1047, 1568].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.15, delay: i * 0.08 })); },
};

// ---- music: 16-step patterns, 2 channels + hat ----
// note numbers = semitones from A3 (220 Hz); null = rest
const N = (semi) => 220 * Math.pow(2, semi / 12);
const TRACKS = {
  menu: {
    bpm: 84, bass: [0, null, null, null, 5, null, null, null, 3, null, null, null, 7, null, null, null],
    lead: [12, null, 15, null, 17, null, 15, null, 12, null, 10, null, 12, null, null, null],
    hat: [], leadType: 'triangle', bassType: 'triangle', leadVol: 0.1, bassVol: 0.12,
  },
  run: {
    bpm: 132,
    bass: [0, 0, 12, 0, 5, 5, 17, 5, 3, 3, 15, 3, 7, 7, 19, 7],
    lead: [12, 15, 17, 19, 17, 15, 12, null, 15, 17, 19, 22, 19, 17, 15, null],
    hat: [0, 2, 4, 6, 8, 10, 12, 14], leadType: 'square', bassType: 'triangle', leadVol: 0.07, bassVol: 0.13,
  },
  boss: {
    bpm: 150,
    bass: [0, 0, 0, 3, 0, 0, 0, 3, -2, -2, -2, 1, -2, -2, -2, 1],
    lead: [12, null, 12, 15, 14, null, 12, null, 10, null, 10, 13, 12, null, 10, null],
    hat: [0, 2, 4, 5, 6, 8, 10, 12, 13, 14], leadType: 'sawtooth', bassType: 'sawtooth', leadVol: 0.06, bassVol: 0.1,
  },
};

function scheduleStep(tr, step, time) {
  const dur = 60 / tr.bpm / 4;
  const t = time - ctx.currentTime;
  const b = tr.bass[step % 16], l = tr.lead[step % 16];
  if (b !== null && b !== undefined) tone({ f: N(b - 12), type: tr.bassType, dur: dur * 1.7, vol: tr.bassVol, delay: Math.max(0, t), out: musicGain });
  if (l !== null && l !== undefined) tone({ f: N(l), type: tr.leadType, dur: dur * 1.2, vol: tr.leadVol, delay: Math.max(0, t), out: musicGain });
  if (tr.hat.includes(step % 16)) {
    const t0 = Math.max(0, t);
    noise({ dur: 0.03, vol: 0.03, freq: 6000, delay: t0 });
  }
}

function seqLoop() {
  if (!currentTrack || !ctx) return;
  const tr = TRACKS[currentTrack];
  const stepDur = 60 / tr.bpm / 4;
  while (nextNoteTime < ctx.currentTime + 0.18) {
    scheduleStep(tr, seqStep, nextNoteTime);
    nextNoteTime += stepDur;
    seqStep++;
  }
}

export const Audio = {
  get enabled() { return enabled; },
  setEnabled(v) {
    enabled = v;
    if (!v) this.stopMusic();
    if (master) master.gain.setTargetAtTime(v ? 0.5 : 0, ctx.currentTime, 0.03);
  },
  unlock() {
    if (!enabled) return;
    unlocked = true;
    ensureCtx();
    if (currentTrack && !seqTimer) { const t = currentTrack; currentTrack = null; this.music(t); }
  },
  sfx(name, throttleMs = 0) {
    if (!enabled || !unlocked) return;
    ensureCtx();
    if (throttleMs) {
      const last = sfxThrottle.get(name) || 0;
      if (performance.now() - last < throttleMs) return;
      sfxThrottle.set(name, performance.now());
    }
    SFX[name]?.();
  },
  music(track) {
    if (!enabled || !unlocked) { currentTrack = track; return; } // starts on unlock
    ensureCtx();
    if (currentTrack === track && seqTimer) return;
    this.stopMusic();
    currentTrack = track;
    seqStep = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    seqTimer = setInterval(seqLoop, 90);
  },
  stopMusic() {
    if (seqTimer) clearInterval(seqTimer);
    seqTimer = null; currentTrack = null;
    for (const n of musicNodes) { try { n.stop(); } catch { /* already ended */ } }
    musicNodes = [];
  },
};
