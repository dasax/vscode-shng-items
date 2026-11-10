'use strict';
// Liest Gruppenadressen aus einem ETS-Projekt (.knxproj): Adresse, Name, DPT, Beschreibung, Gruppen.
// Ergebnis wird je Pfad + Änderungszeit zwischengespeichert.

const fs = require('fs');
const zip = require('./zip');
const { t } = require('./i18n');

// DPTs, die das SmartHomeNG-KNX-Plugin kennt (plugins/knx/dpts.py)
const SHNG_DPTS = new Set(['1', '2', '3', '4002', '4.002', '5', '5001', '5.001', '5003', '5.003', '5999', '5.999', '6', '7', '8', '9',
    '10', '11', '12', '13', '14', '16000', '16', '16001', '16.001', '17', '17001', '17.001', '18001', '18.001', '20', '24', '28',
    '28001', '28.001', '229', '232', '251', '275.100']);

function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    });
}

function attrs(s) {
    const out = {};
    for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = decode(m[2]);
    return out;
}

function gaString(n) {
    return `${n >> 11}/${(n >> 8) & 7}/${n & 255}`;
}

// "DPST-5-1" -> { main: '5', shng: '5.001', label: '5.001' }; "DPT-9" -> { main: '9', shng: '9' }
function parseDpt(s) {
    const m = /DPS?T-(\d+)(?:-(\d+))?/.exec(s || '');
    if (!m) return null;
    const main = m[1];
    const sub = m[2] ? `${main}.${m[2].padStart(3, '0')}` : null;
    return { main, label: sub || main, shng: sub && SHNG_DPTS.has(sub) ? sub : (SHNG_DPTS.has(main) ? main : null) };
}

function parse(xml) {
    const gas = new Map();    // "1/1/22" -> { ga, name, desc, dpt, groups: [Hauptgruppe, Mittelgruppe] }
    const groups = new Map(); // "1" bzw. "1/1" -> Name
    const stack = [];
    for (const m of xml.matchAll(/<(\/?)(GroupRange|GroupAddress)\b([^>]*?)(\/?)>/g)) {
        const [, close, tag, body, selfClose] = m;
        if (tag === 'GroupRange') {
            if (close) { stack.pop(); continue; }
            const a = attrs(body);
            const start = +a.RangeStart;
            const key = stack.length === 0 ? String(start >> 11) : `${start >> 11}/${(start >> 8) & 7}`;
            groups.set(key, a.Name || '');
            if (!selfClose) stack.push(a.Name || '');
        } else if (!close) {
            const a = attrs(body);
            if (a.Address === undefined) continue;
            const ga = gaString(+a.Address);
            gas.set(ga, { ga, name: a.Name || '', desc: a.Description || '', dpt: parseDpt(a.DatapointType), groups: stack.slice() });
        }
    }
    return { gas, groups };
}

const cache = new Map();   // Pfad -> { mtime, result }

/** @returns { gas, groups, file, error? } oder null, wenn kein Pfad gesetzt */
function load(path) {
    if (!path) return null;
    let st;
    try { st = fs.statSync(path); } catch (e) { return { gas: new Map(), groups: new Map(), file: path, error: t('knx.fileNotFound', path) }; }
    const c = cache.get(path);
    if (c && c.mtime === st.mtimeMs) return c.result;
    let result;
    try {
        const buf = fs.readFileSync(path);
        const list = zip.entries(buf);
        const xmlEntry = list.find(e => /^P-[^/]+\/0\.xml$/i.test(e.name));
        if (!xmlEntry) {
            const protectedZip = list.some(e => /^P-[^/]+\.zip$/i.test(e.name));
            throw new Error(protectedZip ? t('knx.protected') : t('knx.noData'));
        }
        result = { ...parse(zip.read(buf, xmlEntry).toString('utf8')), file: path };
    } catch (e) {
        result = { gas: new Map(), groups: new Map(), file: path, error: e.message };
    }
    cache.set(path, { mtime: st.mtimeMs, result });
    return result;
}

module.exports = { load, parseDpt, gaString };
