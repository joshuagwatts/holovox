"use strict";
/* ================= HoloVox v2 — type anything, she sings it =================
   English text -> phoneme syllables (g2p.js) -> formant singing synthesis:
   a sawtooth glottal source through 3 formant resonators whose frequencies
   are automated through each syllable: consonant locus -> vowel (with
   diphthong glide) -> coda colouring, plus fricative noise, stop closures,
   nasal murmurs, vibrato, breath and portamento.                        */

const G2P = window.HoloG2P;

/* ---------------- constants ---------------- */
const STEPS = 96;
const TOP = 72, BOTTOM = 48;
const ROWS = TOP - BOTTOM + 1;
const STEP_W = 36, ROW_H = 22, LABEL_W = 44;

/* phoneme vowel formants (unscaled) + mouth openness */
const PV = {
  AA: { f: [730, 940, 2440], open: 0.95 }, AE: { f: [660, 1720, 2490], open: 0.85 },
  AH: { f: [640, 1190, 2390], open: 0.70 }, AO: { f: [570, 840, 2410],  open: 0.72 },
  EH: { f: [530, 1840, 2480], open: 0.55 }, ER: { f: [490, 1350, 1690], open: 0.45 },
  IH: { f: [400, 1920, 2560], open: 0.38 }, IY: { f: [270, 2290, 3010], open: 0.32 },
  UH: { f: [440, 1020, 2240], open: 0.42 }, UW: { f: [300, 870, 2240],  open: 0.30 },
};
const DIPHTHONG = { AY: ["AA","IH"], EY: ["EH","IH"], OW: ["AO","UH"], AW: ["AA","UH"], OY: ["AO","IH"] };
const vowelTargets = ph => DIPHTHONG[ph] ? DIPHTHONG[ph].map(v => PV[v].f) : [PV[ph].f];
const vowelOpen = ph => DIPHTHONG[ph] ? PV[DIPHTHONG[ph][0]].open : (PV[ph] ? PV[ph].open : 0.6);

const CONS = {
  P:{k:"stop",v:0}, B:{k:"stop",v:1}, T:{k:"stop",v:0}, D:{k:"stop",v:1}, K:{k:"stop",v:0}, G:{k:"stop",v:1},
  F:{k:"fric",f:5200,v:0,g:0.5}, V:{k:"fric",f:4200,v:1,g:0.42}, S:{k:"fric",f:6800,v:0,g:0.55}, Z:{k:"fric",f:5500,v:1,g:0.42},
  SH:{k:"fric",f:3000,v:0,g:0.5}, ZH:{k:"fric",f:2800,v:1,g:0.4}, TH:{k:"fric",f:6000,v:0,g:0.42}, DH:{k:"fric",f:5000,v:1,g:0.42},
  H:{k:"fric",f:1800,v:0,g:0.55},
  CH:{k:"affr",f:3000,v:0}, JH:{k:"affr",f:2800,v:1},
  M:{k:"nasal"}, N:{k:"nasal"}, NG:{k:"nasal"},
  L:{k:"liquid"}, R:{k:"liquid"}, W:{k:"glide"}, Y:{k:"glide"},
};
const consDur = c => ({ stop: 0.06, fric: 0.09, affr: 0.11, nasal: 0.07, liquid: 0.055, glide: 0.05 })[CONS[c].k] || 0.05;

const CHARACTERS = [
  { id: "aoi", name: "AOI", desc: "bright · clear · classic idol", color: "#2ee6c8", scale: 1.09, breath: 14 },
  { id: "ren", name: "REN", desc: "soft · warm · breathy",        color: "#ff7eb0", scale: 0.98, breath: 30 },
  { id: "kai", name: "KAI", desc: "deep · smooth · masculine",     color: "#7ea8ff", scale: 0.83, breath: 10 },
];
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BLACK = new Set([1, 3, 6, 8, 10]);
const CHIP_VOWEL = { a: "AA", i: "IY", u: "UW", e: "EH", o: "AO" };

