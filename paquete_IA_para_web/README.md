> Alcance actual: el MVP utiliza exclusivamente la cámara de ojos5. Este paquete fisiológico se conserva como investigación independiente; no es necesario para ejecutar el MVP. Consulta [INTEGRACION.md](../INTEGRACION.md).

> Integración actualizada: este servicio ejecuta inferencia GRU. CentroControl añade sesiones compartidas en Netlify, alertas e historial. Consulta [INTEGRACION.md](../INTEGRACION.md). El adaptador HTTP usa WSGI y la biblioteca estándar; Gunicorn lo sirve en producción. Configura `INFERENCE_TOKEN` al publicarlo.

# Paquete de IA para el centro de control web

Sistema basado en IA y señales neurofisiológicas para la mitigación del deterioro cognitivo en vuelos espaciales de larga duración.
Esta carpeta es todo lo que la parte de IA entrega a la web: un modelo ya entrenado, un servicio HTTP que devuelve alertas en JSON y un escenario demo.

## 1. Lo que hace el modelo (en una frase)

Cada minuto recibe las **últimas 10 lecturas** de un astronauta (señales fisiológicas + contexto) y devuelve:
- su **estado actual**: `calma`, `estres`, `ira`, `fatiga` o `alegria`;
- el **riesgo de ira en los próximos 5 minutos** y un nivel `bajo` / `medio` / `alto`;
- una **intervención recomendada** (audio o actividad) tomada del perfil del astronauta, o `null`.

## 2. Contenido de la carpeta

| Archivo | Para qué sirve |
|---|---|
| `servidor_alertas.py` | Servicio HTTP WSGI. Es lo que se ejecuta. |
| `alertas_core.py` | Carga el modelo y calcula la alerta. No se ejecuta directo. |
| `modelo_alerta/modelo_alerta.keras` | Modelo GRU entrenado (`gru_v1`). |
| `modelo_alerta/meta.json` | Normalización, calibración y umbrales del modelo. |
| `datos/profiles.csv` | Perfiles de los 12 astronautas (A a L). |
| `datos/demo_scenario_ABC.csv` | Escenario demo de 60 minutos para A, B y C (lecturas). |
| `datos/demo_alertas_ABC.json` | **Las alertas del demo ya calculadas**, minuto a minuto. |
| `ejemplo_peticion_alerta.json` / `ejemplo_respuesta_alerta.json` | Un ejemplo completo de `POST /alerta`. |
| `requirements.txt` | Dependencias de Python. |

## 3. Dos formas de usarlo

**A) Sin instalar nada de IA.** Para construir las pantallas, usa `datos/demo_alertas_ABC.json`. Es un objeto con tres listas (`"A"`, `"B"`, `"C"`), una alerta por minuto desde el minuto 9 hasta el 59, con el mismo formato que devuelve el servicio.

**B) Con el servicio en vivo.**

```bash
python -m venv venv
venv\Scripts\activate            # en Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
python servidor_alertas.py       # queda en http://localhost:5000
```

Probado con Python 3.13, TensorFlow 2.21.0, Keras 3.15.1 y Flask 3.1.3. El primer arranque tarda unos segundos porque carga TensorFlow. Para otro puerto: `set PORT=5055` (Windows) o `PORT=5055 python servidor_alertas.py`.

## 4. Endpoints

| Método y ruta | Qué devuelve |
|---|---|
| `GET /salud` | Estado del servicio, versión del modelo, umbrales y astronautas disponibles. |
| `GET /astronautas` | Perfiles (especialidad, qué lo estresa, qué lo calma, etc.). |
| `POST /alerta` | La alerta de un astronauta a partir de sus últimas lecturas. |
| `GET /demo/<id>` | Lista de alertas del demo para `A`, `B` o `C` (minutos 9 a 59). |
| `GET /demo/<id>/<t_min>` | La alerta de un minuto del demo, por ejemplo `/demo/A/33`. |

El servicio permite llamadas desde cualquier origen si `API_ALLOWED_ORIGINS` está vacío; configúralo con una lista de orígenes HTTPS al publicar. La API de Netlify invoca la inferencia desde el servidor.

**Para simular el paso del tiempo en la demo**, llama `/demo/A/<t>` aumentando `t` cada segundo (1 segundo = 1 minuto).

```js
const r = await fetch("http://localhost:5000/demo/A/33");
const alerta = await r.json();
console.log(alerta.risk.level, alerta.state_now);
```

**`POST /alerta`**: el cuerpo es JSON con `astronaut_id` y `lecturas` (al menos 10 minutos seguidos). Ver `ejemplo_peticion_alerta.json`.

```js
const r = await fetch("http://localhost:5000/alerta", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({astronaut_id: "A", lecturas: ultimos10Minutos})
});
```

Cada lectura (un minuto) debe traer estos campos, todos obligatorios:

