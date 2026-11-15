import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import demo from './data/demo.json' with { type: 'json' };
import { astronautIds, stateLabels, triggerLabels, visualTriggers } from '../src/mission/protocol.ts';
import { cameraDemo, cameraProfiles, visualEpisodes } from './camera-mission.ts';
import type { Alert, AstronautId, CrewStatus, Intervention, MissionSnapshot, Observation,
  Prediction, Profile, Reading, ResponseAction, SessionCreated, Trigger, VisualAnalysis, VisualResult, VisualTrigger } from '../src/mission/protocol.ts';
import type { Store } from './store.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
type FullProfile = Profile & Record<string, string | number>;
type Session = {
  id: string; createdAt: number; mode: MissionSnapshot['mode']; secondsPerMinute: number;
  hashes: Record<string, string>; profiles: FullProfile[];
};
export type MissionEvent = {
  id: string; at: number; kind: 'control' | 'context' | 'response' | 'heartbeat' | 'reading' | 'prediction' | 'inference_error' | 'visual_analysis' | 'self_report';
  order?: number;
  astronautId?: AstronautId; data: Record<string, unknown>;
};
export type Dependencies = {
  store: Store; now?: () => number;
  predict?: (id: AstronautId, readings: Reading[], profile: FullProfile) => Promise<Prediction>;
  vision?: (image: string, profile?: Profile) => Promise<VisualResult>;
  clientAi?: {
    enabled: boolean;
    provider: 'gemini' | 'none';
    apiKey?: string;
    model?: string;
  };
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const iso = (n: number) => new Date(n).toISOString();
const cleanProfile = (p: FullProfile): Profile => ({ astronaut_id: p.astronaut_id, specialty: p.specialty,
  stress_triggers: p.stress_triggers, anger_triggers: p.anger_triggers, calmers: p.calmers, min_sleep_h: p.min_sleep_h });
export const profiles = demo.profiles as unknown as FullProfile[];
export const readingFields = ['t_min', 'confined_space', 'long_conversation', 'overheard_negative_talk', 'exercise',
  'sleep_hours_last_night', 'music_playing', 'loved_voice', 'hr', 'hrv_rmssd', 'eda_mean', 'resp_rate', 'skin_temp',
  'eeg_delta', 'eeg_theta', 'eeg_alpha', 'eeg_beta', 'eeg_alpha_asym'] as const;
const bits = ['confined_space', 'long_conversation', 'overheard_negative_talk', 'exercise', 'loved_voice'];
export function validateReading(value: unknown): Reading {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'La lectura debe ser un objeto.');
  const v = value as Record<string, unknown>;
  for (const key of readingFields) {
    if (key === 'music_playing') {
      if (!['none', 'beethoven', 'suave'].includes(String(v[key]))) throw new HttpError(400, 'music_playing no es válido.');
    } else if (typeof v[key] !== 'number' || !Number.isFinite(v[key])) {
      throw new HttpError(400, `Falta un valor numérico finito para ${key}.`);
    }
  }
  if (!Number.isInteger(v.t_min) || (v.t_min as number) < 0 || (v.t_min as number) > 1000000) throw new HttpError(400, 't_min debe ser un minuto entero no negativo.');
  for (const key of bits) if (![0, 1].includes(v[key] as number)) throw new HttpError(400, `${key} debe ser 0 o 1.`);
  for (const key of ['hr', 'hrv_rmssd', 'eda_mean', 'resp_rate', 'eeg_delta', 'eeg_theta', 'eeg_alpha', 'eeg_beta']) {
    if ((v[key] as number) < 0) throw new HttpError(400, `${key} no puede ser negativo.`);
  }
  if ((v.sleep_hours_last_night as number) < 0 || (v.sleep_hours_last_night as number) > 24) throw new HttpError(400, 'Horas de sueño fuera de rango.');
  return Object.fromEntries(readingFields.map(k => [k, v[k]])) as Reading;
}
function validProfiles(value: unknown): FullProfile[] {
  if (!Array.isArray(value) || value.length !== 3) throw new HttpError(400, 'Las sesiones de sensores necesitan tres perfiles calibrados (A, B y C).');
  const result = value as FullProfile[];
  for (const id of astronautIds) {
    const p = result.find(x => x?.astronaut_id === id);
    if (!p) throw new HttpError(400, `Falta el perfil ${id}.`);
    for (const field of ['stress_triggers', 'anger_triggers', 'calmers', 'joy_triggers', 'specialty']) {
      if (typeof p[field] !== 'string') throw new HttpError(400, `Perfil ${id}: falta ${field}.`);
    }
    for (const field of ['min_sleep_h', 'reactivity', 'baseline_hr', 'baseline_hrv', 'baseline_eda',
      'baseline_alpha', 'baseline_beta', 'baseline_theta', 'baseline_delta']) {
      if (typeof p[field] !== 'number' || !Number.isFinite(p[field]) || p[field] <= 0) throw new HttpError(400, `Perfil ${id}: ${field} debe ser positivo.`);
    }
    if (p.min_sleep_h > 24 || Number(p.reactivity) > 1) throw new HttpError(400, `Perfil ${id}: horas o reactividad fuera de rango.`);
  }
  return result;
}
function publicReading(raw: Record<string, unknown>): Reading {
  return Object.fromEntries(readingFields.map(k => [k, raw[k]])) as Reading;
}
function suggested(p: FullProfile): Intervention | null {
  const first = String(p.calmers).split('|')[0];
  if (!['musica_beethoven', 'musica_suave', 'voz_pareja', 'ejercicio', 'pausa_guiada'].includes(first)) return null;
  return { type: ['ejercicio', 'pausa_guiada'].includes(first) ? 'actividad' : 'audio', item: first as Intervention['item'] };
}
function observationsFor(reading: Reading, p: FullProfile, at: number): Observation[] {
  const candidates: [Trigger, boolean][] = [
    ['espacios_reducidos', !!reading.confined_space], ['charlas_largas', !!reading.long_conversation],
    ['murmullos', !!reading.overheard_negative_talk], ['falta_sueno', reading.sleep_hours_last_night < p.min_sleep_h],
  ];
  return candidates.filter(([t, active]) => active && `${p.stress_triggers}|${p.anger_triggers}`.split('|').includes(t))
    .map(([trigger]) => ({ id: `demo-${p.astronaut_id}-${trigger}-${reading.t_min}`, astronautId: p.astronaut_id,
      trigger, source: 'simulador', timestamp: iso(at), expiresAt: iso(at + 60000),
      evidence: triggerLabels[trigger], confidence: null }));
}
function riskEpisodes(sessionId: string, id: AstronautId, points: {
  prediction: Prediction; at: number; observations: Observation[];
}[], source: 'simulador' | 'sensor'): Alert[] {
  const alerts: Alert[] = []; let current: Alert | null = null; let safe = 0;
  for (const point of points) {
    const p = point.prediction;
    const needsAttention = p.risk.level !== 'bajo' || ['estres', 'ira'].includes(p.state_now);
    if (needsAttention) {
      safe = 0;
      if (!current) {
        current = { id: `${sessionId}:${id}:risk:${point.at}`, astronautId: id, kind: 'riesgo', level: p.risk.level, peakLevel: p.risk.level,
          startedAt: iso(point.at), resolvedAt: null, active: true, state: p.state_now,
          triggers: point.observations, intervention: p.recommended_intervention, response: null, source };
        alerts.push(current);
      }
      current.level = p.risk.level; current.state = p.state_now; current.intervention = p.recommended_intervention;
      if (['bajo', 'medio', 'alto'].indexOf(p.risk.level) > ['bajo', 'medio', 'alto'].indexOf(current.peakLevel)) current.peakLevel = p.risk.level;
      if (point.observations.length) current.triggers = point.observations;
    } else if (current) {
      current.level = p.risk.level; current.state = p.state_now;
      if (++safe >= 2) { current.active = false; current.resolvedAt = iso(point.at); current = null; safe = 0; }
    }
  }
  return alerts;
}

