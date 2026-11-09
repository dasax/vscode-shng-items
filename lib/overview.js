'use strict';
// Tabellarische Übersicht aller Items als Webview (filter- und sortierbar)

const vscode = require('vscode');
const { fmtValue, basename, knxSummary } = require('./present');
const { attrCategories } = require('./categories');

let panel = null;

function rows(model) {
    if (!model) return [];
    const cats = attrCategories(model, vscode.workspace.getConfiguration('shngItems').get('categories'));
    return [...model.nodes()].map(n => {
        const d = n.mainDef;
        return {
            p: n.path,
            n: fmtValue(n.attr('name')),
            t: n.attr('type') || '',
            s: n.attrs.get('struct') && !n.attrs.get('struct').origin ? fmtValue(n.attr('struct')) : '',
            k: knxSummary(n),
            e: n.attrs.has('eval') ? 1 : 0,
            v: n.fromStruct || '',
            f: d ? `${basename(d.uri)}:${d.line + 1}` : '',
            a: [...n.attrs].map(([k, a]) => [k, fmtValue(a.value), a.origin || '']),
            c: cats.filter(c => c.test(n)).map(c => c.name),
        };
    });
}

function show(context, getModel, onOpen) {
    if (panel) {
        panel.reveal();
        update(getModel());
        return;
    }
    panel = vscode.window.createWebviewPanel('shngItems.overview', 'SmartHomeNG Items', vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');
    panel.webview.html = html(panel.webview, rows(getModel()));
    panel.webview.onDidReceiveMessage(msg => {
        if (msg.cmd === 'open') onOpen(msg.path);
    }, null, context.subscriptions);
    panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
}

function update(model) {
    if (panel) panel.webview.postMessage({ cmd: 'data', rows: rows(model) });
}

function html(webview, data) {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return /* html */ `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 12px 24px; }
  .bar { position: sticky; top: 0; z-index: 2; background: var(--vscode-editor-background); display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  input[type=search], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; border-radius: 2px; }
  input[type=search] { flex: 1 1 260px; min-width: 180px; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
  label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .count { opacity: .7; margin-left: auto; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th { text-align: left; cursor: pointer; user-select: none; position: sticky; top: 49px; background: var(--vscode-editor-background); padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap; }
  th.sorted::after { content: ' ▲'; opacity: .6; } th.sorted.desc::after { content: ' ▼'; }
  td { padding: 3px 8px; vertical-align: top; border-bottom: 1px solid var(--vscode-editorWidget-border, transparent); }
  tr.item:hover { background: var(--vscode-list-hoverBackground); }
  td.path { font-family: var(--vscode-editor-font-family); white-space: nowrap; }
  td.path a { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
  td.path a:hover { text-decoration: underline; }
  .tog { cursor: pointer; display: inline-block; width: 14px; opacity: .7; }
  .struct { color: var(--vscode-charts-purple); }
  .dim { opacity: .65; }
  .type { display: inline-block; padding: 0 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
  .knx { font-family: var(--vscode-editor-font-family); white-space: nowrap; }
  tr.detail td { background: var(--vscode-textCodeBlock-background); }
  tr.detail table { margin: 0; } tr.detail td td { border: none; padding: 1px 8px; font-family: var(--vscode-editor-font-family); }
  tr.detail td td:first-child { white-space: nowrap; color: var(--vscode-symbolIcon-propertyForeground, inherit); }
</style>
</head>
<body>
<div class="bar">
  <input id="q" type="search" placeholder="Filter: Pfad, Attribut, Wert, Gruppenadresse … (mehrere Begriffe = UND)">
  <select id="type"><option value="">alle Typen</option></select>
  <select id="cat"><option value="">alle Kategorien</option></select>
  <label><input id="nostruct" type="checkbox"> Struct-Items ausblenden</label>
  <span class="count" id="count"></span>
</div>
<table>
  <thead><tr>
    <th data-k="p">Item</th><th data-k="t">Typ</th><th data-k="k">KNX</th><th data-k="s">Struct</th><th data-k="n">Name</th><th data-k="f">Datei</th>
  </tr></thead>
  <tbody id="body"></tbody>
</table>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let DATA = ${json};
  const st = Object.assign({ q: '', type: '', cat: '', nostruct: false, sort: 'p', desc: false }, vscode.getState() || {});
  const open = new Set();
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MAX = 3000;

  function fillTypes() {
    const types = [...new Set(DATA.map(r => r.t || '(ohne)'))].sort();
    $('type').innerHTML = '<option value="">alle Typen</option>' + types.map(t => '<option>' + esc(t) + '</option>').join('');
    $('type').value = st.type;
    const counts = {};
    DATA.forEach(r => r.c.forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
    $('cat').innerHTML = '<option value="">alle Kategorien</option>'
      + Object.keys(counts).map(c => '<option value="' + esc(c) + '">' + esc(c) + ' (' + counts[c] + ')</option>').join('');
    $('cat').value = st.cat;
  }

  function render() {
    vscode.setState(st);
    const terms = st.q.toLowerCase().split(/\\s+/).filter(Boolean);
    let rows = DATA.filter(r => {
      if (st.type && (r.t || '(ohne)') !== st.type) return false;
      if (st.cat && !r.c.includes(st.cat)) return false;
      if (st.nostruct && r.v) return false;
      if (!terms.length) return true;
      if (!r._h) r._h = (r.p + '\\n' + r.n + '\\n' + r.a.map(a => a[0] + ': ' + a[1]).join('\\n')).toLowerCase();
      return terms.every(t => r._h.includes(t));
    });
    const k = st.sort, dir = st.desc ? -1 : 1;
    rows.sort((a, b) => String(a[k]).localeCompare(String(b[k]), 'de', { numeric: true }) * dir || a.p.localeCompare(b.p));
    $('count').textContent = rows.length + ' / ' + DATA.length + ' Items' + (rows.length > MAX ? ' (erste ' + MAX + ' angezeigt)' : '');
    const out = [];
    for (const r of rows.slice(0, MAX)) {
      const isOpen = open.has(r.p);
      out.push('<tr class="item">'
        + '<td class="path"><span class="tog" data-t="' + esc(r.p) + '">' + (isOpen ? '▾' : '▸') + '</span>'
        + '<a data-p="' + esc(r.p) + '" class="' + (r.v ? 'struct' : '') + '">' + esc(r.p) + '</a></td>'
        + '<td>' + (r.t ? '<span class="type">' + esc(r.t) + '</span>' : '') + (r.e ? ' ƒ' : '') + '</td>'
        + '<td class="knx">' + esc(r.k) + '</td>'
        + '<td>' + esc(r.s) + (r.v ? '<span class="struct dim">' + (r.s ? ' · ' : '') + 'aus ' + esc(r.v) + '</span>' : '') + '</td>'
        + '<td>' + esc(r.n) + '</td>'
        + '<td class="dim">' + esc(r.f) + '</td></tr>');
      if (isOpen) {
        out.push('<tr class="detail"><td colspan="6"><table>'
          + (r.a.length ? r.a.map(a => '<tr><td>' + esc(a[0]) + '</td><td>' + esc(a[1]) + '</td><td class="struct dim">' + esc(a[2]) + '</td></tr>').join('') : '<tr><td class="dim">keine Attribute</td></tr>')
          + '</table></td></tr>');
      }
    }
    $('body').innerHTML = out.join('');
    document.querySelectorAll('th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.k === st.sort);
      th.classList.toggle('desc', th.dataset.k === st.sort && st.desc);
    });
  }

  $('q').value = st.q; $('nostruct').checked = st.nostruct;
  $('q').addEventListener('input', e => { st.q = e.target.value; render(); });
  $('type').addEventListener('change', e => { st.type = e.target.value; render(); });
  $('cat').addEventListener('change', e => { st.cat = e.target.value; render(); });
  $('nostruct').addEventListener('change', e => { st.nostruct = e.target.checked; render(); });
  document.querySelector('thead').addEventListener('click', e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    if (st.sort === k) st.desc = !st.desc; else { st.sort = k; st.desc = false; }
    render();
  });
  $('body').addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.p) vscode.postMessage({ cmd: 'open', path: t.dataset.p });
    else if (t.dataset.t) { open.has(t.dataset.t) ? open.delete(t.dataset.t) : open.add(t.dataset.t); render(); }
  });
  window.addEventListener('message', e => {
    if (e.data.cmd === 'data') { DATA = e.data.rows; fillTypes(); render(); }
  });
  fillTypes();
  render();
  $('q').focus();
</script>
</body>
</html>`;
}

module.exports = { show, update };
