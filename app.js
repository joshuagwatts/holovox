"use strict";
/* ================= HoloVox — browser singing synthesizer =================
   Formant synthesis: a sawtooth "glottal" source through 3 parallel
   bandpass resonators tuned to each vowel's formants, plus consonant
   noise bursts / nasal hums, vibrato, breath noise and portamento.   */

/* ---------------- constants ---------------- */
const STEPS = 32;            // 32 eighth-note steps = 8 bars of 4/4 feel
const TOP = 72, BOTTOM = 48; // C5 .. C3
const ROWS = TOP - BOTTOM + 1;
const STEP_W = 36, ROW_H = 22, LABEL_W = 44;

const VOWELS = {
  //        F1    F2    F3    mouth-open  formant gains
  a: { f: [730, 1090, 2440], open: 1.00, g: [1.00, 0.55, 0.28] },
  i: { f: [270, 2290, 3010], open: 0.32, g: [0.55, 1.00, 0.45] },
  u: { f: [300,  870, 2240], open: 0.30, g: [0.90, 0.40, 0.22] },
  e: { f: [530, 1840, 2480], open: 0.55, g: [0.85, 0.90, 0.35] },
  o: { f: [570,  840, 2410], open: 0.72, g: [1.00, 0.45, 0.25] },
};

const CHARACTERS = [
  { id: "aoi", name: "AOI", desc: "bright · clear · classic idol", color: "#2ee6c8", scale: 1.09, breath: 14 },
  { id: "ren", name: "REN", desc: "soft · warm · breathy",        color: "#ff7eb0", scale: 0.98, breath: 30 },
  { id: "kai", name: "KAI", desc: "deep · smooth · masculine",     color: "#7ea8ff", scale: 0.83, breath: 10 },
];

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BLACK = new Set([1, 3, 6, 8, 10]);

/* ---------------- state ---------------- */
let notes = [];           // {id, step, midi, len, lyric}
let nextId = 1;
let selectedId = null;
let character = CHARACTERS[0];
let auditionVowel = "a";

const $ = s => document.querySelector(s);
const params = () => ({
  tempo: +$("#rngTempo").value,
  vib: +$("#rngVib").value / 100,
  breath: +$("#rngBreath").value / 100,
  bright: 0.75 + (+$("#rngBright").value / 100) * 0.55,   // formant scale 0.75..1.30
  porta: +$("#rngPorta").value / 100,
  vol: +$("#rngVol").value / 100,
  reverb: $("#chkReverb").checked,
  loop: $("#chkLoop").checked,
});

/* ---------------- syllable parsing ---------------- */
function parseSyllable(raw) {
  const s = (raw || "a").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return { onset: "", vowel: "a", nasalOnly: false };
  if (s === "n" || s === "m") return { onset: "", vowel: "u", nasalOnly: true };
  const m = s.match(/^([a-z]*?)([aeiou])([a-z]*)$/);
  if (!m) return { onset: "", vowel: "a", nasalOnly: false };
  return { onset: m[1], vowel: m[2], nasalOnly: false, coda: m[3] || "" };
}
function consonantKind(onset) {
  if (!onset) return "none";
  if (/^(sh|ch|ts|s|z|f|h|j)/.test(onset)) return "fricative";
  if (/^(k|t|p|b|d|g)/.test(onset)) return "plosive";
  if (/^(m|n)/.test(onset)) return "nasal";
  return "liquid"; // r l y w v and everything else glides in
}

/* ================= audio core ================= */
let AC = null, master, wetBus;
const noiseCache = new WeakMap();

function makeNoise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
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
  comp.threshold.value = -16; comp.ratio.value = 6;
  comp.connect(AC.destination);
  master = AC.createGain(); master.gain.value = 0.9; master.connect(comp);
  const conv = AC.createConvolver(); conv.buffer = makeImpulse(AC);
  wetBus = AC.createGain(); wetBus.gain.value = 0.22;
  master.connect(conv); conv.connect(wetBus); wetBus.connect(comp);
  return AC;
}

