// Self-contained static GLB sample for browser import regression checks.
import { mkdirSync, writeFileSync } from "node:fs";
const positions = new Float32Array([-0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5]);
const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
const doc = {
  asset: { version: "2.0", generator: "Pixel Life sample fixture" }, scene: 0,
  scenes: [{ nodes: [0,1,2,3] }],
  nodes: [
    { mesh: 0, translation: [0,0.95,0], scale: [0.6,0.7,0.35] },
    { mesh: 1, translation: [0,1.55,0], scale: [0.45,0.45,0.45] },
    { mesh: 0, translation: [-0.18,0.3,0], scale: [0.23,0.6,0.3] },
    { mesh: 0, translation: [0.18,0.3,0], scale: [0.23,0.6,0.3] },
  ],
  meshes: [0,1].map(material => ({ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material }] })),
  materials: [[0.12,0.48,0.9,1],[0.78,0.55,0.35,1]].map(baseColorFactor => ({ pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 0.8 } })),
  buffers: [{ byteLength: bin.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] }, { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }],
};
const json = Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(JSON.stringify(doc).length / 4) * 4));
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
const chunk = (data, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
mkdirSync(new URL("../public/models/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/models/sample-avatar.glb", import.meta.url), Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]));
