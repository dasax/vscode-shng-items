'use strict';
// Vorschläge für die Autovervollständigung in items/*.yaml und structs/*.yaml – ohne VS-Code-Abhängigkeit.
//
// Quellen:
//  - Item-Namen: Kinder gleichnamiger Items und gleich tief liegender Items in allen Item-Dateien,
//    Kinder aus dem Struct des Items (zum Erweitern)
//  - Attribute: SmartHomeNG-Kern, item_attributes der konfigurierten Plugins (inkl. @instanz),
//    alle in den Items tatsächlich verwendeten Attribute
//  - Werte: feste Listen (type, Wahrheitswerte), valid_list der Plugins, Struct-Namen, Item-Pfade,
//    in den Items verwendete Werte
// Sortierung: gelernt aus den vorhandenen Items (welche Attribute kommen zusammen vor, welche Werte
// haben gleichnamige Items bzw. Items desselben Typs, haben Items dieses Typs Unter-Items).

const CORE = {
    type: { desc: 'Datentyp des Items', values: ['bool', 'num', 'str', 'list', 'dict', 'foo', 'scene'] },
    name: { desc: 'Anzeigename des Items' },
    description: { desc: 'Beschreibung des Items' },
    remark: { desc: 'Bemerkung (wird von SmartHomeNG ignoriert)' },
    value: { desc: 'Startwert (veraltet, besser initial_value)' },
    initial_value: { desc: 'Startwert, solange kein Wert im Cache liegt' },
    cache: { desc: 'Wert über Neustarts hinweg im Cache halten', values: ['True', 'False'] },
    enforce_updates: { desc: 'Trigger auch auslösen, wenn sich der Wert nicht ändert', values: ['True', 'False'] },
    enforce_change: { desc: 'Wert immer als Änderung behandeln', values: ['True', 'False'] },
    eval: { desc: 'Python-Ausdruck, der den Wert berechnet (value, sh.<item>())' },
    eval_trigger: { desc: 'Items, deren Änderung eval auslöst (Liste oder einzelnes Item)', items: true },
    eval_on_trigger_only: { desc: 'eval nur bei eval_trigger auswerten, nicht bei eigenen Updates', values: ['True', 'False'] },
    trigger_condition: { desc: 'Bedingung für das Auslösen von eval' },
    on_update: { desc: 'Bei jedem Update ein anderes Item setzen: <item> = <ausdruck>' },
    on_change: { desc: 'Bei Wertänderung ein anderes Item setzen: <item> = <ausdruck>' },
    autotimer: { desc: 'Nach einer Zeit automatisch einen Wert setzen: <zeit> = <wert>', values: ['1m = 0', '10m = 0', '30s = 0'] },
    cycle: { desc: 'Zyklisch einen Wert setzen: <sekunden> = <wert>', values: ['60 = 1'] },
    crontab: { desc: 'Zeitgesteuert setzen: init, sunrise, sunset oder Cron-Ausdruck', values: ['init', 'init = 0', 'sunrise', 'sunset', '0 7 * * = 1'] },
    threshold: { desc: 'Schwellwert: <unten>:<oben>' },
    hysteresis_input: { desc: 'Eingangs-Item der Hysterese', items: true },
    hysteresis_upper_threshold: { desc: 'Obere Schwelle der Hysterese' },
    hysteresis_lower_threshold: { desc: 'Untere Schwelle der Hysterese' },
    log_change: { desc: 'Änderungen in ein Log schreiben (Log-Name)' },
    log_level: { desc: 'Log-Level für log_change', values: ['DEBUG', 'INFO', 'WARNING', 'ERROR'] },
    log_text: { desc: 'Text für log_change' },
    log_mapping: { desc: 'Werte für das Log übersetzen' },
    log_rules: { desc: 'Regeln für log_change (lowlimit, highlimit, filter, exclude, itemvalue)' },
    struct: { desc: 'Struct(s), die in dieses Item eingebunden werden', structs: true },
};
const LOG_RULES = ['lowlimit', 'highlimit', 'filter', 'exclude', 'itemvalue'];
const EXPR_ATTRS = new Set(['eval', 'on_update', 'on_change', 'trigger_condition']);
const TARGET_ATTRS = new Set(['on_update', 'on_change']);   // "<ziel> = <ausdruck>"
const GA_ATTRS = new Set(['knx_send', 'knx_listen', 'knx_init', 'knx_status', 'knx_reply', 'knx_cache', 'knx_poll']);
const GA_RE = /\b\d{1,2}\/\d{1,2}\/\d{1,3}\b/g;