/* Sing one note into `dest`. Works for live AudioContext and OfflineAudioContext. */
function singNote(ctx, dest, o) {
  // o: {midi, fromMidi|null, t, dur, syllable, char, p}
  const p = o.p, syl = parseSyllable(o.syllable);
  const freq = mtof(o.midi);
  const t = o.t, dur = Math.max(0.08, o.dur);
  const scale = o.char.scale * p.bright;

  if (syl.nasalOnly) { // "n" — closed-mouth hum
    const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * p.vol, t + 0.03);
    g.gain.setValueAtTime(0.5 * p.vol, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(bp); bp.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    return;
  }

  const kind = consonantKind(syl.onset);
  let vStart = t, consDur = 0;
  if (kind === "fricative") { consDur = Math.min(0.09, dur * 0.35); vStart = t + consDur * 0.55; }
  if (kind === "plosive")   { consDur = Math.min(0.045, dur * 0.2); vStart = t + consDur; }
  if (kind === "nasal")     { consDur = Math.min(0.075, dur * 0.3); vStart = t + consDur * 0.5; }

  /* --- consonant layer --- */
  if (kind === "fricative" || kind === "plosive") {
    const src = ctx.createBufferSource(); src.buffer = makeNoise(ctx);
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = syl.onset.startsWith("f") ? 5200 : syl.onset.startsWith("h") ? 1800 : 6800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const peak = (kind === "fricative" ? 0.30 : 0.42) * p.vol;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.03, consDur));
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t); src.stop(t + consDur + 0.05);
  }
  if (kind === "nasal") {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 280; bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 * p.vol, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + consDur + 0.02);
    osc.connect(bp); bp.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + consDur + 0.05);
  }

  /* --- vowel voice --- */
  const vDur = Math.max(0.06, t + dur - vStart);
  const V = VOWELS[syl.vowel];
  const glide = (kind === "liquid") ? 0.055 : 0.0;

  const osc = ctx.createOscillator(); osc.type = "sawtooth";
  // portamento from previous note when legato
  const portaTime = (o.fromMidi != null) ? 0.02 + p.porta * 0.16 : 0.012;
  if (o.fromMidi != null && portaTime > 0.015) {
    osc.frequency.setValueAtTime(mtof(o.fromMidi), vStart);
    osc.frequency.exponentialRampToValueAtTime(freq, vStart + portaTime);
  } else {
    osc.frequency.setValueAtTime(freq * 0.985, vStart); // tiny scoop in
    osc.frequency.exponentialRampToValueAtTime(freq, vStart + 0.03);
  }
  // vibrato: fades in over the note
  if (p.vib > 0.01) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + p.vib * 2.2;
    const lg = ctx.createGain();
    const depthCents = p.vib * 55;
    lg.gain.setValueAtTime(0, vStart);
    lg.gain.linearRampToValueAtTime(0, vStart + vDur * 0.3);
    lg.gain.linearRampToValueAtTime(depthCents, vStart + vDur * 0.75);
    // detune is in cents: route lfo->gain(cents)->osc.detune
    lfo.connect(lg); lg.connect(osc.detune);
    lfo.start(vStart); lfo.stop(vStart + vDur + 0.1);
  }

  const env = ctx.createGain();
  const atk = Math.min(0.045, vDur * 0.25), rel = Math.min(0.07, vDur * 0.35);
  env.gain.setValueAtTime(0, vStart);
  env.gain.linearRampToValueAtTime(0.85 * p.vol, vStart + atk);
  env.gain.setValueAtTime(0.85 * p.vol, vStart + Math.max(atk, vDur - rel));
  env.gain.linearRampToValueAtTime(0, vStart + vDur + 0.015);

  const bus = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = 0.4;
  const singer = ctx.createBiquadFilter(); singer.type = "peaking";
  singer.frequency.value = 3200 * scale; singer.Q.value = 1.1; singer.gain.value = 5;
  bus.connect(singer); singer.connect(lp); lp.connect(dest);

  osc.connect(env);
  V.f.forEach((f, i) => {
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    const target = f * scale;
    if (glide) { // liquid consonants glide the formants in
      bp.frequency.setValueAtTime(target * (i === 1 ? 1.25 : 0.8), vStart);
      bp.frequency.exponentialRampToValueAtTime(target, vStart + glide);
    } else bp.frequency.value = target;
    bp.Q.value = i === 0 ? 5.5 : 7.5;
    const fg = ctx.createGain(); fg.gain.value = V.g[i];
    env.connect(bp); bp.connect(fg); fg.connect(bus);
  });

  // breath noise riding the vowel
  if (p.breath > 0.01) {
    const nsrc = ctx.createBufferSource(); nsrc.buffer = makeNoise(ctx); nsrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = V.f[1] * scale; bp.Q.value = 1.4;
    const ng = ctx.createGain(); ng.gain.value = p.breath * 0.16;
    const nenv = ctx.createGain();
    nenv.gain.setValueAtTime(0, vStart);
    nenv.gain.linearRampToValueAtTime(1, vStart + atk);
    nenv.gain.linearRampToValueAtTime(0, vStart + vDur);
    nsrc.connect(bp); bp.connect(ng); ng.connect(nenv); nenv.connect(bus);
    nsrc.start(vStart); nsrc.stop(vStart + vDur + 0.05);
  }

  osc.start(vStart); osc.stop(vStart + vDur + 0.1);
}

