import { useState } from 'react';
import './App.css';
import Card from './components/Card.tsx';
import Header from './components/Header.tsx';
import Footer from './components/Footer.tsx';
import AstronautScreen from './components/AstronautScreen.tsx';
import { createSession } from './mission/client.ts';
import { connectionFromFragment, normalizeApiUrl, sessionLink, sourceLabels, triggerLabels } from './mission/protocol.ts';
import type { AstronautId, Connection, SessionCreated } from './mission/protocol.ts';
import { useMission } from './mission/useMission.ts';

type SavedSession = { connection: Connection; keys?: SessionCreated };
function recover(): SavedSession | null {
  try {
    const linked = connectionFromFragment(window.location.hash);
    if (linked && !linked.astronautId) return { connection: linked };
    return JSON.parse(sessionStorage.getItem('neuroorbit-control') || 'null');
  } catch { return null; }
}
function remember(value: SavedSession | null) {
  try { if (value) sessionStorage.setItem('neuroorbit-control', JSON.stringify(value)); else sessionStorage.removeItem('neuroorbit-control'); } catch { /* Storage is optional. */ }
}
export default function App() {
  return window.location.pathname.replace(/\/$/, '') === '/ojos' ? <AstronautScreen /> : <Dashboard />;
}
function Dashboard() {
  const [saved, setSaved] = useState<SavedSession | null>(recover);
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || window.location.origin);
  const [join, setJoin] = useState(''); const [formError, setFormError] = useState(''); const [creating, setCreating] = useState(false);
  const { data, error, action, pending, lastContact } = useMission(saved?.connection || null);
  const connect = (value: SavedSession) => { remember(value); setSaved(value); setFormError(''); };
  const leave = () => { remember(null); setSaved(null); window.history.replaceState(null, '', window.location.pathname); };
  async function start(mode: 'camera' | 'camera-demo') {
    setCreating(true); setFormError('');
    try {
      const base = normalizeApiUrl(apiUrl); const keys = await createSession(base, mode);
      connect({ connection: { apiUrl: base, sessionId: keys.sessionId, key: keys.controlKey }, keys });
    } catch (e) { setFormError(e instanceof Error ? e.message : 'No se pudo crear la sesión.'); }
    finally { setCreating(false); }
  }
  const isCameraSession = data?.mode === 'camera' || data?.mode === 'camera-demo';
  const simulated = data?.mode === 'camera-demo';
  const alerts = data?.crew.flatMap(c => c.alerts).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)) || [];
  const active = alerts.filter(a => a.active); const control = data?.role === 'control';
  function crewLink(id: AstronautId) {
    return saved?.keys ? sessionLink(`${window.location.origin}/ojos`, { ...saved.connection, key: saved.keys.crewKeys[id], astronautId: id }) : undefined;
  }
  return <div className="app-shell"><Header /><main className="main-content">
    <div className="page-heading"><div><p className="eyebrow"><span /> MISIÓN · ASISTENCIA CON CÁMARA</p><h1>Centro de control</h1>
      <p className="page-description">Lo que ve el astronauta, las situaciones a revisar y la acción sugerida.</p></div>
      <div className="live-indicator"><span className={`connection-dot ${data && !error ? 'connection-dot--live' : ''}`} />{data && !error ? 'Sesión sincronizada' : saved ? 'Conectando…' : 'Sin sesión'}</div></div>
    {!saved && <section className="session-start" aria-labelledby="start-title"><div><span className="section-kicker">MVP · SOLO CÁMARA</span><h2 id="start-title">Conecta los ojos del astronauta</h2>
      <p>Utiliza la cámara de un teléfono o computadora. La IA describe el entorno visible y señala posibles detonadores para ofrecer una sugerencia.</p>
      <label>Dirección de CentroControl<input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} /></label>
      <div className="toolbar-actions"><button className="button button--primary" disabled={creating} onClick={() => void start('camera')}>{creating ? 'Creando sesión…' : 'Iniciar sesión con cámara'}</button>
        <button className="button" disabled={creating} onClick={() => void start('camera-demo')}>Probar demo visual</button></div>
      <p className="camera-explanation">En la demo, las escenas están simuladas y etiquetadas. En una sesión real se analizan los fotogramas enviados desde ojos5.</p>
    </div><div className="session-join"><span className="section-kicker">CONTINUAR UNA SESIÓN</span><h2>Abre un enlace compartido</h2><p>Comparte la misma sesión con el equipo de apoyo. Las observaciones y respuestas se conservan al recargar.</p>
      <form onSubmit={e => { e.preventDefault(); try {
        const parsed = connectionFromFragment(new URL(join).hash);
        if (!parsed || parsed.astronautId) throw new Error('Utiliza un enlace de CentroControl.'); connect({ connection: parsed });
      } catch (e) { setFormError(e instanceof Error ? e.message : 'El enlace no es válido.'); } }}>
        <label>Enlace de CentroControl<input type="url" value={join} required onChange={e => setJoin(e.target.value)} placeholder="https://tu-centro.netlify.app/#…" /></label><button className="button">Conectar</button>
      </form><p className="prototype-note">La observación visual describe el entorno. El astronauta puede comunicar cómo se siente; esa respuesta se identifica por separado.</p></div></section>}
    {(error || formError) && <div className="connection-warning" role="alert"><strong>{error ? 'Comunicación interrumpida' : 'No se pudo completar la operación'}</strong><p>{formError || error}</p>{data && <p>Se conserva la última información recibida y se reintenta la conexión.</p>}</div>}
    {saved && <section className="mission-toolbar" aria-label="Controles de sesión"><div><strong>{simulated ? 'Demo visual compartida' : 'Sesión con cámara'}</strong><span>{data ? `Minuto ${data.clock.minute}${simulated ? ' / 59 · Escenas simuladas' : ' · Observación del entorno'}` : 'Esperando respuesta del servicio'}</span></div>
      <div className="toolbar-actions">{control && simulated && <><button className="button button--small" disabled={pending || data.clock.finished} onClick={() => void action('/control', { playing: !data.clock.playing })}>{data.clock.playing ? 'Pausar' : 'Continuar'}</button>
        <button className="button button--small" disabled={pending} onClick={() => void action('/control', { minute: 30, playing: false })}>Ver detonador de A</button></>}
        <button className="button button--small" onClick={leave}>Salir de la sesión</button></div></section>}
    {data && !isCameraSession && <div className="connection-warning">Esta sesión pertenece a otra versión. Inicia una sesión de cámara para usar el MVP.</div>}
    {data && isCameraSession && <>
      {!simulated && !data.capabilities.vision && <div className="connection-warning" role="status"><strong>Análisis visual pendiente de activar</strong><p>Ya puedes conectar las cámaras. El servicio de visión debe configurarse en CentroControl para analizar imágenes reales.</p></div>}
      <section className="mission-summary" aria-label="Resumen de misión"><div><span>TRIPULANTES</span><strong>{data.crew.length.toString().padStart(2, '0')}</strong></div>
        <div><span>DETONADORES ACTIVOS</span><strong className={active.length ? 'attention-text' : ''}>{active.length.toString().padStart(2, '0')}</strong></div>
        <div><span>ÚLTIMA SINCRONIZACIÓN</span><strong className="summary-time">{lastContact ? new Date(lastContact).toLocaleTimeString('es-MX') : '—'}</strong></div>
        <div><span>ORIGEN</span><strong className="summary-time">{simulated ? 'Demo visual' : 'Cámara de ojos5'}</strong></div></section>
      <section className="datos-container" aria-label="Observaciones de los astronautas">{data.crew.map(crew => <Card key={crew.id} crew={crew} pending={pending} connected={!error} serverTime={data.serverTime}
        joinLink={crewLink(crew.id)} onRespond={control ? (alertId, response) => void action('/response', { astronautId: crew.id, alertId, action: response }) : undefined} />)}</section>
      <section className="event-history"><div className="section-heading"><div><span className="section-kicker">SEGUIMIENTO</span><h2>Historial de situaciones y acciones</h2></div><span>{alerts.length} registros</span></div>
        {alerts.length ? <div className="table-scroll"><table><thead><tr><th>Tripulante</th><th>Situación observada</th><th>Seguimiento</th><th>Origen</th><th>Respuesta</th></tr></thead><tbody>{alerts.slice(0, 30).map(a => <tr key={a.id}><td>Astronauta {a.astronautId}</td><td>{a.triggers.map(t => triggerLabels[t.trigger]).join(', ')}</td><td>{a.active ? 'A revisar' : 'Ya no aparece'}</td><td>{sourceLabels[a.source]}</td><td>{a.response?.action.replace('_', ' ') || 'Pendiente'}</td></tr>)}</tbody></table></div>
          : <p className="empty-history">Los posibles detonadores y las respuestas del astronauta aparecerán aquí.</p>}</section>
      {saved?.keys && <details className="share-session"><summary>Compartir CentroControl en modo consulta</summary><input readOnly aria-label="Enlace de consulta" value={sessionLink(window.location.origin, { ...saved.connection, key: saved.keys.viewerKey })} onFocus={e => e.currentTarget.select()} /></details>}
      <p className="data-note">{simulated ? 'Escenas simuladas para demostrar el flujo.' : 'Observaciones de cámara y respuestas voluntarias del astronauta.'} Los posibles detonadores y el estado comunicado se muestran por separado.</p>
    </>}
    {saved && !data && !error && <div className="loading-state" role="status">Conectando con la sesión…</div>}
  </main><Footer /></div>;
}
