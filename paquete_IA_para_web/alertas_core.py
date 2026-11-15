"""
Nucleo de prediccion del sistema de alerta temprana (modelo GRU, gru_v1).

Recibe las ultimas lecturas (1 por minuto) de UN astronauta y devuelve la alerta en el
formato JSON acordado con el centro de control. Las funciones de caracteristicas son las
mismas del cuaderno 03_modelo_gru_keras.ipynb (bloques 7, 8 y 30).
"""
import json
import os
import threading
from datetime import datetime, timezone

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import pandas as pd
import tensorflow as tf

CARPETA = os.path.dirname(os.path.abspath(__file__))
RUTA_MODELO = os.path.join(CARPETA, "modelo_alerta", "modelo_alerta.keras")
RUTA_META = os.path.join(CARPETA, "modelo_alerta", "meta.json")
RUTA_PERFILES = os.path.join(CARPETA, "datos", "profiles.csv")
RUTA_DEMO = os.path.join(CARPETA, "datos", "demo_scenario_ABC.csv")

META = json.load(open(RUTA_META, encoding="utf-8"))
MODELO = tf.keras.models.load_model(RUTA_MODELO, compile=False)
PERFILES = pd.read_csv(RUTA_PERFILES, dtype={"astronaut_id": str})
DEMO = pd.read_csv(RUTA_DEMO, dtype={"astronaut_id": str})
_CERROJO = threading.Lock()

VENTANA = META["ventana"]

# Columnas que debe traer cada lectura (una fila por minuto)
COLUMNAS_LECTURA = [
    "t_min", "confined_space", "long_conversation", "overheard_negative_talk", "exercise",
    "sleep_hours_last_night", "music_playing", "loved_voice",
    "hr", "hrv_rmssd", "eda_mean", "resp_rate", "skin_temp",
    "eeg_delta", "eeg_theta", "eeg_alpha", "eeg_beta", "eeg_alpha_asym",
]
COLUMNAS_TEXTO = {"music_playing"}
MUSICA_VALIDA = {"none", "beethoven", "suave"}
COLUMNAS_PERFIL = [
    "astronaut_id", "stress_triggers", "anger_triggers", "calmers", "joy_triggers", "min_sleep_h",
    "reactivity", "baseline_hr", "baseline_hrv", "baseline_eda",
    "baseline_alpha", "baseline_beta", "baseline_theta", "baseline_delta",
]

# ---------------------------------------------------------------- caracteristicas (cuaderno 03)
POOL = {
    "stress": ["espacios_reducidos", "charlas_largas", "murmullos", "falta_sueno"],
    "anger":  ["espacios_reducidos", "charlas_largas", "murmullos", "falta_sueno"],
    "calm":   ["musica_beethoven", "voz_pareja", "ejercicio", "musica_suave"],
    "joy":    ["voz_pareja", "ejercicio", "musica_beethoven", "musica_suave"],
}
COL_LISTA = {"stress": "stress_triggers", "anger": "anger_triggers",
             "calm": "calmers", "joy": "joy_triggers"}


def perfil_multihot(p):
    """Convierte que lo estresa, enoja, calma y alegra en columnas 0/1."""
    p = p.copy()
    for clave, col in COL_LISTA.items():
        conjuntos = p[col].fillna("").astype(str).str.split("|").apply(lambda xs: set(x for x in xs if x))
        for item in POOL[clave]:
            p[f"p_{clave}_{item}"] = conjuntos.apply(lambda s, it=item: int(it in s))
    return p


