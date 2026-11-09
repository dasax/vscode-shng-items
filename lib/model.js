'use strict';
// Liest items/*.yaml, Structs (structs/, etc/struct*.yaml, plugins/<p>/plugin.yaml) und
// baut daraus den Item-Baum so, wie SmartHomeNG ihn sieht – inkl. aufgelöster Structs.
// Dateizugriff läuft über einen Adapter, damit das Modell auch ohne VS Code testbar ist.

const { parse } = require('./yaml');

// Methoden/Properties, die hinter einem Item-Pfad in eval-Ausdrücken stehen dürfen
const ITEM_MEMBERS = new Set([
    'db', 'series', 'age', 'prev_age', 'prev_value', 'last_value', 'last_change', 'last_update',
    'last_trigger', 'prev_change', 'prev_update', 'prev_trigger', 'changed_by', 'updated_by',
    'triggered_by', 'property', 'value', 'timer', 'remove_timer', 'autotimer', 'fade',
    'return_parent', 'return_children', 'id', 'path', 'type', 'conf', 'get_children_path',
    'attributes', 'name', 'get', 'set',
]);

class ItemNode {
    constructor(name, parent) {
        this.name = name;
        this.parent = parent;
        this.path = parent && parent.path ? `${parent.path}.${name}` : name;
        this.attrs = new Map();     // name -> { value, uri, line, itemLines, origin }
        this.children = new Map();
        this.defs = [];             // { uri, line, struct }
        this.fromStruct = null;     // gesetzt, wenn das Item erst durch ein Struct entsteht
        this.structPrefix = '';
        this.applied = new Set();
        this.unresolved = [];       // { name, uri, line }
    }

    attr(name) {
        const a = this.attrs.get(name);
        return a ? a.value : undefined;
    }

    // Sprungziel beim Anklicken:
    // - Item steht (auch nur als Erweiterung) in items/ -> diese Stelle
    // - Item entsteht nur durch ein Struct -> die Zeile "struct: …" in items/, mit der das
    //   Struct eingebunden wird; ersatzweise das nächste übergeordnete Item in items/
    get mainDef() {
        const own = this.defs.find(d => !d.struct);
        if (own) return own;
        for (let p = this.parent; p && p.path; p = p.parent) {
            const s = p.attrs.get('struct');
            if (s && !s.origin && p.applied.has(this.fromStruct)) return { uri: s.uri, line: s.line };
        }
        for (let p = this.parent; p && p.path; p = p.parent) {
            const pOwn = p.defs.find(d => !d.struct);
            if (!pOwn) continue;
            const s = p.attrs.get('struct');
            return s && !s.origin ? { uri: s.uri, line: s.line } : pOwn;
        }
        return this.defs[0];
    }
}

function structNames(v) {
    if (v === null || v === undefined) return [];
    return (Array.isArray(v) ? v : String(v).split(','))
        .map(s => String(s).trim())
        .filter(Boolean);
}

function collectRefs(ynode, out) {
    if (!ynode.children) return;
    for (const [k, c] of ynode.children) {
        if (k === 'struct' && !c.children) structNames(c.value).forEach(n => out.add(n));
        else collectRefs(c, out);
    }
}

class Model {
    /**
     * @param fs   Adapter: join(base, ...parts), read(uri) -> Promise<string>, list(dirUri) -> Promise<string[]> (*.yaml)
     * @param base Basisverzeichnis der SmartHomeNG-Installation
     */
    constructor(fs, base) {
        this.fs = fs;
        this.base = base;
        this.root = new ItemNode('', null);
        this.index = new Map();     // Pfad -> ItemNode
        this.structs = new Map();   // Name -> { node, uri, prefix }
        this.lines = new Map();     // String(uri) -> Zeilen
        this.defsByFile = new Map(); // String(uri) klein -> Map(Zeile -> ItemNode)
        this.errors = [];
        this.plugins = [];          // { name, sections, instances, attrs: Set, attrInfo: Map, desc }
    }

