import io
import json
import math
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import alertas_core as core
from servidor_alertas import app


ROOT = Path(__file__).resolve().parents[1]


class InferenceTests(unittest.TestCase):
    def setUp(self):
        self.example = json.loads((ROOT / "ejemplo_peticion_alerta.json").read_text())

    def request(self, path="/alerta", body=None, token=""):
        payload = json.dumps(self.example if body is None else body).encode()
        status = []
        environment = {"REQUEST_METHOD": "POST", "PATH_INFO": path, "CONTENT_LENGTH": str(len(payload)),
                       "wsgi.input": io.BytesIO(payload), "HTTP_AUTHORIZATION": token}
        response = b"".join(app(environment, lambda value, headers: status.append(value)))
        return int(status[0].split()[0]), json.loads(response)

    def test_saved_model_matches_delivered_demo_prediction(self):
        result = core.predecir_alerta(self.example["lecturas"], core.perfil_de("A"))
        expected = json.loads((ROOT / "ejemplo_respuesta_alerta.json").read_text())
        self.assertEqual(result["state_now"], expected["state_now"])
        self.assertAlmostEqual(result["risk"]["anger_next_5min"], expected["risk"]["anger_next_5min"], delta=.01)
        self.assertEqual(result["recommended_intervention"], expected["recommended_intervention"])
        self.assertTrue(all(math.isfinite(p) for p in result["state_probs"].values()))

    def test_validates_consecutive_minutes_and_duplicate_minutes(self):
        for delta in (0, 2, .5):
            rows = [dict(r) for r in self.example["lecturas"]]
            rows[-1]["t_min"] = rows[-2]["t_min"] + delta
            with self.assertRaises(ValueError):
                core.predecir_alerta(rows, core.perfil_de("A"))

    def test_rejects_nonfinite_context_and_invalid_baseline(self):
        for field, value in (("hr", float("inf")), ("eeg_alpha", float("nan")), ("confined_space", 2)):
            rows = [dict(r) for r in self.example["lecturas"]]
            rows[0][field] = value
            with self.assertRaises(ValueError):
                core.predecir_alerta(rows, core.perfil_de("A"))
        profile = core.perfil_de("A")
        profile["baseline_hr"] = 0
        with self.assertRaises(ValueError):
            core.predecir_alerta(self.example["lecturas"], profile)

    def test_wsgi_token_contract_and_profile_identity(self):
        with patch.dict(os.environ, {"INFERENCE_TOKEN": "test-only-secret"}):
            self.assertEqual(self.request()[0], 401)
            status, result = self.request(token="Bearer test-only-secret")
            self.assertEqual(status, 200)
            self.assertEqual(result["astronaut_id"], "A")
            body = dict(self.example, perfil=core.perfil_de("B"))
            self.assertEqual(self.request(body=body, token="Bearer test-only-secret")[0], 400)

    def test_wsgi_rejects_invalid_body_without_crashing(self):
        with patch.dict(os.environ, {"INFERENCE_TOKEN": ""}):
            for body in ([], {"lecturas": []}, {"lecturas": "invalid"}, {"astronaut_id": "unknown", "lecturas": []}):
                self.assertEqual(self.request(body=body)[0], 400)


if __name__ == "__main__":
    unittest.main()
