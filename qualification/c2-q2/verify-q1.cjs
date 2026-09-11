'use strict';
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'Q1_INPUT_HASHES.json')));
for (const [name, hash] of Object.entries(expected)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'), hash, name);
}
fs.mkdirSync(path.join(__dirname, 'evidence'), {recursive:true});
fs.writeFileSync(path.join(__dirname, 'evidence/Q1_INPUT_VERIFICATION.json'), JSON.stringify({checked:Object.keys(expected).length, mismatches:[]}));
console.log('Exact frozen Q1 inputs verified: ' + Object.keys(expected).length);
