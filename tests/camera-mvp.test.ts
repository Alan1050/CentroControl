import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MissionService } from '../server/mission.ts';
import { MemoryStore } from '../server/store.ts';
import { providers } from '../server/providers.ts';
import { createApi } from '../server/api.ts';
import type { VisualResult } from '../src/mission/protocol.ts';

const image = 'data:image/jpeg;base64,/9j/AA==';
const scene: VisualResult = { summary: 'Pasillo estrecho entre dos equipos.', observations: [
  { trigger: 'espacios_reducidos', confidence: .94, evidence: 'Las paredes próximas dejan poco espacio de circulación.' },
] };
test('MVP starts with camera only, without physiology, calibration or a GRU service', async () => {
  const service = new MissionService({ store: new MemoryStore(), predict: async () => { throw new Error('Camera sessions must not call the GRU'); } });
  const k = await service.create({});
  const snapshot = await service.get(k.sessionId, k.controlKey);
  assert.equal(snapshot.mode, 'camera');
  for (const crew of snapshot.crew) {
    assert.equal(crew.reading, null); assert.equal(crew.prediction, null);
    assert.deepEqual(crew.readings, []); assert.deepEqual(crew.predictions, []);
    assert.deepEqual(crew.visualAnalyses, []); assert.equal(crew.selfReport, null);
  }
});
test('the first real camera observation immediately reaches both clients without a ten-minute warmup', async () => {
  const store = new MemoryStore();
  const service = new MissionService({ store, vision: async () => scene }); const k = await service.create({});
  await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  const astronaut = await service.get(k.sessionId, k.crewKeys.A);
  const control = await service.get(k.sessionId, k.controlKey);
  assert.deepEqual(astronaut.crew[0], control.crew[0]);
  assert.equal(astronaut.crew[0].visualAnalyses[0].summary, scene.summary);
  assert.equal(astronaut.crew[0].alerts[0].source, 'vision');
  assert.equal(astronaut.crew[0].alerts[0].state, null);
  assert.equal(astronaut.crew[0].alerts[0].intervention?.item, 'pausa_guiada');
  assert.equal(astronaut.crew[0].prediction, null);
  assert.equal(JSON.stringify([...store.data.values()]).includes(image), false);
});
test('visual episodes keep their ID while present, close when a new image no longer shows them, and preserve responses', async () => {
  let time = Date.parse('2026-11-15T05:00:00Z'); let result = scene;
  const service = new MissionService({ store: new MemoryStore(), now: () => time, vision: async () => result });
  const k = await service.create({});
  const first = await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  const alertId = first.crew[0].alerts[0].id;
  await service.action(k.sessionId, k.crewKeys.A, 'response', { astronautId: 'A', alertId, action: 'aceptada' });
  time += 20000;
  const repeated = await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  assert.equal(repeated.crew[0].alerts.length, 1); assert.equal(repeated.crew[0].alerts[0].id, alertId);
  assert.equal(repeated.crew[0].alerts[0].response?.action, 'aceptada');
  result = { summary: 'Zona despejada.', observations: [] }; time += 20000;
  const cleared = await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  assert.equal(cleared.crew[0].alerts[0].active, false); assert.equal(cleared.crew[0].visualAnalyses.length, 3);
});
test('an old image becomes stale without assuming that the situation or emotion has resolved', async () => {
  let time = Date.parse('2026-11-15T05:00:00Z');
  const service = new MissionService({ store: new MemoryStore(), now: () => time, vision: async () => scene });
  const k = await service.create({}); await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  time += 61000;
  const snapshot = await service.get(k.sessionId, k.controlKey);
  assert.equal(snapshot.crew[0].quality, 'desactualizada'); assert.equal(snapshot.crew[0].alerts[0].active, true);
  assert.equal(snapshot.crew[0].selfReport, null); assert.equal(snapshot.crew[0].prediction, null);
});
test('low-confidence visual evidence remains in the observation without generating an alert', async () => {
  const service = new MissionService({ store: new MemoryStore(), vision: async () => ({ ...scene,
    observations: [{ ...scene.observations[0], confidence: .4 }] }) });
  const k = await service.create({}); const snapshot = await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  assert.equal(snapshot.crew[0].visualAnalyses.length, 1); assert.equal(snapshot.crew[0].alerts.length, 0);
});
test('reported feelings remain explicitly separate from visual observations and are limited to the astronaut', async () => {
  const service = new MissionService({ store: new MemoryStore(), vision: async () => scene }); const k = await service.create({});
  await service.action(k.sessionId, k.crewKeys.A, 'vision', { astronautId: 'A', image });
  await service.action(k.sessionId, k.crewKeys.A, 'self-report', { astronautId: 'A', state: 'estres' });
  const snapshot = await service.get(k.sessionId, k.controlKey);
  assert.equal(snapshot.crew[0].selfReport?.state, 'estres'); assert.equal(snapshot.crew[0].alerts[0].state, null);
  await assert.rejects(service.action(k.sessionId, k.crewKeys.A, 'self-report', { astronautId: 'B', state: 'ira' }), /otro astronauta/);
  await assert.rejects(service.action(k.sessionId, k.viewerKey, 'self-report', { astronautId: 'A', state: 'ira' }), /consultar/);
});
test('the camera demo shares visual scenes and never inserts synthetic physiological values', async () => {
  const service = new MissionService({ store: new MemoryStore() }); const k = await service.create({ mode: 'camera-demo' });
  const snapshot = await service.action(k.sessionId, k.controlKey, 'control', { minute: 30, playing: false });
  assert.equal(snapshot.crew[0].alerts.length, 1); assert.equal(snapshot.crew[1].alerts.length, 0);
  assert.equal(snapshot.crew[0].visualAnalyses.at(-1)?.source, 'simulador');
  assert.ok(snapshot.crew.every(c => c.prediction === null && c.reading === null && c.readings.length === 0));
  const ended = await service.action(k.sessionId, k.controlKey, 'control', { minute: 45, playing: false });
  assert.ok(ended.crew[0].alerts.every(a => !a.active));
});
test('visual provider uses structured scene evidence, disables response storage and rejects unknown trigger types', async () => {
  let body: Record<string, unknown> = {};
  const p = providers({ OPENAI_API_KEY: 'test-only', VISION_MODEL: 'image-model' }, async (_url, init) => {
    body = JSON.parse(init?.body as string);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(scene) }] }] });
  });
  assert.deepEqual(await p.vision!(image), scene); assert.equal(body.store, false);
  assert.ok(String(body.instructions).includes('No infieras emociones'));
  const invalid = providers({ OPENAI_API_KEY: 'test-only', VISION_MODEL: 'image-model' }, async () =>
    Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Invented signal', observations: [
      { trigger: 'heart_rate', confidence: 1, evidence: 'guess' },
    ] }) }] }] }));
  await assert.rejects(invalid.vision!(image), /inválidos/);
});
test('Google AI (Gemini) visual provider formats request and parses structured output', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> = {};
  const p = providers({ GEMINI_API_KEY: 'test-gemini-key' }, async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init?.body as string);
    return Response.json({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(scene) }]
        }
      }]
    });
  });
  assert.ok(p.vision, 'vision provider should be enabled with GEMINI_API_KEY');
  const res = await p.vision!(image);
  assert.deepEqual(res, scene);
  assert.ok(requestUrl.includes('generativelanguage.googleapis.com'));
  assert.ok(requestUrl.includes('test-gemini-key'));
  assert.ok(requestBody.contents);
});
test('mock visual provider provides fallback observations when enabled', async () => {
  const p = providers({ MOCK_VISION: 'true' });
  assert.ok(p.vision, 'vision provider should be enabled with MOCK_VISION');
  const res1 = await p.vision!(image);
  assert.ok(res1.summary);
  const res2 = await p.vision!(image);
  assert.equal(res2.observations[0]?.trigger, 'espacios_reducidos');
});
test('HTTP camera-only session and reported state work without any inference configuration', async () => {
  const api = createApi({ store: new MemoryStore() });
  const create = await api(new Request('https://control.example/api/sessions', { method: 'POST', body: '{}' }));
  const k = await create.json(); assert.equal(create.status, 201);
  const report = await api(new Request(`https://control.example/api/sessions/${k.sessionId}/self-report`, { method: 'POST',
    headers: { Authorization: `Bearer ${k.crewKeys.A}` }, body: JSON.stringify({ astronautId: 'A', state: 'calma' }) }));
  assert.equal(report.status, 200); assert.equal((await report.json()).crew[0].selfReport.state, 'calma');
});
test('GET /api/active-session returns persistent active mission for seamless mobile selection', async () => {
  const api = createApi({ store: new MemoryStore() });
  const active = await api(new Request('https://control.example/api/active-session'));
  assert.equal(active.status, 200);
  const data = await active.json();
  assert.ok(data.sessionId);
  assert.ok(data.crewKeys.A);
  assert.ok(data.crewKeys.B);
  assert.ok(data.crewKeys.C);
});