def agregar_caracteristicas(df, perfiles_mh):
    d = df.merge(perfiles_mh, on="astronaut_id", how="left", validate="many_to_one")

    d["hr_rel"] = d["hr"] / d["baseline_hr"]
    d["hrv_rel"] = d["hrv_rmssd"] / d["baseline_hrv"]
    d["eda_rel"] = d["eda_mean"] / d["baseline_eda"]
    d["alpha_rel"] = d["eeg_alpha"] / d["baseline_alpha"]
    d["beta_rel"] = d["eeg_beta"] / d["baseline_beta"]
    d["theta_rel"] = d["eeg_theta"] / d["baseline_theta"]
    d["delta_rel"] = d["eeg_delta"] / d["baseline_delta"]
    d["beta_alpha"] = d["eeg_beta"] / d["eeg_alpha"].clip(lower=1e-3)

    d["music_beethoven"] = (d["music_playing"] == "beethoven").astype(int)
    d["music_suave"] = (d["music_playing"] == "suave").astype(int)
    d["sleep_deficit"] = ((d["min_sleep_h"] - d["sleep_hours_last_night"]) / 3).clip(0, 1)

    contexto = {"espacios_reducidos": d["confined_space"],
                "charlas_largas": d["long_conversation"],
                "murmullos": d["overheard_negative_talk"]}
    for clave in ("stress", "anger"):
        activo = sum(d[f"p_{clave}_{n}"] * c for n, c in contexto.items())
        d[f"{clave}_trigger_on"] = activo.clip(upper=1)
        d[f"{clave}_sleep_pressure"] = d[f"p_{clave}_falta_sueno"] * d["sleep_deficit"]

    items = {"musica_beethoven": d["music_beethoven"], "musica_suave": d["music_suave"],
             "voz_pareja": d["loved_voice"], "ejercicio": d["exercise"]}
    d["calmer_on"] = sum(d[f"p_calm_{n}"] * c for n, c in items.items()).clip(upper=1)
    d["joy_on"] = sum(d[f"p_joy_{n}"] * c for n, c in items.items()).clip(upper=1)
    return d


def recomendar(fila_perfil, nivel, estado):
    """Regla de diseno (no aprendida): primer calmante del perfil si hay riesgo o estres/ira."""
    if nivel == "bajo" and estado not in ("estres", "ira"):
        return None
    calmantes = [c for c in str(fila_perfil["calmers"]).split("|") if c]
    if not calmantes:
        return None
    return {"type": "actividad" if calmantes[0] == "ejercicio" else "audio", "item": calmantes[0]}


# ---------------------------------------------------------------- validacion
def perfil_de(astronaut_id):
    f = PERFILES[PERFILES["astronaut_id"] == str(astronaut_id)]
    if f.empty:
        raise ValueError(f"astronaut_id desconocido: {astronaut_id!r}. Disponibles: {sorted(PERFILES['astronaut_id'])}")
    return f.iloc[0].to_dict()


def _validar_lecturas(lecturas):
    d = pd.DataFrame(lecturas)
    faltan = [c for c in COLUMNAS_LECTURA if c not in d.columns]
    if faltan:
        raise ValueError(f"faltan campos en las lecturas: {faltan}")
    d = d[COLUMNAS_LECTURA].copy()
    for c in COLUMNAS_LECTURA:
        if c not in COLUMNAS_TEXTO:
            d[c] = pd.to_numeric(d[c], errors="coerce")
    if d.isna().any().any():
        malas = [c for c in COLUMNAS_LECTURA if d[c].isna().any()]
        raise ValueError(f"valores vacios o no numericos en: {malas}")
    numericas = [c for c in COLUMNAS_LECTURA if c not in COLUMNAS_TEXTO]
    if not np.isfinite(d[numericas].to_numpy(dtype=float)).all():
        raise ValueError("las lecturas deben contener valores finitos")
    for c in ("confined_space", "long_conversation", "overheard_negative_talk", "exercise", "loved_voice"):
        if not d[c].isin([0, 1]).all():
            raise ValueError(f"{c} solo acepta 0 o 1")
    if not ((d["t_min"] >= 0) & (d["t_min"] == np.floor(d["t_min"]))).all():
        raise ValueError("t_min debe contener minutos enteros no negativos")
    if d["t_min"].duplicated().any():
        raise ValueError("no se permiten minutos duplicados")
    if not d["sleep_hours_last_night"].between(0, 24).all():
        raise ValueError("horas de sueno fuera de rango")
    for c in ("hr", "hrv_rmssd", "eda_mean", "resp_rate", "eeg_delta", "eeg_theta", "eeg_alpha", "eeg_beta"):
        if (d[c] < 0).any():
            raise ValueError(f"{c} no puede ser negativo")
    d["music_playing"] = d["music_playing"].astype(str)
    raras = set(d["music_playing"]) - MUSICA_VALIDA
    if raras:
        raise ValueError(f"music_playing solo acepta {sorted(MUSICA_VALIDA)}; llego {sorted(raras)}")
    if len(d) < VENTANA:
        raise ValueError(f"se necesitan al menos {VENTANA} minutos de historial; llegaron {len(d)}")
    recientes = d.sort_values("t_min").tail(VENTANA)
    if not (recientes["t_min"].diff().dropna() == 1).all():
        raise ValueError(f"se necesitan {VENTANA} minutos consecutivos sin huecos")
    return d