/* ---------------- state ---------------- */
let notes = [];           // {id, step, midi, len, lyric, phon}
let nextId = 1;
let selectedId = null;
let character = CHARACTERS[0];
let auditionVowel = "a";
const $ = s => document.querySelector(s);
const params = () => ({
  tempo: +$("#rngTempo").value,
  vib: +$("#rngVib").value / 100,
  breath: +$("#rngBreath").value / 100,
  bright: 0.75 + (+$("#rngBright").value / 100) * 0.55,
  porta: +$("#rngPorta").value / 100,
  vol: +$("#rngVol").value / 100,
  reverb: $("#chkReverb").checked,
  loop: $("#chkLoop").checked,
});
const laPhon = () => ({ onset: ["L"], vowel: "AA", coda: [] });
function phonForLyric(lyric) {
  const t = (lyric || "a").trim();
  if (G2P.isRomajiToken(t.toLowerCase())) return G2P.romajiSyllable(t.toLowerCase());
  const syls = G2P.wordToSyllables(t);
  return syls.length ? syls[0] : laPhon();
}
function notePhon(n) { return n.phon || phonForLyric(n.lyric); }
function sortedNotes() { return [...notes].sort((a, b) => a.step - b.step || b.midi - a.midi); }
function songSteps() {
  if (!notes.length) return 32;
  const end = Math.max(...notes.map(n => n.step + n.len));
  return Math.min(STEPS, Math.max(16, Math.ceil(end / 8) * 8));
}

/* ================= audio core ================= */
let AC = null, master, wetBus;
const noiseCache = new WeakMap();
function makeNoise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf); return buf;
}
function makeImpulse(ctx, seconds = 1.8, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
function ensureCtx() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return AC; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(AC.destination);
  master = AC.createGain(); master.gain.value = 0.9; master.connect(comp);
  const conv = AC.createConvolver(); conv.buffer = makeImpulse(AC);
  wetBus = AC.createGain(); wetBus.gain.value = 0.22;
  master.connect(conv); conv.connect(wetBus); wetBus.connect(comp);
  return AC;
}
function addNoise(ctx, dest, t, dur, freq, peak, q = 0.9) {
  if (dur <= 0.005 || peak <= 0.003) return;
  const src = ctx.createBufferSource(); src.buffer = makeNoise(ctx);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur + 0.05);
}

