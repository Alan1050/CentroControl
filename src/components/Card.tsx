import { interventionText, sourceLabels, stateLabels, triggerLabels } from '../mission/protocol.ts';
import type { Alert, CrewStatus, ResponseAction, Trigger } from '../mission/protocol.ts';
import { EmotionRadarChart, RadiationLineChart } from './TelemetryCharts.tsx';

function AlertContent({ alert, pending, onRespond }: { alert: Alert; pending: boolean; onRespond?: (id: string, action: ResponseAction) => void }) {
  const suggestion = alert.intervention ? interventionText[alert.intervention.item] : null;
  return <div className="alert-detail alert-detail--context"><div className="alert-title"><strong>Posible detonador</strong><span>{alert.active ? 'A revisar' : 'Ya no aparece'}</span></div>
    {alert.triggers.map(t => <div key={t.id}><p><strong>{triggerLabels[t.trigger]}</strong></p><p className="visual-evidence">{t.evidence}</p><small>{sourceLabels[t.source]}</small></div>)}
    {suggestion && <div className="suggestion"><strong>{suggestion.title}</strong><p>{suggestion.description}</p></div>}
    {alert.response && <p className="response-label">Respuesta: {alert.response.action.replace('_', ' ')}</p>}
    {onRespond && alert.active && <button className="button button--small" disabled={pending} onClick={() => onRespond(alert.id, 'reconocida')}>Reconocer aviso</button>}
  </div>;
}
export default function Card({ crew, pending, onRespond, connected, serverTime }: {
  crew: CrewStatus; pending: boolean; onRespond?: (id: string, action: ResponseAction) => void;
  connected: boolean; serverTime: string;
}) {
  const latest = crew.visualAnalyses.at(-1); const active = crew.alerts.filter(a => a.active);
  const deviceOnline = connected && crew.deviceLastSeen && Date.parse(serverTime) - Date.parse(crew.deviceLastSeen) < 75000;
  return <article className={`astronaut-card ${active.length ? 'astronaut-card--attention' : ''}`} data-astronaut={crew.id}>
    <div className="astronaut-card__heading"><div className="astronaut-card__avatar" aria-hidden="true">{crew.id}</div>
      <div><p className="astronaut-card__number">{crew.profile.specialty.replaceAll('_', ' ')}</p><h2>Astronauta {crew.id}</h2></div>
    </div>
    
    <div className="astronaut-profile-brief">
      <span className="profile-pill">Especialidad: {crew.profile.specialty.replaceAll('_', ' ')}</span>
      <span className="profile-pill">Sensible a: {crew.profile.stress_triggers.split('|').map(t => triggerLabels[t as Trigger] || t).join(', ')}</span>
      <span className="profile-pill">Calma: {crew.profile.calmers.split('|').map(c => c.replace('_', ' ')).join(', ')}</span>
    </div>

    <div className="device-status">
      <span className={`connection-dot ${deviceOnline ? 'connection-dot--live' : ''}`} />
      Ojos móvil: {deviceOnline ? (
        latest?.processedOn === 'edge_device'
          ? `activo · 🛰️ Edge AI (${latest.latencyMs ? `${latest.latencyMs}ms` : 'en móvil'})`
          : crew.cameraStatus === 'live' ? 'teléfono conectado y activo' : 'teléfono conectado'
      ) : 'esperando escaneo con smartphone'}
    </div>
    
    <section className="visual-scene">
      <div className="scene-header">
        <span className="section-kicker">ÚLTIMA OBSERVACIÓN</span>
        {latest?.processedOn === 'edge_device' && (
          <span className="edge-badge">
            {latest?.engine === 'dual_contingency' ? '🛰️ Motor Dual On-Device' : '✨ Gemini 3.8 Flash (Edge)'}
          </span>
        )}
      </div>
      <p>{latest?.summary || ''}</p>
      {latest?.impact && <div className="impact-box"><strong>Evaluación contextual según perfil (IA):</strong><p>{latest.impact}</p></div>}
      {latest?.suggestion && <div className="suggestion-box"><strong>Procedimiento sugerido:</strong><p>{latest.suggestion}</p></div>}
      {latest && (
        <small>
          {new Date(latest.timestamp).toLocaleTimeString('es-MX')} · {latest.processedOn === 'edge_device' ? `🛰️ Telemetría recibida de móvil (${latest.latencyMs ? `${latest.latencyMs}ms` : 'Edge AI'}) · Sin transferir video a la Tierra` : sourceLabels[latest.source]}
        </small>
      )}
    </section>
    
    <div className="reported-state"><span>Estado comunicado por el astronauta</span><strong>{crew.selfReport ? stateLabels[crew.selfReport.state] : 'Sin confirmar'}</strong>
      {crew.selfReport && <small>{new Date(crew.selfReport.timestamp).toLocaleTimeString('es-MX')}</small>}</div>
    {crew.quality === 'desactualizada' && <p className="inline-error">No hay observaciones recientes. Se conserva el último entorno analizado.</p>}
    {active.length ? <div className="crew-alerts">{active.map(a => <AlertContent key={a.id} alert={a} pending={pending} onRespond={onRespond} />)}</div>
      : latest && <p className="camera-quiet">Sin posibles detonadores en la última observación.</p>}
    {crew.visualAnalyses.length > 0 && <details className="context-details"><summary>Observaciones anteriores ({crew.visualAnalyses.length})</summary>{crew.visualAnalyses.slice(-8).toReversed().map(a => <p key={a.id}><strong>{new Date(a.timestamp).toLocaleTimeString('es-MX')}</strong> · {a.summary}</p>)}</details>}
    
    <section className="telemetry-section" aria-label="Telemetría fisiológica y ambiental">
      <div className="telemetry-charts-grid">
        <div className="telemetry-chart-card">
          <div className="chart-header">
            <span className="chart-title">RADAR EMOCIONAL Y COGNITIVO</span>
            <span className="demo-pill">DEMO</span>
          </div>
          <EmotionRadarChart astronautId={crew.id} selfReport={crew.selfReport?.state} />
        </div>

        <div className="telemetry-chart-card">
          <div className="chart-header">
            <span className="chart-title">DOSIMETRÍA DE RADIACIÓN</span>
            <span className="demo-pill">DEMO</span>
          </div>
          <RadiationLineChart astronautId={crew.id} />
        </div>
      </div>
    </section>
  </article>;
}