/* ================= transport / scheduler ================= */
let playing = false, playStartCtxTime = 0, playStartStep = 0, schedTimer = null, nextStepToSchedule = 0, nextStepTime = 0;
const stepDur = () => 60 / params().tempo / 2;

function sortedNotes() { return [...notes].sort((a, b) => a.step - b.step || b.midi - a.midi); }

function scheduleStep(step, when) {
  const sd = stepDur();
  const p = params();
  for (const n of sortedNotes()) {
    if (n.step !== step) continue;
    const prev = sortedNotes().filter(x => x.step + x.len <= n.step).pop();
    const legato = prev && prev.step + prev.len === n.step;
    singNote(AC, master, {
      midi: n.midi, fromMidi: legato ? prev.midi : null,
      t: when, dur: n.len * sd * 0.98,
      syllable: n.lyric, char: character, p,
    });
  }
}
function schedulerTick() {
  const ahead = 0.14;
  while (nextStepTime < AC.currentTime + ahead) {
    scheduleStep(nextStepToSchedule, nextStepTime);
    nextStepTime += stepDur();
    nextStepToSchedule++;
    if (nextStepToSchedule >= STEPS) {
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
  if (!notes.length) { flashLyricCount("Add some notes first — click the piano roll."); return; }
  ensureCtx();
  if (playing) { stopPlayback(); return; }
  playing = true;
  $("#btnPlay").textContent = "⏸ Pause";
  $("#btnPlay").classList.add("playing");
  $("#playhead").style.display = "block";
  nextStepToSchedule = 0;
  nextStepTime = AC.currentTime + 0.06;
  playStartCtxTime = nextStepTime; playStartStep = 0;
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

/* playhead + avatar animation */
let mouthOpen = 0.02, mouthTarget = 0.02;
function currentStepFloat() {
  if (!playing) return -1;
  return playStartStep + (AC.currentTime - playStartCtxTime) / stepDur();
}
function raf() {
  const sf = currentStepFloat();
  if (playing && sf >= 0) {
    const stepIdx = Math.floor(sf) % STEPS;
    $("#playhead").style.left = (LABEL_W + sf % STEPS * STEP_W) + "px";
    const active = sortedNotes().find(n => stepIdx >= n.step && stepIdx < n.step + n.len);
    document.querySelectorAll(".note").forEach(el =>
      el.classList.toggle("playing", active && +el.dataset.id === active.id));
    if (active) {
      const syl = parseSyllable(active.lyric);
      const prog = (sf - active.step) / active.len;
      const pulse = Math.sin(Math.min(1, prog) * Math.PI); // open mid-note
      mouthTarget = syl.nasalOnly ? 0.05 : 0.1 + VOWELS[syl.vowel].open * 0.9 * (0.35 + 0.65 * pulse);
      $("#nowLyric").textContent = active.lyric;
      $("#nowNote").textContent = character.name + " · " + noteName(active.midi) + " · " + active.lyric;
    } else mouthTarget = 0.03;
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
  const el = $("#lyricCount");
  el.textContent = notes.length ? notes.length + " note" + (notes.length > 1 ? "s" : "") : "";
  const sel = notes.find(n => n.id === selectedId);
  $("#txtSelLyric").value = sel ? sel.lyric : "";
  $("#txtSelLyric").placeholder = sel ? "" : "—";
}
function flashLyricCount(msg) { $("#lyricCount").textContent = msg; }

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
    const n = { id: nextId++, step: cell.step, midi: cell.midi, len: 1, lyric: defaultLyricForNewNote() };
    notes.push(n); selectedId = n.id;
    drag = { note: n, mode: "resize", startStep: cell.step, startMidi: cell.midi, orig: { ...n } };
    auditionNote(n.midi, n.lyric);
  }
  renderNotes();
  e.preventDefault();
});
window.addEventListener("pointermove", e => {
  if (!drag) return;
  const cell = posToCell(e), n = drag.note;
  if (drag.mode === "resize") {
    n.len = Math.max(1, Math.min(STEPS - n.step, cell.step - n.step + 1));
  } else {
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
      !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    deleteNote(selectedId);
  }
  if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
    e.preventDefault(); playing ? stopPlayback() : startPlayback();
  }
});
function defaultLyricForNewNote() {
  const toks = $("#txtLyrics").value.trim().split(/\s+/).filter(Boolean);
  const idx = sortedNotes().length - 1;
  return toks[idx] || "a";
}