/* Sing one phoneme syllable into dest. Works live + offline. */
function singSyllable(ctx, dest, o) {
  const p = o.p, phon = o.phon;
  const freq = mtof(o.midi);
  const t = o.t, dur = Math.max(0.09, o.dur);
  const scale = o.char.scale * p.bright;

  if (phon.nasalOnly) { // standalone "n" — closed-mouth hum
    const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * p.vol, t + 0.03);
    g.gain.setValueAtTime(0.5 * p.vol, Math.max(t + 0.03, t + dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(bp); bp.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    return;
  }

  const onset = phon.onset || [], coda = phon.coda || [];
  let onDur = onset.reduce((s, c) => s + consDur(c), 0);
  let coDur = coda.reduce((s, c) => s + consDur(c) * 0.85, 0);
  const maxOn = dur * 0.42, maxCo = dur * 0.36;
  if (onDur > maxOn) { const f = maxOn / onDur; onDur = maxOn; onset._f = f; }
  if (coDur > maxCo) { const f = maxCo / coDur; coDur = maxCo; coda._f = f; }
  const vStart = t + onDur, vDur = Math.max(0.05, dur - onDur - coDur), vEnd = vStart + vDur;

  /* --- glottal source: two detuned saws for a thicker buzz --- */
  const portaTime = (o.fromMidi != null) ? 0.02 + p.porta * 0.16 : 0.012;
  const wirePitch = node => {
    if (o.fromMidi != null && portaTime > 0.015) {
      node.frequency.setValueAtTime(mtof(o.fromMidi), t);
      node.frequency.exponentialRampToValueAtTime(freq, t + portaTime);
    } else {
      node.frequency.setValueAtTime(freq * 0.985, t);
      node.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    }
  };
  const osc = ctx.createOscillator(); osc.type = "sawtooth"; wirePitch(osc);
  const osc2 = ctx.createOscillator(); osc2.type = "sawtooth"; wirePitch(osc2); osc2.detune.value = 5;
  if (p.vib > 0.01) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + p.vib * 2.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, vStart + vDur * 0.3);
    lg.gain.linearRampToValueAtTime(p.vib * 55, vStart + vDur * 0.8);
    lfo.connect(lg); lg.connect(osc.detune); lg.connect(osc2.detune);
    lfo.start(t); lfo.stop(t + dur + 0.1);
  }

  /* amplitude envelope + articulation dips (closures, unvoiced stretches) */
  const env = ctx.createGain();
  const atk = Math.min(0.04, dur * 0.2), rel = Math.min(0.07, dur * 0.3);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.85 * p.vol, t + atk);
  env.gain.setValueAtTime(0.85 * p.vol, Math.max(t + atk, t + dur - rel));
  env.gain.linearRampToValueAtTime(0, t + dur + 0.015);
  const artic = ctx.createGain(); artic.gain.value = 1;
  const dip = (t0, t1, val) => {
    artic.gain.setValueAtTime(val, Math.max(t, t0));
    artic.gain.setValueAtTime(val, Math.max(t, t1));
    artic.gain.linearRampToValueAtTime(1, Math.min(t + dur, t1 + 0.012));
  };
  osc.connect(env);
  const g2 = ctx.createGain(); g2.gain.value = 0.45; osc2.connect(g2); g2.connect(env);
  env.connect(artic);

  /* nasal murmur layer */
  const mOsc = ctx.createOscillator(); mOsc.type = "sine"; mOsc.frequency.value = freq;
  const mBp = ctx.createBiquadFilter(); mBp.type = "bandpass"; mBp.frequency.value = 260; mBp.Q.value = 1.4;
  const mGain = ctx.createGain(); mGain.gain.value = 0;
  mOsc.connect(mBp); mBp.connect(mGain); mGain.connect(dest);
  mOsc.start(t); mOsc.stop(t + dur + 0.05);
  const murmur = (t0, t1, val = 0.5) => {
    mGain.gain.setValueAtTime(0, Math.max(t, t0 - 0.005));
    mGain.gain.linearRampToValueAtTime(val * p.vol, Math.max(t, t0 + 0.012));
    mGain.gain.linearRampToValueAtTime(0, Math.max(t, t1));
  };

  /* consonant timeline: fricative noise, stop closures/bursts, murmurs */
  let ct = t;
  const onF = onset._f || 1;
  for (const c of onset) {
    const info = CONS[c], d = consDur(c) * onF;
    if (info.k === "fric") { addNoise(ctx, dest, ct, d, info.f, (info.g || 0.5) * p.vol * (info.v ? 0.8 : 1.2)); if (!info.v) dip(ct, ct + d * 0.9, 0.35); else dip(ct, ct + d * 0.9, 0.7); }
    else if (info.k === "affr") { dip(ct, ct + d * 0.35, 0.08); addNoise(ctx, dest, ct + d * 0.35, d * 0.65, info.f, 0.5 * p.vol); dip(ct + d * 0.35, ct + d, 0.35); }
    else if (info.k === "stop") { dip(ct, ct + d * 0.72, 0.07); addNoise(ctx, dest, ct + d * 0.72, 0.02, 2600, (info.v ? 0.2 : 0.5) * p.vol, 0.7); if (!info.v) addNoise(ctx, dest, ct + d * 0.72 + 0.02, 0.032, 1600, 0.17 * p.vol, 0.8); }
    else if (info.k === "nasal") { murmur(ct, ct + d); dip(ct, ct + d, 0.8); }
    ct += d;
  }
  let kt = vEnd;
  const coF = coda._f || 1;
  for (const c of coda) {
    const info = CONS[c], d = consDur(c) * 0.85 * coF;
    if (info.k === "fric") { addNoise(ctx, dest, kt, d, info.f, (info.g || 0.5) * p.vol * 1.1); dip(kt, kt + d, 0.5); }
    else if (info.k === "affr") { addNoise(ctx, dest, kt, d * 0.7, info.f, 0.45 * p.vol); }
    else if (info.k === "stop") { dip(kt + d * 0.4, kt + d, 0.07); }
    else if (info.k === "nasal") { murmur(kt, kt + d); dip(kt, kt + d, 0.65); }
    kt += d;
  }

  /* --- formant bank with automated trajectories --- */
  const targets = vowelTargets(phon.vowel);
  const t1 = targets[0], t2 = targets[1] || targets[0];
  // start position: consonant locus
  let start = t1;
  const first = onset[0];
  if (first === "W") start = PV.UW.f;
  else if (first === "Y") start = PV.IY.f;
  else if (first === "L") start = [430, 1000, 2500];
  else if (first === "R") start = [t1[0], t1[1], Math.min(t1[2], 1650)];

  const bus = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = 0.4;
  const singer = ctx.createBiquadFilter(); singer.type = "peaking";
  singer.frequency.value = 3200 * scale; singer.Q.value = 1.1; singer.gain.value = 3.5;
  bus.connect(singer); singer.connect(lp); lp.connect(dest);

  /* harmonic body: lowpassed source under the formants so the voice
     buzzes like a voice instead of ringing like three sine beeps */
  const bodyLp = ctx.createBiquadFilter(); bodyLp.type = "lowpass"; bodyLp.frequency.value = 750;
  const bodyG = ctx.createGain(); bodyG.gain.value = 0.32;
  artic.connect(bodyLp); bodyLp.connect(bodyG); bodyG.connect(bus);
  /* fixed presence formants F4/F5 */
  [[3400, 0.16], [4500, 0.09]].forEach(([ff, gg]) => {
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ff * scale; bp.Q.value = 8;
    const fg = ctx.createGain(); fg.gain.value = gg;
    artic.connect(bp); bp.connect(fg); fg.connect(bus);
  });

  const FG = [1.0, 0.7, 0.42];
  const FQ = [3.4, 4.8, 6.5];
  for (let fi = 0; fi < 3; fi++) {
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.Q.value = FQ[fi];
    const pts = [];
    pts.push([t, start[fi] * scale]);
    pts.push([vStart + 0.045, t1[fi] * scale]);
    if (targets.length > 1) { // diphthong glide
      pts.push([vStart + vDur * 0.5, t1[fi] * scale]);
      pts.push([vStart + vDur * 0.88, t2[fi] * scale]);
    }
    // coda colouring
    let endF = (targets.length > 1 ? t2 : t1)[fi];
    if (coda.includes("R")) endF = fi === 2 ? 1600 : endF;
    if (coda.includes("L")) endF = fi === 0 ? 360 : fi === 1 ? 1040 : endF;
    if (coda.some(c => CONS[c].k === "nasal")) endF = fi === 0 ? Math.min(endF, 340) : endF;
    pts.push([t + dur - 0.01, endF * scale]);
    bp.frequency.setValueAtTime(pts[0][1], pts[0][0]);
    for (let k = 1; k < pts.length; k++) bp.frequency.linearRampToValueAtTime(Math.max(60, pts[k][1]), pts[k][0]);
    const fg = ctx.createGain(); fg.gain.value = FG[fi];
    artic.connect(bp); bp.connect(fg); fg.connect(bus);
  }

  /* breath */
  if (p.breath > 0.01) {
    const nsrc = ctx.createBufferSource(); nsrc.buffer = makeNoise(ctx); nsrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = t1[1] * scale; bp.Q.value = 1.4;
    const ng = ctx.createGain(); ng.gain.value = p.breath * 0.15;
    const nenv = ctx.createGain();
    nenv.gain.setValueAtTime(0, vStart);
    nenv.gain.linearRampToValueAtTime(1, vStart + 0.04);
    nenv.gain.linearRampToValueAtTime(0, vEnd);
    nsrc.connect(bp); bp.connect(ng); ng.connect(nenv); nenv.connect(bus);
    nsrc.start(vStart); nsrc.stop(vEnd + 0.05);
  }
  osc.start(t); osc.stop(t + dur + 0.1);
  osc2.start(t); osc2.stop(t + dur + 0.1);
}

