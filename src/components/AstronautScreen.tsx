import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BrowserCamera } from '../camera/browser-camera.ts';
import MissionOverlay from '../mission/MissionOverlay.tsx';

export default function AstronautScreen() {
  const [bypassDesktop, setBypassDesktop] = useState(false);
  const isDesktop = typeof window !== 'undefined' && window.innerWidth > 850 && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [camera] = useState(() => new BrowserCamera());
  const state = useSyncExternalStore(camera.subscribe, camera.snapshot);
  const video = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState(false);
  useEffect(() => {
    if (isDesktop && !bypassDesktop) return;
    void camera.activate();
    const visibility = () => { if (document.hidden) camera.deactivate(); else void camera.activate(camera.state.selectedCamera || undefined); };
    document.addEventListener('visibilitychange', visibility);
    return () => { camera.deactivate(); document.removeEventListener('visibilitychange', visibility); };
  }, [camera, isDesktop, bypassDesktop]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = state.stream;
    if (state.stream) void element.play().catch(() => setPlayback(true));
    return () => { element.srcObject = null; };
  }, [state.stream]);
  const capture = useCallback(async () => {
    const element = video.current;
    if (!element || element.readyState < 2 || !element.videoWidth) throw new Error('La cámara todavía no está lista.');
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(640, element.videoWidth); canvas.height = Math.round(element.videoHeight * canvas.width / element.videoWidth);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo capturar el fotograma.');
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .6);
  }, []);
  if (isDesktop && !bypassDesktop) {
    return <main className="astronaut-screen"><div className="astronaut-camera-message" role="alert">
      <h1>📱 Dispositivo móvil obligatorio</h1>
      <p>La observación de Ojos está configurada exclusivamente para el teléfono móvil del astronauta.</p>
      <p>Por favor escanea el código QR desde el Centro de Control con tu smartphone para conectar el entorno.</p>
      <button className="button button--small" style={{ marginTop: '1.25rem' }} onClick={() => setBypassDesktop(true)}>
        Continuar en computadora (modo desarrollo)
      </button>
    </div></main>;
  }
  return <main className="astronaut-screen"><video ref={video} autoPlay playsInline muted onPlaying={() => setPlayback(false)} aria-label="Entorno del astronauta" />
    {(state.status !== 'live' || playback) && <div className="astronaut-camera-message"><h1>{state.status === 'error' ? 'Cámara no disponible' : playback ? 'Mostrar la cámara' : 'Abriendo la cámara…'}</h1><p>{state.message}</p><button className="button" onClick={() => { if (playback) void video.current?.play(); else void camera.activate(); }}>Volver a intentar</button></div>}
    {state.cameras.length > 1 && <select className="astronaut-camera-picker" aria-label="Elegir cámara" value={state.selectedCamera} onChange={e => void camera.activate(e.target.value)}>{state.cameras.map((c, i) => <option key={c.deviceId || i} value={c.deviceId}>{c.label || `Cámara ${i + 1}`}</option>)}</select>}
    <MissionOverlay cameraStatus={state.status} capture={capture} />
  </main>;
}
