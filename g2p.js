"use strict";
/* ============ HoloVox G2P — English text -> singable phoneme syllables ============
   Output syllable: { disp, onset:[PH], vowel:PH, coda:[PH], word, wordStart, wordEnd, stress }
   Phonemes: P B T D K G F V S Z SH ZH TH DH H CH JH M N NG L R W Y
             AA AE AH AO EH ER IH IY UH UW  + diphthongs AY EY OW AW OY          */
(function () {
const VOWELS = new Set(["AA","AE","AH","AO","EH","ER","IH","IY","UH","UW","AY","EY","OW","AW","OY"]);
const isVowel = p => VOWELS.has(p);

/* ---------- dictionary: words rules get wrong, + lyric vocabulary ---------- */
const D = {};
function M(w, p) { D[w] = [[w, p]]; }                 // monosyllable: disp, phonemes
function W(w, syls) { D[w] = syls; }                  // [[disp, "PH PH"], ...]

// function words & irregulars
M("i","AY"); M("you","Y UW"); M("u","Y UW"); M("the","DH AH"); M("a","AH"); M("an","AE N");
M("and","AE N D"); M("to","T UW"); M("of","AH V"); M("in","IH N"); M("on","AA N"); M("is","IH Z");
M("are","AA R"); M("was","W AH Z"); M("be","B IY"); M("we","W IY"); M("me","M IY"); M("he","H IY");
M("she","SH IY"); M("my","M AY"); M("your","Y AO R"); M("our","AW R"); M("this","DH IH S");
M("that","DH AE T"); M("they","DH EY"); M("them","DH EH M"); M("then","DH EH N"); M("than","DH AE N");
M("with","W IH DH"); M("for","F AO R"); M("from","F R AH M"); M("what","W AA T"); M("when","W EH N");
M("where","W EH R"); M("why","W AY"); M("how","H AW"); M("now","N AW"); M("know","N OW"); M("new","N UW");
M("one","W AH N"); M("two","T UW"); M("all","AO L"); M("can","K AE N"); M("can't","K AE N T");
M("don't","D OW N T"); M("won't","W OW N T"); M("i'm","AY M"); M("you're","Y AO R"); M("we're","W IH R");
M("it's","IH T S"); M("let","L EH T"); M("lets","L EH T S"); M("oh","OW"); M("yeah","Y AE");
M("do","D UW"); M("go","G OW"); M("no","N OW"); M("so","S OW"); M("up","AH P"); M("out","AW T");
M("about","AH B AW T"); W("about",[["a","AH"],["bout","B AW T"]]);
W("again",[["a","AH"],["gain","G EH N"]]); W("away",[["a","AH"],["way","W EY"]]);
W("over",[["o","OW"],["ver","V ER"]]); W("under",[["un","AH N"],["der","D ER"]]);
W("into",[["in","IH N"],["to","T UW"]]); W("only",[["on","OW N"],["ly","L IY"]]);
W("every",[["ev","EH V"],["ery","ER IY"]]); W("other",[["oth","AH DH"],["er","ER"]]);
// lyric vocabulary
M("love","L AH V"); M("heart","H AA R T"); M("night","N AY T"); M("light","L AY T"); M("sky","S K AY");
M("dream","D R IY M"); M("dreams","D R IY M Z"); M("shine","SH AY N"); M("forever","F AO R EH V ER");
W("forever",[["for","F AO R"],["ev","EH V"],["er","ER"]]);
M("tonight","T AH N AY T"); W("tonight",[["to","T AH"],["night","N AY T"]]);
M("baby","B EY B IY"); W("baby",[["ba","B EY"],["by","B IY"]]);
M("fire","F AY R"); M("higher","H AY R"); W("higher",[["high","H AY"],["er","ER"]]);
M("fly","F L AY"); M("alive","AH L AY V"); W("alive",[["a","AH"],["live","L AY V"]]);
M("world","W ER L D"); M("hello","H EH L OW"); W("hello",[["hel","H EH L"],["lo","L OW"]]);
M("beautiful","B Y UW T IH F AH L");
W("beautiful",[["beau","B Y UW"],["ti","T IH"],["ful","F AH L"]]);
M("create","K R IY EY T"); W("create",[["cre","K R IY"],["ate","EY T"]]);
M("anything","EH N IY TH IH NG"); W("anything",[["an","EH N"],["y","IY"],["thing","TH IH NG"]]);
M("imaginable","IH M AE JH IH N AH B AH L");
W("imaginable",[["i","IH"],["mag","M AE JH"],["i","IH"],["na","N AH"],["ble","B AH L"]]);
M("imagine","IH M AE JH IH N"); W("imagine",[["i","IH"],["mag","M AE JH"],["ine","IH N"]]);
M("never","N EH V ER"); W("never",[["nev","N EH V"],["er","ER"]]);
M("ever","EH V ER"); W("ever",[["ev","EH V"],["er","ER"]]);
M("star","S T AA R"); M("moon","M UW N"); M("sun","S AH N"); M("dance","D AE N S");
M("music","M Y UW Z IH K"); W("music",[["mu","M Y UW"],["sic","Z IH K"]]);
M("sing","S IH NG"); M("song","S AO NG"); M("voice","V OY S"); M("angel","EY N JH AH L");
W("angel",[["an","EY N"],["gel","JH AH L"]]);
M("heaven","H EH V AH N"); W("heaven",[["heav","H EH V"],["en","AH N"]]);
M("hold","H OW L D"); M("hand","H AE N D"); M("kiss","K IH S"); M("stay","S T EY");
M("come","K AH M"); M("home","H OW M"); M("free","F R IY"); M("wild","W AY L D");
M("young","Y AH NG"); M("soul","S OW L"); M("mind","M AY N D"); M("life","L AY F");
M("live","L IH V"); M("die","D AY"); M("cry","K R AY"); M("smile","S M AY L");
M("rain","R EY N"); M("storm","S T AO R M"); M("ocean","OW SH AH N"); W("ocean",[["o","OW"],["cean","SH AH N"]]);
M("flower","F L AW R"); W("flower",[["flow","F L AW"],["er","ER"]]);
M("sakura","S AA K UW R AA"); W("sakura",[["sa","S AA"],["ku","K UW"],["ra","R AA"]]);
M("summer","S AH M ER"); W("summer",[["sum","S AH M"],["mer","ER"]]);
M("winter","W IH N T ER"); W("winter",[["win","W IH N"],["ter","T ER"]]);
M("falling","F AO L IH NG"); W("falling",[["fall","F AO L"],["ing","IH NG"]]);
M("rising","R AY Z IH NG"); W("rising",[["ris","R AY Z"],["ing","IH NG"]]);
M("burn","B ER N"); M("burning","B ER N IH NG"); W("burning",[["burn","B ER N"],["ing","IH NG"]]);
M("glow","G L OW"); M("bright","B R AY T"); M("dark","D AA R K"); M("shadow","SH AE D OW");
W("shadow",[["shad","SH AE D"],["ow","OW"]]);
M("electric","IH L EH K T R IH K"); W("electric",[["e","IH"],["lec","L EH K"],["tric","T R IH K"]]);
M("energy","EH N ER JH IY"); W("energy",[["en","EH N"],["er","ER"],["gy","JH IY"]]);
M("feel","F IY L"); M("feeling","F IY L IH NG"); W("feeling",[["feel","F IY L"],["ing","IH NG"]]);
M("touch","T AH CH"); M("near","N IH R"); M("far","F AA R"); M("here","H IH R");
M("there","DH EH R"); M("true","T R UW"); M("truth","T R UW TH"); M("lie","L AY");
M("promise","P R AA M IH S"); W("promise",[["prom","P R AA M"],["ise","IH S"]]);
M("break","B R EY K"); M("broken","B R OW K AH N"); W("broken",[["bro","B R OW"],["ken","K AH N"]]);
M("heal","H IY L"); M("pain","P EY N"); M("joy","JH OY"); M("happy","H AE P IY");
W("happy",[["hap","H AE P"],["py","P IY"]]);
M("lonely","L OW N L IY"); W("lonely",[["lone","L OW N"],["ly","L IY"]]);
M("alone","AH L OW N"); W("alone",[["a","AH"],["lone","L OW N"]]);
M("together","T AH G EH DH ER"); W("together",[["to","T AH"],["geth","G EH DH"],["er","ER"]]);
M("always","AO L W EY Z"); W("always",[["al","AO L"],["ways","W EY Z"]]);
M("maybe","M EY B IY"); W("maybe",[["may","M EY"],["be","B IY"]]);
M("make","M EY K"); M("take","T EY K"); M("give","G IH V"); M("see","S IY"); M("hear","H IH R");
M("say","S EY"); M("tell","T EH L"); M("call","K AO L"); M("name","N EY M"); M("day","D EY");
M("way","W EY"); M("play","P L EY"); M("time","T AY M"); M("eyes","AY Z"); M("eye","AY");
M("goodbye","G UH D B AY"); W("goodbye",[["good","G UH D"],["bye","B AY"]]);
M("hi","H AY");
W("holowatts",[["ho","H OW"],["lo","L OW"],["watts","W AA T S"]]);
W("holovox",[["ho","H OW"],["lo","L OW"],["vox","V AA K S"]]);
W("holo",[["ho","H OW"],["lo","L OW"]]);
M("watts","W AA T S");
W("joshua",[["josh","JH AA SH"],["u","UW"],["a","AH"]]);
M("butterfly","B AH T ER F L AY"); W("butterfly",[["but","B AH T"],["ter","T ER"],["fly","F L AY"]]);
M("could","K UH D"); M("would","W UH D"); M("should","SH UH D"); M("through","TH R UW");
M("though","DH OW"); M("thought","TH AO T"); M("people","P IY P AH L"); W("people",[["peo","P IY"],["ple","P AH L"]]);
M("little","L IH T AH L"); W("little",[["lit","L IH T"],["tle","AH L"]]);
M("twinkle","T W IH NG K AH L"); W("twinkle",[["twin","T W IH NG"],["kle","K AH L"]]);
M("wonder","W AH N D ER"); W("wonder",[["won","W AH N"],["der","D ER"]]);
M("what","W AA T");

/* ---------- rule-based fallback ---------- */
function phonemesFromLetters(word) {
  const w = word, n = w.length, out = [];
  let i = 0;
  const push = (phs, len) => { for (const p of phs) out.push({ ph: p, start: i, end: i + len }); i += len; };
  const at = (s, pos) => w.startsWith(s, pos === undefined ? i : pos);
  const vowelAt = pos => pos < n && "aeiouy".includes(w[pos]);
  function magicVowel(v) { // aCe / iCe ... pattern from position i
    if (i + 2 < n && !vowelAt(i + 1) && w[i + 1] !== "y" && w[i + 2] === "e" &&
        (i + 3 === n || !vowelAt(i + 3))) {
      const long = { a: "EY", e: "IY", i: "AY", o: "OW", u: "UW" }[v];
      push([long], 1); // step over the vowel only; final e skipped later as silent
      return true;
    }
    return false;
  }
  while (i < n) {
    const c = w[i];
    // multi-letter patterns first
    if (at("tch")) { push(["CH"], 3); continue; }
    if (at("dge")) { push(["JH"], 3); continue; }
    if (at("tion")) { push(["SH","AH","N"], 4); continue; }
    if (at("sion")) { push(["ZH","AH","N"], 4); continue; }
    if (at("cian")) { push(["SH","AH","N"], 4); continue; }
    if (at("ture")) { push(["CH","ER"], 4); continue; }
    if (at("eigh")) { push(["EY"], 4); continue; }
    if (at("aigh")) { push(["EY"], 4); continue; }
    if (at("igh")) { push(["AY"], 3); continue; }
    if (at("ough")) { push(["AO"], 4); continue; }
    if (at("augh")) { push(["AO"], 4); continue; }
    if (at("ch")) { push(["CH"], 2); continue; }
    if (at("sh")) { push(["SH"], 2); continue; }
    if (at("th")) {
      const prevV = out.length && isVowel(out[out.length - 1].ph);
      const nextV = vowelAt(i + 2);
      push([prevV || nextV ? "DH" : "TH"], 2); continue;
    }
    if (at("ph")) { push(["F"], 2); continue; }
    if (at("wh")) { push(["W"], 2); continue; }
    if (at("ng")) { push(["NG"], 2); continue; }
    if (at("ck")) { push(["K"], 2); continue; }
    if (at("qu")) { push(["K","W"], 2); continue; }
    if (at("kn") && i === 0) { push(["N"], 2); continue; }
    if (at("wr") && i === 0) { push(["R"], 2); continue; }
    if (at("ai") || at("ay")) { push(["EY"], 2); continue; }
    if (at("au") || at("aw")) { push(["AO"], 2); continue; }
    if (at("ea") || at("ee")) { push(["IY"], 2); continue; }
    if (at("ei") || at("ey")) { push(["EY"], 2); continue; }
    if (at("ie")) { push(["IY"], 2); continue; }
    if (at("oa") || at("oe")) { push(["OW"], 2); continue; }
    if (at("oi") || at("oy")) { push(["OY"], 2); continue; }
    if (at("oo")) { push(["UW"], 2); continue; }
    if (at("ou")) { push(["AW"], 2); continue; }
    if (at("ow")) { push([i + 2 === n ? "OW" : "AW"], 2); continue; }
    if (at("eu") || at("ew") || at("ue") || at("ui")) { push(["UW"], 2); continue; }
    if (at("ar")) { if (vowelAt(i + 2)) { push(["AE","R"], 2); } else push(["AA","R"], 2); continue; }
    if (at("er")) { if (vowelAt(i + 2)) push(["EH","R"], 2); else push(["ER"], 2); continue; }
    if (at("ir")) { if (vowelAt(i + 2)) push(["IH","R"], 2); else push(["ER"], 2); continue; }
    if (at("ur")) { if (vowelAt(i + 2)) push(["AH","R"], 2); else push(["ER"], 2); continue; }
    if (at("or")) { push(["AO","R"], 2); continue; }
    // single letters
    if ("aeiou".includes(c)) {
      if (magicVowel(c)) continue;
      if (c === "a") push(["AE"], 1);
      else if (c === "e") {
        const silentFinal = i === n - 1 && out.some(o => isVowel(o.ph));
        const silentEs = i === n - 2 && w[n - 1] === "s" && !vowelAt(i - 1) && out.some(o => isVowel(o.ph));
        if (silentFinal || silentEs) { i++; } else push(["EH"], 1);
      }
      else if (c === "i") push(["IH"], 1);
      else if (c === "o") push(["AA"], 1);
      else push(["AH"], 1); // u
      continue;
    }
    if (c === "y") {
      if (i === 0 || vowelAt(i - 1) === false && i + 1 < n && vowelAt(i + 1)) { push(["Y"], 1); continue; }
      if (i + 1 < n && vowelAt(i + 1)) { push(["Y"], 1); continue; }
      // y as the vowel: medial y is IH (gym, synthesizer); word-final y is AY
      // when it's the word's only vowel (my, fly), otherwise IY (happy)
      if (i < n - 1) { push(["IH"], 1); continue; }
      const sounded = out.filter(o => isVowel(o.ph)).length;
      push([sounded === 0 ? "AY" : "IY"], 1); continue;
    }
    if (c === "c") { push([i + 1 < n && "eiy".includes(w[i + 1]) ? "S" : "K"], 1); continue; }
    if (c === "g") {
      const nx = w[i + 1] || "";
      push([(nx === "e" && i + 2 === n) || (nx === "i" && vowelAt(i + 2)) || (nx === "e" && vowelAt(i + 2)) ? "JH" : "G"], 1); continue;
    }
    if (c === "x") { push(["K","S"], 1); continue; }
    if (c === "j") { push(["JH"], 1); continue; }
    if (c === "h") { if (!(i + 1 < n && "aeiou".includes(w[i+1]) === false)) push(["H"], 1); else push(["H"], 1); continue; }
    const simple = { b:"B", d:"D", f:"F", k:"K", l:"L", m:"M", n:"N", p:"P", r:"R", s:"S", t:"T", v:"V", w:"W", z:"Z" };
    if (simple[c]) { push([simple[c]], 1); continue; }
    i++; // unknown letter: skip
  }
  return out;
}

function groupSyllables(word, phons) {
  const nuclei = [];
  phons.forEach((p, idx) => { if (isVowel(p.ph)) nuclei.push(idx); });
  if (!nuclei.length) {
    return [{ disp: word, onset: phons.map(p => p.ph), vowel: "AH", coda: [], word }];
  }
  const syls = [];
  let prevEnd = 0; // phoneme index where current onset search starts
  nuclei.forEach((nIdx, k) => {
    const onsetStart = prevEnd;
    let onset = [];
    let codaPrev = [];
    const between = phons.slice(onsetStart, nIdx).map(p => p.ph);
    if (k === 0) onset = between;
    else {
      // split consonants between previous vowel and this one
      if (between.length === 0) { onset = []; }
      else if (between.length === 1) {
        if (between[0] === "NG") codaPrev = between; else onset = between;
      } else {
        let take = 1;
        const last2 = between.slice(-2).join(" ");
        if (["P R","B R","T R","D R","K R","G R","F R","P L","B L","K L","G L","F L","S T","S K","S P"].includes(last2)) take = 2;
        if (between.length >= 3 && between[between.length - 3] === "S") take = 3;
        onset = between.slice(between.length - take);
        codaPrev = between.slice(0, between.length - take);
      }
      if (codaPrev.length && syls.length) syls[syls.length - 1].coda = codaPrev;
    }
    const syl = { onset, vowel: phons[nIdx].ph, coda: [], word,
                  _vletter: word[phons[nIdx].start] || "",
                  _s: phons[onsetStart] ? phons[onsetStart].start : phons[nIdx].start,
                  _e: phons[nIdx].end };
    syls.push(syl);
    prevEnd = nIdx + 1;
  });
  const tail = phons.slice(prevEnd).map(p => p.ph);
  if (tail.length) { syls[syls.length - 1].coda = tail; syls[syls.length - 1]._e = phons[phons.length - 1].end; }
  // open-syllable O says "oh": ho-lo, pho-to, so-lo, ro-bot (coda-less AA from letter o -> OW)
  syls.forEach(s => { if (s.vowel === "AA" && s._vletter === "o" && s.coda.length === 0) s.vowel = "OW"; delete s._vletter; });
  // display fragments from letter spans
  syls.forEach((s, idx) => {
    const start = idx === 0 ? 0 : s._s;
    const end = idx === syls.length - 1 ? word.length : syls[idx + 1]._s;
    s.disp = word.slice(start, end) || s.vowel.toLowerCase();
    delete s._s; delete s._e;
  });
  return syls;
}

function wordToSyllables(raw) {
  let word = raw.toLowerCase().replace(/[^a-z']/g, "");
  if (!word) return [];
  if (word.endsWith("'s")) word = word.slice(0, -2);
  if (D[word]) {
    return D[word].map(([disp, phs]) => {
      const parts = phs.split(" ");
      const vi = parts.findIndex(isVowel);
      return { disp, onset: parts.slice(0, vi), vowel: parts[vi], coda: parts.slice(vi + 1), word };
    });
  }
  return groupSyllables(word, phonemesFromLetters(word));
}

/* ---------- romaji (for the Japanese-style demo songs) ---------- */
const ROMA_ONSET = { k:"K", s:"S", sh:"SH", t:"T", ch:"CH", ts:"TS", n:"N", m:"M", h:"H", f:"F",
                     y:"Y", r:"R", w:"W", g:"G", z:"Z", j:"JH", d:"D", b:"B", p:"P", "":"" };
const ROMA_VOWEL = { a:"AA", i:"IY", u:"UW", e:"EH", o:"AO" };
function romajiSyllable(tok) {
  const t = (tok || "").toLowerCase();
  if (t === "n" || t === "m") return { disp: t, onset: [], vowel: "UW", coda: [], nasalOnly: true, word: t };
  const m = t.match(/^(sh|ch|ts|[kstnhfmyrwgzdbpj])?([aeiou])$/);
  if (!m) return null;
  let onset = ROMA_ONSET[m[1] || ""] || "";
  const onsetArr = onset === "TS" ? ["T","S"] : onset ? [onset] : [];
  return { disp: t, onset: onsetArr, vowel: ROMA_VOWEL[m[2]], coda: [], word: t };
}
const ROMAJI_COLLIDE = new Set(["a","i","me","we","he","she","do","go","no","so","to","be","my","by","hi","ma","pa","oh"]);
function isRomajiToken(tok) { return !!romajiSyllable(tok) && !ROMAJI_COLLIDE.has(tok) && !D[tok]; }

/* ---------- full text ---------- */
function textToSyllables(text) {
  const tokens = (text || "").match(/[A-Za-z']+|[,;:()]|[.!?…]+|\n/g) || [];
  const out = [];
  let pendingPhraseEnd = null;
  for (const tok of tokens) {
    if (/^[,;:()]$/.test(tok)) { pendingPhraseEnd = ","; continue; }
    if (/^[.!?…]+$/.test(tok) || tok === "\n") { pendingPhraseEnd = "."; continue; }
    const word = tok.toLowerCase();
    let syls;
    if (isRomajiToken(word)) syls = [romajiSyllable(word)];
    else syls = wordToSyllables(word);
    syls.forEach((s, idx) => {
      out.push({ ...s,
        wordStart: idx === 0, wordEnd: idx === syls.length - 1,
        stress: idx === 0, phraseEnd: null });
    });
    if (pendingPhraseEnd && out.length) {
      out[out.length - 1].phraseEnd = pendingPhraseEnd;
      out[out.length - 1].wordEnd = true;
      pendingPhraseEnd = null;
    }
  }
  if (pendingPhraseEnd && out.length) out[out.length - 1].phraseEnd = pendingPhraseEnd;
  return out;
}

const api = { textToSyllables, wordToSyllables, romajiSyllable, isRomajiToken, isVowel };
if (typeof window !== "undefined") window.HoloG2P = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
