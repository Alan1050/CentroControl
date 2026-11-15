import { useEffect, useState } from 'react';
import { fetchActiveSession, sendAction } from './client.ts';
import { connectionFromFragment, interventionText, stateLabels, triggerLabels } from './protocol.ts';
import type { AstronautId, Connection, MentalState, ResponseAction, SessionCreated } from './protocol.ts';
import { useMission } from './useMission.ts';
import './mission-overlay.css';

function initialConnection(): Connection | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromHash = connectionFromFragment(window.location.hash);
    if (fromHash?.astronautId) return fromHash;
    return JSON.parse(sessionStorage.getItem('neuroorbit-ojos') || 'null');
  } catch { return null; }
}

export default function MissionOverlay({ cameraStatus, capture }: { cameraStatus: string; capture: () => Promise<string> }) {
  const [connection, setConnection] = useState<Connection | null>(initialConnection);
  const [activeSession, setActiveSession] = useState<SessionCreated | null>(null);
  const [localError, setLocalError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [automatic, setAutomatic] = useState(false);
  const { data, error, pending, action } = useMission(connection);
  const crew = data?.crew.find(c => c.id === connection?.astronautId);
  const latest = crew?.visualAnalyses.at(-1);
  const alerts = crew?.alerts.filter(a => a.active) || [];
  const alert = alerts[0];
  const suggestion = alert?.intervention ? interventionText[alert.intervention.item] : null;
  const simulated = data?.mode === 'camera-demo';
  const cameraSession = data?.mode === 'camera';

  // Obtener sesión activa fija desde la API
  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const origin = window.location.origin;
        const session = await fetchActiveSession(origin);
        if (!mounted) return;
        setActiveSession(session);

        const hashMatch = window.location.hash.match(/astronautId=([ABC])/i);
        const storedAid = sessionStorage.getItem('neuroorbit-astronautId') as AstronautId | null;
        const targetAid = (hashMatch?.[1]?.toUpperCase() as AstronautId) || storedAid;

        if (targetAid && session.crewKeys[targetAid] && (!connection || connection.astronautId !== targetAid)) {
          const conn: Connection = {
            apiUrl: origin,
            sessionId: session.sessionId,
            key: session.crewKeys[targetAid],
            astronautId: targetAid,
          };
          setConnection(conn);
          sessionStorage.setItem('neuroorbit-ojos', JSON.stringify(conn));
          sessionStorage.setItem('neuroorbit-astronautId', targetAid);
        }
      } catch (e) {
        if (mounted) console.error('Error al sincronizar sesión activa:', e);
      }
    };
    void loadSession();
    return () => { mounted = false; };
  }, [connection]);

  const chooseAstronaut = (aid: AstronautId, sess?: SessionCreated | null) => {
    const s = sess || activeSession;
    if (!s) return;
    const conn: Connection = {
      apiUrl: window.location.origin,
      sessionId: s.sessionId,
      key: s.crewKeys[aid],
      astronautId: aid,
    };
    setConnection(conn);
    sessionStorage.setItem('neuroorbit-ojos', JSON.stringify(conn));
    sessionStorage.setItem('neuroorbit-astronautId', aid);
    window.location.hash = `astronautId=${aid}`;
    setAutomatic(false);
    setLocalError('');
  };

  useEffect(() => {
    if (!connection?.astronautId) return;
    const beat = () => {
      void sendAction(connection, '/heartbeat', {
        astronautId: connection.astronautId,
        cameraStatus: document.visibilityState === 'hidden' ? 'paused' : cameraStatus,
      }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 30000);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', beat); };
  }, [connection, cameraStatus]);

  useEffect(() => {
    if (!automatic || cameraStatus !== 'live' || !data?.capabilities.vision || !cameraSession || !connection?.astronautId) return;
    let cancelled = false;
    let running = false;
    const sample = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const image = await capture();
        if (!cancelled) {
          await sendAction(connection, '/vision', { astronautId: connection.astronautId, image });
          setLocalError('');
        }
      } catch (e) {
        if (!cancelled) setLocalError(e instanceof Error ? e.message : 'No se pudo observar el entorno.');
      } finally {
        running = false;
      }
    };
    void sample();
    const timer = setInterval(() => void sample(), 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [automatic, cameraStatus, data?.capabilities.vision, cameraSession, connection, capture]);

  function respond(response: ResponseAction) {
    if (alert && crew) void action('/response', { astronautId: crew.id, alertId: alert.id, action: response });
  }

  async function analyze() {
    setLocalError('');
    try {
      const image = await capture();
      await action('/vision', { astronautId: connection?.astronautId, image });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'No se pudo capturar el entorno.');
    }
  }

  function report(state: MentalState) {
    if (crew) void action('/self-report', { astronautId: crew.id, state });
  }

  return (
    <aside className={`mission-hud ${alert ? 'mission-hud--alert' : ''}`} aria-label="Asistencia al astronauta">
      <div className="mission-hud__bar">
        <div className="hud-bar-crew">
          <span className={`mission-hud__dot ${data && !error ? 'mission-hud__dot--live' : ''}`} />
          {connection?.astronautId ? (
            <select
              className="hud-crew-switch"
              value={connection.astronautId}
              onChange={e => chooseAstronaut(e.target.value as AstronautId)}
              aria-label="Cambiar tripulante"
            >
              <option value="A">Astronauta A (Comunicaciones)</option>
              <option value="B">Astronauta B (Software)</option>
              <option value="C">Astronauta C (Sistemas)</option>
            </select>
          ) : (
            <strong>Ojos · Conexión</strong>
          )}
          <span>{data ? (simulated ? `Demo · ${data.clock.minute}` : 'Solo cámara') : 'Conectando…'}</span>
        </div>
        <button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Ocultar' : alert ? 'Ver aviso' : 'Asistencia'}
        </button>
      </div>

      {expanded && (
        <div className="mission-hud__body">
          {!connection && (
            <div className="astronaut-selector-box">
              <h2>¿Qué tripulante eres hoy?</h2>
              <p>Toca tu perfil para conectar la cámara de este smartphone al Centro de Control:</p>
              <div className="astronaut-selector-grid">
                <button type="button" className="astronaut-select-card" onClick={() => chooseAstronaut('A')}>
                  <span className="select-avatar">A</span>
                  <div className="select-info">
                    <strong>Astronauta A</strong>
                    <small>Especialista en Comunicaciones</small>
                  </div>
                </button>
                <button type="button" className="astronaut-select-card" onClick={() => chooseAstronaut('B')}>
                  <span className="select-avatar">B</span>
                  <div className="select-info">
                    <strong>Astronauta B</strong>
                    <small>Especialista en Software</small>
                  </div>
                </button>
                <button type="button" className="astronaut-select-card" onClick={() => chooseAstronaut('C')}>
                  <span className="select-avatar">C</span>
                  <div className="select-info">
                    <strong>Astronauta C</strong>
                    <small>Ingeniería de Sistemas</small>
                  </div>
                </button>
              </div>
            </div>
          )}

          {connection && !data && !error && <p role="status">Conectando con tu sesión de misión…</p>}
          {(error || localError) && (
            <p className="mission-hud__error" role="alert">
              {localError || error}
              {data && error ? ' Se conserva la última observación.' : ''}
            </p>
          )}

          {crew && (
            <>
              <p className="mission-hud__origin">
                {simulated ? 'Escenas simuladas. La imagen de tu cámara no se analiza en esta demo.' : 'Cámara de smartphone · Observación del entorno'}
              </p>
              <section className="mission-hud__scene" aria-live="polite">
                <h2>Lo que observa la IA</h2>
                <p>{latest?.summary || 'Esperando el primer análisis del entorno.'}</p>
                {latest && (
                  <small>
                    {new Date(latest.timestamp).toLocaleTimeString('es-MX')} · {latest.source === 'simulador' ? 'Simulación' : 'Observación visual'}
                  </small>
                )}
              </section>

              {crew.quality === 'desactualizada' && (
                <p className="mission-hud__error">Sin imágenes analizadas recientemente. La observación mostrada es anterior.</p>
              )}

              {cameraSession && (
                data?.capabilities.vision ? (
                  <section>
                    <h2>Observar mi entorno</h2>
                    <p>Al iniciar se envía un fotograma cada 20 segundos mientras la cámara está activa.</p>
                    <div className="mission-hud__actions">
                      <button disabled={cameraStatus !== 'live'} onClick={() => setAutomatic(v => !v)}>
                        {automatic ? 'Detener observación' : 'Iniciar observación'}
                      </button>
                      {!automatic && (
                        <button disabled={pending || cameraStatus !== 'live'} onClick={() => void analyze()}>
                          Analizar ahora
                        </button>
                      )}
                    </div>
                  </section>
                ) : (
                  <p className="mission-hud__error">La cámara está disponible. El análisis con IA está pendiente de activación en CentroControl.</p>
                )
              )}

              {alert ? (
                <section className="mission-hud__suggestion" aria-live="polite">
                  <h2>Posible detonador</h2>
                  {alert.triggers.map(t => (
                    <p key={t.id}>
                      <strong>{triggerLabels[t.trigger]}</strong>
                      <br />
                      {t.evidence}
                    </p>
                  ))}
                  {suggestion && (
                    <>
                      <strong>{suggestion.title}</strong>
                      <p>{suggestion.description}</p>
                    </>
                  )}
                  {suggestion && typeof window !== 'undefined' && 'speechSynthesis' in window && (
                    <button
                      type="button"
                      onClick={() => {
                        speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(suggestion.description);
                        utterance.lang = 'es-MX';
                        speechSynthesis.speak(utterance);
                      }}
                    >
                      Escuchar sugerencia
                    </button>
                  )}
                  <div className="mission-hud__actions">
                    <button type="button" disabled={pending} onClick={() => respond('aceptada')}>Aceptar sugerencia</button>
                    <button type="button" disabled={pending} onClick={() => respond('descartada')}>Ahora no</button>
                  </div>
                  {alert.response && <p className="mission-hud__response">Respuesta: {alert.response.action.replace('_', ' ')}</p>}
                  {alert.response?.action === 'aceptada' && (
                    <div className="mission-hud__actions">
                      <button type="button" disabled={pending} onClick={() => respond('util')}>Me ayudó</button>
                      <button type="button" disabled={pending} onClick={() => respond('sin_efecto')}>Sin cambio</button>
                    </div>
                  )}
                </section>
              ) : (
                latest && <p className="mission-hud__quiet">Sin posibles detonadores en la última observación.</p>
              )}

              <details>
                <summary>Comunicar cómo me siento · Opcional</summary>
                <p>Esta respuesta la comunicas tú y se comparte con CentroControl.</p>
                {crew.selfReport && <p>Última respuesta: {stateLabels[crew.selfReport.state]}</p>}
                <div className="mission-hud__actions">
                  <button type="button" disabled={pending} onClick={() => report('calma')}>Me siento bien</button>
                  <button type="button" disabled={pending} onClick={() => report('estres')}>Siento estrés</button>
                  <button type="button" disabled={pending} onClick={() => report('ira')}>Siento enojo</button>
                </div>
              </details>
            </>
          )}

          {connection && (
            <button
              type="button"
              className="mission-hud__disconnect"
              onClick={() => {
                setConnection(null);
                setAutomatic(false);
                sessionStorage.removeItem('neuroorbit-ojos');
                sessionStorage.removeItem('neuroorbit-astronautId');
                window.history.replaceState(null, '', window.location.pathname);
              }}
            >
              Cambiar de astronauta
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
