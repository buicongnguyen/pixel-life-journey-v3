import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ART_KINDS, stationArt } from "./art3d";

const bytes = readFileSync(new URL("../public/models/life-art.glb", import.meta.url));
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));

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
