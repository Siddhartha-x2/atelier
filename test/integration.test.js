import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { seedDatabase, seedData } from '../src/seed.js';
import { kolkataToday, calendarDay } from '../src/validation.js';
import { verifyPassword } from '../src/passwords.js';

// Generated only for disposable test databases; never used by normal setup.
const testStudioPassword = randomBytes(24).toString('hex');

const addDays = (days, base = '2026-10-22') => new Date(Date.parse(`${base}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const wall = (extra = {}) => ({ date: addDays(10), wallSize: 10, address: '12 Lake Road, Hyderabad', ...extra });
const pot = (extra = {}) => ({ itemId: 'i-01', glazeId: 'g-01', quantity: 1, neededBy: addDays(14), ...extra });
const painting = (extra = {}) => ({ title: 'New original', artist: 'Studio Artist', description: 'A handmade painting.', price: 6500, imageUrl: '/images/p-001.jpg', ...extra });

function client(base) {
  return {
    cookie: '',
    async call(method, route, body, expected = 200, headers = {}) {
      const response = await fetch(`${base}${route}`, { method,
        headers: { ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
          ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = raw; }
      assert.equal(response.status, expected, `${method} ${route}: ${raw}`);
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) this.cookie = setCookie.split(';')[0];
      return { data, headers: response.headers };
    },
    async signup(email = 'customer@example.com', extra = {}) {
      return (await this.call('POST', '/api/auth/signup', { name: 'Customer', email, password: 'Customer@123', ...extra }, 201)).data;
    },
    async login(email = seedData.studioAccount.email, password = testStudioPassword) {
      return (await this.call('POST', '/api/auth/login', { email, password })).data;
    }
  };
}

async function fixture(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-test-'));
  const databasePath = path.join(dir, 'test.sqlite');
  let clock = new Date('2026-10-22T10:00:00Z');
  const { app, db } = createApp({ databasePath, appOrigin: null, cookieSecure: false,
    sessionHours: 12, now: () => clock, ...options });
  await seedDatabase(db, testStudioPassword);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const customer = client(base), other = client(base), studio = client(base), guest = client(base);
  await customer.signup();
  await other.signup('other@example.com');
  await studio.login();
  return { db, base, databasePath, customer, other, studio, guest,
    setClock(value) { clock = new Date(value); } };
}

test('first seed requires a chosen studio password and rejects placeholders without partial seed data', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-seed-'));
  const db = openDatabase(path.join(dir, 'seed.sqlite'));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(Object.hasOwn(seedData.studioAccount, 'password'), false);
  for (const password of ['', 'short', 'x'.repeat(129), '<choose-a-10-to-128-character-password>']) {
    await assert.rejects(seedDatabase(db, password), /STUDIO_PASSWORD/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM paintings').get().n, 0);
  }
  await seedDatabase(db, testStudioPassword);
  const account = db.prepare('SELECT * FROM users WHERE email=?').get(seedData.studioAccount.email);
  assert.equal(account.role, 'studio');
  assert.ok(await verifyPassword(testStudioPassword, account.password_hash));
  assert.equal(db.prepare('SELECT count(*) AS n FROM paintings').get().n, 12);
});

test('repeat seed does not need a password or reset the existing studio account', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-reseed-'));
  const db = openDatabase(path.join(dir, 'seed.sqlite'));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  await seedDatabase(db, testStudioPassword);
  const before = db.prepare('SELECT password_hash FROM users WHERE email=?').get(seedData.studioAccount.email).password_hash;
  await seedDatabase(db, '');
  await seedDatabase(db, randomBytes(24).toString('hex'));
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE email=?').get(seedData.studioAccount.email).password_hash, before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
});

test('signup, role injection, password hashing, duplicate email and studio account', async t => {
  const f = await fixture(t);
  const injected = client(f.base);
  const user = await injected.signup('Injected@Example.com', { role: 'studio', userId: 1 });
  assert.equal(user.role, 'customer');
  assert.equal(user.email, 'injected@example.com');
  const saved = f.db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  assert.match(saved.password_hash, /^scrypt\$/);
  assert.ok(!saved.password_hash.includes('Customer@123'));
  await injected.call('POST', '/api/paintings', painting(), 403);
  await f.guest.call('POST', '/api/auth/signup', { name: 'X', email: 'INJECTED@example.com', password: 'Customer@123' }, 409);
  await f.guest.call('POST', '/api/auth/signup', { name: 'X', email: 'studio@artstudio.in', password: 'Customer@123', role: 'studio' }, 409);
  for (const body of [{ name: '', email: 'x@e.com', password: 'Customer@123' },
    { name: 'X', email: 'bad', password: 'Customer@123' }, { name: 'X', email: 'x@e.com', password: 'short' }]) {
    await f.guest.call('POST', '/api/auth/signup', body, 400);
  }
  assert.equal((await f.studio.call('GET', '/api/auth/me')).data.role, 'studio');
});

test('login, logout, session rotation, expiry, invalid authentication and HTTP-only cookies', async t => {
  const f = await fixture(t);
  await f.guest.call('POST', '/api/auth/login', { email: 'customer@example.com', password: 'Incorrect@123' }, 401);
  await f.guest.call('POST', '/api/auth/login', { email: 'missing@example.com', password: 'Incorrect@123' }, 401);
  const oldCookie = f.customer.cookie;
  const login = await f.customer.call('POST', '/api/auth/login', { email: 'CUSTOMER@example.com', password: 'Customer@123' });
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.ok(!/; Secure/i.test(login.headers.get('set-cookie')));
  assert.notEqual(f.customer.cookie, oldCookie);
  await f.guest.call('GET', '/api/auth/me', undefined, 401, { Cookie: oldCookie });
  const token = f.customer.cookie.split('=')[1];
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions WHERE token_hash=?').get(token).n, 0);
  await f.customer.call('POST', '/api/auth/logout', {});
  await f.customer.call('GET', '/api/auth/me', undefined, 401);
  await f.customer.login('customer@example.com', 'Customer@123');
  f.setClock('2026-10-22T22:00:00Z'); // Exactly 12h: expired, not still valid.
  await f.customer.call('GET', '/api/auth/me', undefined, 401);
  await f.guest.call('GET', '/api/paintings', undefined, 401, { Cookie: 'artstudio_session=broken' });
});

test('HTTPS cookie option produces Secure cookie', async t => {
  const f = await fixture(t, { cookieSecure: true });
  const result = await f.studio.call('POST', '/api/auth/login', { email: seedData.studioAccount.email, password: testStudioPassword });
  assert.match(result.headers.get('set-cookie'), /; Secure/i);
});

test('business endpoints all require authentication; private files cannot be served', async t => {
  const f = await fixture(t);
  const routes = [['GET', '/catalog'], ['GET', '/paintings'], ['POST', '/paintings'], ['PUT', '/paintings/p-001'],
    ['GET', '/orders'], ['GET', '/orders/1'], ['POST', '/orders'], ['POST', '/orders/1/cancel'],
    ['GET', '/bookings'], ['GET', '/bookings/1'], ['POST', '/bookings'], ['POST', '/bookings/1/cancel'], ['POST', '/bookings/1/decision'],
    ['GET', '/pottery'], ['GET', '/pottery/1'], ['POST', '/pottery'], ['PUT', '/pottery/1'], ['POST', '/pottery/1/cancel'], ['POST', '/pottery/1/decision']];
  for (const [method, route] of routes) await f.guest.call(method, `/api${route}`, method === 'GET' ? undefined : {}, 401);
  for (const route of ['/seed/seed.json', '/src/schema.sql', '/data/art-studio.sqlite', '/.env', '/package.json']) {
    await f.guest.call('GET', route, undefined, 404);
  }
  const catalog = (await f.customer.call('GET', '/api/catalog')).data;
  assert.equal(catalog.items.length, 5); assert.equal(catalog.glazes.length, 6);
  assert.equal(catalog.wallRate, 150); assert.equal(catalog.today, '2026-10-22');
  const rows = (await f.customer.call('GET', '/api/paintings')).data;
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.filter(p => p.status === 'sold').map(p => p.id), ['p-004', 'p-009']);
  assert.ok(rows.find(p => p.id === 'p-012').title.length > 100);
  for (const p of rows) {
    const result = await f.guest.call('GET', p.imageUrl);
    assert.match(result.headers.get('content-type'), /image\/jpeg/);
  }
});

test('roles are enforced for every mutation category', async t => {
  const f = await fixture(t);
  for (const [method, route, body] of [['POST', '/paintings', painting()], ['PUT', '/paintings/p-001', painting()],
    ['POST', '/bookings/1/decision', { status: 'confirmed' }], ['POST', '/pottery/1/decision', { status: 'accepted' }]]) {
    await f.customer.call(method, `/api${route}`, body, 403);
  }
  for (const [method, route, body] of [['POST', '/orders', { paintingId: 'p-001' }], ['POST', '/bookings', wall()],
    ['POST', '/pottery', pot()], ['PUT', '/pottery/1', pot()], ['POST', '/orders/1/cancel', {}],
    ['POST', '/bookings/1/cancel', {}], ['POST', '/pottery/1/cancel', {}]]) {
    await f.studio.call(method, `/api${route}`, body, 403);
  }
});

test('ownership, list filtering and studio visibility for all record kinds', async t => {
  const f = await fixture(t);
  const order = (await f.customer.call('POST', '/api/orders', { paintingId: 'p-001', userId: 1, price: .01 }, 201)).data;
  const booking = (await f.customer.call('POST', '/api/bookings', wall({ userId: 1 }), 201)).data;
  const pottery = (await f.customer.call('POST', '/api/pottery', pot({ userId: 1 }), 201)).data;
  const me = (await f.customer.call('GET', '/api/auth/me')).data;
  for (const [kind, row] of [['orders', order], ['bookings', booking], ['pottery', pottery]]) {
    assert.equal(row.userId, me.id);
    assert.equal((await f.customer.call('GET', `/api/${kind}`)).data.length, 1);
    assert.equal((await f.other.call('GET', `/api/${kind}`)).data.length, 0);
    await f.other.call('GET', `/api/${kind}/${row.id}`, undefined, 404);
    await f.other.call('POST', `/api/${kind}/${row.id}/cancel`, {}, 404);
    await f.customer.call('GET', `/api/${kind}/${row.id}`);
    assert.equal((await f.studio.call('GET', `/api/${kind}`)).data.length, 1);
    await f.studio.call('GET', `/api/${kind}/${row.id}`);
  }
  await f.other.call('PUT', `/api/pottery/${pottery.id}`, pot(), 404);
  assert.equal(order.price, 6500);
});

test('purchase conflict, cancellation, later purchase and repeated old cancellation', async t => {
  const f = await fixture(t);
  const results = await Promise.all([
    fetch(`${f.base}/api/orders`, { method: 'POST', headers: { Cookie: f.customer.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ paintingId: 'p-001' }) }),
    fetch(`${f.base}/api/orders`, { method: 'POST', headers: { Cookie: f.other.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ paintingId: 'p-001' }) })
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const winnerIndex = results.findIndex(r => r.status === 201);
  const winner = winnerIndex === 0 ? f.customer : f.other;
  const loser = winnerIndex === 0 ? f.other : f.customer;
  const first = await results[winnerIndex].json();
  await winner.call('POST', `/api/orders/${first.id}/cancel`, {});
  const second = (await loser.call('POST', '/api/orders', { paintingId: 'p-001' }, 201)).data;
  await winner.call('POST', `/api/orders/${first.id}/cancel`, {}, 409);
  assert.equal(f.db.prepare("SELECT status FROM paintings WHERE id='p-001'").get().status, 'sold');
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(second.id).status, 'placed');
  await winner.call('POST', '/api/orders', { paintingId: 'p-004' }, 409);
  await winner.call('POST', '/api/orders', { paintingId: 'missing' }, 404);
  await winner.call('POST', '/api/orders', { paintingId: {} }, 400);
  await winner.call('POST', '/api/orders/0/cancel', {}, 400);
});

test('studio painting creation/edit validation and sold editing restriction', async t => {
  const f = await fixture(t);
  const created = (await f.studio.call('POST', '/api/paintings', painting({ status: 'sold', price: 123.45 }), 201)).data;
  assert.equal(created.status, 'available'); assert.equal(created.price, 123.45);
  await f.studio.call('PUT', `/api/paintings/${created.id}`, painting({ title: '<script>alert(1)</script>', price: 234.56 }));
  const bought = (await f.customer.call('POST', '/api/orders', { paintingId: created.id }, 201)).data;
  assert.equal(bought.price, 234.56);
  await f.studio.call('PUT', `/api/paintings/${created.id}`, painting(), 409);
  await f.studio.call('PUT', '/api/paintings/p-004', painting(), 409);
  await f.studio.call('PUT', '/api/paintings/missing', painting(), 404);
  for (const body of [painting({ price: -1 }), painting({ price: '100' }), painting({ price: 1.001 }),
    painting({ title: '' }), painting({ description: '' }), painting({ imageUrl: 'javascript:alert(1)' }),
    painting({ imageUrl: '/images/missing.jpg' })]) await f.studio.call('POST', '/api/paintings', body, 400);
  await f.customer.call('POST', `/api/orders/${bought.id}/cancel`, {});
  await f.studio.call('PUT', `/api/paintings/${created.id}`, painting());
});

test('booking date and size boundaries, address and server pricing', async t => {
  const f = await fixture(t);
  for (const date of [addDays(6), addDays(91), '2026-02-30', '2026-1-01', 'bad', null]) {
    await f.customer.call('POST', '/api/bookings', wall({ date }), 400);
  }
  for (const wallSize of [9.99, 500.01, '10', null, -1]) {
    await f.customer.call('POST', '/api/bookings', wall({ wallSize }), 400);
  }
  await f.customer.call('POST', '/api/bookings', wall({ address: '   ' }), 400);
  const min = (await f.customer.call('POST', '/api/bookings', wall({ date: addDays(7), wallSize: 10, rate: .01, total: 1 }), 201)).data;
  const max = (await f.customer.call('POST', '/api/bookings', wall({ date: addDays(90), wallSize: 500 }), 201)).data;
  const decimal = (await f.customer.call('POST', '/api/bookings', wall({ date: addDays(8), wallSize: 10.25 }), 201)).data;
  assert.equal(min.total, 1500); assert.equal(min.rate, 150);
  assert.equal(max.total, 75000); assert.equal(decimal.total, 1537.5);
});

test('database date uniqueness, studio decisions and date reuse after decline/cancel', async t => {
  const f = await fixture(t);
  const row = (await f.customer.call('POST', '/api/bookings', wall(), 201)).data;
  await f.other.call('POST', '/api/bookings', wall(), 409);
  assert.throws(() => f.db.prepare(`INSERT INTO bookings(user_id,date,wall_size,address,rate_paise,total_paise,status,created_at)
    VALUES(?,?,10,'A',15000,150000,'confirmed','now')`).run(row.userId, row.date), /UNIQUE/);
  await f.studio.call('POST', `/api/bookings/${row.id}/decision`, { status: 'accepted' }, 400);
  await f.studio.call('POST', `/api/bookings/${row.id}/decision`, { status: 'declined' });
  await f.studio.call('POST', `/api/bookings/${row.id}/decision`, { status: 'confirmed' }, 409);
  await f.customer.call('POST', `/api/bookings/${row.id}/cancel`, {}, 409);
  const next = (await f.other.call('POST', '/api/bookings', wall(), 201)).data;
  await f.studio.call('POST', `/api/bookings/${next.id}/decision`, { status: 'confirmed' });
  await f.studio.call('POST', `/api/bookings/${next.id}/decision`, { status: 'declined' }, 409);
  await f.customer.call('POST', '/api/bookings', wall(), 409);
  await f.other.call('POST', `/api/bookings/${next.id}/cancel`, {});
  await f.other.call('POST', `/api/bookings/${next.id}/cancel`, {}, 409);
  await f.customer.call('POST', '/api/bookings', wall(), 201);
});

test('Kolkata calendar dates, three-day boundary and cancellation cutoff', async t => {
  assert.equal(kolkataToday(new Date('2026-10-22T18:29:59Z')), '2026-10-22');
  assert.equal(kolkataToday(new Date('2026-10-22T18:30:00Z')), '2026-10-23');
  assert.equal(calendarDay('2028-03-01') - calendarDay('2028-02-28'), 2);
  const f = await fixture(t);
  const first = (await f.customer.call('POST', '/api/bookings', wall(), 201)).data;
  const second = (await f.customer.call('POST', '/api/bookings', wall({ date: addDays(11) }), 201)).data;
  await f.studio.call('POST', `/api/bookings/${first.id}/decision`, { status: 'confirmed' });
  f.setClock(`${addDays(7)}T18:29:59Z`); // 23:59:59 Kolkata, exactly B-3.
  await f.customer.login('customer@example.com', 'Customer@123');
  await f.customer.call('POST', `/api/bookings/${first.id}/cancel`, {});
  f.setClock(`${addDays(8)}T18:30:00Z`); // Now B-2 for second booking.
  await f.customer.login('customer@example.com', 'Customer@123');
  await f.customer.call('POST', `/api/bookings/${second.id}/cancel`, {}, 409);
  assert.equal(f.db.prepare('SELECT status FROM bookings WHERE id=?').get(second.id).status, 'requested');
});

test('pottery lists, integer quantities, date boundaries and no 90-day maximum', async t => {
  const f = await fixture(t);
  for (const quantity of [0, 13, 1.5, '1', null]) await f.customer.call('POST', '/api/pottery', pot({ quantity }), 400);
  for (const neededBy of [addDays(13), '2026-02-30', 'invalid', null]) {
    await f.customer.call('POST', '/api/pottery', pot({ neededBy }), 400);
  }
  for (const extra of [{ itemId: 'i-99' }, { glazeId: 'g-99' }, { itemId: 1 }, { glazeId: {} }]) {
    await f.customer.call('POST', '/api/pottery', pot(extra), 400);
  }
  await f.customer.call('POST', '/api/pottery', pot({ quantity: 1 }), 201);
  const max = (await f.customer.call('POST', '/api/pottery', pot({ quantity: 12, neededBy: addDays(400) }), 201)).data;
  assert.equal(max.quantity, 12);
  assert.equal(max.neededBy, addDays(400));
});

test('pottery editing, cancellation and final-state guards', async t => {
  const f = await fixture(t);
  for (const final of ['accepted', 'declined', 'cancelled']) {
    const row = (await f.customer.call('POST', '/api/pottery', pot(), 201)).data;
    const edited = (await f.customer.call('PUT', `/api/pottery/${row.id}`, pot({ quantity: 12, itemId: 'i-05', glazeId: 'g-06', neededBy: addDays(200), userId: 1, status: 'accepted' }))).data;
    assert.equal(edited.quantity, 12); assert.equal(edited.itemId, 'i-05'); assert.equal(edited.status, 'requested');
    await f.customer.call('PUT', `/api/pottery/${row.id}`, pot({ quantity: 0 }), 400);
    if (final === 'cancelled') await f.customer.call('POST', `/api/pottery/${row.id}/cancel`, {});
    else await f.studio.call('POST', `/api/pottery/${row.id}/decision`, { status: final });
    await f.customer.call('PUT', `/api/pottery/${row.id}`, pot(), 409);
    await f.customer.call('POST', `/api/pottery/${row.id}/cancel`, {}, 409);
    await f.studio.call('POST', `/api/pottery/${row.id}/decision`, { status: 'accepted' }, 409);
  }
  const row = (await f.customer.call('POST', '/api/pottery', pot(), 201)).data;
  await f.studio.call('POST', `/api/pottery/${row.id}/decision`, { status: 'confirmed' }, 400);
});

test('request format, origin protection, prepared SQL and identifier validation', async t => {
  const f = await fixture(t);
  await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 403, { Origin: 'https://untrusted.example' });
  await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 415, { 'Content-Type': 'text/plain' });
  await f.customer.call('POST', '/api/orders', [], 400);
  const malformed = await fetch(`${f.base}/api/orders`, { method: 'POST', headers: { Cookie: f.customer.cookie, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
  for (const route of ['/api/orders/-1', '/api/bookings/1x', '/api/pottery/9007199254740992']) {
    await f.customer.call('GET', route, undefined, 400);
  }
  await f.customer.call('GET', '/api/orders/99999', undefined, 404);
  await f.customer.call('POST', '/api/orders', { paintingId: "p-001' OR 1=1--" }, 400);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM paintings').get().n, 12);
});

test('session storage failure rolls back signup and allows a clean retry', async t => {
  const f = await fixture(t, { quiet: true });
  const incoming = client(f.base);
  const email = 'write-failure@example.com';
  f.db.exec(`CREATE TRIGGER fail_session_write BEFORE INSERT ON sessions
    BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`);
  const failed = await incoming.call('POST', '/api/auth/signup', {
    name: 'Storage check', email, password: 'Customer@123'
  }, 500);
  await f.guest.call('GET', '/api/health');
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal(f.db.prepare('SELECT id FROM users WHERE email=?').get(email), undefined,
    'A failed signup must not leave an account without a successful session');
  f.db.exec('DROP TRIGGER fail_session_write;');
  await incoming.signup(email);
  await incoming.call('GET', '/api/auth/me');
});

test('session storage failure preserves the previous login session', async t => {
  const f = await fixture(t, { quiet: true });
  const before = f.db.prepare('SELECT * FROM sessions ORDER BY token_hash').all();
  const originalCookie = f.customer.cookie;
  f.db.exec(`CREATE TRIGGER fail_session_write BEFORE INSERT ON sessions
    BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`);
  const failed = await f.customer.call('POST', '/api/auth/login', {
    email: 'customer@example.com', password: 'Customer@123'
  }, 500);
  await f.guest.call('GET', '/api/health');
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal(f.customer.cookie, originalCookie);
  assert.deepEqual(f.db.prepare('SELECT * FROM sessions ORDER BY token_hash').all(), before,
    'A failed rotation must preserve existing sessions');
  await f.customer.call('GET', '/api/auth/me');
  f.db.exec('DROP TRIGGER fail_session_write;');
  await f.customer.login('customer@example.com', 'Customer@123');
});

test('failed order storage rolls back sold status without crashing the server', async t => {
  const f = await fixture(t, { quiet: true });
  f.db.exec(`CREATE TRIGGER fail_order_write BEFORE INSERT ON orders
    BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`);
  await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 500);
  await f.guest.call('GET', '/api/health');
  assert.equal(f.db.prepare("SELECT status FROM paintings WHERE id='p-001'").get().status, 'available');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orders').get().n, 0);
  f.db.exec('DROP TRIGGER fail_order_write;');
  await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 201);
});

test('locked storage returns a retryable error and recovers after the lock is released', async t => {
  const f = await fixture(t);
  f.db.exec('PRAGMA busy_timeout=50;');
  const lock = openDatabase(f.databasePath);
  try {
    lock.exec('BEGIN IMMEDIATE;');
    const failed = await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 503);
    assert.match(failed.data.error, /busy.*try again/i);
    await f.guest.call('GET', '/api/health');
    assert.equal(f.db.prepare("SELECT status FROM paintings WHERE id='p-001'").get().status, 'available');
  } finally {
    lock.exec('ROLLBACK;');
    lock.close();
  }
  await f.customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 201);
});

async function worker(databasePath) {
  const child = spawn(process.execPath, ['scripts/worker-server.js', databasePath], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').find(line => line.startsWith('{'));
      if (line) resolve(`http://127.0.0.1:${JSON.parse(line).port}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Test server exited ${code}: ${errors}`)));
  });
  return { base, child, async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const done = once(child, 'exit'); child.kill(); await done; } };
}

