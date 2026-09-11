import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Game } from "./engine";

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  textures.forEach(t => { t.dispose(); if (t.source.data instanceof ImageBitmap) t.source.data.close(); });
}

/** A presentation-only companion: all movement and interactions stay in Game. */
export function open3D(game: Game, onClose: () => void) {
  const panel = document.createElement("section");
  panel.className = "plj-3d";
  panel.setAttribute("aria-label", "Live 3D companion");
  panel.innerHTML = `<header><b>Live 3D · prototype</b><button type="button" aria-label="Close 3D view">✕</button></header>
    <div class="plj-3d-scene"></div>
    <p>Play with the original controls. Drag here to orbit; scroll to zoom. Blue: you · purple: people · red: hazards · green: choices.</p>
    <label>Blender avatar (.glb, max 10 MB)<input type="file" accept=".glb" /></label>
    <p class="plj-3d-status" role="status">Local model import. Your file stays on this device.</p>`;
  const viewport = panel.querySelector<HTMLElement>(".plj-3d-scene")!;
  const status = panel.querySelector<HTMLElement>(".plj-3d-status")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x141c30);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  viewport.append(renderer.domElement);
  document.body.append(panel);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 10, 8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 6;
  controls.maxDistance = 30;
  controls.target.set(0, 0, 0);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x4c4e60, 2.5));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(-4, 10, 5);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 1), new THREE.MeshStandardMaterial({ color: 0x465568 }));
  floor.position.y = -0.12;
  scene.add(floor);
  const grid = new THREE.GridHelper(10, 20, 0x74849b, 0x74849b);
  grid.position.y = -0.025;
  scene.add(grid);
  const avatar = new THREE.Group();
  const fallback = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.35, 4, 8), new THREE.MeshStandardMaterial({ color: 0x56b8ff }));
  fallback.position.y = 0.32;
  avatar.add(fallback);
  scene.add(avatar);
  const gate = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5b6678 }));
  gate.position.y = 0.4;
  scene.add(gate);
  const stations = new Map<string, THREE.Mesh>();
  let imported: THREE.Object3D | undefined;
  let closed = false;
  let generation = 0;
  let lastStage = "";
  const resize = new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(viewport);
  renderer.setAnimationLoop(() => {
    if (document.hidden || closed) return;
    const s = game.renderSnapshot();
    const scale = 10 / Math.max(s.width, s.height);
    const place = (obj: THREE.Object3D, x: number, y: number) => {
      obj.position.x = (x - s.width / 2) * scale;
      obj.position.z = (y - s.height / 2) * scale;
    };
    floor.scale.set(s.width * scale, 1, s.height * scale);
    grid.scale.set(s.width * scale / 10, 1, s.height * scale / 10);
    if (s.stage.id !== lastStage) {
      floor.material.color.set(s.stage.theme.floor);
      lastStage = s.stage.id;
    }
    place(avatar, s.player.x, s.player.y);
    place(gate, s.door.x, s.door.y);
    gate.material.color.set(s.door.open ? 0x5dffae : 0x5b6678);
    const active = new Set<string>();
    s.stations.forEach((st, index) => {
      const key = `${st.kind}:${st.id}:${index}`;
      active.add(key);
      let mesh = stations.get(key);
      if (!mesh) {
        mesh = new THREE.Mesh(
          st.kind === "person" ? new THREE.CapsuleGeometry(0.12, 0.28, 4, 8) : new THREE.OctahedronGeometry(0.18),
          new THREE.MeshStandardMaterial({ color: st.harmful ? 0xff6262 : st.kind === "person" ? 0xc99bff : st.kind === "event" ? 0xffd45c : 0x6eeba2 }),
        );
        mesh.position.y = 0.26;
        scene.add(mesh);
        stations.set(key, mesh);
      }
      place(mesh, st.x, st.y);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.transparent = st.inactive;
      material.opacity = st.inactive ? 0.2 : 1;
    });
    for (const [id, mesh] of stations) if (!active.has(id)) {
      scene.remove(mesh); disposeTree(mesh); stations.delete(id);
    }
    renderer.render(scene, camera);
  });
  panel.querySelector<HTMLInputElement>("input")!.onchange = async event => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const token = ++generation;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb") || file.size > 10 * 1024 * 1024) {
      status.textContent = "Choose a self-contained .glb under 10 MB."; return;
    }
    status.textContent = "Loading avatar…";
    let model: THREE.Object3D | undefined;
    try {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => {
        if (/^(blob:|data:)/.test(url)) return url;
        throw new Error("External resources are unsupported. Embed textures in the GLB.");
      });
      const gltf = await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), "");
      model = gltf.scene;
      if (closed || token !== generation) { disposeTree(model); return; }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(longest) || longest <= 0) throw new Error("Model has no visible geometry.");
      const center = box.getCenter(new THREE.Vector3());
      const factor = 0.8 / longest;
      model.scale.multiplyScalar(factor);
      model.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
      if (imported) { avatar.remove(imported); disposeTree(imported); }
      imported = model;
      avatar.add(model);
      fallback.visible = false;
      status.textContent = `${file.name} loaded. Move in the game to see your avatar.`;
    } catch (error) {
      if (model) disposeTree(model);
      if (!closed && token === generation) status.textContent = error instanceof Error ? error.message : "Unable to load this GLB.";
    }
  };
  const close = () => {
    if (closed) return;
    closed = true; generation++;
    renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose();
    disposeTree(scene); grid.geometry.dispose();
    for (const m of Array.isArray(grid.material) ? grid.material : [grid.material]) m.dispose();
    renderer.dispose(); renderer.forceContextLoss(); panel.remove(); onClose();
  };
  panel.querySelector<HTMLButtonElement>("button")!.onclick = close;
  renderer.domElement.addEventListener("webglcontextlost", event => {
    event.preventDefault(); close();
  });
  return close;
}
