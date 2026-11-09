'use strict';
// Autovervollständigung für items/*.yaml, structs/*.yaml und logics/*.py (Logik in suggest.js),
// Hover für KNX-Gruppenadressen (Infos aus dem ETS-Projekt)

const vscode = require('vscode');
const { suggest, suggestPython, gaInfo } = require('./suggest');
const knxproj = require('./knxproj');

const KINDS = {
    attr: vscode.CompletionItemKind.Property,
    item: vscode.CompletionItemKind.Module,
    value: vscode.CompletionItemKind.EnumMember,
    ref: vscode.CompletionItemKind.Reference,
};

function fileKind(uri) {
    const p = uri.path.toLowerCase();
    if (/\/items\/[^/]+\.yaml$/.test(p)) return 'items';
    if (/\/structs\/[^/]+\.yaml$/.test(p) || /\/etc\/struct[^/]*\.yaml$/.test(p)) return 'structs';
    if (/\/logics\/.+\.py$/.test(p)) return 'logic';
    return null;
}

// ETS-Projekt laden (zwischengespeichert, neu bei geänderter Datei) und am Modell ablegen
let warned = '';
function withKnx(model) {
    if (!model) return model;
    const path = vscode.workspace.getConfiguration('shngItems').get('knxProject');
    const p = knxproj.load(path);
    if (p && p.error && warned !== p.error) {
        warned = p.error;
        vscode.window.showWarningMessage(`SmartHomeNG Items – ETS-Projekt: ${p.error}`);
    }
    model.knx = p && !p.error ? p : null;
    return model;
}

function registerCompletion(context, getModel) {
    const provider = {
        provideCompletionItems(doc, pos, token, cctx) {
            const kind = fileKind(doc.uri);
            if (!kind) return undefined;
            const prefix = doc.lineAt(pos.line).text.slice(0, pos.character);
            // Leerzeichen öffnet die Liste nur nach "key:", "- " bzw. Komma, nicht beim Einrücken
            if (cctx && cctx.triggerCharacter === ' ' && !/(:|,|^\s*-)\s$/.test(prefix)) return undefined;
            const lines = [];
            for (let i = 0; i < doc.lineCount; i++) lines.push(doc.lineAt(i).text);
            const model = withKnx(getModel());
            const res = kind === 'logic'
                ? suggestPython(model, lines, pos.line, pos.character)
                : suggest(model, lines, pos.line, pos.character, kind);
            if (!res || !res.items.length) return undefined;
            const range = new vscode.Range(pos.line, res.start, pos.line, Math.max(res.end, pos.character));
            const items = res.items.map((s, i) => {
                const ci = new vscode.CompletionItem({ label: s.label, description: s.detail }, KINDS[s.kind]);
                ci.insertText = s.snippet ? new vscode.SnippetString(s.snippet) : s.insert;
                ci.range = range;
                ci.filterText = s.filter || s.label;
                // Reihenfolge = Wahrscheinlichkeit (VS Code sortiert bei gleich guter Übereinstimmung danach)
                ci.sortText = String(i).padStart(5, '0');
                if (i === 0) ci.preselect = true;
                if (s.doc) ci.documentation = new vscode.MarkdownString(s.doc);
                if (s.retrigger) ci.command = { command: 'editor.action.triggerSuggest', title: 'Werte vorschlagen' };
                return ci;
            });
            return new vscode.CompletionList(items, false);
        },
    };
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            [{ scheme: 'file', language: 'yaml' }, { scheme: 'file', pattern: '**/*.yaml' }], provider, ' ', '.', '@', ',', '/'),
        vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'python' }, provider, '.', "'", '"'),
        vscode.languages.registerHoverProvider({ scheme: 'file', pattern: '**/*.yaml' }, {
            provideHover(doc, pos) {
                if (!fileKind(doc.uri)) return undefined;
                const range = doc.getWordRangeAtPosition(pos, /\d{1,2}\/\d{1,2}\/\d{1,3}/);
                if (!range) return undefined;
                const md = gaInfo(withKnx(getModel()), doc.getText(range));
                return md ? new vscode.Hover(new vscode.MarkdownString(md), range) : undefined;
            },
        }),
    );
}

module.exports = { registerCompletion };
