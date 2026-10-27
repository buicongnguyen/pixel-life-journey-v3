// Development-only measurement page. No production globals or engine patches.
import * as THREE from 'three';
import { open3D } from '../../src/view3d.ts';
import '../../src/style.css';

const restorers = [];
let counters, renderer, scene, camera, close;
let rows = [], measuring = false, tick = 0, mode = 'idle';
const blank = () => ({ draws: 0, shadowDraws: 0, viewDraws: 0, triangles: 0,
  compose: 0, multiply: 0, bufferDataCalls: 0, bufferDataBytes: 0,
  bufferSubDataCalls: 0, bufferSubDataBytes: 0 });
counters = blank();
function wrap(target, name, factory) {
  const original = target[name]; target[name] = factory(original);
  restorers.push(() => { target[name] = original; });
}
for (const name of ['compose', 'multiplyMatrices']) wrap(THREE.Matrix4.prototype, name, original => function(...args) {
  counters[name === 'compose' ? 'compose' : 'multiply']++;
  return original.apply(this, args);
});
const bytes = (source, offset = 0, length = 0) => typeof source === 'number' ? source
  : source ? (length || (source.length ?? source.byteLength) - offset) * (source.BYTES_PER_ELEMENT ?? 1) : 0;
for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    if (!proto[name]) continue;
    wrap(proto, name, original => function(...args) {
      counters.draws++;
      if (args[0] === this.TRIANGLES) counters.triangles +=
        (name.startsWith('drawArrays') ? args[2] : args[1]) / 3 *
        (name.endsWith('Instanced') ? args[name.startsWith('drawArrays') ? 3 : 4] : 1);
      return original.apply(this, args);
    });
  }
  for (const name of ['bufferData', 'bufferSubData']) wrap(proto, name, original => function(...args) {
    counters[`${name}Calls`]++;
    counters[`${name}Bytes`] += name === 'bufferData' ? bytes(args[1], args[3], args[4]) : bytes(args[2], args[3], args[4]);
    return original.apply(this, args);
  });
}
window.__reviewAttach = instance => {
  renderer = instance;
  const render = instance.render;
  instance.render = function(s, c) { scene = s; camera = c; return render.call(this, s, c); };
  const direct = instance.renderBufferDirect;
  instance.renderBufferDirect = function(c, ...args) {
    counters[c === camera ? 'viewDraws' : 'shadowDraws']++;
    return direct.call(this, c, ...args);
  };
  restorers.push(() => { instance.renderBufferDirect = direct; });
  const originalLoop = instance.setAnimationLoop;
  instance.setAnimationLoop = callback => originalLoop.call(instance, callback ? (...args) => {
    counters = blank();
    const start = performance.now();
    callback(...args);
    if (measuring) rows.push({ ...counters, cpuMs: performance.now() - start });
  } : null);
};
// Reproducible bob animation, independent of machine speed.
THREE.Clock.prototype.getElapsedTime = () => tick / 60;
const snapshot = {
  stage: { id: 'fixture', name: 'Performance review', scene: 'nursery' },
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
const game = { renderSnapshot() {
  if (mode === 'moving') {
    tick++;
    snapshot.player.x = 12 + Math.sin(tick / 30) * 3;
    snapshot.player.facing = Math.cos(tick / 30) > 0 ? 'right' : 'left';
    snapshot.player.moving = true;
    snapshot.stations[0].inactive = tick % 120 < 60;
  }
  return snapshot;
} };
const waitFrames = n => new Promise(resolve => {
  const step = () => { if (--n <= 0) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step);
});
function memory() {
  const geometries = new Set(), buffers = new Set(); let nodes = 0;
  scene.traverse(o => { nodes++; if (o.geometry) geometries.add(o.geometry); });
  for (const g of geometries) for (const a of [g.index, ...Object.values(g.attributes)]) {
    if (a) buffers.add((a.isInterleavedBufferAttribute ? a.data.array : a.array).buffer);
  }
  return { nodes, sceneGeometries: geometries.size, geometryArrayBytes: [...buffers].reduce((n,b) => n + b.byteLength, 0),
    renderer: { ...renderer.info.memory }, programs: renderer.info.programs.length,
    buffer: [renderer.domElement.width, renderer.domElement.height], dpr: renderer.getPixelRatio() };
}
window.review = {
  ready: false, snapshot, waitFrames, memory,
  async sample(nextMode, frames = 120, warmup = 30) {
    mode = nextMode; tick = 0; await waitFrames(warmup); rows = []; measuring = true;
    await waitFrames(frames + 1); measuring = false; return rows.slice(0, frames);
  },
  async picture() {
    mode = 'idle'; tick = 0;
    Object.assign(snapshot.player, { x: 12, y: 9, moving: false, facing: 'front' });
    snapshot.stations[0].inactive = false;
    await waitFrames(5);
  },
  async pose(name) {
    mode = 'idle'; snapshot.player.moving = false;
    if (name === 'turn') { snapshot.player.x += 2; snapshot.player.facing = 'left'; }
    if (name === 'bob') { tick = 7; snapshot.player.moving = true; }
    if (name === 'inactive') snapshot.stations[0].inactive = true;
    if (name === 'child') snapshot.player.age = 8;
    if (name === 'remove') snapshot.stations.pop();
    if (name === 'room') snapshot.stage = { id: 'office-check', name: 'Performance review', scene: 'office' };
    if (name === 'hide' || name === 'reveal') scene.children.find(o => o.userData.label === 'Mother').visible = name === 'reveal';
    if (name === 'shadows-toggle') {
      document.querySelector('.plj-3d-quality').click(); await waitFrames(2);
      document.querySelector('.plj-3d-quality').click();
    }
    await waitFrames(8);
  },
  async forceShadows(value) { renderer.shadowMap.autoUpdate = value; await waitFrames(3); },
  async pick() {
    const target = scene.children.find(o => o.userData.label === 'Mother');
    const position = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3()).project(camera);
    const bounds = renderer.domElement.getBoundingClientRect();
    renderer.domElement.dispatchEvent(new PointerEvent('pointermove', {
      clientX: bounds.left + (position.x + 1) * bounds.width / 2,
      clientY: bounds.top + (1 - position.y) * bounds.height / 2,
    }));
    await waitFrames(3);
    return document.querySelector('.plj-3d-inspect').textContent;
  },
  removeCounters() { restorers.splice(0).reverse().forEach(restore => restore()); },
  async pairedTiming(nextMode, control = false) {
    // Reconstitute the original traversal/shadow cadence in this test page only.
    // The mesh/material/camera/data paths are identical in both arms.
    const cached = [];
    scene.traverse(o => { if(Object.hasOwn(o, 'updateMatrixWorld')) cached.push([o,o.updateMatrixWorld]); });
    const select = baseline => {
      for(const [o,method] of cached) o.updateMatrixWorld = baseline ? THREE.Object3D.prototype.updateMatrixWorld : method;
      scene.matrixAutoUpdate = baseline; renderer.shadowMap.autoUpdate = baseline;
      renderer.shadowMap.needsUpdate = true;
    };
    const pairs = [];
    try {
      for(let pair=0;pair<12;pair++) {
        const values = {};
        for(const arm of pair % 2 ? ['B','A'] : ['A','B']) {
          select(!control && arm === 'A');
          const samples = await this.sample(nextMode, 8, 4);
          values[arm] = samples.reduce((n,s)=>n+s.cpuMs,0)/samples.length;
        }
        pairs.push(values);
      }
    } finally { select(false); }
    return pairs;
  },
  async cycle() {
    const result = [];
    for (const [id, kind] of [['office','office'], ['home','home'], ['fixture','nursery']]) {
      snapshot.stage = { id, name: 'Performance review', scene: kind };
      await waitFrames(12); result.push(memory());
    }
    return result;
  },
  async reopen() { close(); close = await open3D(game, () => {}); await waitFrames(30); return memory(); },
  close() { close(); return { ...renderer.info.memory }; },
};
close = await open3D(game, () => {});
await waitFrames(60);
window.review.ready = true;
