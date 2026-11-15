"""WSGI inference API. Local: python servidor_alertas.py; production: gunicorn servidor_alertas:app.

The shared Netlify API owns mission state. This service only runs the existing GRU.
No web framework is required; the HTTP contract of the previous Flask adapter is preserved.
"""
import hmac
import json
import os
import re
from http import HTTPStatus
from wsgiref.simple_server import make_server

import alertas_core as core


def app(environ, start_response):
    origin = environ.get("HTTP_ORIGIN", "")
    allowed = [s.strip() for s in os.environ.get("API_ALLOWED_ORIGINS", "").split(",") if s.strip()]
    headers = [("Content-Type", "application/json; charset=utf-8"), ("Cache-Control", "no-store"),
               ("Vary", "Origin"), ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
               ("Access-Control-Allow-Methods", "GET, POST, OPTIONS")]
    if origin and (not allowed or origin in allowed):
        headers.append(("Access-Control-Allow-Origin", origin))

    def respond(data, status=200):
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        start_response(f"{status} {HTTPStatus(status).phrase}", headers + [("Content-Length", str(len(payload)))])
        return [payload]

    try:
        if origin and allowed and origin not in allowed:
            return respond({"error": "origen no autorizado"}, 403)
        method, path = environ.get("REQUEST_METHOD", "GET"), environ.get("PATH_INFO", "/")
        if method == "OPTIONS":
            start_response("204 No Content", headers)
            return [b""]
        if method == "GET" and path in ("/salud", "/health"):
            return respond(dict(estado="ok", model_version=core.META["model_version"],
                                ventana_minutos=core.VENTANA, umbral_alto=core.META["umbral_alto"],
                                umbral_medio=core.META["umbral_medio"]))
        token = os.environ.get("INFERENCE_TOKEN", "")
        if token and not hmac.compare_digest(environ.get("HTTP_AUTHORIZATION", ""), "Bearer " + token):
            return respond({"error": "credencial no valida"}, 401)
        if method == "POST" and path == "/alerta":
            try:
                length = int(environ.get("CONTENT_LENGTH", "0") or 0)
            except ValueError:
                return respond({"error": "Content-Length no valido"}, 400)
            if length > 1000000 or length < 0:
                return respond({"error": "peticion demasiado grande"}, 413)
            try:
                body = json.loads(environ["wsgi.input"].read(length))
            except (ValueError, UnicodeError):
                return respond({"error": "se esperaba JSON valido"}, 400)
            if not isinstance(body, dict) or not isinstance(body.get("lecturas"), list):
                return respond({"error": 'se esperaba un objeto con astronaut_id y lecturas (lista)'}, 400)
            profile = body.get("perfil") or core.perfil_de(body.get("astronaut_id"))
            if not isinstance(profile, dict):
                return respond({"error": "perfil debe ser un objeto"}, 400)
            if str(profile.get("astronaut_id")) != str(body.get("astronaut_id")):
                return respond({"error": "el perfil corresponde a otro astronauta"}, 400)
            return respond(core.predecir_alerta(body["lecturas"], profile))
        if method == "GET" and path == "/astronautas":
            cols = ["astronaut_id", "specialty", "stress_triggers", "anger_triggers", "calmers", "joy_triggers", "min_sleep_h", "reactivity"]
            return respond(core.PERFILES[cols].fillna("").to_dict("records"))
        match = re.fullmatch(r"/demo/([A-Z])(?:/(\d+))?", path)
        if method == "GET" and match:
            series = core.alertas_demo(match[1])
            if match[2] is None:
                return respond(series)
            for alert in series:
                if alert["demo"]["t_min"] == int(match[2]):
                    return respond(alert)
            return respond({"error": "minuto fuera del escenario demo"}, 400)
        return respond({"error": "ruta o metodo no disponible"}, 404)
    except (ValueError, TypeError, KeyError) as error:
        return respond({"error": str(error)}, 400)
    except Exception:
        return respond({"error": "no se pudo ejecutar la inferencia"}, 500)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Inference API on http://localhost:{port}; configure INFERENCE_TOKEN before publishing.")
    with make_server("0.0.0.0", port, app) as server:
        server.serve_forever()
