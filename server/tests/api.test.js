/**
 * Basic integration tests for Madarik server endpoints.
 * Run with:  node tests/api.test.js
 * Requires server to be running on http://localhost:3000
 */
'use strict';

const http = require('http');

let passed = 0;
let failed = 0;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(label, condition) {
  if (condition) {
    console.warn(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function run() {
  console.warn('\n=== Madarik API Tests ===\n');

  // ── /health ──────────────────────────────────────────────────────────────
  console.warn('[GET /health]');
  try {
    const r = await request('GET', '/health');
    assert('status 200',       r.status === 200);
    assert('ok: true',         r.body && r.body.ok === true);
    assert('uptime is number', typeof r.body.uptime === 'number');
  } catch (e) {
    console.error('  ERROR', e.message);
    failed++;
  }

  // ── /api/users/register ───────────────────────────────────────────────────
  console.warn('\n[POST /api/users/register]');
  try {
    // Valid request
    const r1 = await request('POST', '/api/users/register', {
      deviceId: 'test-device-001',
      username: 'TestUser'
    });
    assert('status 200 on valid',   r1.status === 200);
    assert('ok: true on valid',     r1.body && r1.body.ok === true);
    assert('token is string',       typeof (r1.body && r1.body.token) === 'string');
    assert('token has 3 parts (JWT)', r1.body.token && r1.body.token.split('.').length === 3);

    // Missing deviceId
    const r2 = await request('POST', '/api/users/register', { username: 'Test' });
    assert('status 400 on missing deviceId', r2.status === 400);

    // Missing username
    const r3 = await request('POST', '/api/users/register', { deviceId: 'test-device-002' });
    assert('status 400 on missing username', r3.status === 400);
  } catch (e) {
    console.error('  ERROR', e.message);
    failed++;
  }

  // ── /api/ai/chat (missing body) ───────────────────────────────────────────
  console.warn('\n[POST /api/ai/chat — input validation]');
  try {
    const r = await request('POST', '/api/ai/chat', {});
    assert('rejects missing message (4xx)', r.status >= 400 && r.status < 500);
  } catch (e) {
    console.error('  ERROR', e.message);
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.warn(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