# ---------------------------------------------------------------- prediccion
def predecir_alerta(lecturas, fila_perfil):
    """lecturas: lista de dicts o DataFrame (>= 10 minutos, un astronauta); fila_perfil: dict del perfil."""
    d = _validar_lecturas(lecturas)
    faltan = [c for c in COLUMNAS_PERFIL if c not in fila_perfil]
    if faltan:
        raise ValueError(f"faltan campos en el perfil: {faltan}")
    for c in ("baseline_hr", "baseline_hrv", "baseline_eda", "baseline_alpha", "baseline_beta", "baseline_theta", "baseline_delta"):
        try:
            valor = float(fila_perfil[c])
        except (ValueError, TypeError):
            raise ValueError(f"{c} debe ser numerico") from None
        if not np.isfinite(valor) or valor <= 0:
            raise ValueError(f"{c} debe ser positivo y finito")
    for c, minimo, maximo in (("min_sleep_h", 0, 24), ("reactivity", 0, 1)):
        try:
            valor = float(fila_perfil[c])
        except (ValueError, TypeError):
            raise ValueError(f"{c} debe ser numerico") from None
        if not np.isfinite(valor) or not minimo <= valor <= maximo:
            raise ValueError(f"{c} fuera de rango")
    d["astronaut_id"] = str(fila_perfil["astronaut_id"])

    pf = perfil_multihot(pd.DataFrame([fila_perfil]))
    pf["astronaut_id"] = str(fila_perfil["astronaut_id"])
    d = agregar_caracteristicas(d.sort_values("t_min").tail(VENTANA), pf)

    xs = (d[META["cols_seq"]].to_numpy(np.float32) - np.array(META["mu_seq"])) / np.array(META["sd_seq"])
    xp = (pf[META["cols_perfil"]].to_numpy(np.float32) - np.array(META["mu_perfil"])) / np.array(META["sd_perfil"])

    with _CERROJO:
        pred = MODELO({"secuencia": xs[None].astype("float32"), "perfil": xp.astype("float32")}, training=False)
    p_estado = np.asarray(pred["estado"])
    p_ira = float(np.asarray(pred["ira"])[0, 0])

    riesgo = float(np.interp(p_ira, META["calibracion"]["x"], META["calibracion"]["y"]))
    estado = META["estados"][int(np.argmax(p_estado[0]))]
    nivel = "alto" if riesgo >= META["umbral_alto"] else ("medio" if riesgo >= META["umbral_medio"] else "bajo")

    return {
        "astronaut_id": str(fila_perfil["astronaut_id"]),
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "state_now": estado,
        "state_probs": {e: round(float(v), 3) for e, v in zip(META["estados"], p_estado[0])},
        "risk": {"anger_next_5min": round(riesgo, 3), "level": nivel},
        "recommended_intervention": recomendar(fila_perfil, nivel, estado),
        "model_version": META["model_version"],
    }


# ---------------------------------------------------------------- escenario demo (A, B, C)
_CACHE_DEMO = {}


def alertas_demo(astronaut_id):
    """Alerta para cada minuto del escenario demo (desde el minuto 9). Se calcula una vez y se guarda."""
    aid = str(astronaut_id)
    if aid in _CACHE_DEMO:
        return _CACHE_DEMO[aid]
    serie = DEMO[DEMO["astronaut_id"] == aid].sort_values("t_min")
    if serie.empty:
        raise ValueError(f"el escenario demo solo tiene {sorted(DEMO['astronaut_id'].unique())}")
    perfil = perfil_de(aid)
    salida = []
    for t in range(VENTANA - 1, int(serie["t_min"].max()) + 1):
        recientes = serie[serie["t_min"] <= t].tail(VENTANA)
        alerta = predecir_alerta(recientes.to_dict("records"), perfil)
        real = recientes.iloc[-1]
        alerta["demo"] = {   # SOLO en el escenario demo: la verdad del simulador, para comparar en pantalla
            "t_min": int(t), "state_real": str(real["state_now"]),
            "anger_next5_real": int(real["anger_next5"]),
        }
        salida.append(alerta)
    _CACHE_DEMO[aid] = salida
    return salida
