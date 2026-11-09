'use strict';
// TreeDataProvider für die Item-Ansicht (Items + optional deren Attribute)

const vscode = require('vscode');
const { describe, iconFor, itemMarkdown, attrMarkdown, fmtValue } = require('./present');
const { matches } = require('./categories');

class AttrEl {
    constructor(node, key) {
        this.node = node;
        this.key = key;
    }
}

function haystack(node) {
    if (node._hay === undefined) {
        const parts = [node.path];
        for (const [k, a] of node.attrs) parts.push(`${k}: ${fmtValue(a.value)}`);
        node._hay = parts.join('\n').toLowerCase();
    }
    return node._hay;
}

class ItemTree {
    constructor(getModel, getCategories) {
        this.getModel = getModel;
        this.getCategories = getCategories;   // aktive Kategorien aus der Filter-Ansicht
        this.filter = '';
        this.visible = null;     // Set sichtbarer Items bei aktivem Filter
        this.gen = 0;            // ändert die Tree-IDs, damit VS Code bei neuem Filter neu aufklappt
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._emitter.event;
    }

    get cfg() {
        return vscode.workspace.getConfiguration('shngItems');
    }

    refresh() {
        this.computeVisible();
        this._emitter.fire();
    }

    setFilter(text) {
        this.filter = (text || '').trim();
        this.gen++;
        this.refresh();
    }

    // Kategorien geändert: nur neu filtern – IDs bleiben gleich, damit der Aufklapp-Zustand erhalten bleibt
    categoriesChanged() {
        this.refresh();
    }

    computeVisible() {
        const model = this.getModel();
        const cats = this.getCategories();
        if ((!this.filter && !cats.length) || !model) {
            this.visible = null;
            return;
        }
        const terms = this.filter ? this.filter.toLowerCase().split(/\s+/) : [];
        const vis = new Set();
        const visit = (node) => {
            let any = false;
            for (const c of node.children.values()) if (visit(c)) any = true;
            const hay = haystack(node);
            if (any || (terms.every(t => hay.includes(t)) && matches(node, cats))) {
                vis.add(node);
                return true;
            }
            return false;
        };
        for (const c of model.root.children.values()) visit(c);
        this.visible = vis;
    }

    childItems(node) {
        let list = [...node.children.values()];
        if (!this.cfg.get('showStructItems')) list = list.filter(c => !c.fromStruct);
        if (this.visible) list = list.filter(c => this.visible.has(c));
        if (this.cfg.get('sortAlphabetically')) list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }

    attrEls(node) {
        if (!this.cfg.get('showAttributes')) return [];
        if (!node._attrEls) node._attrEls = [...node.attrs.keys()].map(k => new AttrEl(node, k));
        return node._attrEls;
    }

    getChildren(el) {
        const model = this.getModel();
        if (!model) return [];
        if (!el) return this.childItems(model.root);
        if (el instanceof AttrEl) return [];
        return [...this.attrEls(el), ...this.childItems(el)];
    }

    getParent(el) {
        if (el instanceof AttrEl) return el.node;
        const model = this.getModel();
        return el.parent && el.parent !== model.root ? el.parent : undefined;
    }

    getTreeItem(el) {
        const C = vscode.TreeItemCollapsibleState;
        if (el instanceof AttrEl) {
            const a = el.node.attrs.get(el.key);
            const ti = new vscode.TreeItem(el.key, C.None);
            ti.id = `${this.gen}|${el.node.path}#${el.key}`;
            ti.description = fmtValue(a.value).replace(/\s+/g, ' ');
            ti.iconPath = new vscode.ThemeIcon(
                a.origin ? 'symbol-field' : 'symbol-property',
                a.origin ? new vscode.ThemeColor('disabledForeground') : undefined,
            );
            ti.command = { command: 'shngItems.open', title: 'Öffnen', arguments: [a.uri, a.line] };
            ti.contextValue = 'attr';
            return ti;
        }

        const node = el;
        const kids = this.childItems(node);
        const hasKids = kids.length > 0 || this.attrEls(node).length > 0;
        // automatisch aufklappen nur beim Textfilter, nicht bei Kategorien
        const expand = !!this.filter && kids.length > 0;
        const label = { label: node.name };
        if (this.filter) {
            const i = node.name.toLowerCase().indexOf(this.filter.toLowerCase().split(/\s+/)[0]);
            if (i >= 0) label.highlights = [[i, i + this.filter.split(/\s+/)[0].length]];
        }
        const ti = new vscode.TreeItem(label, hasKids ? (expand ? C.Expanded : C.Collapsed) : C.None);
        ti.id = `${this.gen}|${node.path}`;
        ti.description = describe(node);
        ti.iconPath = iconFor(node);
        ti.contextValue = node.fromStruct ? 'item.struct' : 'item';
        const def = node.mainDef;
        if (def) ti.command = { command: 'shngItems.open', title: 'Öffnen', arguments: [def.uri, def.line] };
        return ti;
    }

    // Tooltips erst beim Hovern berechnen
    resolveTreeItem(ti, el) {
        ti.tooltip = el instanceof AttrEl ? attrMarkdown(el.node, el.key) : itemMarkdown(el);
        return ti;
    }
}

module.exports = { ItemTree, AttrEl };
