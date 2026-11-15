# NeuroOrbit Lab · MVP con cámara

CentroControl y ojos5 comparten una sesión para observar el entorno del astronauta y ofrecer acciones sugeridas. El MVP utiliza únicamente la cámara integrada del teléfono o computadora.

Sitio de producción previsto: **https://centrocontrolneuro.netlify.app**. La vista web del astronauta se sirve en `/ojos`.

## Flujo del MVP

1. «Iniciar sesión con cámara» crea una sesión compartida.
2. En la tarjeta del astronauta, abre «Conectar ojos5» y utiliza su enlace en el dispositivo con cámara.
3. El astronauta inicia la observación. Se analiza un fotograma cada veinte segundos, o uno a petición.
4. La IA describe el entorno y señala evidencia visible de espacio reducido, área de trabajo saturada o aviso de alarma.
5. El astronauta recibe una sugerencia de pausa y puede aceptar, descartar o registrar si le ayudó. CentroControl recibe las mismas observaciones y respuestas.

La imagen describe contexto; el estado emocional no se deduce de la escena. Si el astronauta decide comunicar estrés, enojo o calma, su respuesta se muestra explícitamente como **estado comunicado**.

«Probar demo visual» reproduce escenas textuales simuladas para demostrar el flujo sin un proveedor configurado. La demo no analiza la cámara ni produce mediciones fisiológicas.

## Ejecutar

Node 22.18 o posterior:

```sh
npm ci
npm run dev
```

Vite sirve el panel, `/ojos` y `/api`. Guarda las sesiones locales en `.mission-data/`, ignorado por Git. Para cámaras en otro teléfono utiliza HTTPS; el dominio público de Netlify sirve como punto común entre redes.

## Publicar y activar la IA

El frontend, la API y el historial se alojan en Netlify usando `netlify.toml`, Functions y Blobs. Este MVP no necesita el servidor Python GRU ni Render.

Para analizar imágenes reales configura `OPENAI_API_KEY` y `VISION_MODEL` como variables de Functions y despliega de nuevo. El modelo debe admitir imágenes y Structured Outputs en Responses. Esas credenciales permanecen en el servidor. Sin ellas se puede conectar la cámara y ejecutar la demo visual; la interfaz indica que el análisis real está pendiente de activación.

Para una publicación inicial mediante el navegador, `npm run package:source` genera `../.release/upload/` con el archivo fuente verificado, README y configuración. Netlify materializa el archivo únicamente si falta `server/mission.ts`; un checkout completo utiliza directamente sus fuentes. El paquete excluye credenciales, dependencias instaladas y datos de sesiones.

## Verificar

```sh
npm test
npm run build
npm run lint
npm run check:shared
```

La guía [INTEGRACION.md](INTEGRACION.md) documenta el contrato y las diferencias entre una observación visual, una escena simulada y una respuesta del astronauta. La investigación fisiológica original permanece en `paquete_IA_para_web/` y en la carpeta hermana `IA/`; no es una dependencia operativa del MVP.

## Equipo

- Iris Anahi Vargas Brambila.
- Kevin Yahir Bernal Aguirre.
- [Alan Emir Medina Delgado](https://devalanmedina.netlify.app/).

Propuesta para NASA Space Apps Challenge 2026: Create Health Monitoring Software for Astronauts on Space Missions.
