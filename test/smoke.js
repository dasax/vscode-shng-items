'use strict';
// Aufruf: ELECTRON_RUN_AS_NODE=1 Code.exe test/smoke.js <shng-basis>
const fs = require('fs');
const path = require('path');
const { Model } = require('../lib/model');

const adapter = {
    join: (base, ...p) => path.join(base, ...p),
    read: async (f) => fs.promises.readFile(f, 'utf8'),
    list: async (d) => {
        try { return (await fs.promises.readdir(d)).filter(n => n.endsWith('.yaml')).sort(); } catch { return []; }
    },
};

(async () => {
    const m = await new Model(adapter, process.argv[2]).load();
    const all = [...m.nodes()];
    console.log('Items:', all.length, 'davon aus Structs:', all.filter(n => n.fromStruct).length);
    console.log('Structs:', [...m.structs.keys()].join(', '));
    console.log('Fehler:', m.errors);
    console.log('Unaufgelöst:', all.filter(n => n.unresolved.length).map(n => n.path + ' -> ' + n.unresolved.map(u => u.name)));
    for (const p of process.argv.slice(3)) {
        const n = m.index.get(p);
        if (!n) { console.log(p, 'NICHT GEFUNDEN'); continue; }
        console.log('\n' + p, n.defs.map(d => path.basename(d.uri) + ':' + (d.line + 1)));
        for (const [k, a] of n.attrs) console.log('  ', k, '=', JSON.stringify(a.value), a.origin ? `(${a.origin})` : '');
        console.log('   Kinder:', [...n.children.keys()].join(', '));
    }
})();
