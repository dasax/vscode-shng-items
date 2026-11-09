'use strict';
// Suche & Filter (Webview-Ansicht oberhalb des Item-Baums).
// Die Item-Liste wird einmal an die Webview geschickt; gesucht wird dort bei jedem Tastendruck.
// Die Kategorie-Chips unter dem Suchfeld filtern sowohl die Trefferliste als auch den Item-Baum.

const vscode = require('vscode');
const { describe, fmtValue } = require('./present');

function nonce() {
    let s = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

function itemData(model, cats) {
    if (!model) return [];
    const list = [];
    for (const node of model.nodes()) {
        const attrs = [];
        for (const [k, a] of node.attrs) attrs.push(`${k}: ${fmtValue(a.value)}`.replace(/\s+/g, ' '));
        const c = [];
        cats.forEach((cat, i) => { if (cat.test(node)) c.push(i); });
        list.push({
            p: node.path,
            n: fmtValue(node.attr('name') || ''),
            d: describe(node),
            a: attrs.join('\n'),
            s: node.fromStruct ? 1 : 0,
            c,
        });
    }
    return list;
}

class SearchView {
    // categories: CategoryTree (Kategorien, Zähler, Auswahl)
    // onPick(path): Treffer öffnen
    constructor(getModel, categories, onPick) {
        this.getModel = getModel;
        this.categories = categories;
        this.onPick = onPick;
        this.view = null;
        this.pendingFocus = false;
    }

    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.html();
        view.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'ready') {
                this.update();
                if (this.pendingFocus) this.focus();
            } else if (msg.type === 'pick') this.onPick(msg.path);
        });
        view.onDidDispose(() => { this.view = null; });
    }

    focus() {
        if (this.view) {
            this.pendingFocus = false;
            this.view.show(false);
            this.view.webview.postMessage({ type: 'focus' });
        } else {
            this.pendingFocus = true;
            vscode.commands.executeCommand('shngItems.search.focus');
        }
    }

    catState() {
        return { cats: this.categories.describe(), selected: [...this.categories.selected] };
    }

    // komplette Item-Liste (nach Neuladen oder geänderter Kategorien-Konfiguration)
    update() {
        if (!this.view) return;
        this.view.webview.postMessage({ type: 'items', items: itemData(this.getModel(), this.categories.categories), ...this.catState() });
    }

    // nur die Kategorie-Auswahl (z.B. von außen zurückgesetzt)
    updateCategories() {
        if (this.view) this.view.webview.postMessage({ type: 'cats', ...this.catState() });
    }

    html() {
        const n = nonce();
        return /* html */ `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${n}">
  body { padding: 0 0 4px 0; margin: 0; color: var(--vscode-foreground); font-size: var(--vscode-font-size); font-family: var(--vscode-font-family); }
  .bar { position: sticky; top: 0; padding: 6px 8px 4px; background: var(--vscode-sideBar-background); z-index: 1; }
  .qwrap { position: relative; }
  input { width: 100%; box-sizing: border-box; padding: 4px 24px 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; outline: none; font: inherit; }
  input:focus { border-color: var(--vscode-focusBorder); }
  .x { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; padding: 0; line-height: 16px;
       border: none; border-radius: 3px; background: transparent; color: var(--vscode-input-foreground); opacity: 0.7; cursor: pointer; font: inherit; }
  .x:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
  .x[hidden] { display: none; }
  .info { padding: 4px 2px 0; font-size: 0.9em; color: var(--vscode-descriptionForeground); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 2px 8px 2px 10px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.35; }
  li:hover { background: var(--vscode-list-hoverBackground); }
  li.sel { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  li.sep { cursor: default; margin: 4px 8px 2px; padding: 3px 0 1px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-descriptionForeground));
           font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  li.sep:hover { background: none; }
  li.out:not(.sel) { opacity: 0.6; }
  .path.struct { color: var(--vscode-charts-purple); }
  .desc { margin-left: 6px; font-size: 0.9em; opacity: 0.75; }
  .sub { display: block; padding-left: 12px; font-size: 0.85em; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; }
  mark { background: var(--vscode-editor-findMatchHighlightBackground); color: inherit; border-radius: 2px; }
</style></head>
<body>
<div class="bar">
  <div class="qwrap">
    <input id="q" type="text" placeholder="Item suchen … (z.B. bad licht, baddim, 1/1/12)" spellcheck="false" autocomplete="off">
    <button class="x" id="x" title="Suche leeren (Esc)" hidden>✕</button>
  </div>
  <div class="info" id="info"></div>
</div>
<ul id="list"></ul>
<script nonce="${n}">
(function () {
  const vscode = acquireVsCodeApi();
  const q = document.getElementById('q');
  const x = document.getElementById('x');
  const list = document.getElementById('list');
  const info = document.getElementById('info');

  const state = vscode.getState() || {};
  q.value = state.q || '';
  const LIMIT = 200;
  let items = [];
  let cats = [];              // [{name, count}]
  let selected = new Set();   // Namen der aktiven Kategorien
  let results = [];           // [{it, r, lv, pm, frags, wstarts}] – erst Treffer im Filter, dann ausgeblendete
  let shownIn = 0;            // Anzahl der angezeigten Treffer im Filter (Position des Trennstrichs)
  let hidden = 0;             // Anzahl der durch den Filter ausgeblendeten Treffer
  let sel = 0;
  let prev = { terms: null, pool: null };

  function esc(s) {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Wortanfänge im Pfad: Anfang, nach . _ - / Leerzeichen, camelCase-Großbuchstabe, Wechsel Buchstabe/Ziffer
  function wordStarts(p) {
    const kind = ch => ch >= '0' && ch <= '9' ? 'd' : (ch.toLowerCase() !== ch.toUpperCase() ? 'a' : '');
    const ws = new Uint8Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const k = kind(p[i]);
      if (!k) continue;
      if (i === 0) { ws[i] = 1; continue; }
      const pc = p[i - 1], pk = kind(pc);
      if (pk !== k) ws[i] = 1;
      else if (k === 'a' && p[i] !== p[i].toLowerCase() && pc === pc.toLowerCase()) ws[i] = 1;
    }
    return ws;
  }

  // Muster-Suche: Buchstaben des Begriffs in Reihenfolge im Pfad finden (Lücken erlaubt).
  // Gewählt wird die Zuordnung mit den wenigsten zusammenhängenden Fragmenten,
  // bei Gleichstand die mit den meisten Fragmenten an einem Wortanfang.
  // Ergebnis: { f: Fragmente, w: Fragmente am Wortanfang, marks: [[von, bis], …] } oder null
  const BIG = 1e9;
  function fuzzy(t, s, ws) {
    const m = t.length, n = s.length;
    if (m > n) return null;
    // f[i][j]: t[0..i) zugeordnet, t[i-1] liegt auf s[j-1]; g[i][j] = bestes f[i][1..j]
    // Kosten = Fragmente * 1000 - Wortanfänge
    const f = [], g = [], fFrom = [], gArg = [];
    for (let i = 0; i <= m; i++) {
      f.push(new Float64Array(n + 1).fill(BIG)); g.push(new Float64Array(n + 1).fill(i ? BIG : 0));
      fFrom.push(new Int32Array(n + 1)); gArg.push(new Int32Array(n + 1));
    }
    for (let i = 1; i <= m; i++) {
      const c = t.charCodeAt(i - 1);
      for (let j = i; j <= n; j++) {
        if (s.charCodeAt(j - 1) === c) {
          // neues Fragment ab s[j-1]
          let best = (i === 1 ? 0 : g[i - 1][j - 1]) + 1000 - ws[j - 1], from = i === 1 ? 0 : gArg[i - 1][j - 1];
          // oder das vorige Fragment fortsetzen
          if (i > 1 && f[i - 1][j - 1] <= best) { best = f[i - 1][j - 1]; from = -1; }
          if (best < BIG / 2) { f[i][j] = best; fFrom[i][j] = from; }
        }
        if (f[i][j] < g[i][j - 1]) { g[i][j] = f[i][j]; gArg[i][j] = j; }
        else { g[i][j] = g[i][j - 1]; gArg[i][j] = gArg[i][j - 1]; }
      }
    }
    if (g[m][n] >= BIG / 2) return null;
    // Zuordnung zurückverfolgen
    const pos = [];
    let j = gArg[m][n];
    for (let i = m; i >= 1; i--) {
      pos.push(j - 1);
      const from = fFrom[i][j];
      j = from === -1 ? j - 1 : from;
    }
    pos.reverse();
    const marks = [];
    for (const p of pos) {
      const last = marks[marks.length - 1];
      if (last && last[1] === p) last[1] = p + 1; else marks.push([p, p + 1]);
    }
    let w = 0;
    for (const mk of marks) w += ws[mk[0]];
    return { f: marks.length, w, marks };
  }

  function substrMarks(lower, terms) {
    const marks = [];
    for (const t of terms) {
      let i = lower.indexOf(t);
      while (i >= 0) { marks.push([i, i + t.length]); i = lower.indexOf(t, i + t.length); }
    }
    return marks;
  }

  function highlight(text, marks) {
    if (!marks.length) return esc(text);
    marks = marks.slice().sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [s, e] of marks) {
      if (e <= pos) continue;
      const st = Math.max(s, pos);
      out += esc(text.slice(pos, st)) + '<mark>' + esc(text.slice(st, e)) + '</mark>';
      pos = e;
    }
    return out + esc(text.slice(pos));
  }

  // je Begriff: 0 = im Pfad (ggf. als Muster), 1 = im Namen, 2 = nur in Attributen
  // Sortierung (für Treffer im Filter und ausgeblendete gleich): reale vor Struct-Items, Stufe, wenige Fragmente,
  // viele Fragmente am Wortanfang, kürzerer Pfad, alphabetisch
  function match(it, terms) {
    const lv = [];
    let pm = [], frags = 0, wstarts = 0;
    for (const t of terms) {
      const z = fuzzy(t, it._p, it._ws || (it._ws = wordStarts(it.p)));
      if (z) { lv.push(0); pm = pm.concat(z.marks); frags += z.f; wstarts += z.w; continue; }
      if (it._n.includes(t)) { lv.push(1); continue; }
      if (it._h.includes(t)) { lv.push(2); continue; }
      return null;
    }
    return { it, lv, pm, r: Math.max.apply(null, lv), frags, wstarts };
  }

  function cmp(a, b) {
    // nur durch ein Struct erzeugte Items (nicht in items/ erweitert) immer ans Ende
    return a.it.s - b.it.s || a.r - b.r || a.frags - b.frags || b.wstarts - a.wstarts || a.it.p.length - b.it.p.length || (a.it.p < b.it.p ? -1 : a.it.p > b.it.p ? 1 : 0);
  }

  function catOk(it) {
    // Kategorien (KNX, Hue, …) untereinander UND, Typen untereinander ODER, beide Gruppen UND
    if (!selected.size) return true;
    let needAttr = 0, gotAttr = 0, needType = false, gotType = false;
    for (const c of cats) {
      if (!selected.has(c.key)) continue;
      if (c.group === 'type') needType = true; else needAttr++;
    }
    for (const i of it.c) {
      const c = cats[i];
      if (!selected.has(c.key)) continue;
      if (c.group === 'type') gotType = true; else gotAttr++;
    }
    return gotAttr === needAttr && (!needType || gotType);
  }

  function search() {
    const text = q.value.trim().toLowerCase();
    x.hidden = !q.value;
    vscode.setState({ q: q.value });
    if (!text) {
      results = [];
      shownIn = hidden = 0;
      prev = { terms: null, pool: null };
      if (!items.length) info.textContent = 'lade Items …';
      else if (selected.size) info.textContent = items.filter(catOk).length + ' Items im Filter – Begriff eintippen';
      else info.textContent = items.length + ' Items – Begriff eintippen';
      render();
      return;
    }
    const terms = text.split(/ +/);
    // beim Weitertippen nur in den bisherigen Treffern suchen
    const narrowing = prev.terms && prev.pool &&
      terms.length >= prev.terms.length && prev.terms.every((t, i) => terms[i].includes(t));
    const pool = narrowing ? prev.pool : items;
    const inF = [], outF = [];
    for (const it of pool) {
      const m = match(it, terms);
      if (m) (catOk(it) ? inF : outF).push(m);
    }
    prev = { terms, pool: inF.concat(outF).map(m => m.it) };
    inF.sort(cmp);
    outF.sort(cmp);
    hidden = outF.length;
    // ohne Filter steht alles in inF; mit Filter folgen die ausgeblendeten Treffer unter einem Strich
    shownIn = Math.min(inF.length, LIMIT);
    results = inF.slice(0, LIMIT).concat(outF.slice(0, LIMIT));
    sel = 0;
    const cut = n => n > LIMIT ? ' (erste ' + LIMIT + ' angezeigt)' : '';
    if (selected.size) {
      info.textContent = (inF.length ? inF.length + ' Treffer im Filter' + cut(inF.length) : 'keine Treffer im Filter') +
        (outF.length ? ' · ' + outF.length + ' ausgeblendet' : '');
    } else {
      info.textContent = inF.length === 0 ? 'keine Treffer' : inF.length + ' Treffer' + cut(inF.length);
    }
    render(terms);
  }

  function attrLine(m, terms) {
    // erste Attributzeile, die einen Begriff enthält, der weder im Pfad noch im Namen steht
    const missing = terms.filter((t, i) => m.lv[i] === 2);
    if (!missing.length) return '';
    const line = m.it.a.split('\\n').find(l => missing.some(t => l.toLowerCase().includes(t)));
    if (!line) return '';
    const shown = line.length > 160 ? line.slice(0, 159) + '…' : line;
    return '<span class="sub">' + highlight(shown, substrMarks(shown.toLowerCase(), terms)) + '</span>';
  }

  function render(terms) {
    const html = [];
    for (let i = 0; i < results.length; i++) {
      if (i === shownIn && hidden) {
        html.push('<li class="sep">ausgeblendet durch Filter (' + hidden + (hidden > LIMIT ? ', erste ' + LIMIT + ' angezeigt' : '') + ')</li>');
      }
      const m = results[i], it = m.it;
      const title = (it.n ? it.p + ' – ' + it.n : it.p) + (it.s ? ' (lila: durch Struct erzeugt)' : '');
      const cls = [i === sel ? 'sel' : '', i >= shownIn ? 'out' : ''].filter(Boolean).join(' ');
      html.push('<li data-i="' + i + '"' + (cls ? ' class="' + cls + '"' : '') + ' title="' + esc(title) + '">' +
        '<span class="path' + (it.s ? ' struct' : '') + '">' + highlight(it.p, m.pm) + '</span>' +
        (it.d ? '<span class="desc">' + esc(it.d) + '</span>' : '') +
        (it.n ? '<span class="sub">' + highlight(it.n, substrMarks(it._n, terms)) + '</span>' : '') +
        attrLine(m, terms) + '</li>');
    }
    list.innerHTML = html.join('');
  }

  function select(i) {
    const lis = list.querySelectorAll('li[data-i]');
    if (!lis.length) return;
    i = Math.max(0, Math.min(lis.length - 1, i));
    if (lis[sel]) lis[sel].classList.remove('sel');
    sel = i;
    lis[sel].classList.add('sel');
    lis[sel].scrollIntoView({ block: 'nearest' });
  }

  function pick(i) {
    const m = results[i];
    if (m) vscode.postMessage({ type: 'pick', path: m.it.p });
  }

  let timer = null;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, items.length > 5000 ? 60 : 0);
  });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { select(sel + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { select(sel - 1); e.preventDefault(); }
    else if (e.key === 'PageDown') { select(sel + 15); e.preventDefault(); }
    else if (e.key === 'PageUp') { select(sel - 15); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { q.value = ''; search(); }
  });
  x.addEventListener('click', () => {
    q.value = '';
    search();
    q.focus();
  });
  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    select(+li.dataset.i);
    pick(+li.dataset.i);
  });
  // Kategorie-Auswahl kommt aus der Filter-Ansicht (über die Extension)
  function setCats(msg) {
    cats = msg.cats || [];
    selected = new Set(msg.selected || []);
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'items') {
      items = msg.items;
      for (const it of items) {
        it._p = it.p.toLowerCase();
        it._n = it.n.toLowerCase();
        it._h = it._p + '\\n' + it._n + '\\n' + it.a.toLowerCase();
      }
      setCats(msg);
      prev = { terms: null, pool: null };
      search();
    } else if (msg.type === 'cats') {
      const before = [...selected].sort().join('|');
      setCats(msg);
      if ([...selected].sort().join('|') !== before) { prev = { terms: null, pool: null }; search(); }
    } else if (msg.type === 'focus') {
      q.focus();
      q.select();
    }
  });

  vscode.postMessage({ type: 'ready' });
  q.focus();
})();
</script>
</body></html>`;
    }
}

module.exports = { SearchView };
