import { interventionText, sourceLabels, stateLabels, triggerLabels } from '../mission/protocol.ts';
import type { Alert, CrewStatus, ResponseAction } from '../mission/protocol.ts';

function AlertContent({ alert, pending, onRespond }: { alert: Alert; pending: boolean; onRespond?: (id: string, action: ResponseAction) => void }) {
  const suggestion = alert.intervention ? interventionText[alert.intervention.item] : null;
  return <div className="alert-detail alert-detail--context"><div className="alert-title"><strong>Posible detonador</strong><span>{alert.active ? 'A revisar' : 'Ya no aparece'}</span></div>
    {alert.triggers.map(t => <div key={t.id}><p><strong>{triggerLabels[t.trigger]}</strong></p><p className="visual-evidence">{t.evidence}</p><small>{sourceLabels[t.source]}</small></div>)}
    {suggestion && <div className="suggestion"><strong>{suggestion.title}</strong><p>{suggestion.description}</p></div>}
    {alert.response && <p className="response-label">Respuesta: {alert.response.action.replace('_', ' ')}</p>}
    {onRespond && alert.active && <button className="button button--small" disabled={pending} onClick={() => onRespond(alert.id, 'reconocida')}>Reconocer aviso</button>}
  </div>;
}
export default function Card({ crew, pending, onRespond, joinLink, connected, serverTime }: {
  crew: CrewStatus; pending: boolean; onRespond?: (id: string, action: ResponseAction) => void;
  joinLink?: string; connected: boolean; serverTime: string;
}) {
  const latest = crew.visualAnalyses.at(-1); const active = crew.alerts.filter(a => a.active);
  const deviceOnline = connected && crew.deviceLastSeen && Date.parse(serverTime) - Date.parse(crew.deviceLastSeen) < 75000;
  return <article className={`astronaut-card ${active.length ? 'astronaut-card--attention' : ''}`} data-astronaut={crew.id}>
    <div className="astronaut-card__heading"><div className="astronaut-card__avatar" aria-hidden="true">{crew.id}</div>
      <div><p className="astronaut-card__number">{crew.profile.specialty.replaceAll('_', ' ')}</p><h2>Astronauta {crew.id}</h2></div>
      <span className="status-pill">{!connected ? 'Conexión interrumpida' : latest?.source === 'simulador' ? 'Escena simulada' : latest ? 'Observación visual' : 'Esperando cámara'}</span></div>
    <div className="device-status"><span className={`connection-dot ${deviceOnline ? 'connection-dot--live' : ''}`} />Ojos: {deviceOnline ? crew.cameraStatus === 'live' ? 'cámara activa' : 'dispositivo conectado' : 'sin dispositivo conectado'}</div>
    <section className="visual-scene"><span className="section-kicker">ÚLTIMA OBSERVACIÓN</span><p>{latest?.summary || 'Conecta ojos5 e inicia el análisis del entorno para recibir observaciones.'}</p>
      {latest && <small>{new Date(latest.timestamp).toLocaleTimeString('es-MX')} · {sourceLabels[latest.source]}</small>}</section>
    <div className="reported-state"><span>Estado comunicado por el astronauta</span><strong>{crew.selfReport ? stateLabels[crew.selfReport.state] : 'Sin confirmar'}</strong>
      {crew.selfReport && <small>{new Date(crew.selfReport.timestamp).toLocaleTimeString('es-MX')}</small>}</div>
    {crew.quality === 'desactualizada' && <p className="inline-error">No hay observaciones recientes. Se conserva el último entorno analizado.</p>}
    {active.length ? <div className="crew-alerts">{active.map(a => <AlertContent key={a.id} alert={a} pending={pending} onRespond={onRespond} />)}</div>
      : latest && <p className="camera-quiet">Sin posibles detonadores en la última observación.</p>}
    {crew.visualAnalyses.length > 0 && <details className="context-details"><summary>Observaciones anteriores ({crew.visualAnalyses.length})</summary>{crew.visualAnalyses.slice(-8).toReversed().map(a => <p key={a.id}><strong>{new Date(a.timestamp).toLocaleTimeString('es-MX')}</strong> · {a.summary}</p>)}</details>}
    {joinLink && <details className="join-details"><summary>Conectar ojos5 · Astronauta {crew.id}</summary><p>Abre el enlace en el teléfono o computadora del astronauta.</p>
      <input aria-label={`Enlace del astronauta ${crew.id}`} readOnly value={joinLink} onFocus={e => e.currentTarget.select()} /><a className="button button--small" href={joinLink} target="_blank" rel="noreferrer">Abrir ojos5</a></details>}
  </article>;
}
