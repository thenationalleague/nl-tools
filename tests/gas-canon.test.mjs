/* NL.gas — the Apps Script calls, promoted from the portal (nl-utils v1.51).

   The network is stood in for by replacing NL.gas.fetch. The stub returns
   the response-like object NL.gas.fetch itself builds ({ json() } resolving
   or rejecting) — this file's own shape, not a guess at Google's. What
   Google sends on a relay fault (an HTML page with a <title>) is described
   in the portal's v5.122 note of 15/09/2026, from a real failure. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NL } from './load-canon.mjs';

const real = NL.gas.fetch;
const reply = (data) => Promise.resolve({ json: () => Promise.resolve(data) });
const page = () => Promise.resolve({ json: () => Promise.reject(new Error('Google returned a web page')) });
const fast = { backoff: () => 0 };

test('a dropped reply is retried with the same payload and token until a real one arrives', async () => {
  const seen = [];
  let n = 0;
  NL.gas.fetch = (p) => { seen.push(p.token); n++; return n < 3 ? page() : reply({ ok: true }); };
  try {
    const out = await NL.gas.send({ action: 'sendInvite', email: 'x@example.invalid' }, fast);
    assert.equal(out.ok, true);
    assert.equal(seen.length, 3);
    assert.ok(seen[0] && seen.every((t) => t === seen[0]), 'one token across every try');
  } finally { NL.gas.fetch = real; }
});

test('a clean refusal is returned at once, never retried', async () => {
  let n = 0;
  NL.gas.fetch = () => { n++; return reply({ ok: false, error: 'not an admin' }); };
  try {
    const out = await NL.gas.send({ action: 'sendInvite' }, fast);
    assert.equal(out.ok, false);
    assert.equal(n, 1);
  } finally { NL.gas.fetch = real; }
});

test('a token already on the payload is kept; retries stop at the limit', async () => {
  let n = 0;
  NL.gas.fetch = () => { n++; return Promise.reject(new Error('network')); };
  try {
    const payload = { action: 'sendInvite', token: 'given' };
    await assert.rejects(NL.gas.send(payload, { retries: 2, backoff: () => 0 }));
    assert.equal(n, 3);
    assert.equal(payload.token, 'given');
  } finally { NL.gas.fetch = real; }
});

test('a web page in place of a reply is named: status, host, title, first words', () => {
  const html = '<html><head><title>Error</title><style>p{}</style></head><body><p>Error</p><p>Sorry, unable to open the file at this time.</p><script>x()</script></body></html>';
  const msg = NL.gas.nonJsonReason(html, { status: 404, url: 'https://script.googleusercontent.com/macros/echo?x=1' });
  /* The host needs URL, which the test sandbox may not carry; the browser does. */
  assert.match(msg, /^Google returned a web page, not a reply \(HTTP 404( from script\.googleusercontent\.com)?\) \u2014 "Error": /);
  assert.ok(msg.endsWith('Sorry, unable to open the file at this time.'), 'scripts and styles stripped, the sentence kept');
  assert.ok(!/x\(\)|p\{\}/.test(msg));
});

test('NL.uuid makes a v4 UUID', () => {
  assert.match(NL.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
