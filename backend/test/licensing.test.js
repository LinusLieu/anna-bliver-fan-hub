const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('repository metadata consistently declares GPL-3.0-or-later', () => {
  const license = read('LICENSE');
  const notice = read('NOTICE');
  const readme = read('README.md');
  const packages = [
    JSON.parse(read('package.json')),
    JSON.parse(read('frontend', 'package.json')),
    JSON.parse(read('backend', 'package.json')),
    JSON.parse(read('frontend', 'package-lock.json')).packages[''],
    JSON.parse(read('backend', 'package-lock.json')).packages['']
  ];

  assert.match(license, /^GNU GENERAL PUBLIC LICENSE\r?\nVersion 3, 29 June 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  for (const packageMetadata of packages) {
    assert.equal(packageMetadata.license, 'GPL-3.0-or-later');
  }
  assert.match(notice, /Additional term under GNU GPLv3 section 7\(b\)/);
  assert.match(notice, /© 2026 Linus_Lieu/);
  assert.match(notice, /https:\/\/github\.com\/LinusLieu/);
  assert.match(readme, /GNU GPL v3/);
  assert.match(readme, /NOTICE/);
});

test('footer host has no plaintext fallback and uses an opaque integrity-locked runtime', () => {
  const footer = read('frontend', 'src', 'components', 'Footer.js');
  const index = read('frontend', 'public', 'index.html');
  const verifier = read('frontend', 'scripts', 'verify-public-assets.js');
  const runtimeTag = index.match(/<script defer src="%PUBLIC_URL%\/(assets\/[a-f0-9]{8}\.js)" integrity="([^"]+)" crossorigin="anonymous"><\/script>/);
  assert.ok(runtimeTag, 'opaque public runtime script tag is missing');
  const generated = read('frontend', 'public', ...runtimeTag[1].split('/'));

  assert.match(footer, /data-ui-slot="r7-4f1c"/);
  assert.match(footer, /<x-r7-slot/);
  assert.match(footer, /data-bilibili-uid=/);
  assert.doesNotMatch(footer, /© 2026|Linus_Lieu|github\.com\/LinusLieu|annapiggy-logo\.png/);
  assert.doesNotMatch(footer, /site-footer-fallback/);

  assert.match(index, /assets\/[a-f0-9]{8}\.js/);
  assert.match(index, /integrity="sha384-[A-Za-z0-9+/=]+"/);
  assert.match(index, /crossorigin="anonymous"/);
  assert.doesNotMatch(index, /Linus_Lieu/);

  assert.match(verifier, /createHash\('sha384'\)/);
  assert.match(verifier, /forbidden plaintext fallback/);
  assert.ok(generated.length > 100_000, 'protected public runtime is unexpectedly small');
  assert.doesNotMatch(generated, /Linus_Lieu/);
  assert.doesNotMatch(generated, /github\.com\/LinusLieu/);
  assert.doesNotMatch(generated, /annapiggy-logo\.png/);
});
