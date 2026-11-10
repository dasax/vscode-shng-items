'use strict';
// SmartHomeNG Items – Baumansicht, Übersichtstabelle, Hover/Definition und Diagnosen
// für die Items einer SmartHomeNG-Installation.

const vscode = require('vscode');
const { Model } = require('./lib/model');
const { ItemTree, AttrEl } = require('./lib/tree');
const { registerLanguageFeatures, computeDiagnostics } = require('./lib/language');
const { CategoryTree } = require('./lib/categories');
const { SearchView } = require('./lib/search');
const { FilterView } = require('./lib/filterview');
const { registerCompletion } = require('./lib/complete');
const { describe } = require('./lib/present');
const overview = require('./lib/overview');
const i18n = require('./lib/i18n');
const { t } = i18n;

const applyLanguage = () =>
    i18n.setLanguage(vscode.workspace.getConfiguration('shngItems').get('language'), vscode.env.language);

const fsAdapter = {
    join: (base, ...parts) => vscode.Uri.joinPath(base, ...parts),
    read: async (uri) => new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri)),
    list: async (uri) => {
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            return entries
                .filter(([n, t]) => (t & vscode.FileType.File) && n.endsWith('.yaml'))
                .map(([n]) => n)
                .sort();
        } catch {
            return [];
        }
    },
};

let model = null;
let base = null;

async function findBase() {
    const configured = vscode.workspace.getConfiguration('shngItems').get('basePath');
    const candidates = configured
        ? [vscode.Uri.file(configured)]
        : (vscode.workspace.workspaceFolders || []).map(f => f.uri);
    for (const uri of candidates) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(uri, 'items'));
            return uri;
        } catch { /* kein SmartHomeNG-Verzeichnis */ }
    }
    return null;
}