/* ================= transport / scheduler ================= */
let playing = false, playStartCtxTime = 0, schedTimer = null, nextStepToSchedule = 0, nextStepTime = 0;
const stepDur = () => 60 / params().tempo / 2;

function scheduleStep(step, when) {
  const sd = stepDur(), p = params(), sorted = sortedNotes();
  for (const n of sorted) {
    if (n.step !== step) continue;
    const prev = sorted.filter(x => x.step + x.len <= n.step).pop();
    const legato = prev && prev.step + prev.len === n.step;
    singSyllable(AC, master, {
      midi: n.midi, fromMidi: legato ? prev.midi : null,
      t: when, dur: n.len * sd * 0.98, phon: notePhon(n), char: character, p,
    });
  }
}
function schedulerTick() {
  while (nextStepTime < AC.currentTime + 0.14) {
    scheduleStep(nextStepToSchedule, nextStepTime);
    nextStepTime += stepDur();
    nextStepToSchedule++;
    if (nextStepToSchedule >= songSteps()) {
      if (!params().loop) { stopSoon(nextStepTime); return; }
      nextStepToSchedule = 0;
    }
  }
}
function stopSoon(atTime) {
  const ms = Math.max(0, (atTime - AC.currentTime) * 1000);
  setTimeout(() => { if (playing) stopPlayback(); }, ms + 30);
}
function startPlayback() {
  if (!notes.length) { flashMsg("Add some notes first — or type words above and hit Sing my words."); return; }
  ensureCtx();
  if (playing) { stopPlayback(); return; }
  playing = true;
  $("#btnPlay").textContent = "⏸ Pause";
  $("#btnPlay").classList.add("playing");
  $("#playhead").style.display = "block";
  nextStepToSchedule = 0;
  nextStepTime = AC.currentTime + 0.06;
  playStartCtxTime = nextStepTime;
  schedTimer = setInterval(schedulerTick, 25);
  schedulerTick();
}
function stopPlayback() {
  playing = false;
  clearInterval(schedTimer);
  $("#btnPlay").textContent = "▶ SING";
  $("#btnPlay").classList.remove("playing");
  $("#playhead").style.display = "none";
  document.querySelectorAll(".note.playing").forEach(e => e.classList.remove("playing"));
  $("#nowLyric").textContent = "—"; $("#nowNote").textContent = "stopped";
  mouthTarget = 0.02;
}

