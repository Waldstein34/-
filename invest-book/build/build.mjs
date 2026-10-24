#!/usr/bin/env node
// 投資の「なぜ」がわかる本 — ビルドスクリプト（Node 22 / 外部依存なし）
//
//   node build/build.mjs                 content/ を読んで dist/index.html を出力
//   node build/build.mjs --src build/sample
//   node build/build.mjs --out dist/test.html --strict   （警告があれば終了コード1）
//
// 原稿の記法は SPEC.md を参照。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---------------------------------------------------------------- 設定
const BOOK = {
  title: '投資の「なぜ」がわかる本',
  subtitle: '1話3〜5分。根っこの理由から理解する、はじめての資産形成',
  audience: '大学1年生のための入門書',
};
const PARTS = {
  0: 'はじめに',
  1: 'お金と経済の根っこ',
  2: '家計の土台をつくる',
  3: '投資の考え方',
  4: '金融商品を知る',
  5: '税金と制度',
  6: 'はじめてみる',
  7: '心と罠',
  8: 'その先へ',
};

// ---------------------------------------------------------------- 引数
function parseArgs(argv) {
  const o = { src: path.join(ROOT, 'content'), out: path.join(ROOT, 'dist', 'index.html'), strict: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') o.src = path.resolve(argv[++i]);
    else if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--strict') o.strict = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') {
      console.log('usage: node build/build.mjs [--src <dir>] [--out <file>] [--strict] [--quiet]');
      process.exit(0);
    } else {
      console.error(`不明な引数: ${a}`);
      process.exit(2);
    }
  }
  return o;
}
const OPT = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------- 警告
const WARNINGS = [];
function warn(file, line, msg) {
  WARNINGS.push({ file, line, msg });
}

