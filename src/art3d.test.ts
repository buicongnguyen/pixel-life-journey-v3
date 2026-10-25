import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { readFileSync, readdirSync } from "node:fs";
import { ART_KINDS, stationArt, createRoom } from "./art3d";

const bytes = readFileSync(new URL("../public/models/life-art.glb", import.meta.url));
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));

describe("static room batching", () => {
  it("keeps all surfaces and materials while reducing meshes and disposing only owned assets", () => {
    const context = { fillRect() {}, beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() {} };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
    const sharedGeometry = new THREE.BoxGeometry();
    const sharedMaterial = new THREE.MeshStandardMaterial();
    const sharedDispose = vi.spyOn(sharedGeometry, "dispose");
    const sharedMaterialDispose = vi.spyOn(sharedMaterial, "dispose");
    try {
      const room = createRoom(10, 6, "nursery", {
        create: () => new THREE.Group().add(new THREE.Mesh(sharedGeometry, sharedMaterial)),
        dispose() {},
      });
      const surfaces = room.root.children[0].children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
      expect(surfaces).toHaveLength(5);
      expect(surfaces.reduce((n, mesh) => n + mesh.geometry.index!.count / 3, 0)).toBe(13 * 12);
      expect(new Set(surfaces.map(mesh => mesh.material)).size).toBe(5);
      for (const mesh of surfaces) {
        expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
        expect(mesh.geometry.getAttribute("normal").count).toBe(mesh.geometry.getAttribute("position").count);
        expect(mesh.geometry.getAttribute("uv").count).toBe(mesh.geometry.getAttribute("position").count);
      }
      const bounds = new THREE.Box3().setFromObject(room.root.children[0]);
      expect(bounds.min.x).toBeCloseTo(-5.06);
      expect(bounds.max.x).toBeCloseTo(5);
      expect(bounds.min.y).toBeCloseTo(-.18);
      expect(bounds.max.y).toBeCloseTo(1.55);
      const ownedDisposals = surfaces.flatMap(mesh => [vi.spyOn(mesh.geometry, "dispose"), vi.spyOn(mesh.material, "dispose")]);
      const textureDispose = vi.spyOn(surfaces.find(mesh => mesh.material.map)!.material.map!, "dispose");
      room.dispose();
      ownedDisposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
      expect(textureDispose).toHaveBeenCalledOnce();
      expect(sharedDispose).not.toHaveBeenCalled();
      expect(sharedMaterialDispose).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      sharedGeometry.dispose(); sharedMaterial.dispose();
    }
  });
});

describe("shipped Blender artwork", () => {
  it("is a valid sized GLB with every required named asset", () => {
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    const names = new Set(json.nodes.map((node: { name: string }) => node.name));
    for (const key of ART_KINDS) expect(names.has(`asset_${key}`)).toBe(true);
  });
  it("embeds textures and buffers so deployment needs no external art service", () => {
    expect(json.images.length).toBeGreaterThanOrEqual(4);
    for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined();
    for (const image of json.images) {
      expect(image.uri).toBeUndefined();
      expect(Number.isInteger(image.bufferView)).toBe(true);
    }
  });
  it("includes surface normals and limits total library geometry", () => {
    let triangles = 0;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      expect(primitive.attributes.NORMAL).toBeDefined();
      triangles += json.accessors[primitive.indices].count / 3;
    }
    expect(triangles).toBeGreaterThan(10000);
    expect(triangles).toBeLessThan(150000);
  });
  it("ships transparent PNG sprites for the default Canvas renderer", () => {
    const files = readdirSync(new URL("../public/art-icons/", import.meta.url));
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const name of files) {
      const png = readFileSync(new URL(`../public/art-icons/${name}`, import.meta.url));
      expect(png.readUInt32BE(16)).toBe(256);
      expect(png.readUInt32BE(20)).toBe(256);
      expect(png[25]).toBe(6); // RGBA: no opaque thumbnail backgrounds
    }
  });
});

describe("recognizable item selection", () => {
  it.each([
    ["milk", "Milk", "bottle"], ["nap", "Nap", "bed"],
    ["books", "Story books", "book"], ["gym", "Gym", "dumbbell"],
    ["diet", "Healthy diet", "salad"], ["junk", "Desk fast food", "burger"],
    ["toycar", "Toy car", "car"],
  ])("maps %s to its actual object", (id, label, expected) => {
    expect(stationArt({ id, label, harmful: id === "junk" })).toBe(expected);
  });
  it("keeps people as people even when their label describes another activity", () => {
    expect(stationArt({ id: "gymBuddy", label: "Gym buddy", person: "gymBuddy", harmful: false })).toBe("person");
    expect(stationArt({ id: "baby", label: "Baby", person: "baby", harmful: false })).toBe("baby");
  });
});
