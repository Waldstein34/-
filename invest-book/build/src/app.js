(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('book-data').textContent);
  var I = D.icons;
  var EP = D.episodes;
  var KEY = 'investbook:v1';
  var root = document.documentElement;
  var view = document.getElementById('view');
  var top = document.getElementById('top');
  var bottom = document.getElementById('bottom');
  var readbar = document.getElementById('readbar').firstChild;
  var SMOOTH = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';

  // ------------------------------------------------ storage（使えなくても動く）
  var S = (function () {
    var mem = {};
    var ok = false;
    try {
      var t = '__ib_test';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      ok = true;
      mem = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {};
      if (typeof mem !== 'object') mem = {};
    } catch (e) {
      mem = mem || {};
    }
    return {
      ok: ok,
      get: function (k, d) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d; },
      set: function (k, v) {
        mem[k] = v;
        if (!ok) return;
        try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 容量超過などは無視 */ }
      }
    };
  })();

  // ------------------------------------------------ helpers
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).normalize('NFKC').toLowerCase(); }
  function idxOf(no) { for (var i = 0; i < EP.length; i++) if (EP[i].no === no) return i; return -1; }
  function partName(p) { return '第' + p + '部 ' + (D.parts[p] || ''); }
  function metaLine(e) { return '第' + e.part + '部・第' + e.no + '話・約' + e.minutes + '分'; }
  function readMap() { return S.get('read', {}); }
  function isRead(no) { return !!readMap()[no]; }
  function setRead(no, v) {
    var m = readMap();
    if (v) m[no] = Date.now(); else delete m[no];
    S.set('read', m);
  }
  function marks() { return S.get('marks', []); }
  function markOf(no) { var m = marks(); for (var i = 0; i < m.length; i++) if (m[i].no === no) return m[i]; return null; }
  function scrollRatio() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
  }
  function scrollToRatio(r) {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(h * r));
  }
  function pct(r) { return Math.round(r * 100) + '%'; }
  function lastEp() {
    var l = S.get('last', null);
    if (l == null) return null;
    var i = idxOf(l);
    return i < 0 ? null : EP[i];
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var q = '';
    var k = h.indexOf('?');
    if (k >= 0) { q = h.slice(k + 1); h = h.slice(0, k); }
    var params = {};
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* ignore */ }
    });
    return { parts: h.split('/').filter(Boolean), params: params };
  }

  // ------------------------------------------------ settings
  var FS_LABEL = ['小', '中', '大'];
  var TH_LABEL = { auto: '自動（端末の設定）', light: 'ライト', dark: 'ダーク' };
  function applySettings() {
    root.setAttribute('data-fs', String(S.get('fs', 1)));
    var th = S.get('theme', 'auto');
    if (th === 'light' || th === 'dark') root.setAttribute('data-theme', th);
    else root.removeAttribute('data-theme');
  }
  function themeIcon() {
    var th = S.get('theme', 'auto');
    return th === 'light' ? I.sun : th === 'dark' ? I.moon : I.auto;
  }
  function cycleFont() {
    var r = scrollRatio();
    var fs = (Number(S.get('fs', 1)) + 1) % 3;
    S.set('fs', fs);
    applySettings();
    fitTables();
    scrollToRatio(r);
    toast('文字サイズ: ' + FS_LABEL[fs]);
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var th = order[(order.indexOf(S.get('theme', 'auto')) + 1) % 3];
    S.set('theme', th);
    applySettings();
    var b = document.querySelector('[data-act="theme"]');
    if (b) b.innerHTML = themeIcon();
    toast('表示: ' + TH_LABEL[th]);
  }

  // ------------------------------------------------ chrome
  function setTop(title, left) {
    var l = left === 'none'
      ? '<a class="ib" href="#/" aria-label="表紙">' + I.book + '</a>'
      : left === 'cover'
        ? '<a class="ib" href="#/" aria-label="表紙へ">' + I.book + '</a>'
        : '<a class="ib" href="#/toc" aria-label="目次へ">' + I.menu + '</a>';
    top.innerHTML = l +
      '<div class="ttl">' + esc(title) + '</div>' +
      '<a class="ib" href="#/search" aria-label="検索">' + I.search + '</a>' +
      '<button type="button" class="ib" data-act="font" aria-label="文字サイズを変える"><span class="aa">A<b>A</b></span></button>' +
      '<button type="button" class="ib" data-act="theme" aria-label="表示の明るさを切り替える">' + themeIcon() + '</button>';
  }
  function navTabs(active) {
    var le = lastEp();
    function tab(id, href, icon, label, dis) {
      return '<a class="nb' + (active === id ? ' on' : '') + '" href="' + href + '"' + (dis ? ' aria-disabled="true"' : '') + (active === id ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></a>';
    }
    bottom.className = 'bottom';
    bottom.innerHTML =
      tab('toc', '#/toc', I.menu, '目次') +
      tab('resume', le ? '#/ep/' + le.no + '?resume=1' : '#/toc', I.resume, '続きから', !le) +
      tab('glossary', '#/glossary', I.glossary, '用語集') +
      tab('search', '#/search', I.search, '検索');
  }

  // ------------------------------------------------ views
  var cleanup = null;
  function setView(html) {
    if (cleanup) { cleanup(); cleanup = null; }
    view.innerHTML = html;
    readbar.style.width = '0';
  }

  function cover(y) {
    setTop('', 'none');
    navTabs('');
    var le = lastEp();
    var readN = EP.filter(function (e) { return isRead(e.no); }).length;
    var mins = EP.reduce(function (a, e) { return a + (e.minutes || 0); }, 0);
    var title = esc(D.book.title).replace('「なぜ」', '<span class="q">「なぜ」</span>');
    var first = EP[0];
    var acts = '';
    if (le) {
      acts += '<a class="btn primary block" href="#/ep/' + le.no + '?resume=1">' + I.resume + '続きから読む</a>' +
        '<p class="resume-note">第' + le.no + '話「' + esc(le.title) + '」</p>';
      acts += '<a class="btn block" href="#/toc">' + I.menu + '目次を見る</a>';
    } else {
      if (first) acts += '<a class="btn primary block" href="#/ep/' + first.no + '">' + I.book + 'はじめから読む</a>';
      acts += '<a class="btn block" href="#/toc">' + I.menu + '目次を見る</a>';
    }
    setView(
      '<section class="cover">' +
      '<div class="mark">' + I.why + '</div>' +
      '<p class="aud">' + esc(D.book.audience) + '</p>' +
      '<h1>' + title + '</h1>' +
      '<div class="rule"></div>' +
      '<p class="sub">' + esc(D.book.subtitle) + '</p>' +
      '<div class="stats"><span>全' + EP.length + '話</span><span>合計 約' + mins + '分</span>' + (readN ? '<span>読了 ' + readN + '話</span>' : '') + '</div>' +
      '<div class="acts">' + acts + '</div>' +
      (S.ok ? '' : '<p class="resume-note">この環境では読書の記録を保存できません。ページを閉じると既読やしおりは消えます。</p>') +
      '</section>'
    );
    restoreTo(y || 0);
  }

  function toc(y) {
    setTop('目次', 'cover');
    navTabs('toc');
    var readN = EP.filter(function (e) { return isRead(e.no); }).length;
    var le = lastEp();
    var h = '<h1 class="pg-h">目次</h1>';
    h += '<div class="toc-progress"><div class="meter"><i style="width:' + (EP.length ? (readN / EP.length * 100) : 0) + '%"></i></div>' +
      '<div class="lbl"><span>読了 ' + readN + ' / ' + EP.length + '話</span><span>' + (EP.length ? Math.round(readN / EP.length * 100) : 0) + '%</span></div></div>';
    if (le) {
      h += '<a class="resume-card" href="#/ep/' + le.no + '?resume=1">' + I.resume + '<div><small>続きから読む</small><b>第' + le.no + '話 ' + esc(le.title) + '</b></div></a>';
    }
    var ms = marks().filter(function (m) { return idxOf(m.no) >= 0; });
    if (ms.length) {
      h += '<div class="part-h">しおり</div><div class="marks">';
      ms.forEach(function (m) {
        var e = EP[idxOf(m.no)];
        h += '<a href="#/ep/' + e.no + '?pos=' + m.pos + '">' + I.bookmarkOn + '<span>第' + e.no + '話 ' + esc(e.title) + '</span><small>' + pct(m.pos) + 'の位置</small></a>';
      });
      h += '</div>';
    }
    var curPart = null;
    EP.forEach(function (e) {
      if (e.part !== curPart) {
        if (curPart !== null) h += '</ul>';
        curPart = e.part;
        h += '<h2 class="part-h"><b>第' + e.part + '部</b>' + esc(D.parts[e.part] || '') + '</h2><ul class="toc-list">';
      }
      var rd = isRead(e.no);
      var here = prevView && prevView.name === 'ep' && prevView.no === e.no;
      h += '<li><a href="#/ep/' + e.no + '" id="toc-' + e.no + '" class="' + (rd ? 'is-read' : '') + (here ? ' here' : '') + '"' + (here ? ' aria-current="true"' : '') + '>' +
        '<span class="no">' + e.no + '</span>' +
        '<span><span class="t">' + esc(e.title) + '</span>' + (e.subtitle ? '<span class="s">' + esc(e.subtitle) + '</span>' : '') + '</span>' +
        '<span class="r">' + (markOf(e.no) ? '<span class="bm" aria-label="しおりあり">' + I.bookmarkOn + '</span>' : '') +
        '<span>約' + e.minutes + '分</span><span class="ck" aria-label="' + (rd ? '既読' : '未読') + '">' + (rd ? I.checkOn : I.check) + '</span></span>' +
        '</a></li>';
    });
    if (curPart !== null) h += '</ul>';
    if (!EP.length) h += '<p class="empty">まだ原稿がありません。</p>';
    setView(h);
    // 話から目次を開いたときは、いま読んでいた話の行を画面に入れる
    var cur = view.querySelector('.toc-list a.here');
    if (y != null) restoreTo(y);
    else if (cur) { window.scrollTo(0, 0); cur.scrollIntoView({ block: 'center' }); }
    else window.scrollTo(0, 0);
  }

  function episodeHtml(e, forPrint) {
    return '<article class="ep" data-no="' + e.no + '">' +
      '<div class="ep-meta">' + esc(metaLine(e)) + '</div>' +
      '<h1>' + esc(e.title) + '</h1>' +
      (e.subtitle ? '<p class="ep-sub">' + esc(e.subtitle) + '</p>' : '') +
      e.html +
      (forPrint ? '' : endHtml(e)) +
      '</article>';
  }
  function endHtml(e) {
    var i = idxOf(e.no);
    var nx = EP[i + 1];
    var rd = isRead(e.no);
    var h = '<div class="ep-end" id="ep-end">';
    h += '<div class="done-line">' + (rd ? I.checkOn + '<span>この話は読了済みです</span>' : I.check + '<span>最後まで読むと読了になります</span>') + '</div>';
    if (nx) h += '<a class="next-card" href="#/ep/' + nx.no + '" data-act="next"><small>次の話　' + esc(metaLine(nx)) + '</small><b>' + esc(nx.title) + '</b>' + (nx.subtitle ? '<span>' + esc(nx.subtitle) + '</span>' : '') + '</a>';
    else h += '<a class="next-card" href="#/toc"><small>最後の話です</small><b>目次へ戻る</b></a>';
    h += '<button type="button" class="btn ghost" data-act="toggle-read">' + (rd ? '未読に戻す' : '読了にする') + '</button>';
    return h + '</div>';
  }

  var curNo = null;
  function episode(no, params, y) {
    var i = idxOf(no);
    if (i < 0) { location.replace('#/toc'); return; }
    var e = EP[i];
    var pv = EP[i - 1];
    var nx = EP[i + 1];
    setTop('第' + e.no + '話 ' + e.title, 'toc');
    bottom.className = 'bottom ep';
    var mk = markOf(e.no);
    bottom.innerHTML =
      '<a class="nb wide" href="' + (pv ? '#/ep/' + pv.no : '#') + '"' + (pv ? '' : ' aria-disabled="true"') + '>' + I.prev + '<span>前の話</span></a>' +
      '<a class="nb" href="#/toc">' + I.menu + '<span>目次</span></a>' +
      '<button type="button" class="nb' + (mk ? ' on' : '') + '" data-act="mark" aria-pressed="' + (mk ? 'true' : 'false') + '">' + (mk ? I.bookmarkOn : I.bookmark) + '<span>しおり</span></button>' +
      '<a class="nb wide primary" href="' + (nx ? '#/ep/' + nx.no : '#/toc') + '" data-act="next"><span>' + (nx ? '次の話' : '目次へ') + '</span>' + I.next + '</a>';
    setView(episodeHtml(e, false));
    fitTables();
    curNo = e.no;
    S.set('last', e.no);

    // 位置の復元
    var pos = null;
    if (params.pos != null) pos = parseFloat(params.pos);
    else if (params.resume) pos = (S.get('pos', {})[e.no]) || 0;
    if (y != null) { restoreTo(y); requestAnimationFrame(updateBar); }
    else if (pos) requestAnimationFrame(function () { scrollToRatio(pos); updateBar(); });
    else window.scrollTo(0, 0);
    if (params.q && y == null) highlight(params.q);
    else if (params.q) highlight(params.q, true);

    // 読了・位置の保存
    var end = document.getElementById('ep-end');
    var io = null;
    var armed = false;
    setTimeout(function () {
      armed = true;
      // 開いてすぐ末尾にいる（続きから・しおりで末尾付近に来た）場合も読了にする
      if (curNo === e.no && end.getBoundingClientRect().top < window.innerHeight) reachEnd();
    }, 800);
    function reachEnd() {
      if (!armed || isRead(e.no)) return;
      setRead(e.no, true);
      var dl = end.querySelector('.done-line');
      if (dl) dl.innerHTML = I.checkOn + '<span>読了にしました</span>';
      var tb = end.querySelector('[data-act="toggle-read"]');
      if (tb) tb.textContent = '未読に戻す';
    }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) reachEnd(); });
      });
      io.observe(end);
    }
    var t = null;
    function onScroll() {
      updateBar();
      if (t) return;
      t = setTimeout(function () {
        t = null;
        var r = scrollRatio();
        var p = S.get('pos', {});
        p[e.no] = Math.round(r * 1000) / 1000;
        S.set('pos', p);
        if (!io && r > 0.97) reachEnd();
      }, 300);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanup = function () {
      window.removeEventListener('scroll', onScroll);
      if (io) io.disconnect();
      curNo = null;
    };
  }
  // 表の「折り返さない列」（番号・金額など）が画面幅に収まらないときだけ、折り返しを許す
  function fitTables() {
    Array.prototype.forEach.call(view.querySelectorAll('.table-wrap'), function (w) {
      var cs = w.querySelectorAll('td.nw, td.nw-off');
      if (!cs.length) return;
      Array.prototype.forEach.call(cs, function (c) { c.classList.add('nw'); c.classList.remove('nw-off'); });
      if (w.scrollWidth > w.clientWidth + 1) Array.prototype.forEach.call(cs, function (c) { c.classList.remove('nw'); c.classList.add('nw-off'); });
    });
  }
  var rsT;
  window.addEventListener('resize', function () { clearTimeout(rsT); rsT = setTimeout(fitTables, 150); });
  function updateBar() { readbar.style.width = (scrollRatio() * 100) + '%'; }

  function highlight(q, noScroll) {
    var nq = norm(q);
    if (!nq) return;
    var art = view.querySelector('.ep');
    var w = document.createTreeWalker(art, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      var k = norm(n.nodeValue).indexOf(nq);
      if (k >= 0 && n.nodeValue.length === norm(n.nodeValue).length) {
        var r = document.createRange();
        r.setStart(n, k);
        r.setEnd(n, k + q.length);
        var m = document.createElement('mark');
        r.surroundContents(m);
        if (!noScroll) setTimeout(function () { m.scrollIntoView({ block: 'center' }); }, 50);
        return;
      }
    }
  }

  function glossary(params, y) {
    setTop('用語集', 'toc');
    navTabs('glossary');
    var G = D.glossary;
    var groups = [];
    var map = {};
    G.forEach(function (g) {
      if (!map[g.group]) { map[g.group] = []; groups.push(g.group); }
      map[g.group].push(g);
    });
    var h = '<h1 class="pg-h">用語集</h1><p class="muted" style="font-size:14px;margin:0 0 4px">本文中の点線の語をタップしても説明が出ます。全' + G.length + '語。</p>';
    if (groups.length > 1) {
      h += '<div class="g-index">' + groups.map(function (g, i) { return '<button type="button" data-act="gjump" data-g="' + i + '">' + esc(g) + '</button>'; }).join('') + '</div>';
    }
    groups.forEach(function (g, i) {
      h += '<section class="g-group"><h2 id="g-' + i + '">' + esc(g) + '</h2><dl class="g-list">';
      map[g].forEach(function (it) {
        h += '<div class="g-item" data-term="' + esc(it.term) + '"><dt>' + esc(it.term) + (it.reading ? '<small>' + esc(it.reading) + '</small>' : '') + '</dt><dd>' + it.html + '</dd></div>';
      });
      h += '</dl></section>';
    });
    if (!G.length) h += '<p class="empty">用語集はまだありません。</p>';
    setView(h);
    if (y != null) { restoreTo(y); return; }
    window.scrollTo(0, 0);
    if (params.t) {
      var items = view.querySelectorAll('.g-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-term') === params.t) {
          var el = items[i];
          el.scrollIntoView({ block: 'center' });
          el.classList.add('flash');
          setTimeout(function () { el.classList.remove('flash'); }, 1600);
          break;
        }
      }
    }
  }

  // 検索用の本文テキスト（出典・ラベル類を除く）。データを軽くするため端末側で html から作る
  function epText(e) {
    if (e._t == null) {
      e._t = String(e.html)
        .replace(/<aside class="blk blk-source"[\s\S]*?<\/aside>/g, '')
        .replace(/<div class="blk-h">[\s\S]*?<\/div>/g, ' ')
        .replace(/<span class="(badge|mk|exl|qno)">[\s\S]*?<\/span>/g, ' ')
        .replace(/<button type="button" class="quiz-retry">[\s\S]*?<\/button>/g, ' ')
        .replace(/<\/?(p|li|h[1-6]|td|th|tr|div|section|aside|figure|button|ul|ol|br)\b[^>]*>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return e._t;
  }
  // 正規化後の位置 → 元の文字列の位置。抜粋は元の表記（大文字・全角など）のまま見せる
  function normMap(text) {
    var nt = '';
    var map = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code >= 0xD800 && code < 0xDC00 && i + 1 < text.length) c = text.substr(i, 2);
      var n = norm(c);
      for (var j = 0; j < n.length; j++) { nt += n.charAt(j); map.push(i); }
      i += c.length - 1;
    }
    map.push(text.length);
    return { nt: nt, map: map };
  }
  function snippet(e, nq, len) {
    if (!e._nm) e._nm = normMap(epText(e));
    var text = epText(e);
    var nt = e._nm.nt;
    var mp = e._nm.map;
    var out = [];
    var from = 0;
    for (var c = 0; c < 2; c++) {
      var k = nt.indexOf(nq, from);
      if (k < 0) break;
      var s = Math.max(from, k - len);
      var e2 = Math.min(nt.length, k + nq.length + len);
      var os = mp[s], ok = mp[k], ok2 = mp[k + nq.length], oe = mp[e2];
      out.push((os > 0 ? '…' : '') + esc(text.slice(os, ok)) + '<mark>' + esc(text.slice(ok, ok2)) + '</mark>' + esc(text.slice(ok2, oe)) + (oe < text.length ? '…' : ''));
      from = e2;
    }
    return out;
  }
  function countHits(nt, nq) {
    var n = 0, k = 0;
    while ((k = nt.indexOf(nq, k)) >= 0) { n++; k += nq.length; }
    return n;
  }
  function search(params, y) {
    setTop('検索', 'toc');
    navTabs('search');
    setView('<div class="search-box"><label>' + I.search + '<input id="q" type="search" enterkeyhint="search" placeholder="言葉で探す（例: 複利）" autocomplete="off" aria-label="検索語"></label></div><div id="results"></div>');
    window.scrollTo(0, 0);
    var input = document.getElementById('q');
    var res = document.getElementById('results');
    input.value = params.q || '';
    var t;
    function run() {
      var q = input.value.trim();
      try { history.replaceState(history.state, '', '#/search' + (q ? '?q=' + encodeURIComponent(q) : '')); } catch (e) { /* ignore */ }
      if (!q) { res.innerHTML = '<p class="empty">本文と用語集から探せます。</p>'; return; }
      var nq = norm(q);
      var eh = [];
      EP.forEach(function (e) {
        var nt = norm(e.title + ' ' + e.subtitle + ' ' + epText(e));
        var c = countHits(nt, nq);
        if (c) eh.push({ e: e, c: c, sn: snippet(e, nq, 24) });
      });
      var gh = D.glossary.filter(function (g) { return norm(g.term + ' ' + g.reading + ' ' + g.text).indexOf(nq) >= 0; });
      var h = '<p class="s-count">' + eh.length + '話・用語' + gh.length + '件が見つかりました</p>';
      if (gh.length) {
        h += '<div class="s-sec">用語集</div>';
        gh.forEach(function (g) {
          h += '<a class="s-hit" href="#/glossary?t=' + encodeURIComponent(g.term) + '"><b>' + esc(g.term) + '</b><p>' + esc(g.text) + '</p></a>';
        });
      }
      if (eh.length) {
        h += '<div class="s-sec">本文</div>';
        eh.forEach(function (x) {
          h += '<a class="s-hit" href="#/ep/' + x.e.no + '?q=' + encodeURIComponent(q) + '"><b>第' + x.e.no + '話 ' + esc(x.e.title) + '</b><small>' + x.c + '件</small>' +
            x.sn.map(function (s) { return '<p>' + s + '</p>'; }).join('') + '</a>';
        });
      }
      if (!eh.length && !gh.length) h = '<p class="empty">「' + esc(q) + '」は見つかりませんでした。</p>';
      res.innerHTML = h;
    }
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 150); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') input.blur(); });
    run();
    if (y != null) restoreTo(y);
    if (!params.q) setTimeout(function () { try { input.focus(); } catch (e) { /* ignore */ } }, 50);
  }

  // ------------------------------------------------ print mode（?print=1）
  function printAll() {
    root.classList.add('print-mode');
    top.innerHTML = '';
    bottom.innerHTML = '';
    var mins = EP.reduce(function (a, e) { return a + (e.minutes || 0); }, 0);
    var h = '<section class="pr-cover"><p class="muted">' + esc(D.book.audience) + '</p><h1>' + esc(D.book.title) + '</h1><p class="muted">' + esc(D.book.subtitle) + '</p><p class="muted" style="font-size:.85em">全' + EP.length + '話・合計 約' + mins + '分</p></section>';
    h += '<section class="pr-sec pr-toc"><h2>目次</h2>';
    var cur = null;
    EP.forEach(function (e) {
      if (e.part !== cur) {
        if (cur !== null) h += '</ol>';
        cur = e.part;
        h += '<h3>' + esc(partName(e.part)) + '</h3><ol>';
      }
      h += '<li><span class="n">第' + e.no + '話</span><span>' + esc(e.title) + '</span><span class="m">約' + e.minutes + '分</span></li>';
    });
    if (cur !== null) h += '</ol>';
    h += '</section>';
    EP.forEach(function (e) { h += episodeHtml(e, true); });
    if (D.glossary.length) {
      h += '<section class="pr-gloss"><h2>用語集</h2><dl>';
      D.glossary.forEach(function (g) {
        h += '<div class="g-item"><dt>' + esc(g.term) + (g.reading ? '<small>' + esc(g.reading) + '</small>' : '') + '</dt><dd>' + g.html + '</dd></div>';
      });
      h += '</dl></section>';
    }
    view.innerHTML = h;
    Array.prototype.forEach.call(view.querySelectorAll('.quiz-item'), function (q) { q.classList.add('done'); });
    window.__printReady = true;
  }

  // ------------------------------------------------ 戻る・進むでのスクロール位置
  // 履歴の1件ごとに鍵をつけ、離れるときの位置を覚えておく。戻る/進むで来たときだけ復元し、
  // リンクで新しく開いたページは先頭（話は「続きから」の位置）から表示する。
  var scrollMem = {};
  try { scrollMem = JSON.parse(window.sessionStorage.getItem('ib:scroll') || '{}') || {}; } catch (e) { scrollMem = {}; }
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
  var curKey = null;
  var prevView = null;
  var curView = null;
  function saveScroll() {
    if (curKey) scrollMem[curKey] = Math.round(window.scrollY);
    try { window.sessionStorage.setItem('ib:scroll', JSON.stringify(scrollMem)); } catch (e) { /* ignore */ }
  }
  function entryKey() {
    var st = history.state;
    if (st && st.k) {
      if (st.sheet) { try { history.replaceState({ k: st.k }, '', location.href); } catch (e) { /* ignore */ } }
      return st.k;
    }
    var k = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { history.replaceState({ k: k }, '', location.href); } catch (e) { /* ignore */ }
    return k;
  }
  function restoreTo(y) {
    window.scrollTo(0, y);
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }
  window.addEventListener('pagehide', saveScroll);

  // ------------------------------------------------ router
  function route() {
    if (curKey) scrollMem[curKey] = Math.round(window.scrollY);
    closeSheet(true);
    document.getElementById('toast').classList.remove('show');
    var st = history.state;
    var back = !!(st && st.k && scrollMem[st.k] != null);
    curKey = entryKey();
    var y = back ? scrollMem[curKey] : null;
    var r = parseHash();
    var p = r.parts;
    prevView = curView;
    curView = { name: p[0] || 'cover', no: p[0] === 'ep' ? parseInt(p[1], 10) : null };
    if (!p.length) cover(y);
    else if (p[0] === 'toc') toc(y);
    else if (p[0] === 'ep') episode(parseInt(p[1], 10), r.params, y);
    else if (p[0] === 'glossary') glossary(r.params, y);
    else if (p[0] === 'search') search(r.params, y);
    else cover(y);
    try { window.sessionStorage.setItem('ib:scroll', JSON.stringify(scrollMem)); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------ term sheet
  var sheet = document.getElementById('sheet');
  var lastFocus = null;
  function openSheet(term) {
    var g = null;
    for (var i = 0; i < D.glossary.length; i++) if (D.glossary[i].term === term) { g = D.glossary[i]; break; }
    if (!g) return;
    lastFocus = document.activeElement;
    document.getElementById('sheet-title').innerHTML = esc(g.term) + (g.reading ? '<small>' + esc(g.reading) + '</small>' : '');
    document.getElementById('sheet-body').innerHTML = g.html;
    document.getElementById('sheet-more').setAttribute('href', '#/glossary?t=' + encodeURIComponent(g.term));
    sheet.hidden = false;
    // スマホの「戻る」で説明だけを閉じられるよう、履歴を1件積む
    try { history.pushState({ k: curKey, sheet: 1 }, '', location.href); } catch (e) { /* ignore */ }
    var c = sheet.querySelector('.sheet [data-act="sheet-close"]');
    if (c) c.focus({ preventScroll: true });
  }
  function hideSheet(silent) {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (sheet.hidden) return;
    if (!silent && history.state && history.state.sheet) { history.back(); return; }
    hideSheet(silent);
  }
  window.addEventListener('popstate', function () {
    if (!sheet.hidden && !(history.state && history.state.sheet)) hideSheet(false);
  });

  // ------------------------------------------------ events
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act], .term, .choice, .quiz-retry');
    if (!el) return;
    if (el.classList.contains('term')) { openSheet(el.getAttribute('data-term')); return; }
    if (el.classList.contains('choice')) {
      var qi = el.closest('.quiz-item');
      if (qi.classList.contains('done')) return;
      el.classList.add('picked');
      qi.classList.add('done');
      var ok = el.hasAttribute('data-c');
      var v = qi.querySelector('.verdict');
      if (ok) { v.className = 'verdict ok'; v.textContent = '正解です。'; }
      else {
        var right = qi.querySelector('.choice[data-c] .mk');
        v.className = 'verdict ng';
        v.textContent = right ? '残念、正解は ' + right.textContent + ' です。' : 'この問題には正解が設定されていません。';
      }
      // 解説が下のナビに隠れないよう、必要なときだけ少し送る
      var ex = qi.querySelector('.quiz-ex');
      if (ex) requestAnimationFrame(function () { ex.scrollIntoView({ block: 'nearest', behavior: SMOOTH }); });
      return;
    }
    if (el.classList.contains('quiz-retry')) {
      var q2 = el.closest('.quiz-item');
      q2.classList.remove('done');
      Array.prototype.forEach.call(q2.querySelectorAll('.picked'), function (c) { c.classList.remove('picked'); });
      // 解説が消えて問題文が上へ外れたら、問題の頭に戻す
      if (q2.getBoundingClientRect().top < 60) q2.scrollIntoView({ block: 'start' });
      var first = q2.querySelector('.choice');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    var act = el.getAttribute('data-act');
    if (act === 'font') cycleFont();
    else if (act === 'theme') cycleTheme();
    else if (act === 'sheet-close') closeSheet();
    else if (act === 'next') { if (curNo != null) setRead(curNo, true); }
    else if (act === 'gjump') {
      var tg = document.getElementById('g-' + el.getAttribute('data-g'));
      if (tg) tg.scrollIntoView({ block: 'start' });
    } else if (act === 'toggle-read' && curNo != null) {
      var nv = !isRead(curNo);
      setRead(curNo, nv);
      el.textContent = nv ? '未読に戻す' : '読了にする';
      var dl = document.querySelector('#ep-end .done-line');
      if (dl) dl.innerHTML = nv ? I.checkOn + '<span>この話は読了済みです</span>' : I.check + '<span>未読に戻しました</span>';
      toast(nv ? '読了にしました' : '未読に戻しました');
    } else if (act === 'mark' && curNo != null) {
      var m = marks().filter(function (x) { return x.no !== curNo; });
      var on = !markOf(curNo);
      if (on) m.unshift({ no: curNo, pos: Math.round(scrollRatio() * 1000) / 1000, t: Date.now() });
      S.set('marks', m);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.innerHTML = (on ? I.bookmarkOn : I.bookmark) + '<span>しおり</span>';
      toast(on ? 'この位置にしおりを挟みました' : 'しおりを外しました');
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeSheet();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('term')) {
      ev.preventDefault();
      openSheet(ev.target.getAttribute('data-term'));
    }
  });
  // 用語集の「用語集で見る」で同じハッシュでも閉じる
  // 説明用に積んだ履歴を用語集で置き換える（用語集から「戻る」で本文に一度で戻れる）
  document.getElementById('sheet-more').addEventListener('click', function (ev) {
    var href = this.getAttribute('href');
    if (history.state && history.state.sheet) {
      ev.preventDefault();
      hideSheet(true);
      location.replace(href);
    } else hideSheet(true);
  });

  // ------------------------------------------------ start
  applySettings();
  if (/[?&]print=1(&|$)/.test(location.search)) {
    printAll();
  } else {
    window.addEventListener('hashchange', route);
    route();
  }
})();
