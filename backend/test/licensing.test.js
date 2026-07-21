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

test('footer attribution has fallback, closed shadow DOM and self-healing guard', () => {
  const footer = read('frontend', 'src', 'components', 'Footer.js');
  const index = read('frontend', 'public', 'index.html');
  const guardSource = read('frontend', 'scripts', 'attribution-guard.source.js');
  const generator = read('frontend', 'scripts', 'build-attribution-guard.js');
  const generated = read('frontend', 'public', 'attribution-guard.js');
  const generatedPayload = generated.slice(generated.indexOf('*/') + 2);

  assert.match(footer, /data-legal-notice="anna-attribution-v1"/);
  assert.match(footer, /aria-label="© 2026 Linus_Lieu"/);
  assert.match(footer, /<anna-project-attribution/);
  assert.match(footer, /© 2026/);
  assert.match(footer, />Linus_Lieu<\/a>/);
  assert.match(footer, /https:\/\/github\.com\/LinusLieu/);
  assert.match(index, /attribution-guard\.js/);

  assert.match(guardSource, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(guardSource, /new MutationObserver\(scheduleCheck\)/);
  assert.match(guardSource, /ensureAttribution/);
  assert.match(guardSource, /enforceImportantStyle/);
  assert.match(guardSource, /© 2026 Linus_Lieu/);

  assert.match(generator, /controlFlowFlattening: true/);
  assert.match(generator, /deadCodeInjection: true/);
  assert.match(generator, /selfDefending: true/);
  assert.match(generator, /stringArrayEncoding: \['rc4'\]/);
  assert.match(generated, /generated file/);
  assert.ok(generatedPayload.length > 50_000, 'generated guard is unexpectedly small');
  assert.doesNotMatch(generatedPayload, /Linus_Lieu/);
  assert.doesNotMatch(generatedPayload, /github\.com\/LinusLieu/);
  assert.doesNotMatch(generatedPayload, /annapiggy-logo\.png/);
});
