'use strict';
// Sprache der Oberfläche: Einstellung shngItems.language ("en", "de", …, "auto" = Sprache von VS Code).
// Ohne VS-Code-Abhängigkeit, damit suggest.js/model.js auch außerhalb von VS Code laufen.
// Texte stehen in lib/l10n/<sprache>.json; fehlende Schlüssel fallen auf Englisch zurück.

const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'nl'];
const dicts = {};
const load = (lang) => dicts[lang] || (dicts[lang] = require(`./l10n/${lang}.json`));

let current = 'en';

// setting: Wert der Einstellung; uiLanguage: Sprache von VS Code (vscode.env.language, z.B. "de" oder "pt-br")
function setLanguage(setting, uiLanguage) {
    let lang = String(setting || 'en').toLowerCase();
    if (lang === 'auto') lang = String(uiLanguage || 'en').toLowerCase().split('-')[0];
    current = LANGUAGES.includes(lang) ? lang : 'en';
    return current;
}

function language() {
    return current;
}

// Text zum Schlüssel; {0}, {1}, … werden durch die Argumente ersetzt
function t(key, ...args) {
    let s = load(current)[key];
    if (s === undefined) s = load('en')[key];
    if (s === undefined) return key;
    return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? String(args[i]) : m)) : s;
}

// alle Texte mit Präfix (z.B. "web.") für Webviews, Englisch als Rückfall
function strings(prefix) {
    const out = {};
    for (const d of [load('en'), load(current)]) {
        for (const [k, v] of Object.entries(d)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    }
    return out;
}

module.exports = { t, setLanguage, language, strings, LANGUAGES };