/* playhead + avatar */
let mouthOpen = 0.02, mouthTarget = 0.02;
function raf() {
  if (playing && AC) {
    const sf = (AC.currentTime - playStartCtxTime) / stepDur();
    if (sf >= 0) {
      const len = songSteps();
      const stepIdx = Math.floor(sf) % len;
      $("#playhead").style.left = (LABEL_W + (sf % len) * STEP_W) + "px";
      const active = sortedNotes().find(n => stepIdx >= n.step && stepIdx < n.step + n.len);
      document.querySelectorAll(".note").forEach(el =>
        el.classList.toggle("playing", !!active && +el.dataset.id === active.id));
      if (active) {
        const phon = notePhon(active);
        const prog = (sf - active.step) / active.len;
        const pulse = Math.sin(Math.min(1, Math.max(0, prog)) * Math.PI);
        mouthTarget = phon.nasalOnly ? 0.05 : 0.1 + vowelOpen(phon.vowel) * 0.9 * (0.35 + 0.65 * pulse);
        $("#nowLyric").textContent = active.lyric;
        $("#nowNote").textContent = character.name + " · " + noteName(active.midi) + " · " + active.lyric;
      } else mouthTarget = 0.03;
    }
  }
  mouthOpen += (mouthTarget - mouthOpen) * 0.35;
  const m = $("#mouth");
  m.setAttribute("ry", (1.2 + mouthOpen * 13).toFixed(2));
  m.setAttribute("rx", (5 + mouthOpen * 4).toFixed(2));
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

/* ================= piano roll UI ================= */
const roll = $("#roll");
roll.style.width = (LABEL_W + STEPS * STEP_W) + "px";
roll.style.height = (ROWS * ROW_H) + "px";
(function buildGrid() {
  for (let r = 0; r < ROWS; r++) {
    const midi = TOP - r;
    const line = document.createElement("div");
    line.className = "rowline" + (BLACK.has(midi % 12) ? " black-row" : "") + (midi % 12 === 0 ? " cline" : "");
    line.style.top = (r * ROW_H) + "px"; line.style.height = ROW_H + "px";
    roll.appendChild(line);
    if (midi % 12 === 0 || r === 0) {
      const lab = document.createElement("div");
      lab.className = "plabel"; lab.style.top = (r * ROW_H + 3) + "px";
      lab.textContent = noteName(midi);
      roll.appendChild(lab);
    }
  }
  for (let s = 0; s <= STEPS; s++) {
    const b = document.createElement("div");
    b.className = "beatline" + (s % 4 === 0 ? " bar" : "");
    b.style.left = (LABEL_W + s * STEP_W) + "px";
    roll.appendChild(b);
  }
})();

function renderNotes() {
  roll.querySelectorAll(".note").forEach(e => e.remove());
  for (const n of notes) {
    const el = document.createElement("div");
    el.className = "note" + (n.id === selectedId ? " sel" : "");
    el.dataset.id = n.id;
    el.style.left = (LABEL_W + n.step * STEP_W + 1) + "px";
    el.style.top = ((TOP - n.midi) * ROW_H + 1) + "px";
    el.style.width = (n.len * STEP_W - 2) + "px";
    el.style.height = (ROW_H - 2) + "px";
    el.textContent = n.lyric || "";
    const grip = document.createElement("div"); grip.className = "grip";
    el.appendChild(grip);
    roll.appendChild(el);
  }
  updateLyricCount();
}
function updateLyricCount() {
  $("#lyricCount").textContent = notes.length ? notes.length + " note" + (notes.length > 1 ? "s" : "") : "";
  const sel = notes.find(n => n.id === selectedId);
  $("#txtSelLyric").value = sel ? sel.lyric : "";
  $("#txtSelLyric").placeholder = sel ? "" : "—";
}
function flashMsg(msg) { $("#wordsMsg").textContent = msg; }

/* --- pointer editing --- */
let drag = null;
function posToCell(e) {
  const r = roll.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  return {
    step: Math.max(0, Math.min(STEPS - 1, Math.floor((x - LABEL_W) / STEP_W))),
    midi: Math.max(BOTTOM, Math.min(TOP, TOP - Math.floor(y / ROW_H))),
    onLabel: x < LABEL_W,
  };
}
roll.addEventListener("pointerdown", e => {
  if (e.button === 2) return;
  const cell = posToCell(e); if (cell.onLabel) return;
  ensureCtx();
  const noteEl = e.target.closest(".note");
  if (noteEl) {
    const n = notes.find(x => x.id === +noteEl.dataset.id);
    selectedId = n.id;
    const mode = e.target.classList.contains("grip") ? "resize" : "move";
    drag = { note: n, mode, startStep: cell.step, startMidi: cell.midi, orig: { ...n } };
  } else {
    const n = { id: nextId++, step: cell.step, midi: cell.midi, len: 1, lyric: "la", phon: laPhon() };
    notes.push(n); selectedId = n.id;
    drag = { note: n, mode: "resize", startStep: cell.step, startMidi: cell.midi, orig: { ...n } };
    auditionNote(n.midi, n.phon, n.lyric);
  }
  renderNotes();
  e.preventDefault();
});
window.addEventListener("pointermove", e => {
  if (!drag) return;
  const cell = posToCell(e), n = drag.note;
  if (drag.mode === "resize") n.len = Math.max(1, Math.min(STEPS - n.step, cell.step - n.step + 1));
  else {
    n.step = Math.max(0, Math.min(STEPS - n.len, drag.orig.step + (cell.step - drag.startStep)));
    n.midi = Math.max(BOTTOM, Math.min(TOP, drag.orig.midi + (cell.midi - drag.startMidi)));
  }
  renderNotes();
});
window.addEventListener("pointerup", () => { drag = null; });
roll.addEventListener("contextmenu", e => {
  const noteEl = e.target.closest(".note");
  if (noteEl) { e.preventDefault(); deleteNote(+noteEl.dataset.id); }
});
roll.addEventListener("dblclick", e => {
  const noteEl = e.target.closest(".note");
  if (noteEl) deleteNote(+noteEl.dataset.id);
});
function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  if (selectedId === id) selectedId = null;
  renderNotes();
}
document.addEventListener("keydown", e => {
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId != null &&
      !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) deleteNote(selectedId);
  if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
    e.preventDefault(); playing ? stopPlayback() : startPlayback();
  }
});

