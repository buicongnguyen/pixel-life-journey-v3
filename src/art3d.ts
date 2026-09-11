import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type ArtKind = "bottle" | "book" | "apple" | "burger" | "dumbbell" | "bed" | "laptop" | "teddy" | "money" | "plant" | "car" | "person" | "woman" | "child" | "baby" | "salad" | "sofa" | "desk";
export const ART_KINDS: ArtKind[] = ["bottle", "book", "apple", "burger", "dumbbell", "bed", "laptop", "teddy", "money", "plant", "car", "person", "woman", "child", "baby", "salad", "sofa", "desk"];

export function stationArt(st: { id: string; label: string; person?: string; category?: string; harmful: boolean }): ArtKind {
  if (st.person) {
    if (/baby/i.test(st.person)) return "baby";
    if (/child|grandkid|playmate/i.test(st.person)) return "child";
    return /mother|grandma|spouse/i.test(st.person) ? "woman" : "person";
  }
  const text = `${st.id} ${st.label}`.toLowerCase();
  if (/milk|bottle/.test(text)) return "bottle";
  if (/salad|vegg|healthy.*(food|meal|lunch)|diet/.test(text)) return "salad";
  if (/nap|sleep|rest/.test(text)) return "bed";
  if (/car|vehicle|bike|drive|travel|vacation/.test(text)) return "car";
  if (/doll|teddy|rattle|toy|blocks|cuddle/.test(text)) return "teddy";
  if (/gym|exercise|sport|active|walk|fitness/.test(text)) return "dumbbell";
  if (/book|read|study|learn|habit|school|mentor/.test(text)) return "book";
  if (/food|burger|junk|snack|soda|candy|sweet/.test(text)) return st.harmful ? "burger" : "apple";
  if (/garden|plant|nature/.test(text)) return "plant";
  if (/work|career|computer|game|screen|tv|phone|hustle/.test(text)) return "laptop";
  if (/money|stock|invest|lottery|cash|wallet|bonus|property/.test(text)) return "money";
  if (st.category === "food") return st.harmful ? "burger" : "apple";
  if (st.category === "smarts") return "book";
  if (st.category === "wealth") return "money";
  if (st.category === "health") return "dumbbell";
  if (st.category === "rest") return "bed";
  return "plant";
}

export function disposeArt(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments)) return;
    geometries.add(obj.geometry);
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(t => {
    t.dispose();
    if (typeof ImageBitmap !== "undefined" && t.source.data instanceof ImageBitmap) t.source.data.close();
  });
}

/** Clones share immutable meshes/materials; dispose the library only after all instances. */
export async function loadArt() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/life-art.glb`);
  const originals = new Map<ArtKind, THREE.Object3D>();
  for (const key of ART_KINDS) {
    const object = gltf.scene.getObjectByName(`asset_${key}`);
    if (!object) { disposeArt(gltf.scene); throw new Error(`Missing art: ${key}`); }
    originals.set(key, object);
  }
  return {
    create(key: ArtKind, height: number) {
      const root = new THREE.Group();
      const model = originals.get(key)!.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = height / Math.max(size.y, 0.001);
      model.scale.multiplyScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      model.traverse(o => {
        if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      root.add(model); return root;
    },
    dispose() { disposeArt(gltf.scene); },
  };
}

export type ArtLibrary = Awaited<ReturnType<typeof loadArt>>;

/** Original deterministic oak texture with grain and board joints. */
function floorTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a48361"; ctx.fillRect(0, 0, 512, 512);
  for (let board = 0; board < 8; board++) {
    const x = board * 64;
    ctx.fillStyle = `hsl(31 28% ${48 + Math.sin(board * 8) * 5}%)`;
    ctx.fillRect(x + 1, 0, 62, 512);
    for (let j = 0; j < 25; j++) {
      ctx.strokeStyle = `rgba(65,36,17,${0.04 + j % 3 * .02})`;
      ctx.beginPath(); ctx.moveTo(x + j * 2.5, 0);
      ctx.bezierCurveTo(x + j * 2.5 + 8, 130, x + j * 2.5 - 7, 380, x + j * 2.5, 512); ctx.stroke();
    }
    ctx.fillStyle = "#564636";ctx.fillRect(x, (board % 3) * 150 + 45, 64, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2); texture.anisotropy = 4;
  return texture;
}

/** Room dressing stays outside the gameplay paths and has no collision authority. */
export function createRoom(width: number, depth: number, kind: string, art: ArtLibrary) {
  const root = new THREE.Group();
  const owned = new THREE.Group(); root.add(owned);
  const wood = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .72 });
  const plaster = new THREE.MeshStandardMaterial({ color: kind === "office" ? 0x7c9393 : kind === "nursery" ? 0xc9bcb2 : 0xaab5ad, roughness: .94 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe7dcc9, roughness: .5 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x,y,z); mesh.receiveShadow = true; mesh.castShadow = true; owned.add(mesh);return mesh;
  };
  box(width,.16,depth,0,-.10,0,wood);
  box(width,.14,.12,0,.05,-depth/2,trim);
  box(.12,1.6,depth,-width/2,.75,0,plaster);
  box(width,1.6,.12,0,.75,-depth/2,plaster);
  box(.14,.10,depth,-width/2+.06,.04,0,trim);
  // Inset window and mullions on the back wall.
  const glass = new THREE.MeshStandardMaterial({ color: 0xb9d8dc, emissive: 0x92c5ce, emissiveIntensity: .25, roughness: .17, metalness: .15 });
  box(1.65,1.02,.035,0,.92,-depth/2+.075,glass);
  for (const x of [-.88,0,.88]) box(.045,1.12,.07,x,.92,-depth/2+.10,trim);
  for (const y of [.36,.92,1.48]) box(1.8,.045,.07,0,y,-depth/2+.11,trim);
  const rug = new THREE.MeshStandardMaterial({ color: kind === "nursery" ? 0x667d7a : 0x786957, roughness: 1 });
  box(width*.50,.015,depth*.32,.25,0,depth*.17,rug);
  const furniture: THREE.Object3D[] = [];
  const place = (key: ArtKind, height: number, x: number, z: number, rotation = 0) => {
    const model=art.create(key,height);model.position.set(x,0,z);model.rotation.y=rotation;root.add(model);furniture.push(model);return model;
  };
  place("plant",.9,width/2-.5,-depth/2+.65);
  place("plant",.75,-width/2+.55,depth/2-.65);
  if (kind === "nursery" || kind === "home" || kind === "sunset") {
    place(kind === "nursery" ? "bed" : "sofa",.75,-width/2+.85,-depth/2+1.05,Math.PI/2);
  } else {
    place("desk",.72,-width/2+.9,-depth/2+1.0);
    const computer=place("laptop",.32,-width/2+.9,-depth/2+1.0);computer.position.y=.75;
  }
  return { root, dispose() { root.remove(...furniture); disposeArt(owned); } };
}