test('two OS processes contend for one painting/date and edit versus purchase', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-process-test-'));
  const filename = path.join(dir, 'shared.sqlite');
  const db = openDatabase(filename); await seedDatabase(db, testStudioPassword); db.close();
  const a = await worker(filename), b = await worker(filename);
  t.after(async () => { await a.stop(); await b.stop(); rmSync(dir, { recursive: true, force: true }); });
  const ca = client(a.base), cb = client(b.base), studio = client(b.base);
  await ca.signup('a@example.com'); await cb.signup('b@example.com'); await studio.login();
  async function raw(base, cookie, route, body, method = 'POST') {
    const response = await fetch(`${base}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  const sales = await Promise.all([raw(a.base, ca.cookie, '/api/orders', { paintingId: 'p-002' }), raw(b.base, cb.cookie, '/api/orders', { paintingId: 'p-002' })]);
  assert.deepEqual(sales.map(r => r.status).sort(), [201, 409]);
  const bookings = await Promise.all([raw(a.base, ca.cookie, '/api/bookings', wall()), raw(b.base, cb.cookie, '/api/bookings', wall())]);
  assert.deepEqual(bookings.map(r => r.status).sort(), [201, 409]);
  for (const id of ['p-001', 'p-003', 'p-005', 'p-006', 'p-007']) {
    const [sale, edit] = await Promise.all([raw(a.base, ca.cookie, '/api/orders', { paintingId: id }), raw(b.base, studio.cookie, `/api/paintings/${id}`, painting({ price: 2222 }), 'PUT')]);
    assert.equal(sale.status, 201);
    assert.ok([200, 409].includes(edit.status));
    const original = seedData.paintings.find(p => p.id === id).price;
    assert.equal(sale.data.price, edit.status === 200 ? 2222 : original);
    await studio.call('PUT', `/api/paintings/${id}`, painting(), 409);
  }
});

test('process restart and repeat seed preserve sales, edits, sessions and all activity', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-persistence-test-'));
  const filename = path.join(dir, 'persist.sqlite');
  let db = openDatabase(filename); await seedDatabase(db, testStudioPassword); db.close();
  let running = await worker(filename);
  t.after(async () => { await running.stop(); rmSync(dir, { recursive: true, force: true }); });
  const customer = client(running.base), studio = client(running.base);
  await customer.signup(); await studio.login();
  await studio.call('PUT', '/api/paintings/p-002', painting({ title: 'Preserved edit' }));
  const order = (await customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 201)).data;
  await customer.call('POST', '/api/bookings', wall(), 201);
  const pottery = (await customer.call('POST', '/api/pottery', pot(), 201)).data;
  await studio.call('POST', `/api/pottery/${pottery.id}/decision`, { status: 'accepted' });
  const cookie = customer.cookie;
  await running.stop();
  db = openDatabase(filename);
  const studioHash = db.prepare("SELECT password_hash FROM users WHERE role='studio'").get().password_hash;
  await seedDatabase(db); await seedDatabase(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM paintings').get().n, 12);
  assert.equal(db.prepare("SELECT status FROM paintings WHERE id='p-001'").get().status, 'sold');
  assert.equal(db.prepare("SELECT title FROM paintings WHERE id='p-002'").get().title, 'Preserved edit');
  assert.equal(db.prepare("SELECT password_hash FROM users WHERE role='studio'").get().password_hash, studioHash);
  assert.equal(db.prepare("SELECT status FROM paintings WHERE id='p-004'").get().status, 'sold');
  db.close();
  running = await worker(filename);
  const resumed = client(running.base); resumed.cookie = cookie;
  await resumed.call('GET', '/api/auth/me');
  assert.equal((await resumed.call('GET', '/api/orders')).data[0].id, order.id);
  assert.equal((await resumed.call('GET', '/api/bookings')).data.length, 1);
  assert.equal((await resumed.call('GET', '/api/pottery')).data[0].status, 'accepted');
  await resumed.call('POST', '/api/orders', { paintingId: 'p-001' }, 409);
});

test('abrupt process termination preserves committed records and rolls back incomplete storage', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-studio-crash-test-'));
  const filename = path.join(dir, 'crash.sqlite');
  let db = openDatabase(filename); await seedDatabase(db, testStudioPassword); db.close();
  let running = await worker(filename), incomplete;
  async function killImmediately(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, 'exit');
    child.kill('SIGKILL');
    await stopped;
  }
  t.after(async () => {
    await killImmediately(incomplete);
    await running.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  const customer = client(running.base);
  await customer.signup('crash-check@example.com');
  const order = (await customer.call('POST', '/api/orders', { paintingId: 'p-001' }, 201)).data;
  const booking = (await customer.call('POST', '/api/bookings', wall(), 201)).data;
  const pottery = (await customer.call('POST', '/api/pottery', pot(), 201)).data;
  const cookie = customer.cookie;
  // Force an exit without allowing the server's shutdown handler to close SQLite.
  await killImmediately(running.child);
  const partialWrite = `import {openDatabase} from './src/db.js';
    const db=openDatabase(process.argv[1]);
    db.exec('BEGIN IMMEDIATE');
    db.prepare("UPDATE paintings SET status='sold' WHERE id='p-002'").run();
    console.log('incomplete-write-ready');
    setInterval(()=>{},1000);`;
  incomplete = spawn(process.execPath, ['--input-type=module', '-e', partialWrite, filename], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    let output = '', diagnostics = '';
    const timer = setTimeout(() => reject(new Error('Incomplete-write worker did not become ready.')), 5000);
    incomplete.stderr.on('data', data => { diagnostics += data; });
    incomplete.stdout.on('data', data => {
      output += data;
      if (output.includes('incomplete-write-ready')) { clearTimeout(timer); resolve(); }
    });
    incomplete.once('error', error => { clearTimeout(timer); reject(error); });
    incomplete.once('exit', () => { clearTimeout(timer); reject(new Error(`Incomplete-write worker exited early: ${diagnostics}`)); });
  });
  await killImmediately(incomplete);
  db = openDatabase(filename);
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare("SELECT status FROM paintings WHERE id='p-001'").get().status, 'sold');
    assert.equal(db.prepare("SELECT status FROM paintings WHERE id='p-002'").get().status, 'available');
  } finally { db.close(); }
  running = await worker(filename);
  const resumed = client(running.base); resumed.cookie = cookie;
  await resumed.call('GET', '/api/auth/me');
  assert.equal((await resumed.call('GET', '/api/orders')).data[0].id, order.id);
  assert.equal((await resumed.call('GET', '/api/bookings')).data[0].id, booking.id);
  assert.equal((await resumed.call('GET', '/api/pottery')).data[0].id, pottery.id);
  await resumed.call('GET', '/api/health');
});