/* audition */
function auditionNote(midi, phon, disp) {
  ensureCtx();
  singSyllable(AC, master, { midi, fromMidi: null, t: AC.currentTime + 0.01, dur: 0.55, phon, char: character, p: params() });
  mouthTarget = phon.nasalOnly ? 0.05 : 0.15 + vowelOpen(phon.vowel);
  $("#nowLyric").textContent = disp;
  $("#nowNote").textContent = character.name + " · " + noteName(midi) + " · " + disp;
  setTimeout(() => { if (!playing) mouthTarget = 0.02; }, 420);
}

/* ================= words: type anything ================= */
function getSyllables() { return G2P.textToSyllables($("#txtWords").value); }

$("#btnSingWords").addEventListener("click", () => {
  const syls = getSyllables();
  if (!syls.length) { flashMsg("Type something first — anything at all."); return; }
  stopPlayback();
  const PENTA = [60, 62, 64, 67, 69, 72, 74, 76];
  const MOVES = [0, 1, 0, -1, 1, 2, 0, -1, -2, 0, 1, -1, 0, 2, -1, -2];
  let deg = 3, step = 0, mi = 0;
  const built = [];
  syls.forEach((s, i) => {
    if (step >= STEPS) return;
    if (s.stress && i > 0) deg += 1;
    deg += MOVES[mi++ % MOVES.length];
    deg = Math.max(1, Math.min(6, deg));
    let len = 1, midi = PENTA[deg];
    if (s.phraseEnd === ".") { len = 3; midi = PENTA[0]; }
    else if (s.phraseEnd === ",") len = 2;
    else if (i === syls.length - 1) { len = 3; midi = PENTA[0]; }
    built.push({ id: nextId++, step, midi, len, lyric: s.disp, phon: s });
    step += len + (s.phraseEnd === "." ? 2 : s.phraseEnd === "," ? 1 : 0);
    if (s.wordEnd) deg += (i % 2 ? -1 : 0);
  });
  notes = built;
  selectedId = null;
  renderNotes();
  flashMsg(built.length + " syllables on a fresh melody — hit SING (or it starts now). Edit any note in the roll.");
  setTimeout(startPlayback, 60);
});

