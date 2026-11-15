/** Visual QA when opening a local server is unavailable. Uses the real Card component and real demo state. */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const check = spawnSync(resolve('node_modules/.bin/tsc'), ['--project', 'tsconfig.app.json', '--noEmit', 'false',
  '--rewriteRelativeImportExtensions', 'true', '--rootDir', 'src', '--outDir', '.qa/compiled'], { stdio: 'inherit' });
if (check.status) process.exit(check.status);
const { default: Card } = await import('../.qa/compiled/components/Card.js');
const { MissionService } = await import('../server/mission.ts');
const { MemoryStore } = await import('../server/store.ts');
const service = new MissionService({ store: new MemoryStore() });
const keys = await service.create({ mode: 'camera-demo' });
const snapshot = await service.action(keys.sessionId, keys.controlKey, 'control', { minute: 30, playing: false });
const cards = renderToStaticMarkup(React.createElement('section', { className: 'datos-container' },
  snapshot.crew.map(crew => React.createElement(Card, { key: crew.id, crew, pending: false, connected: true, serverTime: snapshot.serverTime }))));
if (/Pulso|HRV|Presión arterial|Estado estimado|Riesgo de ira|Temperatura de piel/.test(cards)) throw new Error('The camera MVP must not render physiological measurements or emotional predictions.');
const css = await readFile('src/index.css', 'utf8') + '\n' + await readFile('src/App.css', 'utf8');
const body = `<div class="app-shell"><main class="main-content"><div class="page-heading"><div><p class="eyebrow">NEUROORBIT LAB · MISIÓN</p><h1>Centro de control</h1><p class="page-description">Revisión visual con datos simulados · minuto 30</p></div></div>${cards}</main></div>`;
const page = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeuroOrbit · Revisión visual</title><style>${css}</style>${body}</html>`;
await mkdir('.qa', { recursive: true });
await writeFile('.qa/desktop.html', page);
const mobile = page.replace('<title>NeuroOrbit · Revisión visual</title>', '<title>NeuroOrbit · Móvil</title>');
await writeFile('.qa/mobile-content.html', mobile);
await writeFile('.qa/mobile.html', '<!doctype html><meta charset="utf-8"><title>NeuroOrbit · Revisión móvil</title><style>body{margin:0;background:#182438;display:flex;justify-content:center}iframe{width:390px;height:1400px;border:0}</style><iframe title="Vista móvil de 390px" src="mobile-content.html"></iframe>');
console.log('Visual review:', resolve('.qa/desktop.html'), resolve('.qa/mobile.html'));