// Wörter für den Vergleich Item-Pfad <-> Name der Gruppenadresse
const SYNONYMS = {
    schalten: ['anaus', 'schalten', 'ein', 'aus'], status: ['status', 'rm', 'rueckmeldung'],
    dimmen: ['dimmen', 'dimmwert', 'helligkeit', 'absolut', 'wert'], rolladen: ['rolladen', 'rollladen', 'jalousie', 'rollo', 'behang'],
    temperatur: ['temperatur', 'temp'], licht: ['licht', 'beleuchtung', 'lampe'], position: ['position', 'pos', 'hoehe'],
};
function norm(s) {
    return String(s).replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2').toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}
function tokens(s) {
    return norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2);
}
function tokMatch(a, b) {
    if (a === b) return true;
    const n = Math.min(a.length, b.length);
    return n >= 4 && a.slice(0, 4) === b.slice(0, 4) && (a.startsWith(b) || b.startsWith(a));
}

function isItemAttr(key, info) {
    const base = key.split('@')[0];
    if (CORE[base] && CORE[base].items) return true;
    if (base === 'uzsu_item' || base.endsWith('_item')) return true;
    return !!(info && /item/i.test(info.type || ''));
}

// ---------- Statistik über die vorhandenen Items (einmal je Modell) ----------

