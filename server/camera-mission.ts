import type { Alert, AstronautId, Observation, Profile, VisualAnalysis, VisualResult } from '../src/mission/protocol.ts';

export const cameraProfiles: Profile[] = [
  {
    astronaut_id: 'A',
    specialty: 'comunicaciones',
    stress_triggers: 'espacios_reducidos|desorden_visual',
    anger_triggers: 'murmullos',
    calmers: 'musica_beethoven|voz_pareja|pausa_guiada',
    min_sleep_h: 6,
  },
  {
    astronaut_id: 'B',
    specialty: 'software',
    stress_triggers: 'desorden_visual|charlas_largas',
    anger_triggers: 'falta_sueno',
    calmers: 'ejercicio|pausa_guiada',
    min_sleep_h: 8,
  },
  {
    astronaut_id: 'C',
    specialty: 'ingenieria_sistemas',
    stress_triggers: 'espacios_reducidos|alerta_visual',
    anger_triggers: 'charlas_largas',
    calmers: 'musica_suave|pausa_guiada',
    min_sleep_h: 7,
  },
];
const normal = (summary: string): VisualResult => ({ summary, observations: [] });
/** Explicit visual simulation. It contains no measurements or emotional predictions. */
const demo: Record<AstronautId, { minute: number; result: VisualResult }[]> = {
  A: [
    { minute: 0, result: normal('Zona de trabajo visible, con espacio libre para realizar la tarea.') },
    { minute: 25, result: { summary: 'El campo de visión muestra una zona de circulación reducida.', observations: [
      { trigger: 'espacios_reducidos', confidence: .93, evidence: 'Paredes y equipos cercanos limitan el espacio visible.' },
    ] } },
    { minute: 33, result: { summary: 'Continúa el espacio reducido y hay varios objetos en el área de trabajo.', observations: [
      { trigger: 'espacios_reducidos', confidence: .94, evidence: 'Se mantiene un pasillo estrecho entre equipos.' },
      { trigger: 'desorden_visual', confidence: .88, evidence: 'Objetos y herramientas ocupan gran parte de la superficie visible.' },
    ] } },
    { minute: 43, result: normal('La nueva observación muestra una superficie despejada y espacio de circulación.') },
  ],
  B: [{ minute: 0, result: normal('Zona de trabajo organizada, sin detonadores visuales identificados en este escenario.') }],
  C: [
    { minute: 0, result: normal('La cámara muestra un panel de trabajo sin avisos destacados.') },
    { minute: 12, result: { summary: 'Hay un aviso de alarma claramente visible en el panel del escenario.', observations: [
      { trigger: 'alerta_visual', confidence: .95, evidence: 'El panel muestra un indicador de alarma destacado.' },
    ] } },
    { minute: 25, result: normal('El aviso visual ya no aparece en la nueva observación del panel.') },
  ],
};
export function cameraDemo(id: AstronautId, minute: number, createdAt: number): VisualAnalysis[] {
  return demo[id].filter(p => p.minute <= minute).map(p => ({ ...p.result,
    id: `visual-demo-${id}-${p.minute}`, astronautId: id,
    timestamp: new Date(createdAt + p.minute * 60000).toISOString(), source: 'simulador' }));
}
export function visualEpisodes(sessionId: string, id: AstronautId, analyses: VisualAnalysis[], profile: Profile): Alert[] {
  const alerts: Alert[] = [];
  const current = new Map<string, Alert>();
  for (const analysis of analyses) {
    const observations: Observation[] = analysis.observations.filter(o => o.confidence >= .8 && profile.stress_triggers.split('|').includes(o.trigger))
      .map(o => ({ ...o, id: `${analysis.id}:${o.trigger}`, astronautId: id, source: analysis.source,
        timestamp: analysis.timestamp, expiresAt: new Date(Date.parse(analysis.timestamp) + 60000).toISOString() }));
    for (const [trigger, active] of current) {
      if (!observations.some(o => o.trigger === trigger)) {
        active.active = false; active.resolvedAt = analysis.timestamp; current.delete(trigger);
      }
    }
    for (const o of observations) {
      const active = current.get(o.trigger);
      if (active) { active.triggers = [o]; continue; }
      const alert: Alert = { id: `${sessionId}:${id}:visual:${analysis.id}:${o.trigger}`, astronautId: id,
        kind: 'contexto', level: 'bajo', peakLevel: 'bajo', startedAt: analysis.timestamp,
        resolvedAt: null, active: true, state: null, triggers: [o],
        intervention: { type: 'actividad', item: 'pausa_guiada' }, response: null, source: analysis.source };
      alerts.push(alert); current.set(o.trigger, alert);
    }
  }
  return alerts;
}
