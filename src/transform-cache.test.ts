import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector3 } from "three";
import { cacheTransforms } from "./transform-cache";

describe("r186 live transform cache", () => {
  const pair = () => {
    const ordinary = new Group();
    ordinary.add(new Group().add(new Object3D()));
    const cached = ordinary.clone(true);
    cacheTransforms(cached);
    return { ordinary, cached };
  };
  const equal = (a: Object3D, b: Object3D) => {
    a.matrixWorld.elements.forEach((value, i) => expect(value).toBeCloseTo(b.matrixWorld.elements[i], 12));
    a.children.forEach((child, i) => equal(child, b.children[i]));
  };
  it("skips unchanged compositions but preserves moving, turning, scaling and animated children", () => {
    const { ordinary, cached } = pair();
    const compose = vi.spyOn(cached.matrix, "compose");
    ordinary.updateMatrixWorld(); cached.updateMatrixWorld(); compose.mockClear();
    cached.updateMatrixWorld(); expect(compose).not.toHaveBeenCalled();
    for (let frame = 0; frame < 30; frame++) {
      for (const root of [ordinary, cached]) {
        root.position.set(frame * .13, Math.sin(frame), -frame);
        root.rotation.y = frame * .07;
        root.scale.setScalar(frame === 10 ? 0 : .4 + frame / 30);
        root.scale.y *= 1.3; root.scale.z *= .8;
        root.children[0].rotation.z = Math.sin(frame);
        root.children[0].children[0].visible = frame % 2 === 0;
        root.children[0].children[0].position.y = frame * .1;
        root.updateMatrixWorld();
      }
      equal(ordinary, cached);
    }
  });
  it("retains explicit parent-first updates, forced updates and reparenting", () => {
    const { ordinary, cached } = pair();
    for (const root of [ordinary, cached]) {
      root.updateMatrixWorld();
      root.position.x = 3;
      root.children[0].children[0].updateWorldMatrix(true, false);
    }
    equal(ordinary, cached);
    for (const root of [ordinary, cached]) {
      const newParent = new Group(); newParent.position.z = 7;
      newParent.add(root.children[0].children[0]); root.add(newParent);
      root.updateMatrix(); root.updateMatrixWorld(true);
    }
    equal(ordinary, cached);
  });
  it("falls back for manual matrices and pivots, then resumes automatic updates", () => {
    const { ordinary, cached } = pair();
    for (const root of [ordinary, cached]) {
      root.matrixAutoUpdate = false; root.matrix.makeTranslation(3, 4, 5);
      root.matrixWorldNeedsUpdate = true; root.updateMatrixWorld();
    }
    equal(ordinary, cached);
    for (const root of [ordinary, cached]) {
      root.matrixAutoUpdate = true; root.pivot = new Vector3(2, 0, 0);
      root.rotation.y = .7; root.updateMatrixWorld();
    }
    equal(ordinary, cached);
    for (const root of [ordinary, cached]) { root.pivot = null; root.updateMatrixWorld(); }
    equal(ordinary, cached);
  });
  it("keeps picking correct after movement and only invalidates stable shadows when needed", () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const changed = vi.fn(); cacheTransforms(mesh, changed);
    mesh.updateMatrixWorld(); changed.mockClear();
    mesh.updateMatrixWorld(); expect(changed).not.toHaveBeenCalled();
    mesh.visible = false; mesh.updateMatrixWorld(); expect(changed).toHaveBeenCalledOnce();
    mesh.visible = true; mesh.updateMatrixWorld(); expect(changed).toHaveBeenCalledTimes(2);
    changed.mockClear();
    mesh.position.x = 5; mesh.updateMatrixWorld(); expect(changed).toHaveBeenCalledOnce();
    const ray = new Raycaster(new Vector3(5, 0, 5), new Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).not.toHaveLength(0);
    ray.set(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
    mesh.geometry.dispose(); mesh.material.dispose();
  });
  it("does not wrap custom traversal and restores flags when a child throws", () => {
    const custom = new Group(); custom.updateMatrixWorld = vi.fn();
    const original = custom.updateMatrixWorld; cacheTransforms(custom);
    expect(custom.updateMatrixWorld).toBe(original);
    const root = new Group(); cacheTransforms(root); root.updateMatrixWorld();
    const child = new Group(); child.updateMatrixWorld = () => { throw new Error("test"); }; root.add(child);
    expect(() => root.updateMatrixWorld()).toThrow("test");
    expect(root.matrixAutoUpdate).toBe(true);
  });
});