export class MissionService {
  deps: Dependencies;
  order = 0;
  constructor(deps: Dependencies) { this.deps = deps; }
  now() { return (this.deps.now || Date.now)(); }
  async create(body: Record<string, unknown>): Promise<SessionCreated> {
    const mode = body.mode ?? 'camera';
    if (!['camera', 'camera-demo', 'demo', 'live'].includes(String(mode))) throw new HttpError(400, 'Modo de sesión inválido.');
    if (mode === 'live' && !this.deps.predict) throw new HttpError(503, 'El servicio de inferencia de sensores todavía no está configurado.');
    const seconds = body.secondsPerMinute ?? 3;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new HttpError(400, 'La velocidad debe estar entre 1 y 60 segundos por minuto simulado.');
    const id = typeof body.id === 'string' && /^[\w-]{3,80}$/.test(body.id) ? body.id : randomBytes(12).toString('base64url');
    const keys = Object.fromEntries(['control', 'viewer', ...astronautIds].map(role => [role, randomBytes(32).toString('base64url')]));
    const session: Session = { id, createdAt: this.now(), mode: mode as Session['mode'], secondsPerMinute: seconds,
      hashes: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, hash(v)])),
      profiles: mode === 'live' ? validProfiles(body.profiles) : String(mode).startsWith('camera') ? cameraProfiles as FullProfile[] : profiles.filter(p => astronautIds.includes(p.astronaut_id)) };
    await this.deps.store.put(`sessions/${id}/config`, session);
    await this.deps.store.put(`sessions/${id}/keys`, keys);
    await this.deps.store.put('sessions/active-session', { id, keys });
    return { sessionId: id, controlKey: keys.control, viewerKey: keys.viewer,
      crewKeys: Object.fromEntries(astronautIds.map(a => [a, keys[a]])) as Record<AstronautId, string>,
      clientAi: this.deps.clientAi };
  }
  async getOrCreateActive(): Promise<SessionCreated> {
    const active = await this.deps.store.get<{ id: string; keys: Record<string, string> }>('sessions/active-session');
    if (active?.id && active.keys?.control) {
      const config = await this.deps.store.get<Session>(`sessions/${active.id}/config`);
      if (config) {
        return {
          sessionId: active.id,
          controlKey: active.keys.control,
          viewerKey: active.keys.viewer,
          crewKeys: Object.fromEntries(astronautIds.map(a => [a, active.keys[a]])) as Record<AstronautId, string>,
          clientAi: this.deps.clientAi,
        };
      }
    }
    return this.create({ mode: 'camera', id: 'mission-active' });
  }
  async load(id: string, key: string) {
    if (!/^[\w-]{12,80}$/.test(id)) throw new HttpError(404, 'Sesión desconocida.');
    const session = await this.deps.store.get<Session>(`sessions/${id}/config`);
    if (!session) throw new HttpError(404, 'La sesión no existe. Crea una sesión o revisa el enlace.');
    const digest = Buffer.from(hash(key), 'hex');
    const role = Object.keys(session.hashes).find(r => timingSafeEqual(digest, Buffer.from(session.hashes[r], 'hex')));
    if (!role) throw new HttpError(401, 'La clave de sesión no es válida.');
    const events = (await this.deps.store.list<MissionEvent>(`sessions/${id}/events/`))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.at - b.at || a.id.localeCompare(b.id));
    this.order = Math.max(this.order, ...events.map(e => e.order || 0));
    return { session, events, role: role as MissionSnapshot['role'] };
  }
  async append(id: string, kind: MissionEvent['kind'], data: Record<string, unknown>, astronautId?: AstronautId) {
    const event: MissionEvent = { id: randomUUID(), at: this.now(), order: ++this.order, kind, data, ...(astronautId ? { astronautId } : {}) };
    await this.deps.store.put(`sessions/${id}/events/${event.id}`, event);
    return event;
  }
  clock(session: Session, events: MissionEvent[]) {
    let minute = 0; let playing = true; let since = session.createdAt;
    for (const event of events.filter(e => e.kind === 'control')) {
      if (playing) minute += (event.at - since) / (session.secondsPerMinute * 1000);
      if (typeof event.data.minute === 'number') minute = event.data.minute;
      playing = event.data.playing as boolean; since = event.at;
    }
    if (playing) minute += (this.now() - since) / (session.secondsPerMinute * 1000);
    return { minute: Math.max(0, Math.min(59, Math.floor(minute))), playing: playing && minute < 59,
      secondsPerMinute: session.secondsPerMinute, finished: minute >= 59 };
  }
  snapshot(session: Session, events: MissionEvent[], role: MissionSnapshot['role']): MissionSnapshot {
    const now = this.now(); const clock = this.clock(session, events);
    const crew: CrewStatus[] = session.profiles.filter(p => !astronautIds.includes(role as AstronautId) || p.astronaut_id === role).map(profile => {
      const id = profile.astronaut_id; const own = events.filter(e => e.astronautId === id);
      const readings: CrewStatus['readings'] = session.mode === 'demo'
        ? demo.readings.filter(r => r.astronaut_id === id && r.t_min <= clock.minute).map(r => ({ reading: publicReading(r),
          timestamp: iso(session.createdAt + r.t_min * 60000), source: 'simulador' }))
        : own.filter(e => e.kind === 'reading').map(e => ({ reading: e.data.reading as Reading,
          timestamp: e.data.capturedAt as string, source: 'sensor' }));
      readings.sort((a, b) => a.reading.t_min - b.reading.t_min);
      const latest = readings.at(-1) || null;
      const points = session.mode === 'demo'
        ? (demo.alerts[id] as (Prediction & { demo: { t_min: number } })[]).filter(a => a.demo.t_min <= clock.minute).map(a => ({
          prediction: { astronaut_id: id, timestamp: iso(session.createdAt + a.demo.t_min * 60000), state_now: a.state_now,
            state_probs: a.state_probs, risk: a.risk, recommended_intervention: a.recommended_intervention, model_version: a.model_version } as Prediction,
          at: session.createdAt + a.demo.t_min * 60000,
          observations: observationsFor(readings.find(r => r.reading.t_min === a.demo.t_min)!.reading, profile, session.createdAt + a.demo.t_min * 60000),
        }))
        : own.filter(e => e.kind === 'prediction').map(e => ({ prediction: e.data.prediction as Prediction, at: e.at,
          observations: this.contexts(own, e.at).filter(o => Number(new Date(o.expiresAt)) > e.at) }));
      const prediction = points.at(-1)?.prediction ?? null;
      const contexts = this.contexts(own, now);
      const observations = [...(session.mode === 'demo' && latest ? observationsFor(latest.reading, profile, Number(new Date(latest.timestamp))) : []),
        ...contexts.filter(o => Number(new Date(o.expiresAt)) > now)];
      const visualAnalyses: VisualAnalysis[] = session.mode === 'camera-demo' ? cameraDemo(id, clock.minute, session.createdAt)
        : own.filter(e => e.kind === 'visual_analysis').map(e => ({ ...(e.data.result as VisualResult), id: e.id,
          astronautId: id, timestamp: iso(e.at), source: 'vision' }));
      const cameraMode = session.mode.startsWith('camera');
      const alerts = cameraMode ? visualEpisodes(session.id, id, visualAnalyses, profile)
        : riskEpisodes(session.id, id, points, session.mode === 'demo' ? 'simulador' : 'sensor');
      for (const context of contexts) alerts.push({ id: `${session.id}:${id}:context:${context.id}`, astronautId: id,
        kind: 'contexto', level: 'bajo', peakLevel: 'bajo', startedAt: context.timestamp,
        active: Number(new Date(context.expiresAt)) > now, resolvedAt: Number(new Date(context.expiresAt)) <= now ? context.expiresAt : null,
        state: null, triggers: [context], intervention: suggested(profile), response: null, source: context.source });
      for (const alert of alerts) {
        const response = own.filter(e => e.kind === 'response' && e.data.alertId === alert.id).at(-1);
        if (response) alert.response = { action: response.data.action as ResponseAction, timestamp: iso(response.at) };
      }
      const heartbeat = own.filter(e => e.kind === 'heartbeat').at(-1);
      const lastFailure = own.filter(e => e.kind === 'inference_error').at(-1);
      const lastPrediction = own.filter(e => e.kind === 'prediction').at(-1);
      const inferenceError = lastFailure && (!lastPrediction || lastFailure.at > lastPrediction.at) ? String(lastFailure.data.message) : null;
      const hasWindow = readings.length >= 10 && readings.slice(-10).every((r, i, all) => i === 0 || r.reading.t_min === all[i - 1].reading.t_min + 1);
      const visualLatest = visualAnalyses.at(-1);
      if (cameraMode && visualLatest) observations.push(...visualLatest.observations.filter(o => o.confidence >= .8).map(o => ({
        ...o, id: `${visualLatest.id}:${o.trigger}`, astronautId: id, source: visualLatest.source,
        timestamp: visualLatest.timestamp, expiresAt: iso(Date.parse(visualLatest.timestamp) + 60000),
      })));
      const selfReportEvent = own.filter(e => e.kind === 'self_report').at(-1);
      const selfReport = selfReportEvent ? { state: selfReportEvent.data.state as Prediction['state_now'], timestamp: iso(selfReportEvent.at) } : null;
      const quality = session.mode === 'camera-demo' ? 'simulada' : session.mode === 'camera'
        ? !visualLatest ? 'sin_datos' : now - Date.parse(visualLatest.timestamp) > 60000 ? 'desactualizada' : 'actualizada'
        : session.mode === 'demo' ? 'simulada' : !latest ? 'sin_datos'
        : now - Number(new Date(latest.timestamp)) > 120000 ? 'desactualizada' : inferenceError ? 'error_modelo'
          : !hasWindow || !prediction ? 'recopilando' : 'actualizada';
      return { id, profile: cleanProfile(profile), reading: latest?.reading || null, prediction,
        readings: readings.slice(-120), predictions: points.slice(-120).map(p => ({ prediction: p.prediction, timestamp: iso(p.at) })),
        observations, alerts: alerts.slice(-100), quality,
        lastReadingAt: latest?.timestamp || null, deviceLastSeen: heartbeat ? iso(heartbeat.at) : null,
        cameraStatus: heartbeat ? String(heartbeat.data.cameraStatus) : null, inferenceError,
        visualAnalyses: visualAnalyses.slice(-100), selfReport };
    });
    if (session.mode === 'live') { clock.minute = Math.max(0, ...crew.map(c => c.reading?.t_min ?? 0)); clock.playing = false; clock.finished = false; }
    if (session.mode === 'camera') { clock.minute = Math.floor((now - session.createdAt) / 60000); clock.playing = false; clock.finished = false; }
    return { version: 1, sessionId: session.id, mode: session.mode, createdAt: iso(session.createdAt), serverTime: iso(now), role,
      clock, capabilities: { vision: !!this.deps.vision, sensors: !!this.deps.predict }, crew };
  }
  contexts(events: MissionEvent[], at: number): Observation[] {
    return events.filter(e => e.kind === 'context' && e.at <= at).map(e => ({
      id: e.id, astronautId: e.astronautId!, trigger: e.data.trigger as Trigger,
      source: e.data.source as 'manual' | 'vision', timestamp: iso(e.at),
      expiresAt: iso(e.at + Number(e.data.durationSeconds) * 1000), evidence: String(e.data.evidence),
      confidence: e.data.confidence as number | null,
    }));
  }
  async get(id: string, key: string) {
    const { session, events, role } = await this.load(id, key);
    return this.snapshot(session, events, role);
  }
  async action(id: string, key: string, route: string, body: Record<string, unknown>) {
    const { session, events, role } = await this.load(id, key);
    if (role === 'viewer') throw new HttpError(403, 'Este enlace permite consultar la sesión.');
    if (route === 'control') {
      if (role !== 'control') throw new HttpError(403, 'Solo CentroControl puede controlar la demo.');
      if (!['demo', 'camera-demo'].includes(session.mode)) throw new HttpError(409, 'Esta sesión recibe observaciones en vivo.');
      if (typeof body.playing !== 'boolean') throw new HttpError(400, 'playing debe ser booleano.');
      if (body.minute !== undefined && (!Number.isInteger(body.minute) || Number(body.minute) < 0 || Number(body.minute) > 59)) throw new HttpError(400, 'Minuto fuera de rango.');
      await this.append(id, 'control', { playing: body.playing, ...(body.minute !== undefined ? { minute: body.minute } : {}) });
    } else {
      const aid = body.astronautId as AstronautId;
      if (!astronautIds.includes(aid)) throw new HttpError(400, 'Astronauta desconocido.');
      if (role !== 'control' && role !== aid) throw new HttpError(403, 'La clave pertenece a otro astronauta.');
      if (route === 'heartbeat') {
        if (!['live', 'paused', 'error', 'connecting', 'off'].includes(String(body.cameraStatus))) throw new HttpError(400, 'Estado de cámara inválido.');
        const previous = events.filter(e => e.kind === 'heartbeat' && e.astronautId === aid).at(-1);
        if (!previous || this.now() - previous.at >= 15000 || previous.data.cameraStatus !== body.cameraStatus) {
          await this.append(id, 'heartbeat', { cameraStatus: body.cameraStatus }, aid);
        }
      } else if (route === 'response') {
        if (!['reconocida', 'aceptada', 'descartada', 'util', 'sin_efecto'].includes(String(body.action))) throw new HttpError(400, 'Respuesta desconocida.');
        const snap = this.snapshot(session, events, role);
        if (!snap.crew.find(c => c.id === aid)?.alerts.some(a => a.id === body.alertId)) throw new HttpError(404, 'La alerta no existe en esta sesión.');
        await this.append(id, 'response', { alertId: body.alertId, action: body.action }, aid);
      } else if (route === 'self-report') {
        if (typeof body.state !== 'string' || !Object.hasOwn(stateLabels, body.state)) throw new HttpError(400, 'Estado comunicado no válido.');
        await this.append(id, 'self_report', { state: body.state }, aid);
      } else if (route === 'vision') {
        if (session.mode === 'camera-demo') throw new HttpError(409, 'Esta demo es simulada. Inicia una sesión de cámara para analizar imágenes reales.');
        const previous = events.filter(e => e.kind === 'visual_analysis' && e.astronautId === aid).at(-1);
        if (previous && this.now() - previous.at < 10000) throw new HttpError(429, 'Espera unos segundos antes de analizar otra imagen.');
        let cleanResult: VisualResult;
        if (body.result && typeof body.result === 'object') {
          const r = body.result as Record<string, unknown>;
          if (typeof r.summary !== 'string' || !r.summary.trim() || !Array.isArray(r.observations) || r.observations.length > 3
            || r.observations.some((o: unknown) => {
              if (!o || typeof o !== 'object') return true;
              const obs = o as Record<string, unknown>;
              return !visualTriggers.includes(obs.trigger as VisualTrigger) || !Number.isFinite(obs.confidence) || Number(obs.confidence) < 0 || Number(obs.confidence) > 1 || typeof obs.evidence !== 'string';
            })) throw new HttpError(400, 'El resultado de Edge AI contiene datos inválidos.');
          cleanResult = {
            summary: String(r.summary).slice(0, 500),
            ...(r.impact ? { impact: String(r.impact).slice(0, 500) } : {}),
            ...(r.suggestion ? { suggestion: String(r.suggestion).slice(0, 500) } : {}),
            observations: (r.observations as Array<Record<string, unknown>>).map(o => ({
              trigger: o.trigger as VisualTrigger,
              confidence: Number(o.confidence),
              evidence: String(o.evidence).slice(0, 400),
            })),
            processedOn: 'edge_device',
            ...(typeof r.latencyMs === 'number' && Number.isFinite(r.latencyMs) ? { latencyMs: r.latencyMs } : {}),
          };
        } else if (typeof body.image === 'string') {
          if (!this.deps.vision) throw new HttpError(503, 'El análisis visual todavía no está configurado en el servidor.');
          if (body.image.length > 900000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image)) throw new HttpError(400, 'Envía un fotograma JPEG de menos de 650 KB.');
          const profile = session.profiles.find(p => p.astronaut_id === aid);
          const result = await this.deps.vision(body.image, profile);
          if (typeof result.summary !== 'string' || !result.summary.trim() || !Array.isArray(result.observations) || result.observations.length > 3
            || result.observations.some(o => !visualTriggers.includes(o.trigger) || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1 || typeof o.evidence !== 'string')) throw new HttpError(502, 'El análisis visual devolvió datos inválidos.');
          cleanResult = {
            summary: result.summary.slice(0, 500),
            ...(result.impact ? { impact: String(result.impact).slice(0, 500) } : {}),
            ...(result.suggestion ? { suggestion: String(result.suggestion).slice(0, 500) } : {}),
            observations: result.observations.map(o => ({ trigger: o.trigger, confidence: o.confidence, evidence: o.evidence.slice(0, 400) })),
            processedOn: 'server',
          };
        } else {
          throw new HttpError(400, 'Se requiere un resultado de Edge AI o un fotograma para análisis.');
        }
        await this.append(id, 'visual_analysis', { result: cleanResult }, aid);
      } else if (route === 'context') {
        const trigger = body.trigger as Trigger; const evidence = String(body.evidence || 'Registrado por el astronauta.').slice(0, 400);
        if (!(trigger in triggerLabels)) throw new HttpError(400, 'Detonador desconocido.');
        const profile = session.profiles.find(p => p.astronaut_id === aid)!;
        if (!`${profile.stress_triggers}|${profile.anger_triggers}`.split('|').includes(trigger)) throw new HttpError(400, 'Este contexto no está registrado como detonador en el perfil.');
        const previous = events.filter(e => e.kind === 'context' && e.astronautId === aid && e.data.trigger === trigger).at(-1);
        if (!previous || this.now() - previous.at >= Number(previous.data.durationSeconds) * 1000) {
          await this.append(id, 'context', { trigger, evidence, confidence: null, source: 'manual', durationSeconds: 300 }, aid);
        }
      } else if (route === 'readings') {
        if (session.mode !== 'live') throw new HttpError(409, 'Las lecturas reales necesitan una sesión de sensores.');
        const reading = validateReading(body.reading);
        const capturedAt = typeof body.capturedAt === 'string' ? Date.parse(body.capturedAt) : NaN;
        if (!Number.isFinite(capturedAt) || capturedAt > this.now() + 10000 || capturedAt < session.createdAt - 60000) throw new HttpError(400, 'capturedAt debe ser una fecha UTC válida de esta sesión.');
        const own = events.filter(e => e.astronautId === aid);
        const previous = own.filter(e => e.kind === 'reading');
        const duplicate = previous.find(e => (e.data.reading as Reading).t_min === reading.t_min);
        if (duplicate && JSON.stringify(duplicate.data.reading) !== JSON.stringify(reading)) throw new HttpError(409, 'Ya existe otra lectura para este minuto.');
        if (!duplicate) {
          const last = previous.at(-1);
          if (last && (reading.t_min <= (last.data.reading as Reading).t_min || capturedAt <= Date.parse(String(last.data.capturedAt)))) throw new HttpError(409, 'Las lecturas deben llegar en orden de tiempo.');
          if (last && Math.abs(capturedAt - Date.parse(String(last.data.capturedAt)) - (reading.t_min - (last.data.reading as Reading).t_min) * 60000) > 10000) throw new HttpError(400, 'Cada lectura debe representar un minuto de señales; revisa capturedAt y t_min.');
          const event = await this.append(id, 'reading', { reading, capturedAt: iso(capturedAt) }, aid);
          own.push(event);
        }
        const window = own.filter(e => e.kind === 'reading').map(e => e.data.reading as Reading).sort((a, b) => a.t_min - b.t_min).slice(-10);
        const alreadyPredicted = own.some(e => e.kind === 'prediction' && e.data.minute === reading.t_min);
        if (!alreadyPredicted && window.length === 10 && window.every((r, i) => i === 0 || r.t_min === window[i - 1].t_min + 1)) {
          try {
            const prediction = await this.deps.predict!(aid, window, session.profiles.find(p => p.astronaut_id === aid)!);
            await this.append(id, 'prediction', { prediction, minute: reading.t_min }, aid);
          } catch {
            await this.append(id, 'inference_error', { message: 'No se pudo analizar la ventana. Las lecturas se conservaron; reenvía la última para reintentar.' }, aid);
          }
        }
      } else throw new HttpError(404, 'Operación desconocida.');
    }
    return this.get(id, key);
  }
}
