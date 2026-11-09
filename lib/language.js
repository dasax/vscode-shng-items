'use strict';
// Hover, "Gehe zu Definition" für Item-Pfade in YAML/Python/HTML und Diagnosen für items/*.yaml

const vscode = require('vscode');
const { itemMarkdown, fmtValue } = require('./present');

const REF_RE = /(?:sh\.)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+/;
const SH_RE = /\bsh\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g;
const SELECTOR = [
    { scheme: 'file', language: 'yaml' },
    { scheme: 'file', language: 'python' },
    { scheme: 'file', language: 'html' },
];

function refAt(getModel, doc, pos) {
    const model = getModel();
    if (!model) return null;
    const range = doc.getWordRangeAtPosition(pos, REF_RE);
    if (!range) return null;
    const node = model.resolveRef(doc.getText(range));
    return node ? { node, range } : null;
}

function registerLanguageFeatures(context, getModel) {
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(SELECTOR, {
            provideHover(doc, pos) {
                const r = refAt(getModel, doc, pos);
                return r && new vscode.Hover(itemMarkdown(r.node), r.range);
            },
        }),
        vscode.languages.registerDefinitionProvider(SELECTOR, {
            provideDefinition(doc, pos) {
                const r = refAt(getModel, doc, pos);
                if (!r) return null;
                return r.node.defs.map(d => new vscode.Location(d.uri, new vscode.Position(d.line, 0)));
            },
        }),
    );
}

// Prüft Struct-Namen, eval_trigger und sh.*-Referenzen in eval/on_change/on_update
function computeDiagnostics(model) {
    const byFile = new Map();
    const add = (uri, line, needle, msg) => {
        const key = String(uri);
        if (!byFile.has(key)) byFile.set(key, { uri, list: [] });
        const text = (model.lines.get(key) || [])[line] || '';
        let col = needle ? text.indexOf(needle) : -1;
        if (col < 0) col = Math.max(0, text.search(/\S/));
        const len = needle && text.indexOf(needle) >= 0 ? needle.length : text.length - col;
        const d = new vscode.Diagnostic(new vscode.Range(line, col, line, col + len), msg, vscode.DiagnosticSeverity.Warning);
        d.source = 'SmartHomeNG Items';
        byFile.get(key).list.push(d);
    };

    for (const node of model.nodes()) {
        if (node.fromStruct) continue;
        for (const u of node.unresolved) add(u.uri, u.line, u.name, `Struct '${u.name}' nicht gefunden`);

        for (const [key, a] of node.attrs) {
            if (a.origin) continue;
            if (key === 'eval_trigger') {
                const list = Array.isArray(a.value) ? a.value : [a.value];
                list.forEach((v, i) => {
                    const t = fmtValue(v).trim();
                    if (!t || t.startsWith('.') || t.includes('*') || model.index.has(t)) return;
                    add(a.uri, a.itemLines ? a.itemLines[i] : a.line, t, `eval_trigger: Item '${t}' existiert nicht`);
                });
            } else if (key === 'eval' || key === 'on_change' || key === 'on_update' || key.endsWith('_eval')) {
                const text = (Array.isArray(a.value) ? a.value : [a.value]).map(fmtValue).join('\n');
                for (const m of text.matchAll(SH_RE)) {
                    const top = m[1].split('.')[0];
                    if (!model.isTopLevel(top) || model.resolveRef(m[1])) continue;
                    add(a.uri, a.line, m[0], `${key}: Item '${m[1]}' existiert nicht`);
                }
            }
        }
    }
    return byFile;
}

module.exports = { registerLanguageFeatures, computeDiagnostics };