    async load() {
        const { fs, base } = this;
        for (const f of await fs.list(fs.join(base, 'structs'))) {
            await this.loadStructs(fs.join(base, 'structs', f), f === 'global_structs.yaml' ? '' : 'my.' + f.slice(0, -5));
        }
        for (const f of await fs.list(fs.join(base, 'etc'))) {
            if (f === 'struct.yaml') await this.loadStructs(fs.join(base, 'etc', f), '');
            else if (/^struct_.+\.yaml$/.test(f)) await this.loadStructs(fs.join(base, 'etc', f), 'my.' + f.slice(7, -5));
        }

        const itemTrees = [];
        for (const f of await fs.list(fs.join(base, 'items'))) {
            const uri = fs.join(base, 'items', f);
            const y = await this.parseFile(uri);
            if (!y || !y.children) continue;
            itemTrees.push(y);
            for (const yc of y.children.values()) {
                if (yc.children) this.mergeItem(this.root, yc, uri);
            }
        }

        await this.loadPluginStructs(itemTrees);
        await this.loadPlugins();
        this.expand(this.root, 0);
        this.buildIndex();
        return this;
    }

    async parseFile(uri, quiet) {
        try {
            const text = await this.fs.read(uri);
            this.lines.set(String(uri), text.replace(/^﻿/, '').split(/\r?\n/));
            return parse(text);
        } catch (e) {
            if (!quiet) this.errors.push(`${uri}: ${e.message}`);
            return null;
        }
    }

    async loadStructs(uri, prefix, section, quiet) {
        const y = await this.parseFile(uri, quiet);
        let node = y;
        if (node && section) node = node.children && node.children.get(section);
        if (!node || !node.children) return;
        for (const [k, def] of node.children) {
            if (def.children) this.structs.set(prefix ? `${prefix}.${k}` : k, { node: def, uri, prefix });
        }
    }

    // Plugin-Structs (z.B. "uzsu.child") nur für tatsächlich referenzierte Plugins laden
    async loadPluginStructs(itemTrees) {
        const tried = new Set();
        for (;;) {
            const refs = new Set();
            itemTrees.forEach(t => collectRefs(t, refs));
            for (const s of this.structs.values()) collectRefs(s.node, refs);
            const todo = new Set();
            for (const r of refs) {
                const p = r.split('.')[0];
                if (!this.structs.has(r) && r.includes('.') && p !== 'my' && !tried.has(p)) todo.add(p);
            }
            if (!todo.size) break;
            for (const p of todo) {
                tried.add(p);
                await this.loadStructs(this.fs.join(this.base, 'plugins', p, 'plugin.yaml'), p, 'item_structs', true);
            }
        }
    }

    // Konfigurierte Plugins (etc/plugin.yaml) mit den Item-Attributen aus plugins/<name>/plugin.yaml.
    // Mehrere Instanzen desselben Plugins werden zusammengefasst.
    async loadPlugins() {
        this.plugins = [];
        const y = await this.parseFile(this.fs.join(this.base, 'etc', 'plugin.yaml'), true);
        if (!y || !y.children) return;
        const byName = new Map();
        for (const [section, conf] of y.children) {
            if (!conf.children) continue;
            let name = conf.children.get('plugin_name') && conf.children.get('plugin_name').value;
            if (!name && conf.children.get('class_path')) name = String(conf.children.get('class_path').value).split('.').pop();
            if (!name) continue;
            name = String(name).trim();
            if (!byName.has(name)) byName.set(name, { name, sections: [], instances: [], attrs: new Set(), attrInfo: new Map(), desc: '' });
            const p = byName.get(name);
            p.sections.push(section);
            const inst = conf.children.get('instance');
            if (inst && inst.value) p.instances.push(String(inst.value).trim());
        }
        const text = (n) => {
            if (!n) return '';
            const v = n.children ? (n.children.get('de') || n.children.get('en')) : n;
            return v && v.value !== undefined && v.value !== null && !Array.isArray(v.value) ? String(v.value) : '';
        };
        for (const p of byName.values()) {
            const py = await this.parseFile(this.fs.join(this.base, 'plugins', p.name, 'plugin.yaml'), true);
            const top = (py && py.children) || new Map();
            const ia = top.get('item_attributes');
            if (ia && ia.children) {
                for (const [k, a] of ia.children) {
                    p.attrs.add(k);
                    const c = a.children || new Map();
                    const valid = c.get('valid_list') && c.get('valid_list').value;
                    p.attrInfo.set(k, {
                        type: c.get('type') ? String(c.get('type').value || '') : '',
                        desc: text(c.get('description')),
                        valid: Array.isArray(valid) ? valid.map(String) : [],
                        default: c.get('default') && c.get('default').value !== null ? String(c.get('default').value) : undefined,
                    });
                }
            }
            const plug = top.get('plugin');
            p.desc = text(plug && plug.children && plug.children.get('description'));
            this.plugins.push(p);
        }
    }