$("#btnApplyWords").addEventListener("click", () => {
  const syls = getSyllables();
  if (!syls.length) { flashMsg("Type something first — anything at all."); return; }
  stopPlayback();
  const sorted = sortedNotes();
  let used = 0;
  sorted.forEach((n, i) => {
    if (i < syls.length) { n.lyric = syls[i].disp; n.phon = syls[i]; used++; }
    else { // hold the previous vowel so extra notes don't sing stray words
      const prevPhon = i > 0 ? notePhon(sorted[i - 1]) : laPhon();
      n.lyric = "·"; n.phon = { onset: [], vowel: prevPhon.vowel, coda: [] };
    }
  });
  // overflow syllables: extend the melody past the last note
  if (syls.length > sorted.length) {
    let step = sorted.length ? Math.max(...sorted.map(n => n.step + n.len)) : 0;
    let midi = sorted.length ? sorted[sorted.length - 1].midi : 67;
    const walk = [0, -2, 2, -1, 1, 0];
    for (let i = sorted.length; i < syls.length && step < STEPS; i++) {
      midi = Math.max(57, Math.min(72, midi + walk[i % walk.length]));
      const n = { id: nextId++, step, midi, len: 1, lyric: syls[i].disp, phon: syls[i] };
      notes.push(n); step += 1; used++;
    }
  }
  selectedId = null;
  renderNotes();
  flashMsg(used + " syllables placed on your melody" +
    (used < syls.length ? " — " + (syls.length - used) + " didn't fit the roll." : ". Hit SING."));
});

/* selected-note lyric: typing a whole word splits it across new notes */
$("#txtSelLyric").addEventListener("change", e => {
  const n = notes.find(x => x.id === selectedId);
  if (!n) return;
  const syls = G2P.textToSyllables(e.target.value.trim());
  if (!syls.length) { renderNotes(); return; }
  n.lyric = syls[0].disp; n.phon = syls[0];
  if (syls.length > 1) {
    notes = notes.filter(x => x.id === n.id || x.step < n.step + n.len || x.step >= n.step + n.len + syls.length - 1);
    for (let i = 1; i < syls.length; i++) {
      if (n.step + n.len + i - 1 >= STEPS) break;
      notes.push({ id: nextId++, step: n.step + n.len + i - 1, midi: n.midi, len: 1, lyric: syls[i].disp, phon: syls[i] });
    }
  }
  renderNotes();
});

/* ================= characters ================= */
const charRow = $("#charRow");
CHARACTERS.forEach(c => {
  const card = document.createElement("div");
  card.className = "char-card" + (c === character ? " on" : "");
  card.style.setProperty("--cc", c.color);
  card.innerHTML = `<div class="cname">${c.name}</div><div class="cdesc">${c.desc}</div>`;
  card.addEventListener("click", () => {
    character = c;
    document.documentElement.style.setProperty("--char", c.color);
    $("#rngBreath").value = c.breath; syncLabels();
    charRow.querySelectorAll(".char-card").forEach(el => el.classList.toggle("on", el === card));
    auditionNote(67, laPhon(), "la");
  });
  charRow.appendChild(card);
});
document.documentElement.style.setProperty("--char", character.color);

/* ================= mini keyboard ================= */
(function buildKeys() {
  const wrap = $("#miniKeys");
  for (let m = 60; m <= 72; m++) {
    const b = document.createElement("button");
    if (BLACK.has(m % 12)) b.className = "black";
    b.textContent = noteName(m);
    b.addEventListener("pointerdown", () => {
      b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 300);
      const v = CHIP_VOWEL[auditionVowel];
      auditionNote(m, { onset: ["L"], vowel: v, coda: [] }, "l" + auditionVowel);
    });
    wrap.appendChild(b);
  }
})();
$("#vowelChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip"); if (!chip) return;
  auditionVowel = chip.dataset.v;
  document.querySelectorAll("#vowelChips .chip").forEach(c => c.classList.toggle("on", c === chip));
});

/* ================= sliders / transport ================= */
function syncLabels() {
  $("#tempoVal").textContent = $("#rngTempo").value;
  $("#vibVal").textContent = $("#rngVib").value;
  $("#breathVal").textContent = $("#rngBreath").value;
  $("#brightVal").textContent = $("#rngBright").value;
  $("#portaVal").textContent = $("#rngPorta").value;
  $("#volVal").textContent = $("#rngVol").value;
}
document.querySelectorAll(".sliders input").forEach(i => i.addEventListener("input", syncLabels));
syncLabels();
$("#btnPlay").addEventListener("click", startPlayback);
$("#btnStop").addEventListener("click", stopPlayback);
$("#btnClear").addEventListener("click", () => { stopPlayback(); notes = []; selectedId = null; renderNotes(); });

