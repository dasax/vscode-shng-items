'use strict';
// Filter-Kategorien:
// - Gruppe "plugin": automatisch aus etc/plugin.yaml + item_attributes der plugin.yaml
// - Gruppe "attr" (Sonstige): feste Liste aus der Einstellung shngItems.categories (eval, Zeitsteuerung, …)
// - Gruppe "type": automatisch aus den verwendeten Item-Typen (bool, num, …; ohne type = foo)
// Verknüpfung: Plugins und Sonstige untereinander UND, Typen untereinander ODER, Gruppen untereinander UND.

const vscode = require('vscode');

// Muster: exakter Attributname oder Präfix mit "*"
function compile(config) {
    return Object.entries(config || {}).map(([name, patterns]) => {
        const exact = new Set();
        const prefixes = [];
        for (const p of patterns) {
            if (p.endsWith('*')) prefixes.push(p.slice(0, -1));
            else exact.add(p);
        }
        return {
            key: name,
            name,
            group: 'attr',
            test: (node) => {
                for (const k of node.attrs.keys()) {
                    if (exact.has(k) || prefixes.some(pre => k.startsWith(pre))) return true;
                }
                return false;
            },
        };
    });
}

// lesbare Namen für bekannte Plugins; unbekannte Plugins heißen wie in plugin_name
const PLUGIN_LABELS = {
    knx: 'KNX', hue2: 'Hue', hue: 'Hue', onewire: '1-Wire', modbus_tcp: 'Modbus', smartvisu: 'smartVISU',
    database: 'Datenbank', uzsu: 'UZSU', dashbutton: 'Dashbutton', stateengine: 'Stateengine', mqtt: 'MQTT',
    enocean: 'EnOcean', dmx: 'DMX', alexa4p3: 'Alexa', sonos: 'Sonos', avm: 'AVM/Fritz!Box',
};

// Attribute, die ein Item allein noch nicht an das Plugin anbinden (z.B. knx_dpt ohne Gruppenadresse)
const PLUGIN_IGNORE = { knx: ['knx_dpt'] };

// je konfiguriertem Plugin mit Item-Attributen eine Kategorie; "attr@instanz" zählt wie "attr"
function pluginCategories(model) {
    if (!model || !model.plugins) return [];
    return model.plugins.filter(p => p.attrs.size).map(p => {
        const attrs = new Set([...p.attrs].filter(a => !(PLUGIN_IGNORE[p.name] || []).includes(a)));
        return {
        key: 'plugin:' + p.name,
        name: PLUGIN_LABELS[p.name] || p.name,
        group: 'plugin',
        desc: `Plugin ${p.name}${p.sections.length > 1 ? ' (' + p.sections.join(', ') + ')' : ''}` +
            (p.desc ? ` – ${p.desc}` : '') + `\nAttribute: ${[...p.attrs].join(', ')}`,
        test: (node) => {
            for (const k of node.attrs.keys()) {
                const at = k.indexOf('@');
                if (attrs.has(at > 0 ? k.slice(0, at) : k)) return true;
            }
            return false;
        },
        };
    });
}

// alle Kategorien der Gruppe "attr": Plugins, dann die feste Liste (ohne Namensdoppel)
function attrCategories(model, config) {
    const plugins = pluginCategories(model);
    const names = new Set(plugins.map(c => c.name));
    return plugins.concat(compile(config).filter(c => !names.has(c.name)));
}

function itemType(node) {
    const t = node.attr('type');
    return t === undefined || t === null || t === '' ? 'foo' : String(t).trim().toLowerCase();
}

// Typ-Kategorien aus dem Modell, häufigste zuerst
function typeCategories(model) {
    if (!model) return [];
    const counts = new Map();
    for (const node of model.nodes()) {
        const t = itemType(node);
        counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([t]) => ({ key: 'type:' + t, name: t, group: 'type', test: (node) => itemType(node) === t }));
}

// passt ein Item zu den aktiven Kategorien?
function matches(node, active) {
    let anyType = false, typeOk = false;
    for (const c of active) {
        if (c.group === 'type') {
            anyType = true;
            if (!typeOk && c.test(node)) typeOk = true;
        } else if (!c.test(node)) return false;
    }
    return !anyType || typeOk;
}

class CategoryTree {
    constructor(getModel, state) {
        this.getModel = getModel;
        this.state = state;      // workspaceState zum Merken der Auswahl
        this.selected = new Set(state.get('shngItems.categories', []));
        this.categories = [];
        this.counts = new Map();
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._emitter.event;
    }

    reload() {
        const model = this.getModel();
        this.categories = attrCategories(model, vscode.workspace.getConfiguration('shngItems').get('categories'))
            .concat(typeCategories(model));
        // gemerkte Typen behalten, auch wenn es sie gerade nicht gibt
        for (const key of this.selected) {
            if (key.startsWith('type:') && !this.categories.some(c => c.key === key)) {
                const t = key.slice(5);
                this.categories.push({ key, name: t, group: 'type', test: (node) => itemType(node) === t });
            }
        }
        // gemerkte Kategorien, die es nicht mehr gibt (z.B. Plugin entfernt), vergessen
        if (model) {
            const before = this.selected.size;
            for (const key of [...this.selected]) if (!this.categories.some(c => c.key === key)) this.selected.delete(key);
            if (this.selected.size !== before) this.state.update('shngItems.categories', [...this.selected]);
        }
        this.counts = new Map();
        if (model) {
            for (const c of this.categories) {
                let n = 0;
                for (const node of model.nodes()) if (c.test(node)) n++;
                this.counts.set(c.key, n);
            }
        }
        this._emitter.fire();
    }

    // aktive Kategorien für den Item-Baum
    active() {
        return this.categories.filter(c => this.selected.has(c.key));
    }

    setChecked(key, checked) {
        if (checked) this.selected.add(key);
        else this.selected.delete(key);
        this.state.update('shngItems.categories', [...this.selected]);
    }

    clear() {
        this.selected.clear();
        this.state.update('shngItems.categories', []);
        this._emitter.fire();
    }

    // für Webviews: [{key, name, group, count}]
    describe() {
        return this.categories.map(c => ({ key: c.key, name: c.name, group: c.group, desc: c.desc || '', count: this.counts.get(c.key) || 0 }));
    }

    // Text für die Statuszeile im Item-Baum, z.B. "KNX und Hue, Typ num oder bool"
    label() {
        const act = this.active();
        const attr = act.filter(c => c.group !== 'type').map(c => c.name);
        const types = act.filter(c => c.group === 'type').map(c => c.name);
        const parts = [];
        if (attr.length) parts.push(attr.join(' und '));
        if (types.length) parts.push('Typ ' + types.join(' oder '));
        return parts.join(', ');
    }

    getChildren(el) {
        if (el) return [];
        return this.categories.filter(c => this.counts.get(c.key) || this.selected.has(c.key));
    }

    getTreeItem(c) {
        const ti = new vscode.TreeItem(c.name, vscode.TreeItemCollapsibleState.None);
        ti.id = c.key;
        ti.description = String(this.counts.get(c.key) || 0);
        return ti;
    }
}

module.exports = { CategoryTree, compile, attrCategories, matches, itemType };
