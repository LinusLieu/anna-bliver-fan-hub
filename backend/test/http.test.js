const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { app } = require('../src/server');

test('health endpoint starts without bot configuration and CORS rejects unknown browser origins', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const blocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { message: 'Origin is not allowed by CORS' });
  } finally {
    server.close();
    await once(server, 'close');
  }
});