// ---------------------------------------------------------------- 共通
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normKey = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const stripTags = (h) =>
  h
    .replace(/<\/?(p|li|h[1-6]|td|th|tr|div|section|aside|figure|button|ul|ol|br)\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const URL_RE = /https?:\/\/[^\s<>"「」『』（）()\[\]、。，]+/g;

// ---------------------------------------------------------------- アイコン（インラインSVG）
const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  question: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><circle cx="12" cy="16.9" r=".5" fill="currentColor"/>'),
  answer: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.7L16.2 9.6"/>'),
  why: svg('<path d="M9.2 18h5.6M10.2 21h3.6"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.2 1.1 2V16h5v-.2c0-.8.4-1.5 1.1-2A6 6 0 0 0 12 3z"/>'),
  student: svg('<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v3.9c1.5 1.4 3.5 2.1 5.5 2.1s4-.7 5.5-2.1v-3.9"/><path d="M21.5 9.5v5"/>'),
  caution: svg('<path d="M12 3.8L2.9 19.5h18.2z"/><path d="M12 10v4.4"/><circle cx="12" cy="16.9" r=".5" fill="currentColor"/>'),
  summary: svg('<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4 7l1 1 1.7-2M4 12l1 1 1.7-2M4 17l1 1 1.7-2"/>'),
  quiz: svg('<path d="M4.5 4.5h15v11h-9l-4.5 4v-4h-1.5z"/><path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.3"/><circle cx="12" cy="13.4" r=".45" fill="currentColor"/>'),
  source: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>'),
  figure: svg('<path d="M4 4v16h16"/><path d="M7.5 15.5l3.5-4.5 3 2.5 4.5-6"/>'),
  note: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/>'),
  // UI
  menu: svg('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  prev: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  next: svg('<path d="M9.5 6l6 6-6 6"/>'),
  bookmark: svg('<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>'),
  bookmarkOn: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></svg>',
  search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  book: svg('<path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v14"/>'),
  glossary: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 8h6M9 11.5h4"/>'),
  resume: svg('<path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z"/><path d="M15.5 4.8v6l1.75-1.3L19 10.8v-6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
  auto: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>'),
  check: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.7L16.2 9.6"/>'),
  checkOn: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.8 12.4l2.8 2.8 5.6-5.6" fill="none" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

const BLOCKS = {
  question: { label: '今日の疑問' },
  answer: { label: '先に結論' },
  why: { label: 'なぜそうなるのか' },
  student: { label: '大学1年生・20万円の場合' },
  caution: { label: '注意・よくある誤解' },
  summary: { label: 'まとめ' },
  quiz: { label: '確認クイズ' },
  source: { label: '出典' },
  figure: { label: '図解' },
};

// ---------------------------------------------------------------- 禁止表現チェック
function checkText(file, ln, text) {
  const t = text.replace(URL_RE, '');
  if (/[！!]/.test(t)) {
    const i = t.search(/[！!]/);
    warn(file, ln, `「！」が含まれています: …${t.slice(Math.max(0, i - 12), i + 3).trim()}…`);
  }
  { const tq = t.replace(/「[^」]*」/g, ''); // 「」で引用した文句（詐欺の例など）は対象外
    if (/(必ず|絶対(に)?)(儲|もう)か/.test(tq)) warn(file, ln, `断定表現の可能性があります: ${tq.match(/(必ず|絶対(に)?)(儲|もう)か./)[0]}`); }
}

// ---------------------------------------------------------------- 用語集
function parseGlossaryFiles(dir) {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^glossary-.*\.md$/.test(f)).sort()
    : [];
  const map = new Map(); // normKey -> entry
  const entries = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n').split('\n');
    let last = null;
    lines.forEach((raw, i) => {
      const ln = i + 1;
      if (!raw.trim()) { last = null; return; }
      checkText(f, ln, raw);
      if (/^\s*#/.test(raw)) return; // 見出しは無視
      const m = raw.match(/^\s*[-*+]\s+(.+?)\s*[:：]\s*(.*)$/);
      if (m) {
        let term = m[1].trim();
        let reading = '';
        let rm = term.match(/^(.+?)\s*[（(]([ぁ-ゖァ-ヺー・\s]+)[）)]$/) || term.match(/^(.+?)\s*\|\s*(.+)$/);
        if (rm) { term = rm[1].trim(); reading = rm[2].trim(); }
        term = term.replace(/^\*\*(.+)\*\*$/, '$1');
        const desc = m[2].trim();
        if (!desc) warn(f, ln, `用語「${term}」の説明が空です`);
        const key = normKey(term);
        if (map.has(key)) {
          const prev = map.get(key);
          warn(f, ln, `用語「${term}」は ${prev.file}:${prev.line} で定義済みのため、こちらは使いません`);
          last = null;
          return;
        }
        const e = { term, reading, desc, file: f, line: ln };
        map.set(key, e);
        entries.push(e);
        last = e;
      } else if (last && /^\s+\S/.test(raw)) {
        last.desc += raw.trim();
      } else {
        warn(f, ln, `用語集の形式（- 用語: 説明）ではない行です: ${raw.trim().slice(0, 30)}`);
      }
    });
  }
  const coll = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });
  for (const e of entries) e.sortKey = toHira((e.reading || e.term).normalize('NFKC').toLowerCase());
  entries.sort((a, b) => coll.compare(a.sortKey, b.sortKey));
  const noReading = entries.filter((e) => !e.reading && /[一-鿿]/.test(e.term[0]));
  if (noReading.length)
    warn(
      'glossary',
      0,
      `読みのない漢字始まりの用語 ${noReading.length}件（50音順に並ばず「その他」に入ります。「- 金利（きんり）: 説明」と書くと読みを指定できます）: ${noReading.map((e) => e.term).join('、')}`
    );
  return { map, entries, files };
}

const ROWS = [
  ['あ', 'あいうえおぁぃぅぇぉゔ'],
  ['か', 'かきくけこがぎぐげごゕゖ'],
  ['さ', 'さしすせそざじずぜぞ'],
  ['た', 'たちつてとだぢづでどっ'],
  ['な', 'なにぬねの'],
  ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま', 'まみむめも'],
  ['や', 'やゆよゃゅょ'],
  ['ら', 'らりるれろ'],
  ['わ', 'わをんゎゐゑ'],
];
function groupOf(key) {
  const c = key[0] || '';
  if (/[a-z0-9]/i.test(c)) return '英数';
  for (const [label, chars] of ROWS) if (chars.includes(c)) return label;
  return 'その他';
}

// ---------------------------------------------------------------- インライン
function inline(text, ctx) {
  const re = /\*\*(.+?)\*\*|\[\[(.+?)\]\]|(https?:\/\/[^\s<>"「」『』（）()\[\]、。，]+)/g;
  let out = '';
  let pos = 0;
  let m;
  while ((m = re.exec(text))) {
    out += escRest(text.slice(pos, m.index), ctx);
    if (m[1] !== undefined) out += `<strong>${inline(m[1], ctx)}</strong>`;
    else if (m[2] !== undefined) out += termHtml(m[2], ctx);
    else out += `<a href="${esc(m[3])}" target="_blank" rel="noopener noreferrer">${esc(m[3])}</a>`;
    pos = re.lastIndex;
  }
  out += escRest(text.slice(pos), ctx);
  return out;
}
function escRest(s, ctx) {
  if (ctx && !ctx.silent) {
    if (s.includes('**')) warn(ctx.file, ctx.ln, '太字「**」が閉じられていない可能性があります');
    if (s.includes('[[') || s.includes(']]')) warn(ctx.file, ctx.ln, '用語リンク「[[ ]]」の書き方が崩れています');
  }
  return esc(s);
}
function termHtml(raw, ctx) {
  let label = raw;
  let term = raw;
  const p = raw.indexOf('|');
  if (p >= 0) { label = raw.slice(0, p); term = raw.slice(p + 1); }
  const e = ctx.glossary.map.get(normKey(term));
  if (!e) {
    if (!ctx.silent) {
      warn(ctx.file, ctx.ln, `用語「${term}」が用語集にありません（プレーンテキストで表示）`);
      ctx.missingTerms?.add(term);
    }
    return esc(label);
  }
  ctx.usedTerms?.add(e.term);
  return `<span class="term" role="button" tabindex="0" data-term="${esc(e.term)}">${esc(label)}</span>`;
}

// ---------------------------------------------------------------- ブロック要素（Markdown）
const RE_HEAD = /^(#{1,6})\s+(.*)$/;
const RE_UL = /^(\s*)[-*+]\s+(.*)$/;
const RE_OL = /^(\s*)(\d+)[.)．]\s+(.*)$/;
const RE_TABLE = /^\s*\|/;
const RE_HR = /^\s*(-{3,}|\*{3,})\s*$/;

function joinLines(parts) {
  let s = '';
  for (const p of parts) {
    const t = p.trim();
    if (!s) s = t;
    else if (/[A-Za-z0-9,.]$/.test(s) && /^[A-Za-z0-9]/.test(t)) s += ' ' + t;
    else s += t;
  }
  return s;
}

function md(lines, ctx) {
  // lines: [{t, ln}]
  const out = [];
  let i = 0;
  const n = lines.length;
  const at = (k) => (ctx.ln = lines[k].ln);
  while (i < n) {
    const t = lines[i].t;
    if (!t.trim()) { i++; continue; }
    at(i);
    let m;
    if ((m = t.match(RE_HEAD))) {
      let lv = m[1].length;
      if (lv !== 2 && lv !== 3) {
        warn(ctx.file, lines[i].ln, `見出しは ## と ### のみ使えます（${m[1]} を ${lv < 2 ? '##' : '###'} として扱います）`);
        lv = lv < 2 ? 2 : 3;
      }
      out.push(`<h${lv}>${inline(m[2].trim(), ctx)}</h${lv}>`);
      i++;
    } else if (RE_HR.test(t)) {
      out.push('<hr>');
      i++;
    } else if (RE_TABLE.test(t)) {
      const rows = [];
      while (i < n && RE_TABLE.test(lines[i].t)) rows.push(lines[i++]);
      out.push(table(rows, ctx));
    } else if (RE_UL.test(t) || RE_OL.test(t)) {
      const ordered = !RE_UL.test(t);
      const items = [];
      let start = 1;
      while (i < n) {
        const L = lines[i].t;
        const mu = L.match(RE_UL);
        const mo = L.match(RE_OL);
        if (!ordered && mu) items.push({ parts: [mu[2]], ln: lines[i].ln, nested: mu[1].length >= 2 });
        else if (ordered && mo) {
          if (!items.length) start = +mo[2];
          items.push({ parts: [mo[3]], ln: lines[i].ln, nested: mo[1].length >= 2 });
        } else if (items.length && L.trim() && /^\s+/.test(L) && !RE_HEAD.test(L.trim())) items[items.length - 1].parts.push(L);
        else break;
        i++;
      }
      const lis = items.map((it) => {
        ctx.ln = it.ln;
        return `<li${it.nested ? ' class="nested"' : ''}>${inline(joinLines(it.parts), ctx)}</li>`;
      });
      out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${lis.join('')}</ol>` : `<ul>${lis.join('')}</ul>`);
    } else {
      const parts = [];
      const ln0 = lines[i].ln;
      while (i < n) {
        const L = lines[i].t;
        if (!L.trim() || RE_HEAD.test(L) || RE_UL.test(L) || RE_OL.test(L) || RE_TABLE.test(L) || RE_HR.test(L)) break;
        parts.push(L);
        i++;
      }
      ctx.ln = ln0;
      out.push(`<p>${inline(joinLines(parts), ctx)}</p>`);
    }
  }
  return out.join('\n');
}

function splitRow(s) {
  let t = s.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}
function table(rows, ctx) {
  const isSep = (r) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(r.t);
  let head = null;
  let body = rows;
  let align = [];
  if (rows.length >= 2 && isSep(rows[1])) {
    head = rows[0];
    align = splitRow(rows[1].t).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
    body = rows.slice(2);
  } else {
    warn(ctx.file, rows[0].ln, '表の2行目に区切り行（| --- | --- |）がありません');
  }
  const cols = Math.max(...rows.filter((r) => !isSep(r)).map((r) => splitRow(r.t).length));
  if (cols > 3) warn(ctx.file, rows[0].ln, `表が${cols}列あります（3列以内が目安）`);
  const cell = (tag, c, k, ln) => {
    ctx.ln = ln;
    const a = align[k] ? ` style="text-align:${align[k]}"` : '';
    return `<${tag}${a}>${inline(c, ctx)}</${tag}>`;
  };
  let h = '<div class="table-wrap"><table>';
  if (head) h += `<thead><tr>${splitRow(head.t).map((c, k) => cell('th', c, k, head.ln)).join('')}</tr></thead>`;
  h += '<tbody>';
  for (const r of body) {
    if (isSep(r)) continue;
    const cs = splitRow(r.t);
    while (cs.length < cols) cs.push('');
    h += `<tr>${cs.map((c, k) => cell('td', c, k, r.ln)).join('')}</tr>`;
  }
  return h + '</tbody></table></div>';
}

// ---------------------------------------------------------------- 独自ブロック
function quiz(lines, ctx, blockLn) {
  const items = [];
  let cur = null;
  let mode = '';
  for (const { t, ln } of lines) {
    const s = t.trim();
    if (!s) continue;
    let m;
    if ((m = s.match(/^Q\s*[:：]\s*(.*)$/i))) {
      cur = { q: [m[1]], choices: [], a: [], ln };
      items.push(cur);
      mode = 'q';
    } else if (!cur) {
      warn(ctx.file, ln, 'quiz の先頭に「Q: 問題文」がありません');
    } else if ((m = s.match(/^A\s*[:：]\s*(.*)$/i))) {
      cur.a.push(m[1]);
      mode = 'a';
    } else if (mode !== 'a' && (m = s.match(/^[-+]\s+(.*)$|^\*\s+(.*)$/))) {
      let c = (m[1] ?? m[2]).trim();
      let correct = false;
      if (c.startsWith('***')) { correct = true; c = c.slice(1); }
      else if (c.startsWith('*') && !c.startsWith('**')) { correct = true; c = c.slice(1).trim(); }
      else if (c.startsWith('＊')) { correct = true; c = c.slice(1).trim(); warn(ctx.file, ln, '正解の印に全角「＊」が使われています（半角 * にしてください）'); }
      cur.choices.push({ parts: [c], correct, ln });
      mode = 'c';
    } else if (mode === 'q') cur.q.push(s);
    else if (mode === 'c') cur.choices[cur.choices.length - 1].parts.push(s);
    else if (mode === 'a') cur.a.push(s);
  }
  if (!items.length) warn(ctx.file, blockLn, 'quiz に問題がありません');
  const html = items
    .map((it, qi) => {
      const nCorrect = it.choices.filter((c) => c.correct).length;
      if (it.choices.length < 2) warn(ctx.file, it.ln, 'quiz の選択肢が2つ未満です');
      if (nCorrect === 0) warn(ctx.file, it.ln, 'quiz に正解（先頭に * の選択肢）がありません');
      if (nCorrect > 1) warn(ctx.file, it.ln, `quiz の正解が${nCorrect}つあります（どれを選んでも正解扱いになります）`);
      if (!it.a.join('').trim()) warn(ctx.file, it.ln, 'quiz に解説（A: ）がありません');
      ctx.ln = it.ln;
      const q = inline(joinLines(it.q), ctx);
      const letters = 'ABCDEFGH';
      const ch = it.choices
        .map((c, k) => {
          ctx.ln = c.ln;
          return `<button type="button" class="choice"${c.correct ? ' data-c="1"' : ''}><span class="mk">${letters[k] || k + 1}</span><span class="tx">${inline(joinLines(c.parts), ctx)}</span><span class="badge">正解</span></button>`;
        })
        .join('');
      ctx.ln = it.ln;
      const a = inline(joinLines(it.a), ctx);
      return `<div class="quiz-item"><p class="quiz-q"><span class="qno">Q${items.length > 1 ? qi + 1 : ''}</span>${q}</p><div class="choices">${ch}</div><div class="quiz-ex" aria-live="polite"><p class="verdict"></p><p class="ex"><span class="exl">解説</span>${a}</p><button type="button" class="quiz-retry">もう一度解く</button></div></div>`;
    })
    .join('');
  return html;
}

function renderBlock(name, lines, ctx, ln) {
  const def = BLOCKS[name];
  let inner;
  if (name === 'quiz') inner = quiz(lines, ctx, ln);
  else inner = md(lines, ctx);
  if (!lines.some((l) => l.t.trim())) warn(ctx.file, ln, `:::${name} の中身が空です`);
  const label = def ? def.label : 'メモ';
  const icon = ICONS[def ? name : 'note'];
  const tag = name === 'figure' ? 'figure' : name === 'source' ? 'aside' : 'section';
  return `<${tag} class="blk blk-${def ? name : 'other'}"><div class="blk-h">${icon}<span>${label}</span></div><div class="blk-b">${inner}</div></${tag}>`;
}

// ---------------------------------------------------------------- 1話
function parseEpisode(file, src, glossary) {
  const lines = src.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  const meta = {};
  let i = 0;
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = lines[i].match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
      else if (lines[i].trim()) warn(file, i + 1, `frontmatter の形式が不正です: ${lines[i]}`);
      i++;
    }
    if (i >= lines.length) warn(file, 1, 'frontmatter が「---」で閉じられていません');
    i++;
  } else warn(file, 1, 'frontmatter（---）がありません');

  for (const k of ['no', 'part', 'title', 'minutes']) if (!meta[k]) warn(file, 1, `frontmatter に ${k} がありません`);
  for (const k of ['title', 'subtitle']) if (meta[k]) checkText(file, 1, meta[k]);
  const fileNo = parseInt(path.basename(file), 10);
  const no = meta.no ? parseInt(meta.no, 10) : fileNo;
  if (meta.no && no !== fileNo) warn(file, 1, `frontmatter の no: ${meta.no} がファイル名と一致しません`);
  const part = meta.part !== undefined && meta.part !== '' ? parseInt(meta.part, 10) : 0;
  if (Number.isNaN(part)) warn(file, 1, `part が数値ではありません: ${meta.part}`);
  const minutes = parseInt(meta.minutes, 10) || 0;

  // セグメント分割
  const segs = [];
  let main = { kind: 'md', lines: [] };
  segs.push(main);
  let blk = null;
  for (; i < lines.length; i++) {
    const t = lines[i];
    const ln = i + 1;
    checkText(file, ln, t);
    const open = t.match(/^\s*:::\s*([A-Za-z]\w*)\s*(.*)$/);
    const close = /^\s*:::\s*$/.test(t);
    if (open) {
      if (blk) {
        warn(file, blk.ln, `:::${blk.name} が閉じられていません（${ln}行目の :::${open[1]} の前に「:::」が必要です）`);
      }
      const name = open[1].toLowerCase();
      if (!BLOCKS[name]) warn(file, ln, `不明なブロック :::${open[1]} です`);
      if (open[2]) warn(file, ln, `:::${open[1]} の後ろに余計な文字があります: ${open[2]}`);
      blk = { kind: 'blk', name, ln, lines: [] };
      segs.push(blk);
    } else if (close) {
      if (!blk) warn(file, ln, '対応する開始のない「:::」があります');
      else {
        blk = null;
        main = { kind: 'md', lines: [] };
        segs.push(main);
      }
    } else if (blk && /\S\s*:::\s*$/.test(t)) {
      warn(file, ln, '「:::」が行末にくっついています（:::は単独の行に書いてください）。ここでブロックを閉じたものとして扱います');
      blk.lines.push({ t: t.replace(/\s*:::\s*$/, ''), ln });
      blk = null;
      main = { kind: 'md', lines: [] };
      segs.push(main);
    } else if (/^\s*::/.test(t) && !/^\s*:::/.test(t)) {
      warn(file, ln, `ブロック記法はコロン3つ（:::）です: ${t.trim()}`);
      (blk || main).lines.push({ t, ln });
    } else (blk || main).lines.push({ t, ln });
  }
  if (blk) warn(file, blk.ln, `:::${blk.name} が閉じられていません（ファイル末尾まで）`);

  const ctx = { file, ln: 0, glossary, usedTerms: new Set(), missingTerms: new Set() };
  const html = segs
    .map((s) => (s.kind === 'md' ? md(s.lines, ctx) : renderBlock(s.name, s.lines, ctx, s.ln)))
    .filter(Boolean)
    .join('\n');

  // 構成チェック
  const nonEmpty = segs.filter((s) => s.kind === 'blk' || s.lines.some((l) => l.t.trim()));
  const names = segs.filter((s) => s.kind === 'blk').map((s) => s.name);
  if (nonEmpty[0]?.name !== 'question') warn(file, nonEmpty[0]?.ln || 1, '最初のブロックが :::question ではありません');
  else if (nonEmpty[1]?.name !== 'answer') warn(file, nonEmpty[1]?.ln || 1, ':::question の直後が :::answer ではありません');
  for (const req of ['question', 'answer', 'why', 'student', 'summary', 'quiz', 'source'])
    if (!names.includes(req)) warn(file, 0, `:::${req} がありません`);

  // 本文の文字数（quiz・source を除く）
  const bodyText = segs
    .filter((s) => !(s.kind === 'blk' && (s.name === 'quiz' || s.name === 'source')))
    .flatMap((s) => s.lines.map((l) => l.t))
    .join('')
    .replace(/[\s|#*\-:[\]]/g, '');
  const chars = bodyText.length;

  return {
    no,
    part: Number.isNaN(part) ? 0 : part,
    title: meta.title || `第${no}話`,
    subtitle: meta.subtitle || '',
    minutes,
    html,
    text: stripTags(
      html
        .replace(/<aside class="blk blk-source"[\s\S]*?<\/aside>/g, '')
        .replace(/<div class="blk-h">[\s\S]*?<\/div>/g, ' ')
        .replace(/<span class="(badge|mk|exl|qno)">[\s\S]*?<\/span>/g, ' ')
        .replace(/<button type="button" class="quiz-retry">[\s\S]*?<\/button>/g, ' ')
    ),
    chars,
    file,
  };
}

// ---------------------------------------------------------------- メイン
function main() {
  const t0 = Date.now();
  if (!fs.existsSync(OPT.src)) {
    console.error(`原稿ディレクトリがありません: ${OPT.src}`);
    process.exit(2);
  }
  const glossary = parseGlossaryFiles(OPT.src);
  const files = fs.readdirSync(OPT.src).filter((f) => /^\d+\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  const eps = files.map((f) => parseEpisode(f, fs.readFileSync(path.join(OPT.src, f), 'utf8'), glossary));
  eps.sort((a, b) => a.no - b.no);
  const seen = new Map();
  for (const e of eps) {
    if (seen.has(e.no)) warn(e.file, 1, `話番号 ${e.no} が ${seen.get(e.no)} と重複しています`);
    seen.set(e.no, e.file);
  }
  for (let k = 1; k < eps.length; k++)
    if (eps[k].part < eps[k - 1].part) warn(eps[k].file, 1, `部の番号が前の話（${eps[k - 1].file}）より小さくなっています`);

  const gctx = { file: 'glossary', ln: 0, glossary, silent: true };
  const gloss = glossary.entries.map((e) => {
    const html = inline(e.desc, gctx);
    return { term: e.term, reading: e.reading, html, text: stripTags(html), group: groupOf(e.sortKey) };
  });

  const data = {
    book: BOOK,
    parts: PARTS,
    episodes: eps.map(({ no, part, title, subtitle, minutes, html, text }) => ({ no, part, title, subtitle, minutes, html, text })),
    glossary: gloss,
    icons: ICONS,
    builtAt: new Date().toISOString(),
  };

  const css = fs.readFileSync(path.join(HERE, 'src', 'app.css'), 'utf8');
  const dark = fs.readFileSync(path.join(HERE, 'src', 'dark.css'), 'utf8');
  const js = fs.readFileSync(path.join(HERE, 'src', 'app.js'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
  const boot = `(function(){try{var s=JSON.parse(localStorage.getItem('investbook:v1')||'{}')||{};var r=document.documentElement;if(s.theme==='light'||s.theme==='dark')r.setAttribute('data-theme',s.theme);if(s.fs!=null)r.setAttribute('data-fs',s.fs);}catch(e){}if(/[?&]print=1/.test(location.search))document.documentElement.classList.add('print-mode');})();`;

  const out = `<!doctype html>
<html lang="ja" data-fs="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f3ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1c1e" media="(prefers-color-scheme: dark)">
<title>${esc(BOOK.title)}</title>
<script>${boot}</script>
<style>
${css.replaceAll('/*@DARK@*/', dark)}
</style>
</head>
<body>
<header class="top" id="top"></header>
<div class="readbar" id="readbar" aria-hidden="true"><i></i></div>
<main id="view" tabindex="-1"></main>
<nav class="bottom" id="bottom" aria-label="ページ移動"></nav>
<div class="sheet-wrap" id="sheet" hidden>
  <div class="sheet-bg" data-act="sheet-close"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-grip" aria-hidden="true"></div>
    <h2 id="sheet-title"></h2>
    <div class="sheet-body" id="sheet-body"></div>
    <div class="sheet-act">
      <a class="btn" id="sheet-more" href="#/glossary">用語集で見る</a>
      <button type="button" class="btn primary" data-act="sheet-close">閉じる</button>
    </div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<noscript><p style="padding:24px">このページを読むには JavaScript を有効にしてください。</p></noscript>
<script type="application/json" id="book-data">${json}</script>
<script>
${js}
</script>
</body>
</html>
`;
  fs.mkdirSync(path.dirname(OPT.out), { recursive: true });
  fs.writeFileSync(OPT.out, out);

  // ---- 報告
  const rel = (p) => path.relative(process.cwd(), p) || p;
  if (!OPT.quiet) {
    console.log(`原稿: ${rel(OPT.src)}  話数: ${eps.length}  用語: ${gloss.length}（${glossary.files.join(', ') || '用語集なし'}）`);
    for (const e of eps) {
      const flag = e.chars < 1200 ? ' ← 短め' : e.chars > 2000 ? ' ← 長め' : '';
      console.log(`  ${e.file.padEnd(6)} 第${e.part}部 第${e.no}話 ${e.title}（約${e.minutes}分・本文約${e.chars}字${flag}）`);
    }
  }
  if (WARNINGS.length) {
    console.log(`\n警告 ${WARNINGS.length}件:`);
    for (const w of WARNINGS) console.log(`  [warn] ${w.file}${w.line ? ':' + w.line : ''}  ${w.msg}`);
  } else if (!OPT.quiet) console.log('\n警告はありません');
  console.log(`\n出力: ${rel(OPT.out)}（${(Buffer.byteLength(out) / 1024).toFixed(1)} KB, ${Date.now() - t0} ms）`);
  if (OPT.strict && WARNINGS.length) process.exit(1);
}

main();
