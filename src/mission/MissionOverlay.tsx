import { useEffect, useState } from 'react';
import { sendAction } from './client.ts';
import { connectionFromFragment, interventionText, stateLabels, triggerLabels } from './protocol.ts';
import type { Connection, MentalState, ResponseAction } from './protocol.ts';
import { useMission } from './useMission.ts';
import './mission-overlay.css';

function initialConnection(): Connection | null {
  if (typeof window === 'undefined') return null;
  try { return connectionFromFragment(window.location.hash) || JSON.parse(sessionStorage.getItem('neuroorbit-ojos') || 'null'); }
  catch { return null; }
}
export default function MissionOverlay({ cameraStatus, capture }: { cameraStatus: string; capture: () => Promise<string> }) {
  const [connection, setConnection] = useState<Connection | null>(initialConnection);
  const [link, setLink] = useState(''); const [localError, setLocalError] = useState('');
  const [expanded, setExpanded] = useState(true); const [automatic, setAutomatic] = useState(false);
  const { data, error, pending, action } = useMission(connection);
  const crew = data?.crew.find(c => c.id === connection?.astronautId);
  const latest = crew?.visualAnalyses.at(-1); const alerts = crew?.alerts.filter(a => a.active) || [];
  const alert = alerts[0]; const suggestion = alert?.intervention ? interventionText[alert.intervention.item] : null;
  const simulated = data?.mode === 'camera-demo'; const cameraSession = data?.mode === 'camera';
  useEffect(() => {
    if (!connection?.astronautId) return;
    const beat = () => {
      void sendAction(connection, '/heartbeat', { astronautId: connection.astronautId,
        cameraStatus: document.visibilityState === 'hidden' ? 'paused' : cameraStatus }).catch(() => {});
    };
    beat(); const timer = setInterval(beat, 30000); document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', beat); };
  }, [connection, cameraStatus]);
  useEffect(() => {
    if (!automatic || cameraStatus !== 'live' || !data?.capabilities.vision || !cameraSession || !connection?.astronautId) return;
    let cancelled = false; let running = false;
    const sample = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const image = await capture();
        if (!cancelled) { await sendAction(connection, '/vision', { astronautId: connection.astronautId, image }); setLocalError(''); }
      } catch (e) { if (!cancelled) setLocalError(e instanceof Error ? e.message : 'No se pudo observar el entorno.'); }
      finally { running = false; }
    };
    void sample(); const timer = setInterval(() => void sample(), 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [automatic, cameraStatus, data?.capabilities.vision, cameraSession, connection, capture]);
  function connect() {
    try {
      const c = connectionFromFragment(new URL(link).hash);
      if (!c?.astronautId) throw new Error('Abre el enlace de un astronauta generado en CentroControl.');
      try { sessionStorage.setItem('neuroorbit-ojos', JSON.stringify(c)); } catch { /* Optional storage */ }
      setConnection(c); setAutomatic(false); setLocalError('');
    } catch (e) { setLocalError(e instanceof Error ? e.message : 'El enlace no es válido.'); }
  }
  function respond(response: ResponseAction) {
    if (alert && crew) void action('/response', { astronautId: crew.id, alertId: alert.id, action: response });
  }
  async function analyze() {
    setLocalError('');
    try { const image = await capture(); await action('/vision', { astronautId: connection?.astronautId, image }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : 'No se pudo capturar el entorno.'); }
  }
  function report(state: MentalState) { if (crew) void action('/self-report', { astronautId: crew.id, state }); }
  return <aside className={`mission-hud ${alert ? 'mission-hud--alert' : ''}`} aria-label="Asistencia al astronauta">
    <div className="mission-hud__bar"><div><span className={`mission-hud__dot ${data && !error ? 'mission-hud__dot--live' : ''}`} /><strong>{connection?.astronautId ? `Astronauta ${connection.astronautId}` : 'Ojos · Asistencia'}</strong>
      <span>{data ? simulated ? `Demo visual · ${data.clock.minute}` : 'Solo cámara' : 'Sin sesión'}</span></div><button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Ocultar' : alert ? 'Ver aviso' : 'Asistencia'}</button></div>
    {expanded && <div className="mission-hud__body">
      {!connection && <form onSubmit={e => { e.preventDefault(); connect(); }}><h2>Conecta con CentroControl</h2><p>Pega el enlace del astronauta para compartir las observaciones de tu cámara y recibir sugerencias.</p>
        <label>Enlace del astronauta<input type="url" required value={link} onChange={e => setLink(e.target.value)} placeholder="https://tu-centro.netlify.app/ojos#…" /></label><button>Conectar sesión</button></form>}
      {connection && !data && !error && <p role="status">Conectando con tu sesión…</p>}
      {(error || localError) && <p className="mission-hud__error" role="alert">{localError || error}{data && error ? ' Se conserva la última observación.' : ''}</p>}
      {crew && <>
        <p className="mission-hud__origin">{simulated ? 'Escenas simuladas. La imagen de tu cámara no se analiza en esta demo.' : 'Cámara de ojos5 · Observación del entorno'}</p>
        <section className="mission-hud__scene" aria-live="polite"><h2>Lo que observa la IA</h2><p>{latest?.summary || 'Esperando el primer análisis del entorno.'}</p>
          {latest && <small>{new Date(latest.timestamp).toLocaleTimeString('es-MX')} · {latest.source === 'simulador' ? 'Simulación' : 'Observación visual'}</small>}</section>
        {crew.quality === 'desactualizada' && <p className="mission-hud__error">Sin imágenes analizadas recientemente. La observación mostrada es anterior.</p>}
        {cameraSession && (data?.capabilities.vision ? <section><h2>Observar mi entorno</h2><p>Al iniciar se envía un fotograma cada 20 segundos mientras la cámara está activa.</p>
          <div className="mission-hud__actions"><button disabled={cameraStatus !== 'live'} onClick={() => setAutomatic(v => !v)}>{automatic ? 'Detener observación' : 'Iniciar observación'}</button>
            {!automatic && <button disabled={pending || cameraStatus !== 'live'} onClick={() => void analyze()}>Analizar ahora</button>}</div></section>
          : <p className="mission-hud__error">La cámara está disponible. El análisis con IA está pendiente de activación en CentroControl.</p>)}
        {alert ? <section className="mission-hud__suggestion" aria-live="polite"><h2>Posible detonador</h2>{alert.triggers.map(t => <p key={t.id}><strong>{triggerLabels[t.trigger]}</strong><br />{t.evidence}</p>)}
          {suggestion && <><strong>{suggestion.title}</strong><p>{suggestion.description}</p></>}
          {suggestion && typeof window !== 'undefined' && 'speechSynthesis' in window && <button onClick={() => { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(suggestion.description); utterance.lang = 'es-MX'; speechSynthesis.speak(utterance); }}>Escuchar sugerencia</button>}
          <div className="mission-hud__actions"><button disabled={pending} onClick={() => respond('aceptada')}>Aceptar sugerencia</button><button disabled={pending} onClick={() => respond('descartada')}>Ahora no</button></div>
          {alert.response && <p className="mission-hud__response">Respuesta: {alert.response.action.replace('_', ' ')}</p>}
          {alert.response?.action === 'aceptada' && <div className="mission-hud__actions"><button disabled={pending} onClick={() => respond('util')}>Me ayudó</button><button disabled={pending} onClick={() => respond('sin_efecto')}>Sin cambio</button></div>}
        </section> : latest && <p className="mission-hud__quiet">Sin posibles detonadores en la última observación.</p>}
        <details><summary>Comunicar cómo me siento · Opcional</summary><p>Esta respuesta la comunicas tú y se comparte con CentroControl.</p>
          {crew.selfReport && <p>Última respuesta: {stateLabels[crew.selfReport.state]}</p>}
          <div className="mission-hud__actions"><button disabled={pending} onClick={() => report('calma')}>Me siento bien</button><button disabled={pending} onClick={() => report('estres')}>Siento estrés</button><button disabled={pending} onClick={() => report('ira')}>Siento enojo</button></div></details>
      </>}
      {connection && <button className="mission-hud__disconnect" onClick={() => { setConnection(null); setAutomatic(false); try { sessionStorage.removeItem('neuroorbit-ojos'); } catch { /* No storage */ } window.history.replaceState(null, '', window.location.pathname); }}>Desconectar sesión</button>}
    </div>}
  </aside>;
}
