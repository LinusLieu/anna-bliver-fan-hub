'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const publicRoot = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicRoot, 'index.html');
const footerPath = path.join(__dirname, '..', 'src', 'components', 'Footer.js');

const index = fs.readFileSync(indexPath, 'utf8');
const footer = fs.readFileSync(footerPath, 'utf8');
const tag = index.match(/<script defer src="%PUBLIC_URL%\/(assets\/[a-f0-9]{8}\.js)" integrity="([^"]+)" crossorigin="anonymous"><\/script>/);
if (!tag) throw new Error('Protected public asset reference is missing.');

const assetPath = path.join(publicRoot, ...tag[1].split('/'));
const asset = fs.readFileSync(assetPath);
const expectedIntegrity = `sha384-${crypto.createHash('sha384').update(asset).digest('base64')}`;

if (tag[2] !== expectedIntegrity) {
  throw new Error('Protected public asset is missing or its integrity hash is invalid.');
}

for (const forbidden of [
  'Linus_Lieu',
  'github.com/LinusLieu',
  'annapiggy-logo.png'
]) {
  if (asset.includes(Buffer.from(forbidden))) {
    throw new Error(`Protected public asset contains unexpected plaintext: ${forbidden}`);
  }
}

for (const forbidden of ['Linus_Lieu', 'github.com/LinusLieu', 'annapiggy-logo.png']) {
  if (footer.includes(forbidden)) {
    throw new Error(`Footer host contains a forbidden plaintext fallback: ${forbidden}`);
  }
}

if (asset.length < 100_000) throw new Error('Protected public asset is unexpectedly small.');
console.log(`Protected public asset verified (${asset.length} bytes, ${expectedIntegrity}).`);
