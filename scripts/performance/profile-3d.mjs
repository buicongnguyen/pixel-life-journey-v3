#!/usr/bin/env node
// Deterministic companion-view fixture; run against the Vite development server.
// Measurement tools reused from Claude's smooth-dense-scenes skill.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [url = 'http://127.0.0.1:5191/', ...options] = process.argv.slice(2);
const fixture = async () => {
  const { open3D } = await import('/src/view3d.ts');
  document.body.replaceChildren();
  const snapshot = {
    stage: { id: 'benchmark', name: 'Rendering benchmark', scene: 'nursery' },
    width: 24, height: 14,
    player: { x: 12, y: 9, age: 30, gender: 'female', facing: 'front', moving: false },
    door: { x: 22, y: 7, open: true },
    stations: [
      { id: 'book', label: 'Read a book', x: 6, y: 5, category: 'smarts' },
      { id: 'mother', label: 'Mother', x: 12, y: 5, person: 'mother' },
      { id: 'food', label: 'Healthy meal', x: 18, y: 5, category: 'food' },
      { id: 'gym', label: 'Exercise', x: 6, y: 10, category: 'health' },
      { id: 'work', label: 'Work', x: 18, y: 10, category: 'wealth' },
    ].map(s => ({ kind: 'choice', harmful: false, inactive: false, ...s })),
  };
  await open3D({ renderSnapshot: () => snapshot }, () => {});
  await new Promise(resolve => setTimeout(resolve, 2000));
};
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./render-probe.mjs', import.meta.url)), url,
  '--eval', `(${fixture.toString()})()`, ...options,
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
