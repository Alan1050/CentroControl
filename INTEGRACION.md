# NeuroOrbit · MVP exclusivamente con cámara

El MVP usa la cámara integrada del teléfono o computadora para observar el entorno del astronauta. No solicita dispositivos adicionales ni lecturas cardiacas, EEG, temperatura o presión arterial.

Destino de publicación: **https://centrocontrolneuro.netlify.app**. CentroControl y la vista web de ojos5 (`/ojos`) comparten la misma API. El proyecto Expo `ojos5/` conserva sus versiones nativas y web independientes.

## Qué hace la IA

Cada fotograma se utiliza para describir la escena y buscar evidencia visible de:

- Espacio reducido.
- Área de trabajo saturada de objetos.
- Aviso o indicador de alarma visible.

Cuando encuentra un posible detonador del perfil con confianza suficiente, genera un aviso contextual y una sugerencia de pausa. Conserva el aviso mientras la situación siga apareciendo. Una nueva imagen donde ya no aparece lo cierra; si dejan de llegar imágenes, muestra que la observación es antigua y conserva el contexto anterior.

La cámara hacia el entorno no mide el estado emocional del astronauta. El panel separa **observación visual**, **posible detonador** y **estado comunicado voluntariamente por el astronauta**. El MVP no muestra probabilidades de ira ni mediciones fisiológicas generadas a partir de imágenes.

La sugerencia de pausa incluye respirar con suavidad, sin forzar, cuando la tarea permita detenerse de forma segura. Referencia general del contenido: [NHS · Breathing exercises for stress](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/).

## Uso

1. En CentroControl pulsa «Iniciar sesión con cámara».
2. En la tarjeta del astronauta abre «Conectar ojos5» y utiliza su enlace en el dispositivo con cámara.
3. También puedes pegarlo en la aplicación Expo de ojos5.
4. El astronauta pulsa «Iniciar observación», que analiza un fotograma cada veinte segundos. «Analizar ahora» envía uno a petición.
5. CentroControl recibe las mismas observaciones, avisos, sugerencias y respuestas.
6. Opcionalmente, el astronauta puede comunicar «Me siento bien», «Siento estrés» o «Siento enojo». Esta respuesta se identifica como comunicada por la persona.

«Probar demo visual» reproduce escenas simuladas para A/B/C sin un proveedor de IA configurado. A encuentra un espacio reducido desde el minuto 25; C ve un aviso desde el 12; B permanece sin detonadores. Los escenarios se identifican como simulación y no analizan la imagen de la cámara.

## Desarrollo

En `CentroControl/`:

```sh
npm ci
npm run dev
```

Vite sirve el panel, `/ojos` y `/api`. La API conserva sesiones locales en `.mission-data/`, ignorado por Git. El puerto 5173 puede pertenecer a otro proyecto: utiliza la dirección que imprima Vite.

En `ojos5/`:

```sh
npm ci
npm run web
# o npm start para dispositivos compatibles con Expo SDK 58
```

La cámara web requiere localhost o HTTPS en el dispositivo que la utiliza. Para conectar otro teléfono utiliza la dirección pública de Netlify.

## Publicación en Netlify

El frontend, la API y el historial se ejecutan en Netlify. El MVP no depende de Render ni del modelo fisiológico en Python.

- Repositorio conectado: `Alan1050/CentroControl`.
- Configuración: `netlify.toml`.
- Publicación: `dist`.
- Función de API: `netlify/functions/mission.mts`, ruta `/api/*`.
- Persistencia: store de sitio `neuroorbit-sessions-v1`, disponible entre despliegues.
- Construcción: Node 22, SDK de Blobs instalado en `netlify/` y frontend compilado con Vite.

El frontend utiliza su propio origen por defecto. `VITE_API_URL` solo es necesario para conectarlo a otra dirección pública de CentroControl. Nunca contiene una clave de proveedor.

Para publicar desde el navegador, `npm run package:source` genera `../.release/upload/` con tres archivos: `neuroorbit-source.zip`, `netlify.toml` y `README.md`. El comando de Netlify extrae las fuentes únicamente si falta `server/mission.ts`. Un checkout completo construye directamente sus fuentes. El ZIP se verifica con hashes y excluye credenciales, dependencias instaladas y datos de sesiones.

