'use strict';
// Kleiner, toleranter YAML-Parser für SmartHomeNG-Dateien (items/, structs/, plugin.yaml).
// Unterstützt Block-Mappings, Block-Listen, Block-Scalars (| >) und Flow-Listen ([a, b]).
// Jeder Knoten merkt sich seine Zeile, damit die Extension direkt dorthin springen kann.
//
// Knoten: { key, line, indent, value, children: Map|null, itemLines? }
//   value:    string | string[] | null
//   children: Map nur bei Mappings (= Items bzw. Struct-Knoten)

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#][^:]*?)\s*:(?:\s+(.*))?$/;
const BLOCK_RE = /^[|>][-+0-9]*$/;

function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) {
            if (q === '"' && c === '\\') i++;
            else if (c === q) q = null;
            continue;
        }
        if ((c === '"' || c === "'") && (i === 0 || /[\s[,{:]/.test(s[i - 1]))) q = c;
        else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    }
    return s.trimEnd();
}

function unquote(s) {
    if (s.length >= 2) {
        if (s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
        if (s[0] === '"' && s.endsWith('"')) {
            try { return JSON.parse(s); } catch { return s.slice(1, -1); }
        }
    }
    return s;
}

// Kommaliste auf oberster Ebene trennen (Kommas in Quotes/Klammern ignorieren)
function splitTop(s) {
    const out = [];
    let depth = 0, q = null, start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) { if (c === q) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '[' || c === '{' || c === '(') depth++;
        else if (c === ']' || c === '}' || c === ')') depth--;
        else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map(x => x.trim()).filter(Boolean);
}

function flowList(s) {
    return splitTop(s.slice(1, -1)).map(unquote);
}

function scalar(rest) {
    if (rest.startsWith('[') && rest.endsWith(']')) return flowList(rest);
    return unquote(rest);
}

function parse(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const root = { key: null, line: -1, indent: -1, value: null, children: null };
    const stack = [root];
    let last = null;    // zuletzt angelegter Key-Knoten
    let block = null;   // offener Block-Scalar
    let flow = null;    // offene mehrzeilige Flow-Liste

    const endBlock = () => {
        const buf = block.buf;
        while (buf.length && !buf[buf.length - 1].trim()) buf.pop();
        const ind = Math.min(...buf.filter(l => l.trim()).map(l => l.search(/\S/)));
        const body = buf.map(l => (l.trim() ? l.slice(ind) : ''));
        block.node.value = block.fold ? body.join(' ').replace(/\s+/g, ' ').trim() : body.join('\n');
        block = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const ind = raw.search(/\S/);

        if (block) {
            if (ind === -1 || ind > block.indent) { block.buf.push(raw); continue; }
            endBlock();
        }
        if (flow) {
            const part = stripComment(raw.trim());
            flow.buf += ' ' + part;
            if (part.endsWith(']')) { flow.node.value = flowList(flow.buf); flow = null; }
            continue;
        }
        if (ind === -1) continue;

        const content = stripComment(raw.slice(ind));
        if (!content || content[0] === '%' || content === '---' || content === '...') continue;

        if (content === '-' || content.startsWith('- ')) {
            if (last && !last.children && ind >= last.indent && (last.value === null || Array.isArray(last.value))) {
                if (last.value === null) { last.value = []; last.itemLines = []; }
                last.value.push(scalar(content.slice(1).trim()));
                last.itemLines.push(i);
            }
            continue;
        }

        const m = KEY_RE.exec(content);
        if (!m) {
            // Fortsetzung eines mehrzeiligen Plain-Scalars
            if (last && typeof last.value === 'string' && ind > last.indent) last.value += ' ' + content;
            continue;
        }

        while (stack[stack.length - 1].indent >= ind) stack.pop();
        const parent = stack[stack.length - 1];
        if (!parent.children) parent.children = new Map();
        const node = { key: unquote(m[1].trim()), line: i, indent: ind, value: null, children: null };
        parent.children.set(node.key, node);
        stack.push(node);
        last = node;

        const rest = m[2] === undefined ? '' : m[2].trim();
        if (!rest) continue;
        if (BLOCK_RE.test(rest)) {
            node.value = '';
            block = { node, indent: ind, buf: [], fold: rest[0] === '>' };
        } else if (rest[0] === '[' && !rest.endsWith(']')) {
            flow = { node, buf: rest };
        } else {
            node.value = scalar(rest);
        }
    }
    if (block) endBlock();
    return root;
}

module.exports = { parse };
