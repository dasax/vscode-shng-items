'use strict';
// Minimaler ZIP-Leser (nur lesen, Methoden "stored" und "deflate", kein ZIP64) – reicht für .knxproj

const zlib = require('zlib');

function entries(buf) {
    // End of Central Directory suchen (max. 64 KB Kommentar am Ende)
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('keine gültige ZIP-Datei');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const list = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        list.push({ name, method, compSize, local });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return list;
}

function read(buf, entry) {
    const p = entry.local;
    if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('ZIP-Eintrag beschädigt: ' + entry.name);
    const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    const data = buf.subarray(start, start + entry.compSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`ZIP-Methode ${entry.method} nicht unterstützt (${entry.name})`);
}

module.exports = { entries, read };
