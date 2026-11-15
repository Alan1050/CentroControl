"""Export the existing IA delivery into a JSON module for Netlify and local tests."""
import csv
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'paquete_IA_para_web'
profiles = list(csv.DictReader((source / 'datos/profiles.csv').open()))
for profile in profiles:
    for key in profile:
        if key.startswith('baseline_') or key in ('min_sleep_h', 'reactivity'):
            profile[key] = float(profile[key])
readings = list(csv.DictReader((source / 'datos/demo_scenario_ABC.csv').open()))
for reading in readings:
    for key in reading:
        if key not in ('session_id', 'astronaut_id', 'music_playing', 'state_now', 'best_intervention'):
            reading[key] = float(reading[key])
output = root / 'server/data/demo.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({
    'profiles': profiles, 'readings': readings,
    'alerts': json.loads((source / 'datos/demo_alertas_ABC.json').read_text()),
    'meta': json.loads((source / 'modelo_alerta/meta.json').read_text()),
}, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Exported existing predictions:', output)
