# WordDecoder

**Type an English word — see how it was built.**

Roots · prefixes · suffixes · related forms. A word-morphology tool for learners.

`v0.1` · Installable PWA · Works offline · MIT License

**▶ [Open the app](https://richardozhao.github.io/WordDecoder/)** · [中文说明 README](README.zh-CN.md)

---

## The problem

Every learner hits the same wall:

```
memorise a word → remember it → forget it → memorise it again → forget it again

meet a new word → look it up → know the meaning → still can't read it next time
```

**A dictionary tells you *what* a word means. It never tells you *why* it is spelled that way.**

A student who knows `creativity` = `create + -ive + -ity` can **guess** the meaning of
`productivity`, `sensibility`, `connectivity` — not because they memorised those words,
but because they learned **a method of taking words apart**.

WordDecoder makes that method as explicit as possible.

---

## What it looks like

```
Input: creativity

─────────────────────────────────────────────
Morphology (left to right)
  create  +  -ive (adj.)  +  -ity (n.)

[root]  create       to create
[suffix] -ive  adj.  having the nature of
         -ity  n.    state, quality

[Related forms] neighbours on the same derivational chain
   creative      creat(e); -ive adj.
   create

Derivational chain: create → creative → creativity
─────────────────────────────────────────────
```

**Why aren't `creation` / `creature` / `creator` listed under "Related forms"?**

Because they grow in a **different direction**. `creativity` grows along
`create → creative → creativity`; `creation` is `create + -ion` — a different branch.

Words on the same chain are **close relatives** (learning one helps you infer the others).
Words with a different suffix direction are **distant relatives** (each must be learned separately).
The tool lists close relatives only.

---

## More examples

```
absorb       →  ab- (away)  +  sorb (to suck in)
                vt. to take in…

depend       →  de- (down)  +  pend (to hang)
                vi. to rely on

apple        →  no root — a native English word, nothing to decompose

internationalization
             →  inter- + nation + -al (adj.) + -ization (n.)
```

---

## Three ways to use it

### ① Install as a phone app (recommended)

Open **https://richardozhao.github.io/WordDecoder/** in a browser, then:

```
iOS      : Safari → Share → Add to Home Screen
Android  : Chrome → menu → Install app
```

It becomes a standalone icon and **works offline** (the lexicon is cached locally).

### ② Use it on a desktop

Same URL — it opens in any browser.

### ③ Run it locally

```bash
git clone https://github.com/RichardoZhao/WordDecoder.git
cd WordDecoder
python3 -m http.server 8899
# open http://127.0.0.1:8899/
```

Pure static files. No backend, no database, no network calls.

---

## Part-of-speech tags

Abbreviations follow a fixed teaching convention:

| Tag | Meaning |
|---|---|
| `n.` | noun |
| `adj.` | adjective |
| `adv.` | adverb |
| `vt.` | transitive verb (**a trailing `…` marks that an object is expected**) |
| `vi.` | intransitive verb |
| `lv.` | linking verb |
| `aux.` | auxiliary / modal |
| `prep.` `conj.` `pron.` `num.` | preposition / conjunction / pronoun / numeral |

Example of the `…` convention:

```
create   vt.  to create…
absorb   vt.  to take in…
depend   vi.  to rely on      ← intransitive: no ellipsis
```

---

## Data sources

| Source | Used for |
|---|---|
| Li Pingwu, 《英语词根与单词的说文解字》 / 《英语词缀与英语派生词》 (FLTRP, 2018) | root list (355), morphology strings (3,672), textbook splits (561) |
| PEP High-School English vocabulary lists (6 books) | high-school word list (1,401 words) |
| Collins English-Chinese Dictionary (MDict) | POS, transitivity, Chinese glosses (4,002 words matched) |
| ECDICT (open-source word list) | fallback reference |

---

## Coverage — an honest number

```
High-school list: 1,401 words → 555 analysable (39.6%)
Primary / middle school: currently a generic list; coverage to be improved
```

**Why not 100%?**

Li Pingwu's system describes **Latin/Greek-derived words** (`agility = agil + -ity`).
A large part of English consists of **native Germanic words** (`apple`, `water`, `about`)
that simply **have no root or affix to split** — that is a fact of the language, not a defect
of the tool.

For those words the tool says so plainly: *"a native English base word — no Latin/Greek root to decompose."*

**That is more honest than inventing a root.**

---

## Known limitations (v0.1)

1. **Sound shifts are not traced back.** `absorb + -tion → absorption` (b→p). The tool stops at
   `absorp` and does not restore `absorb` automatically. English morphology has many such shifts;
   not all are implemented yet.
2. **Primary/middle-school word list** is generic, not an official textbook edition.
3. **Some roots lack a gloss.** Where the source gives only etymology, the tool falls back to the
   meaning of the chain's base word.
4. **No grammar teaching.** `-ed` / `-ing` / `-s` are marked as suffixes only; tense and voice are out of scope.

---

## Technical notes

```
index.html        UI (mobile-first)
decode.js         core algorithm (derivational chain; browser + Node)
pos_norm.js       POS normalisation + left-to-right formatting
data/lexicon.js   lexicon (~1.1 MB, ~150 KB gzipped)
manifest.json     PWA manifest
sw.js             service worker (offline cache)
icons/            app icons
```

**Algorithm**: starting from the target word, peel suffixes one layer at a time; at each layer,
try to validate a restored variant of the stem against the lexicon (`creativ` → `creative`);
recurse until a root is reached. That chain *is* the derivational chain, and its members are close relatives.

---

## Deploy to your own server

The whole directory is the whole app — pure static files:

```bash
# any static server will do
cp -r WordDecoder /var/www/html/
# or
python3 -m http.server 80
```

There is no build step in this README because **there is no build step**.

---

## Data & Privacy

This tool does not collect, store or transmit any user data. It is a pure client-side app:
queries never leave the browser.

## Sources & License

- **Code**: MIT — see [LICENSE](./LICENSE).
- **Data**: root list and morphology strings derive from Li Pingwu's books (analysis only, no verbatim text);
  glosses come from the Collins dictionary; the word list follows the PEP textbook vocabulary.
- **Third-party content**: copyright remains with the respective authors and publishers.
  This repository does not reproduce their text — it only makes the analytical structure queryable.
  Commercial reuse of the underlying data requires clearance from the rights holders.

## Disclaimer

- Morphological analysis is generated by an algorithm; treat it as a study aid, not an authority.
- The tool does **not** replace a teacher's or a lexicographer's judgement.
- Some analyses may be incomplete in v0.1 (see *Known limitations*) — issues and corrections are welcome.

## Feedback

Found a wrong analysis? [Open an issue](https://github.com/RichardoZhao/WordDecoder/issues) —
**for a teaching tool, accuracy matters more than features.**
