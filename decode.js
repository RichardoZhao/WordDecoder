/* 单词解密 · 核心算法（浏览器与 Node 通用）
   —— 与 2_项目代码/decode_v4.py 逐行对齐，两版输出必须一致。
   判据来源（铁律）：
     ① 词根表 → 《英语词根与单词的说文解字》索引（异形根已合并）
     ② 前缀表/后缀表 → 《英语词缀与英语派生词》索引 + 章节条目
     ③ 词形分析串 → 两书正文词条（【原书】直接引用）
     ④ 推演 → 只用①②里的部件，每层都要书内可验（【推演】）
   依赖 window.LEXICON / global.LEXICON，或调用 WordDecode.load(db)。 */
(function (root) {
  'use strict';

  var DB = null;
  var ROOT_FORMS = null, SUF_LIST = null, PRE_LIST = null, PRE_ALT = null;
  var SYL_SCORE = null;      // 词形 → 教材/词表权重（同分时取更常见的那个还原形）

  function got() {
    if (!DB) {
      var g = (typeof window !== 'undefined' && window.LEXICON) ? window.LEXICON
            : (typeof global !== 'undefined' && global.LEXICON) ? global.LEXICON : null;
      if (g) load(g);
    }
    return DB;
  }

  function load(dbObj) {
    DB = dbObj;
    SYL_SCORE = {};
    var _W = { '小学': 8, '中考': 4, '高中': 2, '高中教材': 2, 'COCA20000': 1 };
    Object.keys(DB.syllabi || {}).forEach(function (k) {
      var w = _W[k] || 1;
      (DB.syllabi[k] || []).forEach(function (x) { SYL_SCORE[x] = (SYL_SCORE[x] || 0) + w; });
    });
    ROOT_FORMS = {};
    var rk = Object.keys(DB.roots || {});
    for (var i = 0; i < rk.length; i++) {
      var r = DB.roots[rk[i]], fs = r.forms || [];
      for (var j = 0; j < fs.length; j++) if (!(fs[j] in ROOT_FORMS)) ROOT_FORMS[fs[j]] = rk[i];
    }
    SUF_LIST = (DB.affixes.suffixes || []).slice().sort(function (a, b) {
      return (b.form.length - a.form.length) || (a.form < b.form ? -1 : 1);
    });
    PRE_LIST = (DB.affixes.prefixes || []).slice().sort(function (a, b) {
      return (b.form.length - a.form.length) || (a.form < b.form ? -1 : 1);
    });
    PRE_ALT = {};
    for (var k = 0; k < PRE_LIST.length; k++) {
      var alts = PRE_LIST[k].alts || [];
      for (var m = 0; m < alts.length; m++) if (!(alts[m] in PRE_ALT)) PRE_ALT[alts[m]] = PRE_LIST[k].form;
    }
    return DB;
  }

  // ---------------- 词性规范化 ----------------
  var POS_MAP = { a: 'adj.', adj: 'adj.', ad: 'adv.', adv: 'adv.', n: 'n.', v: 'v.',
    vt: 'vt.', vi: 'vi.', lv: 'lv.', aux: 'aux.', prep: 'prep.', conj: 'conj.',
    pron: 'pron.', num: 'num.', int: 'int.', art: 'art.' };

  function normPos(p) {
    if (!p) return '';
    var out = [];
    String(p).replace(/\//g, ' ').split(/\s+/).forEach(function (x) {
      var k = x.trim().replace(/\.$/, '').toLowerCase();
      if (!k) return;
      var v = POS_MAP[k] || (k + '.');
      if (out.indexOf(v) < 0) out.push(v);
    });
    return out.join('/');
  }

  function markTransitive(mean, pos) {
    if (!mean || String(pos).indexOf('vt') < 0) return mean || '';
    var m = String(mean).trim();
    if (/[…\.]+$/.test(m)) return m;
    return m.replace(/[。；;，,、]+$/, '') + '…';
  }

  // ---------------- 还原规则（只允许三种，且必须书内可验） ----------------
  function variants(stem) {
    var out = [stem];
    if (stem.slice(-1) === 'i') out.push(stem.slice(0, -1) + 'y');
    else out.push(stem + 'e');
    if (stem.length >= 2 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2))
      out.push(stem.slice(0, -1));
    var seen = {}, res = [];
    out.forEach(function (x) { if (!(x in seen)) { seen[x] = 1; res.push(x); } });
    return res;
  }

  function known(form, strict) {
    var db = got();
    var vs = strict ? [form] : variants(form);
    for (var i = 0; i < vs.length; i++) if (db.words[vs[i]]) return vs[i];
    var keys = Object.keys(db.syllabi || {});
    var ws = strict ? [form] : variants(form);
    for (var k = 0; k < keys.length; k++) {
      var lst = db.syllabi[keys[k]] || [];
      for (var j = 0; j < ws.length; j++) if (lst.indexOf(ws[j]) >= 0) return ws[j];
    }
    return null;
  }

  function rootOf(form) {
    var vs = variants(form);
    for (var i = 0; i < vs.length; i++) if (vs[i] in ROOT_FORMS) return ROOT_FORMS[vs[i]];
    return null;
  }

  // ---------------- 分析串解析（从左至右） ----------------
  function parseAnalysis(s) {
    var parts = [];
    if (!s) return parts;
    var t = String(s).replace(/＝/g, '=').replace(/（/g, '(').replace(/）/g, ')');
    t.split(/[;；]/).forEach(function (raw) {
      var seg = raw.trim();
      if (!seg) return;
      var head = seg, mean = '';
      if (seg.indexOf('=') >= 0) {
        var ix = seg.indexOf('=');
        head = seg.slice(0, ix);
        mean = seg.slice(ix + 1).replace(/→.*$/, '').trim().replace(/[“"][\s\S]*$/, '').trim();
      }
      head = head.trim();
      if (!head) return;
      head = head.replace(/[→⇒][\s\S]*$/, '').replace(/[\u4e00-\u9fff][\s\S]*$/, '').trim();
      if (!head) return;
      var mp = head.match(/([a-z]{1,4})\.\s*$/);
      var pos = mp ? normPos(mp[1]) : '';
      var core = head.replace(/\s*[a-z]{1,4}\.\s*$/, '').trim();
      var compact = core.replace(/\s+/g, '');
      if (/^[a-z]{1,14}-$/.test(compact)) {
        parts.push({ kind: 'prefix', form: compact, mean: mean.slice(0, 60), pos: '' });
        return;
      }
      var m = compact.match(/^-([a-z\-]{1,14})$/);
      if (m) {
        parts.push({ kind: 'suffix', form: '-' + m[1], mean: mean.slice(0, 60), pos: pos });
        return;
      }
      m = compact.match(/^([a-z]+)/);
      if (m && m[1].length >= 2) {
        parts.push({ kind: 'base', form: m[1], mean: mean.slice(0, 60), pos: pos });
      }
    });
    return parts;
  }

  function suffixInfo(form) {
    var db = got(), key = String(form).toLowerCase();
    for (var i = 0; i < SUF_LIST.length; i++) {
      if (SUF_LIST[i].form === key)
        return { form: key, pos: SUF_LIST[i].pos || '', mean: SUF_LIST[i].mean || '' };
    }
    var f = key.replace(/^-/, ''), best = null;
    for (var j = 0; j < SUF_LIST.length; j++) {
      var sf = SUF_LIST[j].form.replace(/^-/, '');
      if (sf && (f === sf || f.indexOf(sf) === 0 || sf.indexOf(f) === 0)) {
        if (!best || sf.length > best.form.replace(/^-/, '').length) best = SUF_LIST[j];
      }
    }
    if (best) return { form: key, pos: best.pos || '', mean: best.mean || '' };
    return { form: key, pos: '', mean: '' };
  }

  function prefixInfo(form) {
    var key = String(form).toLowerCase();
    for (var i = 0; i < PRE_LIST.length; i++) {
      var p = PRE_LIST[i];
      if (p.form === key || (key.replace(/^-/, '') + '-') === p.form)
        return { form: p.form, mean: p.mean || '', alts: p.alts || [] };
    }
    var bare = key.replace(/-$/, '');
    if (bare in PRE_ALT) {
      var main = PRE_ALT[bare];
      for (var j = 0; j < PRE_LIST.length; j++) {
        if (PRE_LIST[j].form === main)
          return { form: PRE_LIST[j].form, mean: PRE_LIST[j].mean || '',
                   alts: PRE_LIST[j].alts || [], via: bare };
      }
    }
    return { form: key, mean: '', alts: [] };
  }

  // ---------------- 词根含义 ----------------
  function rootInfo(form) {
    var k = rootOf(form);
    if (!k) return null;
    var r = got().roots[k], actual = form, vs = variants(form);
    for (var i = 0; i < vs.length; i++) if ((r.forms || []).indexOf(vs[i]) >= 0) { actual = vs[i]; break; }
    var others = (r.forms || []).filter(function (f) { return f !== actual; });
    return { form: actual, key: k, alts: others, mean: r.mean || '', src: r.src || '', found: true };
  }

  // ---------------- 后缀层剥离（推演用） ----------------
  function suffixCandidates(stem) {
    var low = stem.toLowerCase(), out = [];
    for (var i = 0; i < SUF_LIST.length; i++) {
      var f = SUF_LIST[i].form.replace(/^-/, '');
      if (!f || f === 'e') continue;
      if (f.length > low.length - 3) continue;      // 每剥一层，至少给词干留 3 个字母
      if (low.slice(-f.length) === f) out.push([SUF_LIST[i], f]);
    }
    return out;
  }

  function cmp(a, b) {                              // 分数是数组，越大越好
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
  }

  /* 递归找后缀层。返回 [score, layers, terminal] 或 null
     layers：外→内 [[后缀对象, 还原后的词干]]；terminal：['word', f] | ['root', f]
     打分四元组 [tier, -短后缀数, 后缀总长, -层数]：
       tier —— 书内词条 3 ＞ 词根 2 ＞ 普通词（词表里有、书里没分析串）1 */
  function cleanStep(sub, pfx) {     // 这一层剥得干不干净
    var vs = variants(sub);
    for (var i = 0; i < vs.length; i++)
      for (var k = 0, xs = [vs[i], pfx + vs[i]]; k < 2; k++)
        if (xs[k] && (rootOf(xs[k]) || known(xs[k]))) return true;
    return false;
  }

  function solve(stem, orig, depth, pfx) {
    depth = depth || 0;
    pfx = pfx || '';
    var db = got(), best = null;

    function keep(tier, extraLen, nlayers, layers, term) {
      var sc = [tier, 0, extraLen, -nlayers, 0];
      if (!best || cmp(sc, best[0]) > 0) best = [sc, layers, term];
    }

    if (rootOf(stem)) keep(2, 0, 0, [], ['root', stem]);
    var kw = known(stem, true);
    if (kw && kw !== orig && !rootOf(kw)) {
      var e = db.words[kw] || {};
      if (e.analysis) keep(3, 0, 0, [], ['word', kw]);
      else if (kw.length >= 4 && (e.gloss_cn || e.gloss || !Object.keys(e).length))
        keep((SYL_SCORE[kw] || 0) >= 2 ? 1 : 0.5, 0, 0, [], ['word', kw]);
    }
    if (depth >= 3) return best;

    var cands = suffixCandidates(stem);
    for (var i = 0; i < cands.length; i++) {
      var s = cands[i][0], f = cands[i][1];
      var sub = stem.slice(0, stem.length - f.length);
      if (sub.length < 3) continue;
      if (!cleanStep(sub, pfx)) continue;   // 剥完不像词形（carel）→ 这一层不成立
      if (f.length < 2 && sub.length >= 2 && sub.slice(-1) === sub.slice(-2, -1)) continue;
      var vs = (known(sub) === sub || rootOf(sub)) ? [sub] : variants(sub);  // 原形在册不试还原
      if (vs.length > 2 && f && f.length < 2) vs = vs.slice(0, 2);
      for (var j = 0; j < vs.length; j++) {
        var v = vs[j];
        if (v.length < 3) continue;
        var sol = solve(v, orig, depth + 1, pfx);
        if (!sol) continue;
        if (sol[2][0] === 'word' && sol[2][1] === orig) continue;
        var sc = [sol[0][0], sol[0][1] - (f.length < 3 ? 1 : 0),
                  sol[0][2] + f.length, sol[0][3] - 1, SYL_SCORE[v] || 0];
        if (!best || cmp(sc, best[0]) > 0) best = [sc, [[s, v]].concat(sol[1]), sol[2]];
      }
    }
    return best;
  }

  /* 词基展开规则：书里收录、且本身带前缀（已是 前缀+词根 结构）的词基继续展开；
     否则停在词基本身 —— 书里另有一条它的分析串。 */
  function expandBase(bw, depth) {
    depth = depth || 0;
    if (!bw) return [null, null];
    var db = got(), be = db.words[bw];
    if (be && be.analysis && depth < 2) {
      var toks = parseAnalysis(be.analysis);
      var hasPre = toks.some(function (t) { return t.kind === 'prefix'; });
      if (hasPre) {
        var r = fromBook(bw, be.analysis, depth + 1), parts = r[0], chain = r[1];
        while (parts.length && parts[parts.length - 1].kind === 'suffix' &&
               parts[parts.length - 1].form === '-e') parts = parts.slice(0, -1);
        if (parts.length) return [parts, chain];
      }
    }
    return [null, null];
  }

  function matchPrefix(form) {
    var low = form.toLowerCase(), i;
    for (i = 0; i < PRE_LIST.length; i++) {
      var f = PRE_LIST[i].form.replace(/-$/, '');
      if (!f || low.length - f.length < 3) continue;
      if (low.indexOf(f) === 0)
        return { form: PRE_LIST[i].form, mean: PRE_LIST[i].mean || '', via: f };
    }
    var alts = Object.keys(PRE_ALT).sort(function (a, b) { return b.length - a.length; });
    for (i = 0; i < alts.length; i++) {
      var ff = alts[i].replace(/-$/, '');
      if (ff && low.length - ff.length >= 3 && low.indexOf(ff) === 0) {
        var main = PRE_ALT[alts[i]];
        for (var k = 0; k < PRE_LIST.length; k++)
          if (PRE_LIST[k].form === main)
            return { form: PRE_LIST[k].form, mean: PRE_LIST[k].mean || '', via: ff };
      }
    }
    return null;
  }

  // ---------------- 【原书】路径 ----------------
  function fromBook(w, analysis, depth) {
    depth = depth || 0;
    var db = got(), parts = [], chain = [{ word: w }];
    if (depth > 2) return [parts, chain];
    var toks = parseAnalysis(analysis);
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.kind === 'prefix') {
        var pi = prefixInfo(t.form);
        parts.push({ kind: 'prefix', form: pi.form, mean: t.mean || pi.mean, pos: '' });
      } else if (t.kind === 'suffix') {
        if (t.form === '-e' && !String(t.mean || '').trim()) continue;   // -e 是构词连接成分
        var si = suffixInfo(t.form);
        parts.push({ kind: 'suffix', form: si.form, mean: t.mean || si.mean, pos: t.pos || si.pos });
      } else {
        var base = t.form, ri = rootInfo(base);
        if (ri) {
          parts.push({ kind: 'root', form: ri.form, mean: ri.mean, src: ri.src, alts: ri.alts || [] });
          continue;
        }
        var bw = known(base);
        var eb = bw ? expandBase(bw, depth) : [null, null];   // 只展开"本身带前缀"的词基
        if (eb[0]) { parts = parts.concat(eb[0]); chain = chain.concat(eb[1]); continue; }
        var ee = db.words[bw || base] || {};
        if (bw && base.length >= 2 && base.slice(-1) === base.slice(-2, -1) && bw === base.slice(0, -1))
          bw = base;               // 书里写的是 happ
        parts.push({ kind: 'base', form: bw || base,
          mean: t.mean || ee.gloss_cn || ee.gloss || '', src: '', book: !!ee.analysis });
        if (bw) chain.push({ word: bw });
      }
    }
    return [parts, chain];
  }

  // ---------------- 【推演】路径 ----------------
  function infer(w) {
    var chain = [{ word: w }];
    var pre = matchPrefix(w), rest = pre ? w.slice(pre.via.length) : w;
    var sol = solve(rest, w, 0, pre ? pre.via : '');
    if (sol && (!sol[1] || !sol[1].length)) sol = null;   // 一层后缀都没剥出来 → 走护栏
    if (!sol && pre) {
      var kw = known(rest);
      if (kw && !rootOf(kw)) sol = [[0, 0, 0, 0], [], ['word', kw]];
      else if (rootOf(rest) && pre.form.replace(/-$/, '') === pre.via && w.length >= 6)
        sol = [[0, 0, 0, 0], [], ['root', rest]];
    }
    if (!sol && pre) {                    // 前缀抢错了 → 整个词重新试
      pre = null; rest = w;
      sol = solve(rest, w, 0, '');
      if (sol && (!sol[1] || !sol[1].length)) sol = null;
    }
    if (!sol) return [[], []];
    var parts = [];
    if (pre) parts.push({ kind: 'prefix', form: pre.form, mean: pre.mean, pos: '' });

    var layers = sol[1], term = sol[2], baseParts = [], baseNative = false;
    if (term[0] === 'root') {
      var ri = rootInfo(term[1]);
      if (ri) baseParts.push({ kind: 'root', form: ri.form, mean: ri.mean,
                               src: ri.src, alts: ri.alts || [] });
    } else {
      var bw = term[1], eb = expandBase(bw, 0);
      if (eb[0]) {
        baseParts = baseParts.concat(eb[0]);
        chain = chain.concat(eb[1]);
      } else {
        var e = got().words[bw] || {};
        if (!(e && e.analysis)) baseNative = true;
        else baseParts.push({ kind: 'base', form: bw, book: true, mean: e.gloss_cn || '', src: '' });
      }
    }
    parts = parts.concat(baseParts);

    var pfx = pre ? pre.via : '';
    layers.forEach(function (L) {                       // 派生链：由近及远
      var w2 = pfx + L[1];
      chain.push({ word: known(w2) || w2 });
    });
    chain.push({ word: term[1] });
    layers.slice().reverse().forEach(function (L) {     // 构词：左→右
      var s = L[0];
      parts.push({ kind: 'suffix', form: s.form, mean: s.mean || '', pos: s.pos || '' });
    });
    if (baseNative) {
      var bform = term[0] === 'word' ? term[1] : (known(rest) || rest);
      parts.unshift({ kind: 'native', form: bform, mean: '', pos: '' });
      chain.splice(1, 0, { word: bform });
    }
    return [parts, chain];
  }

  function parentOf(word) {
    var db = got(), e = db.words[word];
    if (!e || !e.analysis) return null;
    var toks = parseAnalysis(e.analysis);
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].kind === 'base') {
        if (rootOf(toks[i].form)) return null;
        return known(toks[i].form) || toks[i].form;
      }
    }
    return null;
  }

  function rootAndPre(parts) {
    var rk = null, pk = null;
    parts.forEach(function (p) {
      if (!rk && p.kind === 'root' && p.form) rk = rootOf(p.form);
      if (!pk && p.kind === 'prefix') pk = p.form;
    });
    return rk ? [rk, pk] : null;
  }

  function relatives(w, chain, parts) {
    var db = got(), out = [], seen = {};
    seen[w] = 1;
    chain.forEach(function (c) {
      var x = c.word;
      if (x && !seen[x] && db.words[x] && !rootOf(x)) { seen[x] = 1; out.push(x); }
    });
    Object.keys(db.words).forEach(function (cand) {
      if (seen[cand]) return;
      if (parentOf(cand) === w) { seen[cand] = 1; out.push(cand); }
    });
    for (var i = 0; i < SUF_LIST.length; i++) {
      var f = SUF_LIST[i].form.replace(/^-/, '');
      if (!f || f === 'e') continue;
      var stems = w.slice(-1) === 'e' ? [w, w.slice(0, -1)] : [w];
      for (var j = 0; j < stems.length; j++) {
        var cand = stems[j] + f;
        if (cand.length < 4 || seen[cand]) continue;
        var inSyl = Object.keys(db.syllabi || {}).some(function (k) {
          return (db.syllabi[k] || []).indexOf(cand) >= 0;
        });
        if (db.words[cand] || inSyl) { seen[cand] = 1; out.push(cand); break; }
      }
    }
    var rp = rootAndPre(parts);                        // 派生链为空 → 找同前缀+同词根
    if (!out.length && rp) {
      Object.keys(db.words).forEach(function (cand) {
        if (seen[cand]) return;
        var toks = parseAnalysis((db.words[cand] || {}).analysis || '');
        if (!toks.length) return;
        var r = null, p = null;
        toks.forEach(function (t) {
          if (!r && t.kind === 'base' && rootOf(t.form)) r = rootOf(t.form);
          if (!p && t.kind === 'prefix') p = t.form;
        });
        if (r === rp[0] && p === rp[1]) { seen[cand] = 1; out.push(cand); }
      });
    }
    out.sort(function (a, b) {
      return (Math.abs(a.length - w.length) - Math.abs(b.length - w.length)) || (a < b ? -1 : 1);
    });
    return out.slice(0, 8).map(function (f) {
      var e = db.words[f] || {};
      return { word: f, analysis: e.analysis || '', gloss: e.gloss_cn || e.gloss || '' };
    });
  }

  // ---------------- 主流程 ----------------
  function decode(word) {
    var db = got();
    var w = String(word == null ? '' : word).toLowerCase().trim();
    var res = { word: w, syllabus: [], textbookSplit: null, pos: '', gloss: '',
      source: '', sourceNote: '', expressionParts: [], prefix: null, root: null,
      suffixes: [], chain: [], relatives: [], lexiconEntry: null, note: '', basic: false };
    if (!w) return res;

    Object.keys(db.syllabi || {}).forEach(function (k) {
      if ((db.syllabi[k] || []).indexOf(w) >= 0) res.syllabus.push(k);
    });
    if (db.splits && db.splits[w]) res.textbookSplit = db.splits[w];

    var e = db.words[w];
    if (e) {
      res.lexiconEntry = { analysis: e.analysis || '', gloss: e.gloss || '',
                           glossCn: e.gloss_cn || '', pos: e.pos || '' };
      res.pos = normPos(e.pos || '');
      res.gloss = e.gloss_cn || '';
    }

    var parts, chain;
    if (e && e.analysis) {
      var r = fromBook(w, e.analysis, 0);
      parts = r[0]; chain = r[1];
      res.source = '原书';
      res.sourceNote = '《英语词根与单词的说文解字》/《英语词缀与英语派生词》收录，直接采用书中词形分析';
    } else {
      var r2 = infer(w);
      parts = r2[0]; chain = r2[1];
      if (parts.length) {
        res.source = '推演';
        res.sourceNote = '书中未收录该词；据书中罗列的词根与词缀推演';
      } else {
        res.source = '未覆盖';
        res.sourceNote = '书中未收录，且无法用书里的部件推出构词';
      }
    }

    res.expressionParts = parts;
    res.chain = chain;
    parts.forEach(function (p) {
      if (p.kind === 'prefix' && !res.prefix) res.prefix = { form: p.form, mean: p.mean };
      else if (p.kind === 'root' && !res.root)
        res.root = { form: p.form, mean: p.mean, src: p.src || '', alts: p.alts || [] };
      else if (p.kind === 'suffix')
        res.suffixes.push({ form: p.form, pos: p.pos || '', mean: p.mean || '' });
    });
    res.nativeBase = '';
    parts.forEach(function (p) { if (p.kind === 'native' && !res.nativeBase) res.nativeBase = p.form; });

    var rootOk = res.root && res.root.form;
    if (!rootOk && !res.suffixes.length && !res.prefix) {
      res.basic = true;
      var primary = (db.syllabi && db.syllabi['小学']) || [];
      res.sourceNote = '';
      if (primary.indexOf(w) >= 0) {
        res.note = '英语本族基础词，无拉丁/希腊词根可拆';
        res.source = '本族基础词';
        res.sourceNote = '英语本族语基础词，本就没有词根词缀可拆（这是语言事实，不是漏收）';
      } else {
        res.note = '本书未收录该词的词根，暂不硬拆（它也可能是本族基础词）';
        res.source = '本书未收录';
        res.sourceNote = '《英语词根与单词的说文解字》/《英语词缀与英语派生词》未收此词的词根词缀；按铁律不自行发明拆分规则';
      }
      res.expressionParts = [];
    } else if (!rootOk && res.suffixes.length) {
      var b = null;
      parts.forEach(function (p) { if (!b && (p.kind === 'base' || p.kind === 'native')) b = p; });
      if (b && b.book) res.note = '词基 ' + b.form + ' 书里有单独条目（另有分析串），此处不重复展开';
      else res.note = '词基 ' + (res.nativeBase || (b && b.form) || '（词基）') +
                      ' 本身是英语本族基础词，无拉丁/希腊词根可拆';
    } else if (!rootOk) {
      res.note = '本书未收录该词的词根，暂不硬拆';
    }

    res.relatives = (res.expressionParts.length) ? relatives(w, res.chain, parts) : [];
    return res;
  }

  function expression(res) {
    var bits = [];
    (res.expressionParts || []).forEach(function (p) {
      if (p.kind === 'prefix' || p.kind === 'root' || p.kind === 'base' || p.kind === 'native')
        bits.push(p.form);
      else bits.push(p.form + (p.pos ? ' (' + normPos(p.pos) + ')' : ''));
    });
    return bits.join('  +  ');
  }

  var API = { decode: decode, expression: expression, parseAnalysis: parseAnalysis,
              variants: variants, known: known, rootOf: rootOf, rootInfo: rootInfo,
              normPos: normPos, markTransitive: markTransitive, load: load,
              db: function () { return got(); } };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WordDecode = API;
})(typeof window !== 'undefined' ? window : global);
