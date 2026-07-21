const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const settings = require('../src/controllers/settingsController').__test__;

test('site config resolves database over environment over defaults', () => {
  const resolved = settings.resolveConfig(
    [{ setting_key: 'site_title', setting_value: 'Database title' }],
    { SITE_TITLE: 'Environment title', BILIBILI_UID: '12345' }
  );
  assert.equal(resolved.siteTitle, 'Database title');
  assert.equal(resolved.bilibiliUid, '12345');
  assert.equal(resolved.navbarLogoUrl, '/annapiggy-logo.png');
});

test('site config validates UID, colors and remote assets', () => {
  assert.equal(settings.normalizeValue('bilibiliUid', '12345'), '12345');
  assert.throws(() => settings.normalizeValue('bilibiliUid', 'uid-1'));
  assert.throws(() => settings.normalizeValue('primaryColor', '#1234'));
  assert.throws(() => settings.normalizeValue('navbarLogoUrl', 'http://example.test/logo.png'));
});

test('footer keeps fixed attribution and safely degrades without UID', () => {
  const source = read('frontend', 'src', 'components', 'Footer.js');
  assert.match(source, /© 2026/);
  assert.match(source, />Linus_Lieu<\/a>/);
  assert.match(source, /https:\/\/github\.com\/LinusLieu/);
  assert.match(source, /noopener noreferrer/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(source, /bilibiliUid \?/);
});

test('QR binding isolates sessions and never returns or stores login secrets', () => {
  const source = read('backend', 'src', 'controllers', 'bilibiliBindingController.js');
  assert.match(source, /session\.userId !== req\.userId/);
  assert.match(source, /MAX_BINDINGS_PER_USER/);
  assert.doesNotMatch(source, /res\.(?:json|send)\([^)]*(?:cookie|refreshToken)/is);
  assert.doesNotMatch(source, /INSERT INTO[^;]*(?:cookie|refresh_token)/is);
});

test('point ingestion is idempotent, filtered and configuration driven', () => {
  const service = read('backend', 'src', 'services', 'pointsService.js');
  const schema = read('backend', 'src', 'config', 'schema.sql');
  assert.match(schema, /source_event_id VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(service, /POINTS_ROOM_ID/);
  assert.match(service, /POINTS_START_AT/);
  assert.match(service, /POINTS_COIN_PER_POINT/);
  assert.match(service, /INSERT IGNORE INTO bilibili_point_events/);
  assert.match(service, /ORDER BY event_at, id FOR UPDATE/);
});

test('cart mutations do not charge and checkout is atomic', () => {
  const source = read('backend', 'src', 'controllers', 'prizeController.js');
  const addStart = source.indexOf('const addCartItem');
  const checkoutStart = source.indexOf('const checkoutCart');
  const addSection = source.slice(addStart, source.indexOf('const updateCartItem', addStart));
  const checkoutSection = source.slice(checkoutStart, source.indexOf('const getUserRedemptions', checkoutStart));
  assert.doesNotMatch(addSection, /recordRedemption|UPDATE point_wallets|stock = stock -/);
  assert.match(checkoutSection, /beginTransaction/);
  assert.match(checkoutSection, /createRedemptionLine/);
  assert.match(checkoutSection, /DELETE FROM prize_cart_items WHERE user_id = \?/);
  assert.ok(checkoutSection.indexOf('createRedemptionLine') < checkoutSection.indexOf('DELETE FROM prize_cart_items'));
  assert.match(checkoutSection, /commit/);
  assert.match(checkoutSection, /rollback/);
});

test('refunds are protected from repeated balance and stock restoration', () => {
  const prize = read('backend', 'src', 'controllers', 'prizeController.js');
  const points = read('backend', 'src', 'services', 'pointsService.js');
  assert.match(prize, /if \(order\.refunded_at\) return false/);
  assert.match(points, /if \(existing\.length\) return \{ duplicate: true \}/);
  assert.match(points, /unique_source_reference/);
});

test('public schema and routes exclude removed operational modules and currencies', () => {
  const schema = read('backend', 'src', 'config', 'schema.sql');
  const server = read('backend', 'src', 'server.js');
  const store = read('frontend', 'src', 'pages', 'PrizesWithCart.js');
  for (const forbidden of ['movie_ticket', 'blindbox', 'gift_screenshot', 'activation_codes', 'room_ai_credentials']) {
    assert.equal(schema.includes(forbidden), false, `schema contains ${forbidden}`);
  }
  for (const forbidden of ['/api/bot', '/api/blindbox', '/api/movie-tickets', '/api/gift-overlay']) {
    assert.equal(server.includes(forbidden), false, `server exposes ${forbidden}`);
  }
  assert.equal(/movie.?ticket/i.test(store), false);
});

test('demo seed requires an explicit strong password', () => {
  const seed = read('backend', 'scripts', 'seed_demo.js');
  assert.match(seed, /DEMO_ADMIN_PASSWORD is required/);
  assert.match(seed, /example\.invalid/);
  assert.doesNotMatch(seed, /password123|admin@anna/);
});
