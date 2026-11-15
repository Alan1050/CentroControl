import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionFromFragment, normalizeApiUrl, sessionLink } from '../src/mission/protocol.ts';
import { watchMission } from '../src/mission/client.ts';

test('session links round trip; credentials stay in fragments, insecure remote URLs are rejected', () => {
  const c = { apiUrl: 'https://control.netlify.app', sessionId: 'session_123456', key: 'a'.repeat(43), astronautId: 'A' as const };
  const link = new URL(sessionLink('https://control.netlify.app/ojos', c));
  assert.equal(link.search, ''); assert.deepEqual(connectionFromFragment(link.hash), c);
  assert.throws(() => normalizeApiUrl('http://192.168.1.2:5000'));
  assert.throws(() => normalizeApiUrl('https://name:secret@control.example'));
  assert.equal(normalizeApiUrl('http://localhost:5173/api/'), 'http://localhost:5173');
});
test('polling cancels in-flight work and never delivers a late result after unmount', async () => {
  const original = globalThis.fetch; let delivered = false; let aborted = false;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  try {
    const stop = watchMission({ apiUrl: 'https://control.example', sessionId: 'session_123456', key: 'a'.repeat(43) }, () => { delivered = true; }, () => { delivered = true; });
    stop(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(aborted, true); assert.equal(delivered, false);
  } finally { globalThis.fetch = original; }
});
