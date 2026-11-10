'use strict';
// Abschnitt "Filter": Kategorie-Chips (KNX, Hue, 1-Wire, …) und Typ-Chips (bool, num, …).
// Kategorien untereinander UND, Typen untereinander ODER; wirkt auf die Suche und den Item-Baum.

const vscode = require('vscode');
const { strings, language } = require('./i18n');

// Texte für das Skript der Webview (JSON, "<" maskiert)
function scriptStrings(prefix) {
    return JSON.stringify(strings(prefix)).replace(/</g, '\\u003c');
}

function nonce() {
    let s = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

class FilterView {
    // categories: CategoryTree; onChange(): Auswahl wurde hier geändert
    constructor(categories, onChange) {
        this.categories = categories;
        this.onChange = onChange;
        this.view = null;
    }

    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.html();
        view.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'ready') this.update();
            else if (msg.type === 'toggleCat') {
                this.categories.setChecked(msg.key, !this.categories.selected.has(msg.key));
                this.onChange();
            } else if (msg.type === 'clearCats') {
                this.categories.clear();
                this.onChange();
            }
        });
        view.onDidDispose(() => { this.view = null; });
    }

    // Sprache geändert: Webview neu aufbauen (meldet sich danach mit "ready")
    relocalize() {
        if (this.view) this.view.webview.html = this.html();
    }

    update() {
        if (!this.view) return;
        this.view.webview.postMessage({ type: 'cats', cats: this.categories.describe(), selected: [...this.categories.selected] });
    }

    html() {
        const n = nonce();
        return /* html */ `<!DOCTYPE html>
<html lang="${language()}"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${n}">
  body { padding: 6px 8px 4px; margin: 0; color: var(--vscode-foreground); font-size: var(--vscode-font-size); font-family: var(--vscode-font-family); }
  .grp { display: grid; grid-template-columns: 4.6em 1fr; column-gap: 6px; align-items: start; padding: 5px 0; }
  .grp + .grp { border-top: 1px solid var(--vscode-widget-border, var(--vscode-sideBarSectionHeader-border, #8883)); }
  .grp:first-child { padding-top: 0; }
  .lbl { font-size: 0.8em; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em;
         padding-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .foot { display: flex; justify-content: flex-end; padding-top: 2px; }
  .chip { font: inherit; font-size: 0.85em; padding: 1px 6px; border-radius: 9px; cursor: pointer; line-height: 1.4;
          color: var(--vscode-foreground); background: transparent; border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, #8884)); }
  .chip:hover { background: var(--vscode-list-hoverBackground); }
  .chip.on { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .chip.on:hover { background: var(--vscode-button-hoverBackground); }
  .chip .cnt { opacity: 0.7; margin-left: 3px; }
  .chip.clear { border-style: dashed; opacity: 0.85; }
  .chip:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .empty { font-size: 0.9em; color: var(--vscode-descriptionForeground); }
</style></head>
<body>
<div id="cats"></div>
<script nonce="${n}">
(function () {
  const vscode = acquireVsCodeApi();
  const T = ${scriptStrings('filter.')};
  const fmt = (s, ...a) => s.replace(/\\{(\\d+)\\}/g, (m, i) => a[i] !== undefined ? a[i] : m);
  const catsEl = document.getElementById('cats');
  let cats = [];
  let selected = new Set();

  function esc(s) {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  catsEl.innerHTML = '<span class="empty">' + esc(T.loading) + '</span>';

  // what: Text für den Tooltip, z.B. "Nur Items mit {0} zeigen"
  function chips(group, what) {
    const html = [];
    for (const c of cats) {
      if (c.group !== group) continue;
      const on = selected.has(c.key);
      if (!c.count && !on) continue;   // leere Kategorien nur zeigen, wenn aktiv
      html.push('<button class="chip' + (on ? ' on' : '') + '" data-k="' + esc(c.key) + '" title="' +
        esc(fmt(on ? T.remove : what, c.name)) +
        (c.desc ? '\\n' + esc(c.desc) : '') + '">' +
        esc(c.name) + '<span class="cnt">' + c.count + '</span></button>');
    }
    return html.join('');
  }

  function group(label, hint, html) {
    return html ? '<div class="grp" title="' + esc(hint) + '"><span class="lbl">' + esc(label) + '</span><div class="chips">' + html + '</div></div>' : '';
  }

  function render() {
    const html =
      group(T.plugin, T.pluginHint, chips('plugin', T.onlyWith)) +
      group(T.other, T.otherHint, chips('attr', T.onlyWith)) +
      group(T.type, T.typeHint, chips('type', T.onlyType));
    catsEl.innerHTML = (html || '<span class="empty">' + esc(T.none) + '</span>') +
      (selected.size ? '<div class="foot"><button class="chip clear" data-clear="1" title="' + esc(T.clearTitle) + '">' + esc(T.clear) + '</button></div>' : '');
  }

  catsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    // sofort lokal umschalten, die Bestätigung der Extension folgt
    if (b.dataset.clear) { selected.clear(); vscode.postMessage({ type: 'clearCats' }); }
    else {
      const key = b.dataset.k;
      if (selected.has(key)) selected.delete(key); else selected.add(key);
      vscode.postMessage({ type: 'toggleCat', key });
    }
    render();
  });

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'cats') {
      cats = msg.cats || [];
      selected = new Set(msg.selected || []);
      render();
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
</script>
</body></html>`;
    }
}

module.exports = { FilterView };