async function activate(context) {
    applyLanguage();
    const categories = new CategoryTree(() => model, context.workspaceState);
    const tree = new ItemTree(() => model, () => categories.active());
    const view = vscode.window.createTreeView('shngItems.tree', { treeDataProvider: tree, showCollapseAll: true });
    const diagnostics = vscode.languages.createDiagnosticCollection('shngItems');
    context.subscriptions.push(view, diagnostics);

    // Suche: Suchfeld mit Trefferliste; Klick öffnet das Item und zeigt es im Baum
    const search = new SearchView(() => model, categories, async (path) => {
        const node = model && model.index.get(path);
        if (!node) return;
        await openItem(node);
        await reveal(node);
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('shngItems.search', search,
        { webviewOptions: { retainContextWhenHidden: true } }));

    // Filter: Kategorie- und Typ-Chips, wirken auf Suche und Item-Baum
    const filterView = new FilterView(categories, () => {
        tree.categoriesChanged();
        updateMessage();
        search.updateCategories();
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('shngItems.categories', filterView,
        { webviewOptions: { retainContextWhenHidden: true } }));
    const categoriesChanged = () => {
        search.updateCategories();
        filterView.update();
    };

    let watchers = [];
    let reloadTimer = null;

    const updateMessage = () => {
        if (!base) view.message = t('msg.noBase');
        else if (model && model.errors.length) view.message = t('msg.readError', model.errors[0]);
        else if (tree.visible) {
            const parts = [];
            if (tree.filter) parts.push(`"${tree.filter}"`);
            const cats = categories.label();
            if (cats) parts.push(cats);
            view.message = t('msg.filterStatus', parts.join(' + '), tree.visible.size);
        } else view.message = undefined;
        vscode.commands.executeCommand('setContext', 'shngItems.filtered', !!tree.filter);
        vscode.commands.executeCommand('setContext', 'shngItems.categoriesActive', categories.active().length > 0);
    };

    const reload = async () => {
        const newBase = await findBase();
        if (String(newBase) !== String(base)) {
            base = newBase;
            watchWorkspace();
        }
        if (!base) {
            model = null;
        } else {
            try {
                model = await new Model(fsAdapter, base).load();
            } catch (e) {
                vscode.window.showErrorMessage(`SmartHomeNG Items: ${e.message}`);
            }
        }
        categories.reload();
        tree.refresh();
        updateMessage();
        overview.update(model);
        search.update();
        filterView.update();
        diagnostics.clear();
        if (model && vscode.workspace.getConfiguration('shngItems').get('diagnostics')) {
            for (const { uri, list } of computeDiagnostics(model).values()) diagnostics.set(uri, list);
        }
    };

    const scheduleReload = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(reload, 400);
    };

    const watchWorkspace = () => {
        watchers.forEach(w => w.dispose());
        watchers = [];
        if (!base) return;
        const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, '{items,structs,etc}/*.yaml'));
        w.onDidChange(scheduleReload);
        w.onDidCreate(scheduleReload);
        w.onDidDelete(scheduleReload);
        watchers.push(w);
    };
    context.subscriptions.push({ dispose: () => watchers.forEach(w => w.dispose()) });

    // Netzlaufwerke melden Änderungen nicht immer zuverlässig – deshalb zusätzlich beim Speichern
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (base && doc.uri.toString().startsWith(base.toString()) && doc.fileName.endsWith('.yaml')) scheduleReload();
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('shngItems.language')) {
            // Texte stecken auch im Modell (Plugin-Beschreibungen) und in den Webviews
            applyLanguage();
            await reload();
            search.relocalize();
            filterView.relocalize();
            overview.relocalize(model);
        } else if (e.affectsConfiguration('shngItems.basePath') || e.affectsConfiguration('shngItems.diagnostics')) reload();
        else if (e.affectsConfiguration('shngItems.categories')) {
            categories.reload();
            tree.refresh();
            updateMessage();
            overview.update(model);
            search.update();
            filterView.update();
        } else if (e.affectsConfiguration('shngItems')) tree.refresh();
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(reload));

    const openAt = async (uri, line) => {
        if (typeof uri === 'string') uri = vscode.Uri.parse(uri);
        const doc = await vscode.workspace.openTextDocument(uri);
        const col = Math.max(0, doc.lineAt(Math.min(line, doc.lineCount - 1)).firstNonWhitespaceCharacterIndex);
        const pos = new vscode.Position(line, col);
        await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true });
    };

    const nodeOf = (el) => (el instanceof AttrEl ? el.node : el);

    const reveal = async (node) => {
        if (tree.visible && !tree.visible.has(node)) {
            categories.clear();
            tree.setFilter('');
            updateMessage();
            categoriesChanged();
        }
        if (node.fromStruct && !vscode.workspace.getConfiguration('shngItems').get('showStructItems')) return;
        try {
            await view.reveal(node, { select: true, focus: false, expand: true });
        } catch { /* Tree noch nicht sichtbar */ }
    };

    const openItem = async (node) => {
        const def = node.mainDef;
        if (def) await openAt(def.uri, def.line);
    };

    const toggleSetting = async (key) => {
        const cfg = vscode.workspace.getConfiguration('shngItems');
        await cfg.update(key, !cfg.get(key), vscode.ConfigurationTarget.Global);
    };

    const cmd = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

    cmd('shngItems.refresh', reload);
    cmd('shngItems.focusSearch', () => search.focus());
    cmd('shngItems.open', openAt);

    cmd('shngItems.filter', async () => {
        const text = await vscode.window.showInputBox({
            title: t('cmd.filterTitle'),
            prompt: t('cmd.filterPrompt'),
            value: tree.filter,
        });
        if (text === undefined) return;
        tree.setFilter(text);
        updateMessage();
    });

    cmd('shngItems.clearFilter', () => {
        tree.setFilter('');
        updateMessage();
    });

    cmd('shngItems.clearCategories', () => {
        categories.clear();
        tree.categoriesChanged();
        updateMessage();
        categoriesChanged();
    });

    cmd('shngItems.goto', async () => {
        if (!model) return;
        const picks = [...model.nodes()].map(n => ({ label: n.path, description: describe(n), node: n }));
        const pick = await vscode.window.showQuickPick(picks, {
            title: t('cmd.gotoTitle'),
            placeHolder: t('cmd.gotoPlaceholder'),
            matchOnDescription: true,
        });
        if (!pick) return;
        await openItem(pick.node);
        await reveal(pick.node);
    });

    cmd('shngItems.overview', () => overview.show(context, () => model, async (path) => {
        const node = model && model.index.get(path);
        if (!node) return;
        await openItem(node);
        await reveal(node);
    }));

    cmd('shngItems.copyPath', (el) => {
        const node = nodeOf(el || view.selection[0]);
        if (!node) return;
        vscode.env.clipboard.writeText(node.path);
        vscode.window.setStatusBarMessage(t('msg.copied', node.path), 2500);
    });

    cmd('shngItems.findReferences', (el) => {
        const node = nodeOf(el || view.selection[0]);
        if (!node) return;
        const escaped = node.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        vscode.commands.executeCommand('workbench.action.findInFiles', {
            query: `(?<![\\w.])${escaped}(?!\\w)`,
            isRegex: true,
            isCaseSensitive: true,
            triggerSearch: true,
        });
    });

    cmd('shngItems.revealCurrent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !model) return;
        const defs = model.defsByFile.get(editor.document.uri.toString().toLowerCase());
        if (!defs) {
            vscode.window.showInformationMessage(t('msg.noItemsInFile'));
            return;
        }
        // vom Cursor aus nach oben die nächste umschließende Item-Zeile suchen
        const doc = editor.document;
        let line = editor.selection.active.line;
        let threshold = Infinity;
        for (; line >= 0; line--) {
            const l = doc.lineAt(line);
            if (l.isEmptyOrWhitespace || l.text.trimStart().startsWith('#')) continue;
            const ind = l.firstNonWhitespaceCharacterIndex;
            if (threshold === Infinity || ind < threshold) {
                if (defs.has(line)) return reveal(defs.get(line));
                threshold = ind;
            }
        }
    });

    cmd('shngItems.toggleAttributes', () => toggleSetting('showAttributes'));
    cmd('shngItems.toggleStructItems', () => toggleSetting('showStructItems'));
    cmd('shngItems.toggleSort', () => toggleSetting('sortAlphabetically'));
    // Symbole in der Titelleiste des Item-Baums (je Zustand ein Befehl, damit der Tooltip die Aktion nennt)
    for (const [id, key] of [['hideAttributes', 'showAttributes'], ['showAttributes', 'showAttributes'],
        ['hideStructItems', 'showStructItems'], ['showStructItems', 'showStructItems'],
        ['sortFileOrder', 'sortAlphabetically'], ['sortAlpha', 'sortAlphabetically']]) {
        cmd('shngItems.' + id, () => toggleSetting(key));
    }

    registerLanguageFeatures(context, () => model);
    registerCompletion(context, () => model);
    await reload();
}

function deactivate() {}

module.exports = { activate, deactivate };
