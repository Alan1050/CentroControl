import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/api.ts';
import { MissionService, profiles, validateReading } from '../server/mission.ts';
import { FileStore, MemoryStore } from '../server/store.ts';
import { providers } from '../server/providers.ts';
import type { Prediction, Reading } from '../src/mission/protocol.ts';
import demo from '../server/data/demo.json' with { type: 'json' };

function fixture() {
  let time = Date.parse('2026-11-15T03:00:00Z');
  const store = new MemoryStore();
  const service = new MissionService({ store, now: () => time });
  return { service, store, advance: (ms: number) => { time += ms; }, now: () => time };
}
const reading = (minute: number): Reading => validateReading({ ...demo.readings.find(r => r.astronaut_id === 'A'), t_min: minute });
const prediction = (): Prediction => ({ astronaut_id: 'A', timestamp: '2026-11-15T03:09:00Z', state_now: 'estres',
  state_probs: { calma: .1, estres: .8, ira: .1, fatiga: 0, alegria: 0 },
  risk: { anger_next_5min: .7, level: 'alto' }, recommended_intervention: { type: 'audio', item: 'musica_beethoven' }, model_version: 'gru_v1' });

test('demo: all clients share the clock, state, risk and deterministic episode IDs', async () => {
  const f = fixture(); const keys = await f.service.create({ mode: 'demo' });
  f.advance(30 * 3000);
  const control = await f.service.get(keys.sessionId, keys.controlKey);
  const ojos = await f.service.get(keys.sessionId, keys.crewKeys.A);
  const viewer = await f.service.get(keys.sessionId, keys.viewerKey);
  assert.equal(control.clock.minute, 30); assert.equal(ojos.crew.length, 1);
  assert.deepEqual(control.crew[0], ojos.crew[0]); assert.deepEqual(viewer.crew, control.crew);
  assert.equal(control.crew[0].prediction?.state_now, 'calma');
  assert.equal(control.crew[0].prediction?.risk.level, 'alto');
  assert.equal(control.crew[1].alerts.filter(a => a.kind === 'riesgo').length, 0);
  assert.equal(control.crew[0].alerts.length, 1);
});
test('warmup is explicit; the complete demo resolves episodes with two safe readings', async () => {
  const f = fixture(); const keys = await f.service.create({ mode: 'demo' });
  assert.equal((await f.service.get(keys.sessionId, keys.controlKey)).crew[0].prediction, null);
  f.advance(43 * 3000);
  assert.equal((await f.service.get(keys.sessionId, keys.controlKey)).crew[0].alerts[0].active, true);
  f.advance(3000);
  const snapshot = await f.service.get(keys.sessionId, keys.controlKey);
  assert.equal(snapshot.crew[0].alerts[0].active, false);
  assert.equal(snapshot.crew[0].alerts.length, 1);
  f.advance(60000);
  assert.equal((await f.service.get(keys.sessionId, keys.controlKey)).clock.finished, true);
});
test('pause survives another service instance and resume preserves fractional clock progress', async () => {
  const f = fixture(); const keys = await f.service.create({ mode: 'demo' }); f.advance(10500);
  await f.service.action(keys.sessionId, keys.controlKey, 'control', { playing: false });
  f.advance(60000);
  const other = new MissionService({ store: f.store, now: f.now });
  assert.equal((await other.get(keys.sessionId, keys.controlKey)).clock.minute, 3);
  await other.action(keys.sessionId, keys.controlKey, 'control', { playing: true }); f.advance(1500);
  assert.equal((await f.service.get(keys.sessionId, keys.controlKey)).clock.minute, 4);
});
test('astronaut response reaches control and persists without clearing the episode', async () => {
  const f = fixture(); const keys = await f.service.create({ mode: 'demo' }); f.advance(90000);
  const before = await f.service.get(keys.sessionId, keys.crewKeys.A); const alert = before.crew[0].alerts[0];
  await f.service.action(keys.sessionId, keys.crewKeys.A, 'response', { astronautId: 'A', alertId: alert.id, action: 'aceptada' });
  const after = await f.service.get(keys.sessionId, keys.controlKey);
  assert.equal(after.crew[0].alerts[0].response?.action, 'aceptada'); assert.equal(after.crew[0].alerts[0].active, true);
  assert.equal(after.crew[0].alerts.length, before.crew[0].alerts.length);
});
test('viewer is read-only and astronaut keys cannot operate on other crew members', async () => {
  const f = fixture(); const k = await f.service.create({ mode: 'demo' });
  await assert.rejects(f.service.get(k.sessionId, 'wrong'), /clave/);
  await assert.rejects(f.service.action(k.sessionId, k.viewerKey, 'control', { playing: false }), /consultar/);
  await assert.rejects(f.service.action(k.sessionId, k.crewKeys.A, 'context', { astronautId: 'B', trigger: 'falta_sueno' }), /otro astronauta/);
  await assert.rejects(f.service.action(k.sessionId, k.crewKeys.A, 'control', { playing: false }), /Solo CentroControl/);
});
test('context is labeled, deduplicated, expires, and does not fabricate a physiological prediction', async () => {
  const f = fixture(); const k = await f.service.create({ mode: 'demo' });
  const body = { astronautId: 'A', trigger: 'espacios_reducidos' };
  await f.service.action(k.sessionId, k.crewKeys.A, 'context', body);
  await f.service.action(k.sessionId, k.crewKeys.A, 'context', body);
  let c = (await f.service.get(k.sessionId, k.controlKey)).crew[0];
  assert.equal(c.alerts.length, 1); assert.equal(c.alerts[0].kind, 'contexto');
  assert.equal(c.alerts[0].source, 'manual'); assert.equal(c.prediction, null);
  f.advance(301000); c = (await f.service.get(k.sessionId, k.controlKey)).crew[0];
  assert.equal(c.alerts.find(a => a.kind === 'contexto')?.active, false);
});
test('concurrent independent events are retained instead of overwriting session state', async () => {
  const f = fixture(); const k = await f.service.create({ mode: 'demo' });
  await Promise.all(['A', 'B', 'C'].map(astronautId => f.service.action(k.sessionId, k.controlKey, 'heartbeat', { astronautId, cameraStatus: 'live' })));
  const snapshot = await f.service.get(k.sessionId, k.controlKey);
  assert.ok(snapshot.crew.every(c => c.deviceLastSeen && c.cameraStatus === 'live'));
});
test('local persistence is atomic and survives a new store/service instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'neuroorbit-test-'));
  try {
    const s = new MissionService({ store: new FileStore(dir) }); const k = await s.create({});
    await Promise.all(Array.from({ length: 10 }, (_, n) => s.deps.store.put(`unrelated/${n}`, { n })));
    assert.equal((await new FileStore(dir).list('unrelated/')).length, 10);
    assert.equal((await new MissionService({ store: new FileStore(dir) }).get(k.sessionId, k.controlKey)).sessionId, k.sessionId);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('sensor validation rejects missing, nonfinite, fractional and invalid context data', () => {
  for (const r of [{}, { ...reading(0), hr: NaN }, { ...reading(0), hr: Infinity }, { ...reading(0), t_min: 1.2 },
    { ...reading(0), confined_space: 2 }, { ...reading(0), sleep_hours_last_night: 25 }]) assert.throws(() => validateReading(r));
});
test('real readings require calibrated profiles; inference uses a consecutive window once', async () => {
  const f = fixture(); let calls = 0;
  const s = new MissionService({ store: f.store, now: f.now, predict: async (_id, window) => { calls++; assert.equal(window.length, 10); return prediction(); } });
  await assert.rejects(s.create({ mode: 'live' }), /perfiles/);
  const k = await s.create({ mode: 'live', profiles: profiles.slice(0, 3) });
  for (let minute = 0; minute < 10; minute++) {
    if (minute) f.advance(60000);
    await s.action(k.sessionId, k.crewKeys.A, 'readings', { astronautId: 'A', reading: reading(minute), capturedAt: new Date(f.now()).toISOString() });
  }
  assert.equal(calls, 1);
  const snapshot = await s.get(k.sessionId, k.controlKey);
  assert.equal(snapshot.crew[0].quality, 'actualizada'); assert.equal(snapshot.crew[0].alerts[0].source, 'sensor');
  await s.action(k.sessionId, k.crewKeys.A, 'readings', { astronautId: 'A', reading: reading(9), capturedAt: new Date(f.now()).toISOString() });
  assert.equal(calls, 1);
  f.advance(121000); assert.equal((await s.get(k.sessionId, k.controlKey)).crew[0].quality, 'desactualizada');
});
test('gaps restart sensor warmup; failed inference preserves readings and supports retry', async () => {
  const f = fixture(); let fails = true; let calls = 0;
  const s = new MissionService({ store: f.store, now: f.now, predict: async () => { calls++; if (fails) throw new Error('unavailable'); return prediction(); } });
  const k = await s.create({ mode: 'live', profiles: profiles.slice(0, 3) });
  for (let minute = 0; minute <= 10; minute++) {
    if (minute) f.advance(60000); if (minute === 3) continue;
    await s.action(k.sessionId, k.crewKeys.A, 'readings', { astronautId: 'A', reading: reading(minute), capturedAt: new Date(f.now()).toISOString() });
  }
  assert.equal(calls, 0); assert.equal((await s.get(k.sessionId, k.controlKey)).crew[0].quality, 'recopilando');
  for (let minute = 11; minute <= 13; minute++) {
    f.advance(60000); await s.action(k.sessionId, k.crewKeys.A, 'readings', { astronautId: 'A', reading: reading(minute), capturedAt: new Date(f.now()).toISOString() });
  }
  assert.equal(calls, 1); assert.equal((await s.get(k.sessionId, k.controlKey)).crew[0].quality, 'error_modelo');
  fails = false; f.advance(1);
  await s.action(k.sessionId, k.crewKeys.A, 'readings', { astronautId: 'A', reading: reading(13), capturedAt: new Date(f.now() - 1).toISOString() });
  assert.equal(calls, 2); assert.equal((await s.get(k.sessionId, k.controlKey)).crew[0].quality, 'actualizada');
});
test('API rejects malformed bodies, unauthorized origins and unauthorized writes', async () => {
  const api = createApi({ store: new MemoryStore() }, ['https://control.example']);
  const response = await api(new Request('https://control.example/api/sessions', { method: 'POST', body: '{' }));
  assert.equal(response.status, 400);
  assert.equal((await api(new Request('https://control.example/api/health', { headers: { Origin: 'https://unrelated.example' } }))).status, 403);
  const options = await api(new Request('https://control.example/api/sessions', { method: 'OPTIONS', headers: { Origin: 'https://control.example' } }));
  assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
});
test('HTTP contract supports creation, polling, heartbeat, context and response across clients', async () => {
  const f = fixture(); const api = createApi({ store: f.store, now: f.now });
  const req = async (path: string, body?: unknown, key?: string) => {
    const r = await api(new Request(`http://localhost/api${path}`, { method: body ? 'POST' : 'GET',
      headers: key ? { Authorization: `Bearer ${key}` } : {}, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: r.status, data: await r.json() };
  };
  const created = await req('/sessions', { mode: 'demo' }); assert.equal(created.status, 201);
  const k = created.data; f.advance(90000);
  assert.equal((await req(`/sessions/${k.sessionId}`)).status, 401);
  const a = await req(`/sessions/${k.sessionId}`, undefined, k.crewKeys.A); assert.equal(a.data.crew.length, 1);
  await req(`/sessions/${k.sessionId}/response`, { astronautId: 'A', alertId: a.data.crew[0].alerts[0].id, action: 'util' }, k.crewKeys.A);
  const c = await req(`/sessions/${k.sessionId}`, undefined, k.controlKey);
  assert.equal(c.data.crew[0].alerts[0].response.action, 'util');
});
test('vision observes context and never supplies a physiological state', async () => {
  const f = fixture(); const s = new MissionService({ store: f.store, now: f.now,
    vision: async () => ({ summary: 'Espacio reducido visible.', observations: [{ trigger: 'espacios_reducidos', confidence: .9, evidence: 'Paredes próximas y espacio de circulación reducido.' }] }) });
  const k = await s.create({ mode: 'camera' });
  const result = await s.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image: 'data:image/jpeg;base64,/9j/AA==' });
  assert.equal(result.crew[0].prediction, null); assert.equal(result.crew[0].alerts[0].source, 'vision');
});
test('provider forwards the correct profile, window and server-only token, validates model output', async () => {
  let payload: Record<string, unknown> = {};
  const p = providers({ INFERENCE_URL: 'https://model.example', INFERENCE_TOKEN: 'secret' }, async (_url, init) => {
    payload = JSON.parse(init?.body as string); assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer secret');
    return Response.json(prediction());
  });
  assert.equal((await p.predict!('A', [reading(0)], profiles[0])).risk.level, 'alto');
  assert.ok(payload.perfil); assert.equal(payload.astronaut_id, 'A');
  const broken = providers({ INFERENCE_URL: 'https://model.example' }, async () => Response.json({ ...prediction(), astronaut_id: 'B' }));
  await assert.rejects(broken.predict!('A', [reading(0)], profiles[0]), /inválido/);
});
