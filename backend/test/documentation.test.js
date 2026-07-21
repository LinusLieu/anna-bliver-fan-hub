const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const documents = [
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/ARCHITECTURE.md',
  'docs/CONFIGURATION.md',
  'docs/API.md',
  'docs/DEPLOYMENT.md'
];

function localTargets(source) {
  const markdownTargets = [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const htmlTargets = [...source.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  return [...markdownTargets, ...htmlTargets]
    .map((target) => target.replace(/^<|>$/g, '').split('#')[0])
    .filter((target) => target && !/^(?:https?:|mailto:|data:|#)/i.test(target));
}

test('all documented local links resolve inside the repository', () => {
  for (const relativeDocument of documents) {
    const documentPath = path.join(root, relativeDocument);
    assert.equal(fs.existsSync(documentPath), true, `${relativeDocument} is missing`);
    const source = fs.readFileSync(documentPath, 'utf8');
    for (const target of localTargets(source)) {
      const resolved = path.resolve(path.dirname(documentPath), target);
      assert.equal(resolved.startsWith(root), true, `${relativeDocument} links outside the repository: ${target}`);
      assert.equal(fs.existsSync(resolved), true, `${relativeDocument} contains a broken link: ${target}`);
    }
  }
});

test('README identifies the maintainer and verified Anna friend links', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /Linus_Lieu/);
  assert.match(readme, /https:\/\/github\.com\/LinusLieu/);
  assert.match(readme, /https:\/\/annapiggy\.live/);
  assert.match(readme, /https:\/\/space\.bilibili\.com\/501066866/);
  assert.match(readme, /frontend\/public\/annapiggy-logo\.png/);
});

test('bili-bot documentation defines direction, authentication, replay and ACK semantics', () => {
  const api = fs.readFileSync(path.join(root, 'docs', 'API.md'), 'utf8');
  for (const expected of ['WebSocket 客户端', 'Authorization: Bearer', 'resume', 'event_ack', 'accepted', 'duplicate', 'rejected', 'event_id', '指数退避']) {
    assert.equal(api.includes(expected), true, `bili-bot documentation is missing ${expected}`);
  }
});
