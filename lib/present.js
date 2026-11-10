'use strict';
// Darstellung von Items: Kurzbeschreibung, Icon, Markdown-Tooltip

const vscode = require('vscode');
const { t } = require('./i18n');

const TYPE_ICONS = {
    bool: 'symbol-boolean',
    num: 'symbol-number',
    str: 'symbol-string',
    list: 'symbol-array',
    dict: 'symbol-object',
    scene: 'symbol-event',
    foo: 'symbol-misc',
};

function fmtValue(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return '[' + v.map(fmtValue).join(', ') + ']';
    return String(v);
}

function basename(uri) {
    return String(uri.path || uri).split(/[\\/]/).pop();
}

function knxSummary(node) {
    const parts = [];
    const add = (attr, sym) => {
        const v = node.attr(attr);
        if (v !== undefined && v !== null && v !== '') parts.push(sym + fmtValue(v).replace(/^\[|\]$/g, ''));
    };
    add('knx_send', '→');
    add('knx_listen', '←');
    add('knx_status', '⇢');
    add('knx_init', '⇐');
    add('knx_cache', '⇐');
    return parts.join(' ');
}

function describe(node) {
    const parts = [];
    const type = node.attr('type');
    if (type) parts.push(type);
    const knx = knxSummary(node);
    if (knx) parts.push(knx);
    const hueId = node.attr('hue2_id');
    if (hueId !== undefined && !String(hueId).startsWith('..')) parts.push(`hue ${node.attr('hue2_resource') || ''}#${node.attr('hue2_id')}`);
    if (node.attrs.has('eval')) parts.push('ƒ');
    if (node.attrs.has('uzsu_item')) parts.push('⏲');
    const struct = node.attrs.get('struct');
    if (struct && !struct.origin) parts.push(`⟨${fmtValue(struct.value)}⟩`);
    if (node.fromStruct) parts.push(`· ${node.fromStruct}`);
    return parts.join('  ');
}

function iconFor(node) {
    const type = node.attr('type');
    let id = TYPE_ICONS[type];
    if (!id) id = node.children.size ? 'symbol-namespace' : 'symbol-variable';
    if (node.attrs.has('uzsu_item')) id = 'watch';
    return new vscode.ThemeIcon(id, node.fromStruct ? new vscode.ThemeColor('charts.purple') : undefined);
}

function openLink(uri, line) {
    const args = encodeURIComponent(JSON.stringify([uri.toString(), line]));
    return `command:shngItems.open?${args}`;
}

function cell(v, max = 140) {
    let s = fmtValue(v).replace(/\s+/g, ' ');
    if (s.length > max) s = s.slice(0, max - 1) + '…';
    return s ? '`' + s.replace(/`/g, "'").replace(/\|/g, '\\|') + '`' : '';
}

function itemMarkdown(node) {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['shngItems.open'] };
    md.appendMarkdown(`**\`${node.path}\`**`);
    if (node.attr('type')) md.appendMarkdown(` · ${node.attr('type')}`);
    if (node.attr('name')) md.appendMarkdown(`  \n${md_escape(fmtValue(node.attr('name')))}`);
    if (node.fromStruct) md.appendMarkdown(`  \n_${t('item.createdByStruct', '`' + node.fromStruct + '`')}_`);
    md.appendMarkdown('\n\n');

    if (node.attrs.size) {
        md.appendMarkdown(`| ${t('item.attribute')} | ${t('item.value')} | ${t('item.origin')} |\n|---|---|---|\n`);
        for (const [k, a] of node.attrs) {
            md.appendMarkdown(`| [${k}](${openLink(a.uri, a.line)}) | ${cell(a.value)} | ${a.origin ? '`' + a.origin + '`' : ''} |\n`);
        }
        md.appendMarkdown('\n');
    }
    if (node.children.size) {
        const names = [...node.children.keys()];
        md.appendMarkdown(`**${t('item.children', names.length)}** ${names.slice(0, 30).join(', ')}${names.length > 30 ? ', …' : ''}\n\n`);
    }
    const defs = node.defs.map(d => `[${basename(d.uri)}:${d.line + 1}](${openLink(d.uri, d.line)})${d.struct ? ` (${d.struct})` : ''}`);
    md.appendMarkdown(t('item.definedIn', defs.join(', ')));
    return md;
}

function attrMarkdown(node, key) {
    const a = node.attrs.get(key);
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['shngItems.open'] };
    md.appendMarkdown(`**${node.path}** · \`${key}\``);
    if (a.origin) md.appendMarkdown(`  \n_${t('item.fromStruct', '`' + a.origin + '`')}_`);
    md.appendMarkdown(`  \n[${basename(a.uri)}:${a.line + 1}](${openLink(a.uri, a.line)})\n\n`);
    md.appendCodeblock(Array.isArray(a.value) ? a.value.map(fmtValue).join('\n') : fmtValue(a.value), key.includes('eval') ? 'python' : 'yaml');
    return md;
}

function md_escape(s) {
    return s.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

module.exports = { describe, iconFor, itemMarkdown, attrMarkdown, fmtValue, basename, knxSummary };
