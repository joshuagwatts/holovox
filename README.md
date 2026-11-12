# 🎤 HoloVox — Online Singing Synthesizer

A Vocaloid-style singing voice synthesizer that runs **entirely in your browser**.
No installs, no samples, no servers — just open the page and she sings.

**▶ Live: https://joshuagwatts.github.io/holovox/**

![status](https://img.shields.io/badge/voice-formant%20synthesis-teal) ![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Web%20Audio-pink)

## What it does

- **Type anything** — write plain English in the big box and hit **✨ Sing my words**: a built-in grapheme-to-phoneme engine splits your text into syllables, generates a melody, and she sings the whole phrase. Or hit **Put words on my melody** to lay your words over a piano-roll melody you wrote. No phonetic spelling, ever.
- **Piano roll editor** — click to add notes, drag the right edge to lengthen, drag notes to move them, right-click to delete. 96 steps, C3–C5, monophonic like the real thing. Typing a whole word on a selected note splits it across new notes automatically.
- **Real singing synthesis** — every note is synthesized live with the source-filter model of the human voice:
  - sawtooth glottal source → three parallel bandpass **formant resonators** per vowel (a / i / u / e / o)
  - **full syllables, not just vowels**: formants glide from each consonant's locus through the vowel (including diphthongs like the *i* in "shine") and into the ending — fricative noise (s, sh, f, th), plosive closures + bursts (k, t, p), nasal murmurs (m, n, -ng), r/l-coloured endings
  - **vibrato** that fades in over sustained notes, **portamento** glides between legato notes, breath noise, and a singer's-formant presence boost
- **3 original voices** — AOI (bright idol), REN (soft & breathy), KAI (deep & smooth), each with its own vocal-tract scale and an animated avatar whose mouth follows the vowel.
- **Audition keyboard** — tap keys to hear a voice sing any vowel before you write it.
- **Export WAV** — the whole song renders offline to a downloadable `.wav`.
- **Demo songs** — an original track (*Hoshi no Uta*), *Twinkle Twinkle Little Star*, and *Sakura Dream* to pull apart.

## Controls

| Control | What it does |
|---|---|
| Tempo | 60–180 BPM (steps are eighth notes) |
| Vibrato | Depth of the pitch wobble on held notes |
| Breath | Amount of air noise in the voice |
| Brightness | Shifts all formants — smaller/brighter ↔ bigger/darker vocal tract |
| Smooth | Portamento time between connected notes |
| Hall reverb | Generated impulse-response reverb |

Play/pause with the SING button or the **spacebar**. Delete the selected note with **Delete**.

## How it works

Human vowels are just a buzz (vocal folds) filtered by the shape of the mouth.
Each vowel has characteristic resonant peaks — *formants* (F1/F2/F3). HoloVox
recreates that with Web Audio: one sawtooth oscillator per note runs into three
bandpass filters tuned to the vowel's formants, scaled by the character's
vocal-tract size. Consonants are layered on top as shaped noise bursts or
low nasal hums timed to the start of each syllable, exactly where a real
singer puts them. Everything — including the WAV export, which re-renders the
song in an `OfflineAudioContext` — happens locally in the page.

## Run locally

```bash
git clone https://github.com/joshuagwatts/holovox
cd holovox
python3 -m http.server 8000   # then open http://localhost:8000
```

Or just open `index.html` — it's three static files, no build step.

## Roadmap ideas

- Longer songs / scrollable multi-page sequences
- Pitch-bend & dynamics lanes (draw vibrato and volume per note)
- More voices + a voice editor (design your own formant set)
- .ust / .vsqx import

---

An original homage to singing synthesizers like Vocaloid. Not affiliated with Yamaha or Crypton Future Media.
Built by [Holowatts](https://github.com/joshuagwatts).