## Activar imágenes reales

Configura estas variables en Netlify con alcance **Functions** y vuelve a desplegar:

- Opción recomendada (Google AI / Gemini - gratuita):
  - `GEMINI_API_KEY`: clave obtenida en Google AI Studio (https://aistudio.google.com/app/apikey).
  - `GEMINI_MODEL`: modelo de visión (por defecto `gemini-1.5-flash`).
- Opción alternativa (OpenAI):
  - `OPENAI_API_KEY`: credencial privada del proveedor.
  - `VISION_MODEL`: modelo que admita imágenes y Structured Outputs en Responses (ej. `gpt-4o-mini`).
- Modo de prueba sin API externa:
  - `MOCK_VISION`: `true` para activar el análisis visual simulado de fotogramas sin credenciales externas.
- `API_ALLOWED_ORIGINS`: opcional, lista separada por comas para los clientes web externos.

Sin las dos primeras variables la cámara sigue funcionando, se puede reproducir la demo visual y la interfaz informa que el análisis real está pendiente de activación. La app no introduce resultados ficticios para ocultar esa falta de configuración.

Se envía un JPEG de tamaño limitado; el servidor no conserva la imagen y solicita `store: false` al proveedor. Sí conserva la descripción y los eventos. En nativo, Expo Camera crea un archivo temporal en la caché del sistema. La captura periódica se detiene en segundo plano y comienza únicamente cuando el usuario la activa. No hay micrófono ni grabación de video.

## Sesiones y contrato

`POST /api/sessions` crea por defecto una sesión de cámara. También acepta `{ "mode": "camera" }` o `{ "mode": "camera-demo", "secondsPerMinute": 3 }`.

Devuelve `sessionId`, `controlKey`, `viewerKey` y una `crewKey` por astronauta. La clave de consulta es de solo lectura; cada astronauta solo puede consultar y modificar sus propios datos. Los enlaces son credenciales de sesión y viajan en el fragmento de la URL. La API recibe la clave mediante `Authorization: Bearer <clave>`.

| Ruta | Método | Función |
| --- | --- | --- |
| `/api/health` | GET | Estado y disponibilidad del análisis visual. |
| `/api/sessions/:id` | GET | Observaciones, avisos, respuestas y estado de cámaras de la sesión. |
| `/api/sessions/:id/vision` | POST | `{ "astronautId": "A", "image": "data:image/jpeg;base64,…" }`. |
| `/api/sessions/:id/heartbeat` | POST | Conexión del dispositivo y estado de cámara. |
| `/api/sessions/:id/response` | POST | Respuesta a una sugerencia o aviso. |
| `/api/sessions/:id/self-report` | POST | Estado emocional comunicado voluntariamente. |
| `/api/sessions/:id/control` | POST | Pausar o avanzar la demo visual, solo desde control. |

El contrato completo está en `src/mission/protocol.ts`. `scripts/sync-ojos.mjs` mantiene el contrato, el cliente y la asistencia web sincronizados con el proyecto hermano. La cámara de ojos5 también se copia al portal para servir `/ojos` desde el mismo sitio. Ambos repositorios compilan independientemente.

Los clientes consultan la misma sesión cada dos segundos. Evitan peticiones de lectura superpuestas, reintentan con espera progresiva y conservan la última información si se interrumpe la comunicación. El registro de eventos usa claves inmutables y conserva la respuesta aunque la escena cambie.

## Investigación previa

Los cuadernos, datos y modelo fisiológico originales permanecen en `IA/` y `CentroControl/paquete_IA_para_web/`. Su demo y los endpoints anteriores se conservan para investigación y compatibilidad. No forman parte del recorrido del MVP con cámara y sus resultados no se presentan como observaciones visuales.

## Verificación

```sh
# CentroControl
npm test
npm run build
npm run lint
npm run check:shared

# ojos5
npm run typecheck
npm run lint
npm test
npm run export:web
```

Las pruebas del MVP comprueban que la sesión arranca sin sensores ni GRU, que no se generan mediciones fisiológicas, que una observación llega inmediatamente a ambos clientes, que se conserva su respuesta, que se distinguen escenas reales y simuladas y que el estado comunicado no se infiere de la imagen.