/* audition a single note (also used by mini keyboard) */
function auditionNote(midi, lyric) {
  ensureCtx();
  const p = params();
  singNote(AC, master, { midi, fromMidi: null, t: AC.currentTime + 0.01, dur: 0.55, syllable: lyric, char: character, p });
  const syl = parseSyllable(lyric);
  mouthTarget = syl.nasalOnly ? 0.05 : 0.15 + VOWELS[syl.vowel].open;
  $("#nowLyric").textContent = lyric;
  $("#nowNote").textContent = character.name + " · " + noteName(midi) + " · " + lyric;
  setTimeout(() => { if (!playing) mouthTarget = 0.02; }, 420);
}

/* ================= lyrics bar ================= */
$("#btnApplyLyrics").addEventListener("click", () => {
  const toks = $("#txtLyrics").value.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return;
  sortedNotes().forEach((n, i) => { if (toks[i]) n.lyric = toks[i]; });
  renderNotes();
});
$("#txtSelLyric").addEventListener("input", e => {
  const n = notes.find(x => x.id === selectedId);
  if (n) { n.lyric = e.target.value.trim() || "a"; renderNotes(); $("#txtSelLyric").value = n.lyric; $("#txtSelLyric").focus(); }
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
    auditionNote(67, "la");
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
      auditionNote(m, auditionVowel === "a" ? "la" : "l" + auditionVowel);
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
  if (AC) { /* live volume */ }
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
  twinkle: { tempo: 100, char: "aoi", lyrics: "twin kle twin kle lit tle star how i won der what you are",
    notes: [[0,60,1],[1,60,1],[2,67,1],[3,67,1],[4,69,1],[5,69,1],[6,67,2],[8,65,1],[9,65,1],[10,64,1],[11,64,1],[12,62,1],[13,62,1],[14,60,2],[16,67,1],[17,67,1],[18,65,1],[19,65,1],[20,64,1],[21,64,1],[22,62,2],[24,67,1],[25,67,1],[26,65,1],[27,65,1],[28,64,1],[29,64,1],[30,62,2]] },
  sakura: { tempo: 84, char: "ren", lyrics: "sa ku ra ma i chi ru ha ru no ka ze ni no se te to do ke ta i ki mi e no u ta",
    notes: [[0,69,2],[2,67,1],[3,64,1],[4,62,2],[6,64,1],[7,67,1],[8,69,2],[10,72,2],[12,69,1],[13,67,1],[14,64,2],[16,62,2],[18,60,1],[19,62,1],[20,64,2],[22,67,1],[23,69,1],[24,67,2],[26,64,2],[28,62,4]] },
};
function loadPreset(key) {
  const pr = PRESETS[key]; if (!pr) return;
  stopPlayback();
  const toks = pr.lyrics.split(/\s+/);
  notes = pr.notes.map((n, i) => ({ id: nextId++, step: n[0], midi: n[1], len: n[2], lyric: toks[i] || "a" }));
  $("#txtLyrics").value = pr.lyrics;
  $("#rngTempo").value = pr.tempo; syncLabels();
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
  if (!notes.length) { flashLyricCount("Nothing to export yet — add notes first."); return; }
  const btn = $("#btnExport"); btn.textContent = "⏳ Rendering…"; btn.disabled = true;
  try {
    const p = params(), sd = 60 / p.tempo / 2;
    const total = STEPS * sd + 1.2;
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
      singNote(off, mst, { midi: n.midi, fromMidi: legato ? prev.midi : null,
        t: 0.05 + n.step * sd, dur: n.len * sd * 0.98, syllable: n.lyric, char: character, p });
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