| Campo | Significado |
|---|---|
| `t_min` | Minuto de la lectura (entero, creciente) |
| `confined_space`, `long_conversation`, `overheard_negative_talk`, `exercise`, `loved_voice` | Contexto: `0` o `1` |
| `sleep_hours_last_night` | Horas dormidas la noche anterior |
| `music_playing` | `"none"`, `"beethoven"` o `"suave"` |
| `hr` | Frecuencia cardiaca (lpm) |
| `hrv_rmssd` | Variabilidad cardiaca RMSSD (ms) |
| `eda_mean` | Actividad electrodérmica (µS) |
| `resp_rate` | Respiraciones por minuto |
| `skin_temp` | Temperatura de piel (°C) |
| `eeg_delta`, `eeg_theta`, `eeg_alpha`, `eeg_beta`, `eeg_alpha_asym` | EEG, en las unidades relativas del simulador |

El perfil se busca en `profiles.csv` por `astronaut_id`. Se puede mandar otro con la clave opcional `"perfil"`.

## 5. Contrato de la alerta (JSON)

```json
{
  "astronaut_id": "A",
  "timestamp": "2026-11-14T23:58:52Z",
  "state_now": "calma",
  "state_probs": {"calma": 0.985, "estres": 0.0, "ira": 0.014, "fatiga": 0.0, "alegria": 0.001},
  "risk": {"anger_next_5min": 0.938, "level": "alto"},
  "recommended_intervention": {"type": "audio", "item": "musica_beethoven"},
  "model_version": "gru_v1"
}
```

| Campo | Valores |
|---|---|
| `state_now` | `calma`, `estres`, `ira`, `fatiga`, `alegria` |
| `state_probs` | Probabilidad de cada estado (suman 1) |
| `risk.anger_next_5min` | Probabilidad calibrada de que empiece una ira en los próximos 5 minutos (0 a 1) |
| `risk.level` | `bajo` (< 0.294), `medio` (0.294 a 0.588), `alto` (≥ 0.588) |
| `recommended_intervention` | `{"type": "audio" \| "actividad", "item": ...}` o `null` |
| `item` posibles | `musica_beethoven`, `voz_pareja`, `ejercicio`, `musica_suave` |
| `timestamp` | Hora UTC en que se calculó la alerta (no es el minuto de la misión) |

- La intervención sale como `null` cuando el riesgo es `bajo` y el estado no es `estres` ni `ira`. **La web debe manejar `null`.**
- Solo las respuestas de `/demo/...` traen una clave extra `demo` con la verdad del simulador (`t_min`, `state_real`, `anger_next5_real`). Sirve para comparar en pantalla. No existe en `/alerta`.
- Errores: el servicio responde `400` con `{"error": "..."}` y un mensaje claro (faltan campos, menos de 10 minutos, astronauta desconocido, etc.).

## 6. Qué pasa en el escenario demo

Lo siguiente sale de `demo_alertas_ABC.json`:

- **Astronauta A.** Riesgo `alto` desde el minuto 27 (0.588). La ira real empieza en el minuto 33, así que la alerta llega unos 6 minutos antes. Recomienda `musica_beethoven`. En el minuto 33 el estado todavía sale `calma` y desde el 34 sale `ira`. En el minuto 42 la ira ya terminó, pero el modelo sigue mostrando `ira` y riesgo `alto` un minuto más; en el 43 baja a `bajo`.
- **Astronauta B.** Riesgo `bajo` durante todo el demo. Sirve de control: la pantalla no debe alertar.
- **Astronauta C.** Ya está en `alto` (0.994) en el minuto 9, que es el primer minuto en que el modelo puede predecir, y la ira real empieza en el 12. Baja a `bajo` en el minuto 25. Recomienda `musica_suave`.

## 7. Qué tan bien funciona (y qué NO se puede afirmar)

Resultados sobre los astronautas A, B y C, que el modelo no vio al entrenar, con datos simulados:

| Medida | Resultado |
|---|---|
| Estado actual (accuracy) | 92.3 % |
| Detección de ira, solo cuando todavía no está en ira (la alerta temprana real) | precisión 0.54, recall 0.85 |
| Episodios de ira avisados con alerta alta antes de empezar | 58 de 65 (89.2 %) |
| Antelación mediana | 5 minutos |

Límites que la presentación debe declarar:

1. **Los datos son sintéticos.** Las señales periféricas (HR, HRV, EDA, respiración, temperatura) se calibraron con WESAD (15 personas reales, estrés vs. reposo). El EEG, los perfiles, los eventos de la misión y las etiquetas de ira son simulados. WESAD no contiene ira.
2. **La ira es una decisión de diseño del simulador:** empuja las señales 1.3 veces más que el estrés. [Inferencia] Por eso las métricas de ira describen al simulador y probablemente son optimistas frente a personas reales.
3. **No está validado con astronautas ni con personas reales.** No se debe presentar como detector clínico ni como diagnóstico.
4. **Falsa alarma al terminar un episodio:** la ventana de 10 minutos hace que el riesgo tarde unos minutos en bajar (ver astronauta A, minuto 42).
5. **La intervención recomendada es una regla**, no algo que aprendió el modelo: el primer calmante del perfil del astronauta.
6. **HRV es la señal menos confiable de la calibración** (mucha dispersión entre personas en WESAD) y la respiración casi no distingue estados.
7. En producción configura `INFERENCE_TOKEN`: las llamadas requieren `Authorization: Bearer <token>`. Sin esa variable, conserva el acceso local de la demo.

Cita de los datos de calibración: Schmidt et al., *Introducing WESAD, a Multimodal Dataset for Wearable Stress and Affect Detection*, ICMI 2018. Uso científico no comercial.
