"""Package a reproducible source release for Netlify's GitHub-based build."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
release = root.parent / '.release'
target = release / 'upload'
target.mkdir(parents=True, exist_ok=True)
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
files = sorted({name for name in names if name and name != 'neuroorbit-source.zip' and (root / name).is_file()})
for name in files:
    filename = Path(name).name
    if filename.startswith('.env') and filename != '.env.example':
        raise RuntimeError(f'Refusing to package environment credentials: {name}')
    if any(part in ('.git', 'node_modules', '.mission-data', '.qa', '__pycache__') for part in Path(name).parts):
        raise RuntimeError(f'Refusing to package runtime/generated files: {name}')
manifest = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files}
archive = target / 'neuroorbit-source.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
    for name in files:
        output.write(root / name, name)
for name in ('netlify.toml', 'README.md'):
    shutil.copyfile(root / name, target / name)
(release / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with zipfile.ZipFile(archive) as packaged:
    assert packaged.testzip() is None
    assert all(hashlib.sha256(packaged.read(name)).hexdigest() == digest for name, digest in manifest.items())
print(f'Verified source archive: {len(files)} files, {archive.stat().st_size} bytes')
print(f'SHA256: {hashlib.sha256(archive.read_bytes()).hexdigest()}')
