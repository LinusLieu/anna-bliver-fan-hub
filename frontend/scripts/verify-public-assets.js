'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const publicRoot = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicRoot, 'index.html');
const footerPath = path.join(__dirname, '..', 'src', 'components', 'Footer.js');
const entryPath = path.join(__dirname, '..', 'src', 'index.js');

const index = fs.readFileSync(indexPath, 'utf8');
const footer = fs.readFileSync(footerPath, 'utf8');
const entry = fs.readFileSync(entryPath, 'utf8');
const tag = index.match(/<script defer src="%PUBLIC_URL%\/(assets\/[a-f0-9]{8}\.js)" integrity="([^"]+)" crossorigin="anonymous"><\/script>/);
if (!tag) throw new Error('Protected public asset reference is missing.');

const primaryAssetPath = path.join(publicRoot, ...tag[1].split('/'));
const primaryAsset = fs.readFileSync(primaryAssetPath);
const expectedIntegrity = `sha384-${crypto.createHash('sha384').update(primaryAsset).digest('base64')}`;

if (tag[2] !== expectedIntegrity) {
  throw new Error('Protected public asset is missing or its integrity hash is invalid.');
}

const publicAssets = fs.readdirSync(path.join(publicRoot, 'assets'))
  .filter((name) => /^[a-f0-9]{8}\.js$/.test(name))
  .map((name) => `assets/${name}`);
if (publicAssets.length !== 2 || !publicAssets.includes(tag[1])) {
  throw new Error('Expected exactly two opaque public runtime assets.');
}

const secondaryRelativePath = publicAssets.find((assetPath) => assetPath !== tag[1]);
const secondaryAsset = fs.readFileSync(path.join(publicRoot, ...secondaryRelativePath.split('/')));
const secondaryIntegrity = `sha384-${crypto.createHash('sha384').update(secondaryAsset).digest('base64')}`;
const decodedEntryValues = [...entry.matchAll(/unpack\(\[([\d,\s]+)\]\)/g)]
  .map((match) => String.fromCharCode(...match[1].split(',').map((value) => Number(value.trim()) ^ 93)));
if (!decodedEntryValues.includes(secondaryRelativePath) || !decodedEntryValues.includes(secondaryIntegrity)) {
  throw new Error('Secondary runtime path or integrity hash is not encoded in the application entry.');
}
if (!entry.includes('requestIdleCallback') || !entry.includes('data-ui-continuity')) {
  throw new Error('Secondary runtime health probe is missing.');
}

for (const forbidden of [
  'Linus_Lieu',
  'github.com/LinusLieu',
  'annapiggy-logo.png'
]) {
  if (primaryAsset.includes(Buffer.from(forbidden)) || secondaryAsset.includes(Buffer.from(forbidden))) {
    throw new Error(`Protected public assets contain unexpected plaintext: ${forbidden}`);
  }
  if (footer.includes(forbidden) || entry.includes(forbidden) || index.includes(forbidden)) {
    throw new Error(`Public entry source contains unexpected plaintext: ${forbidden}`);
  }
}

if (primaryAsset.length < 100_000 || secondaryAsset.length < 100_000) {
  throw new Error('Protected public assets are unexpectedly small.');
}
console.log(`Protected public assets verified (primary ${primaryAsset.length} bytes; secondary ${secondaryAsset.length} bytes).`);