function rawValue(model, a) {
    const line = (model.lines.get(String(a.uri)) || [])[a.line] || '';
    const i = line.indexOf(':');
    if (i < 0) return '';
    let v = line.slice(i + 1).trim();
    const hash = v.search(/\s#/);
    if (hash >= 0) v = v.slice(0, hash).trim();
    if (!v || v[0] === '|' || v[0] === '>' || v[0] === '[' || v[0] === '{') return '';
    return v;
}

function stats(model) {
    if (model._suggestStats) return model._suggestStats;
    const s = {
        n: 0,
        attrCount: new Map(),          // Attribut -> Anzahl Items
        featCount: new Map(),          // Merkmal -> Anzahl Items
        co: new Map(),                 // Merkmal -> Map(Attribut -> Anzahl)
        values: new Map(),             // Attribut -> Map(roher Wert -> { n, byType: Map, byName: Map })
        kids: new Map(),               // type -> [mit Unter-Items, gesamt]
        pluginAttr: new Map(),         // Attribut (ohne @) -> Plugin
        gaUse: new Map(),              // Gruppenadresse -> [{ path, attr }]
    };
    for (const p of model.plugins || []) for (const a of p.attrs) s.pluginAttr.set(a, p);
    const inc = (m, k, d = 1) => m.set(k, (m.get(k) || 0) + d);
    for (const node of model.nodes()) {
        if (!node.defs.some(d => !d.struct)) continue;
        s.n++;
        const type = String(node.attr('type') || 'foo');
        const own = [...node.attrs].filter(([, a]) => !a.origin);
        const feats = own.map(([k]) => k);
        const t = own.find(([k]) => k === 'type');
        if (t) feats.push('type=' + String(t[1].value));
        for (const f of feats) inc(s.featCount, f);
        for (const [k, a] of own) {
            inc(s.attrCount, k);
            if (GA_ATTRS.has(k.split('@')[0])) {
                const text = Array.isArray(a.value) ? a.value.join(' ') : String(a.value);
                for (const ga of text.match(GA_RE) || []) {
                    if (!s.gaUse.has(ga)) s.gaUse.set(ga, []);
                    s.gaUse.get(ga).push({ path: node.path, attr: k });
                }
            }
            for (const f of feats) {
                if (f === k) continue;
                if (!s.co.has(f)) s.co.set(f, new Map());
                inc(s.co.get(f), k);
            }
            const raw = rawValue(model, a);
            if (raw) {
                if (!s.values.has(k)) s.values.set(k, new Map());
                const vm = s.values.get(k);
                if (!vm.has(raw)) vm.set(raw, { n: 0, byType: new Map(), byName: new Map() });
                const e = vm.get(raw);
                e.n++;
                inc(e.byType, type);
                inc(e.byName, node.name);
            }
        }
        const kv = s.kids.get(type) || [0, 0];
        if ([...node.children.values()].some(c => !c.fromStruct)) kv[0]++;
        kv[1]++;
        s.kids.set(type, kv);
    }
    model._suggestStats = s;
    return s;
}

// ---------- Kontext im Dokument ----------

const KEY_LINE = /^(\s*)([^\s#:'"-][^:#]*?|'[^']*'|"[^"]*")\s*:(?:\s+(.*))?\s*$/;

function info(text) {
    const ind = text.search(/\S/);
    if (ind < 0) return { blank: true };
    const t = text.slice(ind);
    if (t[0] === '#' || t[0] === '%' || t === '---') return { blank: true };
    if (t === '-' || t.startsWith('- ')) return { ind, list: true };
    const m = KEY_LINE.exec(text);
    if (!m) return { ind, other: true };
    let rest = (m[3] || '').trim();
    const hash = rest.search(/(^|\s)#/);
    if (hash >= 0) rest = rest.slice(0, hash).trim();
    return { ind, key: m[2].replace(/^['"]|['"]$/g, ''), rest };
}

// Schlüssel-Kette der umschließenden Items (außen -> innen) für eine Zeile mit Einrückung ind
function parentChain(lines, lineNo, ind) {
    const chain = [];
    let cur = ind;
    for (let i = lineNo - 1; i >= 0 && cur > 0; i--) {
        const li = info(lines[i]);
        if (li.blank || li.list || li.other) continue;
        if (li.ind < cur) {
            chain.unshift({ key: li.key, line: i, ind: li.ind, rest: li.rest });
            cur = li.ind;
        }
    }
    return chain;
}

// Geschwister-Schlüssel auf gleicher Ebene (im selben Block) – Attribute und Unter-Items
function siblings(lines, lineNo, ind, knownAttr) {
    const out = [];
    const scan = (from, step) => {
        for (let i = from; i >= 0 && i < lines.length; i += step) {
            const li = info(lines[i]);
            if (li.blank) continue;
            if (li.ind < ind) break;
            if (li.ind !== ind || li.list || li.other) continue;
            // Attribut: hat einen Wert, ist bekannt oder darunter folgt eine Liste
            let attr = !!li.rest || knownAttr(li.key);
            if (!attr) {
                for (let j = i + 1; j < lines.length; j++) {
                    const nj = info(lines[j]);
                    if (nj.blank) continue;
                    attr = !!nj.list && nj.ind >= ind;
                    break;
                }
            }
            out.push({ key: li.key, rest: li.rest, attr, line: i });
        }
    };
    scan(lineNo - 1, -1);
    scan(lineNo + 1, 1);
    return out;
}

function indentUnit(lines) {
    for (const l of lines) {
        const li = info(l);
        if (!li.blank && li.ind > 0) return li.ind;
    }
    return 4;
}

// ---------- Vorschläge ----------

/**
 * @param model    geladenes Modell (oder null)
 * @param lines    Zeilen des Dokuments
 * @param lineNo   Zeile des Cursors
 * @param col      Spalte des Cursors
 * @param kind     'items' | 'structs'
 * @returns { start, end, items: [{ label, kind, insert, snippet, detail, doc, score, retrigger, filter }] } | null
 */
function suggest(model, lines, lineNo, col, kind) {
    if (!model) return null;
    const s = stats(model);
    const text = lines[lineNo] || '';
    const prefix = text.slice(0, col);
    const wordEnd = col + (/^[\w@./]*/.exec(text.slice(col)) || [''])[0].length;

    const pluginInfo = (key) => {
        const [base] = key.split('@');
        const p = s.pluginAttr.get(base);
        return p ? { plugin: p, info: p.attrInfo && p.attrInfo.get(base) } : null;
    };
    const knownAttr = (key) => !!(CORE[key.split('@')[0]] || pluginInfo(key) || s.attrCount.has(key) || key.includes('@'));

    // Attribut, zu dem eine Listenzeile "- …" gehört
    const listOwner = (ind) => {
        for (let i = lineNo - 1; i >= 0; i--) {
            const li = info(lines[i]);
            if (li.blank || li.list) continue;
            return !li.other && li.ind <= ind && !li.rest ? { ...li, line: i } : null;
        }
        return null;
    };
    const attrCtx = (attrLine, attrInd) =>
        itemContext(lines, attrLine, attrInd, parentChain(lines, attrLine, attrInd), kind, knownAttr);

    // 1) sh.<item> in Ausdrücken (eval, on_change, …), auch relativ: sh..kind, sh...geschwister
    let m = /\bsh\.([\w.]*)$/.exec(prefix);
    if (m && (/:\s/.test(prefix) || /^\s*-\s/.test(prefix))) {
        const ind = text.search(/\S/);
        const owner = /^\s*-\s/.test(prefix) ? listOwner(ind) : { line: lineNo, ind };
        if (!owner) return null;
        const ctx = attrCtx(owner.line, owner.ind);
        return { start: col - m[1].length, end: wordEnd, items: itemPaths(model, ctx.path, { sh: true }) };
    }

    // 2) Wert eines Attributs: "key: <cursor>"
    m = /^(\s*)([\w@.-]+)\s*:\s+(['"]?)(.*)$/.exec(prefix);
    if (m) {
        const key = m[2], partial = m[4];
        const base = key.split('@')[0];
        const ctx = attrCtx(lineNo, m[1].length);
        const start = col - partial.length - m[3].length;
        if (TARGET_ATTRS.has(base)) {
            // Ziel-Item vor dem "=": absolute oder relative Pfade, danach " = "
            if (partial.includes('=') || !/^[\w.]*$/.test(partial)) return null;
            return { start, end: wordEnd, items: itemPaths(model, ctx.path, { target: true }) };
        }
        if (EXPR_ATTRS.has(base)) return null;
        if (GA_ATTRS.has(base)) {
            // nur das letzte Element einer Kommaliste ersetzen
            const tail = partial.slice(partial.lastIndexOf(',') + 1).replace(/^\s+/, '');
            return { start: col - tail.length, end: wordEnd, items: gaSuggestions(model, s, key, ctx) };
        }
        return { start, end: text.length, items: valueSuggestions(model, s, key, ctx, pluginInfo(key)) };
    }

    // 3) Listeneintrag: "- <cursor>" unter eval_trigger, on_change, knx_listen, …
    m = /^(\s*)-\s+(['"]?)([\w./]*)$/.exec(prefix);
    if (m) {
        const owner = listOwner(m[1].length);
        if (!owner) return null;
        const base = owner.key.split('@')[0];
        const ctx = attrCtx(owner.line, owner.ind);
        const start = col - m[3].length - m[2].length;
        if (GA_ATTRS.has(base)) return { start, end: wordEnd, items: gaSuggestions(model, s, owner.key, ctx) };
        if (TARGET_ATTRS.has(base)) return { start, end: wordEnd, items: itemPaths(model, ctx.path, { target: true }) };
        const pi = pluginInfo(owner.key);
        if (!isItemAttr(owner.key, pi && pi.info)) return null;
        return { start, end: wordEnd, items: itemPaths(model, ctx.path, {}) };
    }

    // 4) Schlüssel: neues Attribut oder Unter-Item
    m = /^(\s*)([\w@]*)$/.exec(prefix);
    if (!m) return null;
    const ind = m[1].length;
    const chain = parentChain(lines, lineNo, ind);
    if (kind === 'structs' && !chain.length) return null;   // Struct-Namen selbst nicht vorschlagen
    const parent = chain[chain.length - 1];
    if (parent && parent.key === 'log_rules') {
        return { start: col - m[2].length, end: wordEnd, items: LOG_RULES.map((k, i) => ({ label: k, kind: 'attr', insert: k + ': ', detail: 'log_rules', score: 1 - i / 10 })) };
    }
    if (parent && parent.rest) return null;   // unter einem Attribut mit Wert
    const ctx = itemContext(lines, lineNo, ind, chain, kind, knownAttr);
    const unit = indentUnit(lines);
    const items = keySuggestions(model, s, ctx, unit, pluginInfo);
    return { start: col - m[2].length, end: wordEnd, items };
}

// Was über das Item an der Cursorposition bekannt ist
function itemContext(lines, lineNo, ind, chain, kind, knownAttr) {
    const keys = chain.map(c => c.key);
    const pathKeys = kind === 'structs' ? keys.slice(1) : keys;
    const sib = siblings(lines, lineNo, ind, knownAttr);
    const attrs = sib.filter(x => x.attr);
    const typeSib = attrs.find(x => x.key === 'type');
    const structSib = attrs.find(x => x.key === 'struct');
    return {
        kind,
        keys,
        path: pathKeys.join('.'),
        depth: pathKeys.length,
        name: keys.length ? keys[keys.length - 1] : '',
        parentName: keys.length > 1 ? keys[keys.length - 2] : '',
        present: new Set(sib.map(x => x.key)),
        attrs,
        childItems: sib.filter(x => !x.attr),
        type: typeSib ? typeSib.rest.replace(/^['"]|['"]$/g, '') : '',
        structs: structSib ? structSib.rest.replace(/[[\]'"]/g, '').split(',').map(x => x.trim()).filter(Boolean) : [],
    };
}

function keySuggestions(model, s, ctx, unit, pluginInfo) {
    const out = [];
    const feats = ctx.attrs.map(a => a.key);
    if (ctx.type) feats.push('type=' + ctx.type);

    // Wahrscheinlichkeit, dass dieses Item Unter-Items hat
    let itemFactor = 1;
    if (ctx.type && ctx.type !== 'foo') {
        const kv = s.kids.get(ctx.type) || [0, 0];
        itemFactor = (kv[0] + 1) / (kv[1] + 4);
    } else if (ctx.attrs.length && !ctx.attrs.some(a => a.key === 'struct')) itemFactor = 0.6;
    if (ctx.childItems.length) itemFactor = Math.max(itemFactor, 0.9);
    const attrFactor = ctx.childItems.length && !ctx.attrs.length ? 0.6 : 1;

    // das Item selbst im Modell (Stand der gespeicherten Dateien) – z.B. für Attribute aus Structs
    const own = ctx.kind === 'items' && ctx.path ? model.index.get(ctx.path) : null;

    // --- Attribute ---
    const cands = new Map();   // Schlüssel -> { source }
    for (const k of Object.keys(CORE)) cands.set(k, 'core');
    for (const p of model.plugins || []) {
        for (const a of p.attrs) {
            if (!cands.has(a)) cands.set(a, 'plugin');
            for (const inst of p.instances || []) if (!cands.has(a + '@' + inst)) cands.set(a + '@' + inst, 'plugin');
        }
    }
    for (const k of s.attrCount.keys()) if (!cands.has(k)) cands.set(k, 'used');

    for (const [key, source] of cands) {
        if (!ctx.keys.length) break;            // auf oberster Ebene stehen nur Items
        if (ctx.present.has(key)) continue;
        const used = s.attrCount.get(key) || 0;
        const base = s.n ? used / s.n : 0;
        let cond = 0, condMax = 0;
        for (const f of feats) {
            const fc = s.featCount.get(f);
            if (!fc) continue;
            const c = ((s.co.get(f) && s.co.get(f).get(key)) || 0) / fc;
            cond += c;
            condMax = Math.max(condMax, c);
        }
        let score = feats.length ? 0.15 * Math.sqrt(base) + 0.85 * (0.7 * condMax + 0.3 * cond / feats.length) : Math.sqrt(base) * 0.8;
        if (!used) score = source === 'core' ? 0.02 : 0.012;
        const fromStruct = own && own.attrs.get(key) && own.attrs.get(key).origin;
        if (key === 'type' && !ctx.childItems.length && !ctx.structs.length && !fromStruct) score = Math.max(score, 0.6);
        score *= attrFactor;
        if (fromStruct) score *= 0.25;   // kommt schon aus dem Struct, Überschreiben ist selten

        const pi = pluginInfo(key);
        const core = CORE[key];
        const doc = [];
        if (core) doc.push(core.desc);
        if (pi && pi.info && pi.info.desc) doc.push(pi.info.desc);
        if (pi && pi.info && pi.info.type) doc.push('Typ: `' + pi.info.type + '`');
        if (pi && pi.info && pi.info.valid.length) doc.push('Werte: ' + pi.info.valid.map(v => '`' + (v === '' ? "''" : v) + '`').join(', '));
        if (used) doc.push(`In ${used} Items verwendet` + topValues(s, key));
        if (fromStruct) doc.push(`Kommt bereits aus Struct \`${fromStruct}\`: \`${String(own.attr(key))}\``);
        out.push({
            label: key,
            kind: 'attr',
            insert: key + ': ',
            retrigger: hasValues(s, key, pi),
            detail: (core ? 'SmartHomeNG' : pi ? 'Plugin ' + pi.plugin.name : 'verwendetes Attribut') +
                (fromStruct ? ' · schon aus Struct ' + fromStruct : ''),
            doc: doc.join('\n\n'),
            score,
        });
    }

    // --- Unter-Items ---
    const names = new Map();   // Name -> { score, from }
    const add = (name, sc, from) => {
        if (ctx.present.has(name) || CORE[name] || s.attrCount.has(name)) return;
        const e = names.get(name) || { score: 0, from: [] };
        e.score += sc;
        if (from && !e.from.includes(from)) e.from.push(from);
        names.set(name, e);
    };
    const nodes = [...model.nodes()];
    const ownKids = (n) => [...n.children.values()].filter(c => !c.fromStruct && c.defs.some(d => !d.struct));
    if (ctx.name) {
        // Kinder gleichnamiger Items (z.B. alle "licht" -> decke, spiegel, …)
        const same = nodes.filter(n => n.name === ctx.name && n.path !== ctx.path);
        const tally = new Map();
        for (const n of same) for (const c of ownKids(n)) tally.set(c.name, (tally.get(c.name) || 0) + 1);
        for (const [k, v] of tally) add(k, 1.0 * v / same.length, `${v}× unter „${ctx.name}“`);
    }
    if (ctx.kind === 'items') {
        // Kinder gleich tief liegender Items (z.B. alle Räume -> licht, rolladen, …)
        const peers = ctx.depth === 0 ? [model.root] : nodes.filter(n => n.path.split('.').length === ctx.depth && n.path !== ctx.path);
        const tally = new Map();
        for (const n of peers) for (const c of (n === model.root ? [...n.children.values()] : ownKids(n))) tally.set(c.name, (tally.get(c.name) || 0) + 1);
        for (const [k, v] of tally) add(k, 0.6 * v / Math.max(peers.length, 1), ctx.depth === 0 ? 'Top-Level-Item' : `${v}× auf Ebene ${ctx.depth + 1}`);
    }
    // Kinder aus dem Struct des Items – zum Erweitern
    const structNames = new Set(ctx.structs);
    if (own && own.attrs.get('struct')) String(own.attr('struct')).split(',').forEach(x => structNames.add(x.trim()));
    for (const sn of structNames) {
        const def = model.structs.get(sn);
        if (!def || !def.node.children) continue;
        for (const [k, c] of def.node.children) if (c.children) add(k, 1.2, `aus Struct ${sn} – erweitern`);
    }
    for (const [name, e] of names) {
        out.push({
            label: name,
            kind: 'item',
            snippet: name + ':\n' + ' '.repeat(unit) + '$0',
            detail: 'Item · ' + e.from.join(', '),
            doc: 'Unter-Item anlegen',
            score: Math.min(e.score, 1.2) * 0.8 * itemFactor,
        });
    }
    out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return out;
}

function topValues(s, key) {
    const vm = s.values.get(key);
    if (!vm) return '';
    const top = [...vm].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([v, e]) => '`' + v + '` (' + e.n + ')');
    return top.length ? '; häufige Werte: ' + top.join(', ') : '';
}

function hasValues(s, key, pi) {
    const base = key.split('@')[0];
    if (EXPR_ATTRS.has(base)) return false;
    return !!(CORE[base] && (CORE[base].values || CORE[base].structs || CORE[base].items)) ||
        !!(pi && pi.info && pi.info.valid.length) || s.values.has(key) || isItemAttr(key, pi && pi.info);
}

function valueSuggestions(model, s, key, ctx, pi) {
    const base = key.split('@')[0];
    if (isItemAttr(key, pi && pi.info)) return itemPaths(model, ctx.path, {});
    const out = new Map();   // Wert -> { score, detail }
    const add = (v, score, detail) => {
        const e = out.get(v);
        if (!e || e.score < score) out.set(v, { score: Math.max(score, e ? e.score : 0), detail: detail || (e && e.detail) || '' });
    };
    const fixed = (CORE[base] && CORE[base].values) || [];
    fixed.forEach((v, i) => add(v, 0.05 - i * 0.001, 'SmartHomeNG'));
    if (pi && pi.info) pi.info.valid.forEach((v, i) => add(v === '' ? "''" : v, 0.06 - i * 0.001, 'Plugin ' + pi.plugin.name));
    if (CORE[base] && CORE[base].structs) {
        const usage = s.values.get('struct') || new Map();
        for (const name of model.structs.keys()) {
            const u = usage.get(name);
            add(name, 0.04 + (u ? 0.5 * u.n / s.n + 0.3 : 0), 'Struct' + (u ? ` · ${u.n}× verwendet` : ''));
        }
    }
    // knx_dpt: DPT der Gruppenadressen dieses Items laut ETS
    if (base === 'knx_dpt' && model.knx) {
        for (const a of ctx.attrs) {
            if (!GA_ATTRS.has(a.key.split('@')[0])) continue;
            for (const ga of a.rest.match(GA_RE) || []) {
                const g = model.knx.gas.get(ga);
                if (!g || !g.dpt || !g.dpt.shng) continue;
                add(dptValue(g), 2,`aus ETS: ${ga} „${g.name}“ (DPT ${g.dpt.label})`);
            }
        }
    }
    // in den Items verwendete Werte, gewichtet nach gleichem Item-Namen und gleichem Typ
    const vm = s.values.get(key);
    if (vm) {
        let total = 0, totalType = 0, totalName = 0;
        for (const e of vm.values()) {
            total += e.n;
            totalType += e.byType.get(ctx.type || 'foo') || 0;
            totalName += e.byName.get(ctx.name) || 0;
        }
        for (const [v, e] of vm) {
            const pName = totalName ? (e.byName.get(ctx.name) || 0) / totalName : 0;
            const pType = totalType ? (e.byType.get(ctx.type || 'foo') || 0) / totalType : 0;
            const score = 0.45 * pName + 0.35 * pType + 0.2 * e.n / total + 0.1;
            const why = [];
            if (pName) why.push(`bei „${ctx.name}“ ${e.byName.get(ctx.name)}×`);
            if (pType && ctx.type) why.push(`bei type ${ctx.type} ${e.byType.get(ctx.type)}×`);
            add(v, score, `${e.n}× verwendet` + (why.length ? ' · ' + why.join(', ') : ''));
        }
    }
    return [...out].map(([v, e]) => ({ label: v, kind: 'value', insert: v, detail: e.detail, score: e.score }))
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

// Item-Pfade: relative Referenzen (Geschwister, Kinder, …) und absolute Pfade, nahe Items zuerst
// opts.sh: in einem Ausdruck nach "sh." (Einfügen mit "()"); opts.target: Ziel bei on_change (Einfügen mit " = ")
function itemPaths(model, here, opts) {
    const hereSegs = here ? here.split('.') : [];
    const suffix = opts.sh ? '()' : opts.target ? ' = ' : '';
    const nodeDetail = (node) => [node.attr('type') || 'foo', node.fromStruct ? 'aus Struct ' + node.fromStruct : ''].filter(Boolean).join(' · ');
    const out = [];

    // relative Referenzen – nur wenn das Item (bzw. sein Eltern-Item) im Modell bekannt ist
    if (here) {
        const self = model.index.get(here);
        const parentPath = hereSegs.slice(0, -1).join('.');
        const parent = parentPath ? model.index.get(parentPath) : model.root;
        const grandPath = hereSegs.slice(0, -2).join('.');
        const grand = hereSegs.length > 1 ? (grandPath ? model.index.get(grandPath) : model.root) : null;
        const rel = (prefix, base, score, what, depth) => {
            if (!base) return;
            for (const c of base.children.values()) {
                if (prefix === '..' && c.path === here) continue;
                if (prefix === '...' && c.path === parentPath) continue;
                out.push({ label: prefix + c.name, kind: 'ref', insert: prefix + c.name + suffix, detail: `relativ: ${what} · ${c.path}`, score, filter: prefix + c.name });
                if (depth > 1) {
                    for (const g of c.children.values()) {
                        out.push({ label: prefix + c.name + '.' + g.name, kind: 'ref', insert: prefix + c.name + '.' + g.name + suffix, detail: `relativ · ${g.path}`, score: score - 0.08 });
                    }
                }
            }
        };
        rel('..', parent, 1.0, 'Geschwister', 2);
        rel('.', self, 0.97, 'Kind', 2);
        rel('...', grand, 0.86, 'Geschwister des Eltern-Items', 1);
        if (opts.sh && self) out.push({ label: '.self', kind: 'ref', insert: '.self.', detail: 'relativ: das Item selbst (z.B. .self.prev_value())', score: 0.9 });
    }

    for (const node of model.nodes()) {
        if (here && node.path === here) continue;   // nicht auf sich selbst verweisen
        const segs = node.path.split('.');
        let common = 0;
        while (common < segs.length && common < hereSegs.length && segs[common] === hereSegs[common]) common++;
        const score = (common / Math.max(hereSegs.length, 1)) * 0.7 + (node.fromStruct ? 0 : 0.1) + 0.1 / segs.length;
        out.push({ label: node.path, kind: 'ref', insert: node.path + suffix, detail: nodeDetail(node), score });
    }
    return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

// knx_dpt-Wert so, wie er in die YAML gehört ('5.001' mit Anführungszeichen)
function dptValue(g) {
    return g.dpt && g.dpt.shng ? (g.dpt.shng.includes('.') ? `'${g.dpt.shng}'` : g.dpt.shng) : '';
}
function dptText(g) {
    return g.dpt ? `DPT ${g.dpt.label}` + (g.dpt.shng ? ` → \`knx_dpt: ${dptValue(g)}\`` : '') : 'kein DPT in der ETS';
}

// Gruppenadressen für knx_send/knx_listen/…: passende aus der ETS, nächste freie, bereits verwendete
function gaSuggestions(model, s, key, ctx) {
    const base = key.split('@')[0];
    const knx = model.knx;
    const own = ctx.kind === 'items' && ctx.path ? model.index.get(ctx.path) : null;
    const type = ctx.type || (own && own.attr('type')) || '';
    const dptSib = ctx.attrs.find(a => a.key === 'knx_dpt');
    const dpt = String((dptSib && dptSib.rest.replace(/['"]/g, '')) || (own && own.attr('knx_dpt')) || '').split('.')[0];
    const mine = new Set();   // Adressen, die dieses Item schon verwendet
    for (const a of ctx.attrs) if (GA_ATTRS.has(a.key.split('@')[0])) (a.rest.match(GA_RE) || []).forEach(g => mine.add(g));
    const wantsStatus = base !== 'knx_send';
    const out = [];

    // Wörter des Items: Pfad (tiefere Ebenen zählen mehr), Name, Synonyme
    const segs = ctx.path ? ctx.path.split('.') : [];
    const words = new Map();
    segs.forEach((seg, i) => {
        for (const t of tokens(seg)) {
            const w = 0.6 + 0.8 * (i + 1) / segs.length;
            for (const syn of SYNONYMS[t] || [t]) words.set(syn, Math.max(words.get(syn) || 0, syn === t ? w : w * 0.8));
        }
    });
    if (own && own.attr('name')) for (const t of tokens(own.attr('name'))) words.set(t, Math.max(words.get(t) || 0, 1));
    const groupKey = (ga) => ga.split('/').slice(0, 2).join('/');

    if (knx && knx.gas.size) {
        const totalW = [...words.values()].reduce((a, b) => a + b, 0) || 1;
        for (const g of knx.gas.values()) {
            const gt = tokens(`${g.name} ${g.groups.join(' ')} ${g.desc}`);
            let hit = 0;
            for (const [w, wt] of words) if (gt.some(t => tokMatch(w, t))) hit += wt;
            let score = 0.8 * hit / totalW;
            const isStatus = gt.some(t => t === 'status' || t === 'rm' || t.startsWith('rueckmeld'));
            if (isStatus) score += wantsStatus ? 0.12 : -0.12;
            if (g.dpt) {
                if (dpt) score *= g.dpt.main === dpt ? 1.25 : 0.4;
                else if (type === 'bool') score *= g.dpt.main === '1' ? 1.15 : 0.5;
                else if (type === 'num') score *= g.dpt.main === '1' ? 0.6 : 1.05;
            }
            const used = (s.gaUse.get(g.ga) || []).filter(u => u.path !== ctx.path);
            if (used.length) score *= 0.6;
            if (mine.has(g.ga)) score *= base === 'knx_send' ? 0.3 : 1.1;
            // Anzeige: Hauptgruppe › Mittelgruppe › Name · DPT · verwendet/frei
            const detail = [[...g.groups, g.name].filter(Boolean).join(' › '), g.dpt ? 'DPT ' + g.dpt.label : '',
                used.length ? 'verwendet: ' + used[0].path + (used.length > 1 ? ` (+${used.length - 1})` : '') : 'frei']
                .filter(Boolean).join(' · ');
            const doc = [`**${g.ga}** ${g.name}`, g.groups.join(' › '), g.desc, dptText(g),
                used.length ? 'Verwendet von:\n' + used.map(u => `- \`${u.path}\` (${u.attr})`).join('\n') : ''].filter(Boolean).join('\n\n');
            // Filtern beim Tippen auch über die Namen von Haupt- und Mittelgruppe ("Galer" findet "Galerie › Seilsystem Schalten")
            out.push({ label: g.ga, kind: 'value', insert: g.ga, detail, doc, score, filter: `${g.ga} ${g.name} ${g.groups.join(' ')}` });
        }
    } else {
        // ohne ETS: Adressen, die in den Items schon verwendet werden
        for (const [ga, uses] of s.gaUse) {
            const others = uses.filter(u => u.path !== ctx.path);
            if (!others.length) continue;
            out.push({ label: ga, kind: 'value', insert: ga, detail: 'verwendet: ' + others[0].path, score: 0.05, filter: ga });
        }
    }

    // nächste freie Adresse in der Gruppe, die dieses Item bzw. seine Nachbarn verwenden
    const neighbours = [...mine];
    const parentPath = ctx.path.split('.').slice(0, -1).join('.');
    for (const [ga, uses] of s.gaUse) if (uses.some(u => parentPath && u.path.startsWith(parentPath + '.'))) neighbours.push(ga);
    if (neighbours.length) {
        const tally = new Map();
        for (const ga of neighbours) tally.set(groupKey(ga), (tally.get(groupKey(ga)) || 0) + 1);
        const group = [...tally].sort((a, b) => b[1] - a[1])[0][0];
        const usedSubs = new Set();
        for (const ga of s.gaUse.keys()) if (groupKey(ga) === group) usedSubs.add(+ga.split('/')[2]);
        if (knx) for (const ga of knx.gas.keys()) if (groupKey(ga) === group) usedSubs.add(+ga.split('/')[2]);
        let sub = Math.max(...neighbours.filter(ga => groupKey(ga) === group).map(ga => +ga.split('/')[2])) + 1;
        while (sub <= 255 && usedSubs.has(sub)) sub++;
        if (sub <= 255) {
            const ga = `${group}/${sub}`;
            const gname = knx && knx.groups.get(group);
            out.push({
                // hinter gut passende ETS-Adressen, aber vor schwachen Treffern
                label: ga, kind: 'value', insert: ga, score: 0.3, filter: `${ga} neu frei`,
                detail: `neu · nächste freie Adresse in ${group}${gname ? ' (' + gname + ')' : ''}` + (knx ? ' – in der ETS anlegen' : ''),
                doc: knx ? 'Weder in der ETS noch in den Items verwendet.' : 'In den Items noch nicht verwendet (kein ETS-Projekt konfiguriert, siehe `shngItems.knxProject`).',
            });
        }
    }
    return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// Python-Logiken (logics/*.py): sh.<item> und items.return_item('<item>')
function suggestPython(model, lines, lineNo, col) {
    if (!model) return null;
    const text = lines[lineNo] || '';
    const prefix = text.slice(0, col);
    const wordEnd = col + (/^[\w.]*/.exec(text.slice(col)) || [''])[0].length;
    let m = /items\.return_item\(\s*['"]([\w.]*)$/.exec(prefix);
    if (m) return { start: col - m[1].length, end: wordEnd, items: itemPaths(model, '', {}) };
    m = /(?:^|[^\w.])sh\.([\w.]*)$/.exec(prefix);
    if (m && !/^\s*#/.test(prefix)) return { start: col - m[1].length, end: wordEnd, items: itemPaths(model, '', { sh: true }) };
    return null;
}

// Info zu einer Gruppenadresse (Hover)
function gaInfo(model, ga) {
    if (!model) return null;
    const s = stats(model);
    const g = model.knx && model.knx.gas.get(ga);
    const uses = s.gaUse.get(ga) || [];
    if (!g && !uses.length) return null;
    const parts = [];
    if (g) {
        parts.push(`**${ga}** ${g.name}`);
        if (g.groups.length) parts.push(g.groups.join(' › '));
        if (g.desc) parts.push(g.desc);
        parts.push(dptText(g));
    } else {
        parts.push(`**${ga}**`, model.knx ? '_nicht im ETS-Projekt_' : '_kein ETS-Projekt konfiguriert (`shngItems.knxProject`)_');
    }
    if (uses.length) parts.push('Verwendet von:\n' + uses.map(u => `- \`${u.path}\` (${u.attr})`).join('\n'));
    return parts.join('\n\n');
}

module.exports = { suggest, suggestPython, gaInfo, stats, CORE };