/* ================= presets ================= */
const PRESETS = {
  hoshi: { tempo: 112, char: "aoi", lyrics: "ho shi no u ta ga hi ka ru yo ru so ra wo ko e te yu ku ka ze no ne i ro",
    notes: [[0,67,1],[1,67,1],[2,69,1],[3,67,1],[4,65,1],[5,64,1],[6,62,1],[7,64,1],[8,65,1],[9,64,1],[10,62,2],[12,60,1],[13,62,1],[14,64,1],[15,65,1],[16,67,1],[17,69,1],[18,67,2],[20,65,1],[21,64,1],[22,62,1],[23,60,1],[24,62,3],[28,60,3]] },
  twinkle: { tempo: 100, char: "aoi", text: "twinkle twinkle little star, how i wonder what you are",
    notes: [[0,60,1],[1,60,1],[2,67,1],[3,67,1],[4,69,1],[5,69,1],[6,67,2],[8,65,1],[9,65,1],[10,64,1],[11,64,1],[12,62,1],[13,62,1],[14,60,2],[16,67,1],[17,67,1],[18,65,1],[19,65,1],[20,64,1],[21,64,1],[22,62,2],[24,67,1],[25,67,1],[26,65,1],[27,65,1],[28,64,1],[29,64,1],[30,62,2]] },
  sakura: { tempo: 84, char: "ren", lyrics: "sa ku ra ma i chi ru ha ru no ka ze ni no se te to do ke ta i ki mi e no u ta",
    notes: [[0,69,2],[2,67,1],[3,64,1],[4,62,2],[6,64,1],[7,67,1],[8,69,2],[10,72,2],[12,69,1],[13,67,1],[14,64,2],[16,62,2],[18,60,1],[19,62,1],[20,64,2],[22,67,1],[23,69,1],[24,67,2],[26,64,2],[28,62,4]] },
};
function loadPreset(key) {
  const pr = PRESETS[key]; if (!pr) return;
  stopPlayback();
  let syls;
  if (pr.text) { syls = G2P.textToSyllables(pr.text); $("#txtWords").value = pr.text; }
  else { syls = pr.lyrics.split(/\s+/).map(tok => G2P.romajiSyllable(tok) || laPhon()); }
  notes = pr.notes.map((n, i) => ({ id: nextId++, step: n[0], midi: n[1], len: n[2],
    lyric: syls[i] ? (syls[i].disp || syls[i].word) : "a", phon: syls[i] || null }));
  if (pr.tempo) $("#rngTempo").value = pr.tempo;
  syncLabels();
  const card = [...charRow.children].find(el => el.querySelector(".cname").textContent === pr.char.toUpperCase());
  if (card && character.id !== pr.char) card.click();
  selectedId = null;
  renderNotes();
}
$("#selPreset").addEventListener("change", e => { loadPreset(e.target.value); e.target.value = ""; });

/* ================= WAV export ================= */
function encodeWAV(buffer) {
  const ch = Math.min(2, buffer.numberOfChannels), sr = buffer.sampleRate, len = buffer.length;
  const bytes = 44 + len * ch * 2;
  const ab = new ArrayBuffer(bytes), v = new DataView(ab);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); v.setUint32(4, bytes - 8, true); wstr(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); wstr(36, "data"); v.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    v.setInt16(off, s * 0x7fff, true); off += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}
$("#btnExport").addEventListener("click", async () => {
  if (!notes.length) { flashMsg("Nothing to export yet."); return; }
  const btn = $("#btnExport"); btn.textContent = "⏳ Rendering…"; btn.disabled = true;
  try {
    const p = params(), sd = 60 / p.tempo / 2;
    const endStep = Math.max(...notes.map(n => n.step + n.len));
    const total = endStep * sd + 1.2;
    const off = new OfflineAudioContext(2, Math.ceil(44100 * total), 44100);
    const mst = off.createGain(); mst.gain.value = 0.9;
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    mst.connect(comp); comp.connect(off.destination);
    if (p.reverb) {
      const conv = off.createConvolver(); conv.buffer = makeImpulse(off);
      const wet = off.createGain(); wet.gain.value = 0.22;
      mst.connect(conv); conv.connect(wet); wet.connect(comp);
    }
    const sorted = sortedNotes();
    sorted.forEach((n, i) => {
      const prev = sorted[i - 1];
      const legato = prev && prev.step + prev.len === n.step;
      singSyllable(off, mst, { midi: n.midi, fromMidi: legato ? prev.midi : null,
        t: 0.05 + n.step * sd, dur: n.len * sd * 0.98, phon: notePhon(n), char: character, p });
    });
    const rendered = await off.startRendering();
    const blob = encodeWAV(rendered);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "holovox-" + character.name.toLowerCase() + ".wav";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } finally { btn.textContent = "⬇ Export WAV"; btn.disabled = false; }
});

/* ================= boot ================= */
loadPreset("hoshi");
