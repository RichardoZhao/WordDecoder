/* 词性规范化 + 构词分析格式化（按赵老师教学规范）

规范：
  形容词 → adj.    副词 → adv.     及物动词 → vt.    不及物动词 → vi.
  系动词 → lv.     情态动词 → aux.  名词 → n.        介词 → prep.
  连词 → conj.     代词 → pron.     数词 → num.

构词分析：从左至右 = 前缀 → 词根 → 后缀（按单词中的实际顺序）
vt. 的汉语释义后加 "..." 表示需接宾语
*/
(function (root) {
  'use strict';

  var POS_MAP = {
    a: 'adj.', adj: 'adj.',
    ad: 'adv.', adv: 'adv.',
    n: 'n.',
    v: 'v.',
    vt: 'vt.', vi: 'vi.',
    lv: 'lv.', aux: 'aux.',
    prep: 'prep.', conj: 'conj.', pron: 'pron.', num: 'num.',
    int: 'int.', art: 'art.',
  };


  // 已知后缀（按长度降序，用于精确切分）
  var KNOWN_SUFFIXES = [
    'ational','ationally','ization','isation','iveness','fulness','ability','ibility',
    'tional','ically','ously','edly','ition','ution','ation','sion','tion','ment','ness',
    'ance','ence','ancy','ency','ship','hood','dom','ism','ist','ity','ive','ous','ful',
    'less','able','ible','ally','ily','ize','ise','ify','ate','ant','ent','ary','ory',
    'ing','ed','ly','er','or','al','ic','ial','ical','y','s','en','ee'
  ].sort(function (a, b) { return b.length - a.length; });

  // 复数组合（如 adj/n、v/adj）也要规范化
  function normPos(p) {
    if (!p) return '';
    var s = String(p).trim();
    if (!s) return '';
    var parts = s.split('/');
    var out = parts.map(function (x) {
      var k = x.trim().replace(/\.$/, '').toLowerCase();
      return POS_MAP[k] || (k ? k + '.' : '');
    }).filter(Boolean);
    return out.join('/');
  }

  // 释义后是否需要加省略号（及物动词需接宾语）
  function needsEllipsis(pos) {
    if (!pos) return false;
    return String(pos).indexOf('vt') >= 0;
  }

  // 给 vt. 的汉语释义加省略号
  function markTransitive(mean, pos) {
    if (!mean || !needsEllipsis(pos)) return mean || '';
    var m = String(mean).trim();
    if (!m) return m;
    if (/[…\.]{1,}$/.test(m)) return m;      // 已有省略号就不重复加
    return m.replace(/[。；;，,、]+$/, '') + '…';
  }

  // 把词形分析串格式化为"从左至右"的构件列表
  // 输入例：'creat(e); -ive a.'  →  [ {kind:'root',form:'creat(e)'}, {kind:'suffix',form:'-ive',pos:'adj.'} ]
  // 输入例：'ab -; sorb'          →  [ {kind:'prefix',form:'ab-'}, {kind:'root',form:'sorb'} ]
  function splitOrder(s) {
    var out = [];
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
      var m;
      // 前缀：xxx-
      var compact = head.replace(/\s+/g, '');
      if ((m = compact.match(/^([a-z]{1,12})-$/))) {
        out.push({ kind: 'prefix', form: m[1] + '-', mean: mean.slice(0, 40) });
        continue;
      }
      // 后缀：-xxx [词性]
      // 后缀：在已知后缀表里找最长的匹配（避免把词性缩写吞进后缀名）
      if (/^-/.test(compact)) {
        var body = compact.replace(/^-/, '');
        var best = '';
        for (var si = 0; si < KNOWN_SUFFIXES.length; si++) {
          var ksf = KNOWN_SUFFIXES[si];
          if (body.indexOf(ksf) === 0 && ksf.length > best.length) best = ksf;
        }
        if (!best) {                                   // 表外后缀：退回取到第一个点号为止
          var bm = body.match(/^([a-z\-]+?)(?=[a-z]{1,4}\.|$)/);
          best = bm ? bm[1] : body;
        }
        var pm = head.match(/\b([a-z]{1,4})\./);
        out.push({ kind: 'suffix', form: '-' + best, pos: normPos(pm ? pm[1] : ''),
                   mean: mean.slice(0, 40) });
        continue;
      }
      // 词根：字母（可能带括号说明）
      if ((m = head.match(/^([a-z]+)/))) {
        if (m[1].length >= 2) {
          // 去掉尾巴上的词性标注（act v. → act）、保留括号说明（creat(e)）
          var rootForm = head.replace(/\s*[a-z]{1,4}\.\s*$/, '').replace(/\s+/g, '');
          out.push({ kind: 'root', form: rootForm, mean: mean.slice(0, 60) });
        }
      }
    }
    return out;
  }

  // 渲染成一行"从左至右"的表达式：creat(e) + -ive (adj.)
  function toExpression(parts) {
    if (!parts || !parts.length) return '';
    return parts.map(function (p) {
      if (p.kind === 'suffix') return p.form + (p.pos ? ' (' + p.pos + ')' : '');
      return p.form;
    }).join('  +  ');
  }

  var API = { normPos: normPos, markTransitive: markTransitive, needsEllipsis: needsEllipsis,
              splitOrder: splitOrder, toExpression: toExpression, POS_MAP: POS_MAP };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.PosNorm = API;
})(typeof window !== 'undefined' ? window : global);
