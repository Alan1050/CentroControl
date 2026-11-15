import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapping = [
  ...['protocol.ts', 'client.ts', 'useMission.ts', 'MissionOverlay.tsx', 'mission-overlay.css'].map(name => [resolve(root, 'src/mission', name), resolve(root, '../ojos5/src/mission', name)]),
  [resolve(root, '../ojos5/src/camera/browser-camera.ts'), resolve(root, 'src/camera/browser-camera.ts')],
];
for (const [source, destination] of mapping) {
  if (process.argv.includes('--check')) {
    if (await readFile(source, 'utf8') !== await readFile(destination, 'utf8')) throw new Error(`Shared file differs: ${destination}`);
  } else { await mkdir(dirname(destination), { recursive: true }); await copyFile(source, destination); }
}
console.log(process.argv.includes('--check') ? 'Shared contracts and clients match.' : 'Shared contracts and clients synchronized.');