    mergeItem(parent, y, uri) {
        let item = parent.children.get(y.key);
        if (!item) {
            item = new ItemNode(y.key, parent);
            parent.children.set(y.key, item);
        }
        item.defs.push({ uri, line: y.line });
        for (const yc of y.children.values()) {
            if (yc.children) this.mergeItem(item, yc, uri);
            else item.attrs.set(yc.key, { value: yc.value, uri, line: yc.line, itemLines: yc.itemLines });
        }
    }

    expand(item, depth) {
        if (depth > 60) return;
        const s = item.attrs.get('struct');
        if (s) {
            for (const name of structNames(s.value)) this.applyStruct(item, name, item.structPrefix, s, 0);
        }
        for (const child of item.children.values()) this.expand(child, depth + 1);
    }

    applyStruct(item, name, prefix, src, level) {
        if (level > 10) return;
        let fullName = name;
        let def = this.structs.get(name);
        if (!def && prefix) {
            fullName = `${prefix}.${name}`;
            def = this.structs.get(fullName);
        }
        if (!def) {
            if (!src.origin) item.unresolved.push({ name, uri: src.uri, line: src.line });
            return;
        }
        if (item.applied.has(fullName)) return;
        item.applied.add(fullName);
        this.mergeStruct(item, def.node, def, fullName, level);
    }

    // Struct-Inhalte ergänzen; eigene Attribute des Items haben Vorrang
    mergeStruct(item, ynode, def, name, level) {
        for (const [k, yc] of ynode.children) {
            if (yc.children) {
                let child = item.children.get(k);
                if (!child) {
                    child = new ItemNode(k, item);
                    child.fromStruct = name;
                    child.structPrefix = def.prefix;
                    item.children.set(k, child);
                }
                child.defs.push({ uri: def.uri, line: yc.line, struct: name });
                this.mergeStruct(child, yc, def, name, level);
            } else if (k === 'struct') {
                const src = { value: yc.value, uri: def.uri, line: yc.line, origin: name };
                if (!item.attrs.has('struct')) item.attrs.set('struct', src);
                for (const n of structNames(yc.value)) this.applyStruct(item, n, def.prefix, src, level + 1);
            } else if (!item.attrs.has(k)) {
                item.attrs.set(k, { value: yc.value, uri: def.uri, line: yc.line, itemLines: yc.itemLines, origin: name });
            }
        }
    }

    buildIndex() {
        const walk = (node) => {
            for (const c of node.children.values()) {
                this.index.set(c.path, c);
                for (const d of c.defs) {
                    const key = String(d.uri).toLowerCase();
                    if (!this.defsByFile.has(key)) this.defsByFile.set(key, new Map());
                    const m = this.defsByFile.get(key);
                    if (!m.has(d.line)) m.set(d.line, c);
                }
                walk(c);
            }
        };
        walk(this.root);
    }

    *nodes() {
        yield* this.index.values();
    }

    /**
     * Item-Referenz wie "sh.eg.bad.licht()" oder "eg.bad.licht.db" auflösen.
     * Liefert das Item, wenn der Rest nur aus bekannten Item-Methoden besteht.
     */
    resolveRef(ref) {
        const segs = ref.replace(/^sh\./, '').replace(/\(\)$/, '').split('.');
        for (let n = segs.length; n >= 1; n--) {
            const node = this.index.get(segs.slice(0, n).join('.'));
            if (node) return segs.slice(n).every(s => ITEM_MEMBERS.has(s)) ? node : null;
        }
        return null;
    }

    isTopLevel(name) {
        return this.root.children.has(name);
    }
}

module.exports = { Model, ItemNode, structNames };
