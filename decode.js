/* 单词解密 · 核心算法（浏览器与 Node 通用）
   依赖 window.LEXICON 或全局 LEXICON */
(function (root) {
  'use strict';

  var DB = (typeof window !== 'undefined' && window.LEXICON) ? window.LEXICON
         : (typeof global !== 'undefined' && global.LEXICON) ? global.LEXICON : null;

  var AFFIX_ROOTS = {};

  function parseAnalysis(s) {
    var out = { prefix: null, roots: [], suffixes: [] };
    if (!s) return out;
    var t = String(s).replace(/＝/g, '=').replace(/（/g, '(').replace(/）/g, ')');
    var parts = t.split(/[;；]/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var mean = '', head = p;
      var eq = p.indexOf('=');
      if (eq >= 0) { head = p.slice(0, eq).trim(); mean = p.slice(eq + 1).replace(/→.*$/, '').trim(); }
      head = head.trim();
      if (!head) continue;
      var m = head.match(/^([a-z]{1,12})-\s*$/);
      if (m) { out.prefix = { form: m[1] + '-', mean: mean.slice(0, 40) }; continue; }
      m = head.match(/^-([a-z\-]{1,12})\s*(n|v|a|ad|adv|adj|prep|conj|pron|num|int|vt|vi|art|aux)\.?/);
      if (m) {
        var pm = head.match(/(n|v|a|ad|adv|adj|prep|conj|pron|num|int|vt|vi|art|aux)\./);
        out.suffixes.push({ form: '-' + m[1], pos: pm ? pm[1] : '', mean: mean.slice(0, 40) });
        continue;
      }
      m = head.match(/^([a-z]+)/);
      if (m && m[1].length >= 2) {
        out.roots.push({ form: m[1], mean: mean.slice(0, 60) });
        if (mean && !AFFIX_ROOTS[m[1]]) AFFIX_ROOTS[m[1]] = mean;
      }
    }
    return out;
  }

  function buildAffixRoots() {
    if (!DB) return;
    for (var w in DB.words) {
      var v = DB.words[w];
      if (v && v.analysis) parseAnalysis(v.analysis);
    }
  }

  function variants(stem) {
    var out = [stem, stem + 'e'];
    if (stem.slice(-1) === 'i') out.push(stem.slice(0, -1) + 'y');
    if (stem.length >= 2 && stem.slice(-1) === stem.slice(-2, -1)) out.push(stem.slice(0, -1));
    ['at', 'it', 'ut'].forEach(function (t) { if (stem.slice(-2) === t) out.push(stem + 'e'); });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function known(stem) {
    var v = variants(stem);
    for (var i = 0; i < v.length; i++) {
      if (DB.words[v[i]]) return v[i];
      for (var k in DB.syllabi) if (DB.syllabi[k].indexOf(v[i]) >= 0) return v[i];
    }
    return null;
  }

  var _suf = null;
  function SUF() {
    if (!_suf) _suf = DB.affixes.suffixes.slice().sort(function (a, b) { return b.form.length - a.form.length; });
    return _suf;
  }
  var _pre = null;
  function PRE() {
    if (!_pre) _pre = DB.affixes.prefixes.slice().sort(function (a, b) { return b.form.length - a.form.length; });
    return _pre;
  }

  function peel(word) {
    var S = SUF();
    for (var i = 0; i < S.length; i++) {
      var f = S[i].form.replace(/^-/, '');
      if (word.length - f.length >= 3 && word.slice(-f.length) === f)
        return [{ form: S[i].form, pos: S[i].pos, mean: S[i].mean }, word.slice(0, -f.length)];
    }
    return [null, null];
  }

  function chain(word, maxDepth) {
    maxDepth = maxDepth || 3;
    var out = [], cur = word.toLowerCase(), seen = {};
    for (var d = 0; d < maxDepth; d++) {
      if (seen[cur] || cur.length < 4) break;
      seen[cur] = 1;
      var r = peel(cur), suf = r[0], stem = r[1];
      if (!suf) break;
      // 词干太短（<5）→ 剥过头了：比如 create 被剥成 cre + -ate
      // 判别依据：create 是法语来源的基本词，本身就是词根，-ate 不属于后缀
      if (stem.length < 5) {
        // 剥过头了（create → cre）：这个词本身即词根，不记录这个后缀
        out.push({ word: cur, suffix: null, stem: null, prev: null,
                   isRootHere: true, isRootStem: true, selfRoot: true });
        break;
      }
      // 词干本身已命中词根表 → 这就是词根，不再往下剥
      var isRootHere = false;
      for (var ri = 0; ri < variants(stem).length; ri++) {
        if (DB.roots[variants(stem)[ri]]) { isRootHere = true; break; }
      }
      var prev = null;
      var vs = variants(stem);
      for (var i = 0; i < vs.length; i++) {
        var k = known(vs[i]);
        if (k && k !== cur) { prev = k; break; }
      }
      out.push({ word: cur, suffix: suf, stem: stem, prev: prev });
      if (isRootHere) {
        out.push({ word: stem, suffix: null, stem: null, prev: null, isRootStem: true });
        break;
      }
      if (prev) {
        // prev 是词根（如 create 对应 creat）→ 停在 prev 上
        var prevIsRoot = false;
        for (var pi = 0; pi < variants(prev).length; pi++) {
          if (DB.roots[variants(prev)[pi]]) { prevIsRoot = true; break; }
        }
        cur = prev;
        if (prevIsRoot) break;
      } else {
        out.push({ word: stem, suffix: null, stem: null, prev: null, isRootStem: true });
        break;
      }
    }
    return out;
  }

  function rootMeaning(stem) {
    var vs = variants(stem);
    for (var i = 0; i < vs.length; i++) {
      var c = vs[i];
      if (DB.roots[c]) return { form: DB.roots[c].forms.join('/'), mean: DB.roots[c].mean || '', src: DB.roots[c].src || '', found: !!DB.roots[c].mean };
      if (AFFIX_ROOTS[c]) return { form: c, mean: AFFIX_ROOTS[c], src: '', found: true };
    }
    // 前缀式匹配：要求词根几乎等于词干（只允许差 1 个字母），避免把 tant 当成 accountant 的词根
    var keys = Object.keys(DB.roots).concat(Object.keys(AFFIX_ROOTS));
    keys.sort(function (a, b) { return b.length - a.length; });
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (k.length < 4) continue;
      if (k.length >= Math.max(4, Math.ceil(stem.length * 0.5)) &&
          (stem.indexOf(k) === 0 || stem.slice(-k.length) === k)) {
        if (DB.roots[k]) return { form: DB.roots[k].forms.join('/'), mean: DB.roots[k].mean || '', src: DB.roots[k].src || '', found: !!DB.roots[k].mean };
        return { form: k, mean: AFFIX_ROOTS[k], src: '', found: true };
      }
    }
    // 找不到已知词根 → 词干本身作为词根（如 accountant 的 account）
    var _sw = DB.words[stem];
    return { form: stem, mean: (_sw && _sw.gloss_cn) || '', src: '', found: !!(_sw && _sw.gloss_cn) };
  }

  function isBasicWord(w) {
    return !DB.words[w] && !chain(w).length;
  }

  function decode(word) {
    var w = String(word || '').toLowerCase().trim();
    var res = { word: w, syllabus: [], textbookSplit: null, prefix: null, root: null,
                suffixes: [], chain: [], relatives: [], lexiconEntry: null, note: '' };
    if (!w) return res;

    for (var k in DB.syllabi) if (DB.syllabi[k].indexOf(w) >= 0) res.syllabus.push(k);
    if (DB.splits[w]) res.textbookSplit = DB.splits[w];

    var e = DB.words[w];
    if (e && e.pos) res.wordPos = e.pos;
    if (e) {
      res.lexiconEntry = { analysis: e.analysis || '', gloss: e.gloss || '',
                           glossCn: e.gloss_cn || '', pos: e.pos || '' };
      var p = parseAnalysis(e.analysis);
      res.prefix = p.prefix;
      res.suffixes = p.suffixes.slice();
      if (p.roots.length) res.root = { form: p.roots[0].form, mean: p.roots[0].mean, src: '', found: !!p.roots[0].mean };
    }

    if (!res.prefix) {
      var P = PRE();
      for (var i = 0; i < P.length; i++) {
        var f = P[i].form.replace(/-$/, '');
        if (w.length - f.length >= 3 && w.indexOf(f) === 0) { res.prefix = { form: P[i].form, mean: P[i].mean }; break; }
      }
    }

    var ch = chain(w);
    res.chain = ch;
    if (!res.suffixes.length) {
      // chain 的 suffix 是剥离顺序（从外到内），显示要按构词顺序（从内到外）→ 反转
      res.suffixes = ch.filter(function (c) { return c.suffix; })
                      .map(function (c) { return c.suffix; }).reverse();
    }

    // 自身即词根的情形：create / relate / donate —— 法语来源的基本动词，无后缀可剥
    var selfRoot = false;
    var _bottomWord = ch.length ? ch[ch.length - 1].word : '';
    var _selfFromChain = (ch.length === 1 && ch[0].selfRoot) ||
                         (_bottomWord === w && ch.some(function (c) { return c.isRootStem; }));
    if (!res.root && !res.prefix && ch.length <= 1 &&
        (_selfFromChain || /^[a-z]{4,}(ate|ute|ite|ify|ize|ise)$/.test(w))) {
      selfRoot = true;
      res.root = { form: w, mean: '', src: '', found: false, self: true };
    }
    if (!res.root || !res.root.mean) {
      var base = ch.length ? ch[ch.length - 1].word : w;
      var rm = rootMeaning(base);
      if (rm.found || !res.root) res.root = rm;
    }
    if (selfRoot && res.root && !res.root.mean) {
      var _se = DB.words[w];
      if (_se && _se.gloss_cn) { res.root.mean = _se.gloss_cn; res.root.meanFrom = w; }
    }
    // 词根含义兜底：书里部分词根只给语源未给中文，改用链底端词的中文释义反推
    if (res.root && res.root.form && !res.root.mean) {
      var _bases = [];
      if (ch.length) _bases.push(ch[ch.length - 1].word);
      if (ch.length > 1) _bases.push(ch[ch.length - 2].word);
      _bases.push(w);
      for (var _bi = 0; _bi < _bases.length; _bi++) {
        var _be = DB.words[_bases[_bi]];
        if (_be && _be.gloss_cn) { res.root.mean = _be.gloss_cn; res.root.meanFrom = _bases[_bi]; break; }
      }
    }

    // 近亲 = 派生链上的词
    var fam = [];
    ch.forEach(function (c) {
      if (c.word !== w && known(c.word) && fam.indexOf(c.word) < 0) fam.push(c.word);
    });

    var rel = fam.sort(function (a, b) {
      return (Math.abs(a.length - w.length) - Math.abs(b.length - w.length)) || (a < b ? -1 : 1);
    }).slice(0, 8).map(function (f) {
      var ve = DB.words[f] || {};
      return { word: f, analysis: ve.analysis || '', gloss: ve.gloss || '' };
    });
    res.relatives = rel;

    if (!res.root || !res.root.form) res.note = '英语本族基础词，无拉丁/希腊词根可拆';
    else if (!res.root.mean && !res.root.found) res.note = '词库未收录该词根的含义';

    // 基础词判定：词根无效 + 后缀无效 → 英语本族基础词
    // （apple 这类词被柯林斯补了 n. 词性，但不能因此就把 ap- + ple 当真）
    var rootOk = res.root && res.root.found && res.root.mean;
    var sufOk = res.suffixes && res.suffixes.length > 0;
    if (!rootOk && !sufOk) {
      res.basic = true;
      res.prefix = null;
      res.root = null;
      res.suffixes = [];
      res.relatives = [];
      res.note = '英语本族基础词，无拉丁/希腊词根可拆';
    }
    return res;
  }

  var API = { decode: decode, parseAnalysis: parseAnalysis, chain: chain,
              variants: variants, known: known, rootMeaning: rootMeaning,
              init: buildAffixRoots, db: function () { return DB; } };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WordDecode = API;
})(typeof window !== 'undefined' ? window : global);
