import { Object3D } from "three";

/** Opt in only live, ordinary object trees owned by the companion view (Three r186).
 * Keep Three's parent propagation and explicit matrix-update APIs unchanged.
 * Cameras, imported rigs, pivots and custom update implementations use Three's path.
 */
export function cacheTransforms(root: Object3D, onChange: () => void = () => {}) {
  root.traverse(object => {
    if (object.updateMatrixWorld !== Object3D.prototype.updateMatrixWorld) return;
    const update = object.updateMatrixWorld;
    const pose: number[] = [];
    let valid = false, parent = object.parent, visible = object.visible;
    object.updateMatrixWorld = function(force?: boolean) {
      if (visible !== this.visible) { visible = this.visible; onChange(); }
      if (!this.matrixAutoUpdate || !this.matrixWorldAutoUpdate || this.pivot !== null) {
        valid = false;
        onChange();
        return update.call(this, force);
      }
      const p = this.position, q = this.quaternion, s = this.scale;
      const changed = !valid || parent !== this.parent ||
        p.x !== pose[0] || p.y !== pose[1] || p.z !== pose[2] ||
        q.x !== pose[3] || q.y !== pose[4] || q.z !== pose[5] || q.w !== pose[6] ||
        s.x !== pose[7] || s.y !== pose[8] || s.z !== pose[9];
      if (changed) {
        pose[0] = p.x; pose[1] = p.y; pose[2] = p.z;
        pose[3] = q.x; pose[4] = q.y; pose[5] = q.z; pose[6] = q.w;
        pose[7] = s.x; pose[8] = s.y; pose[9] = s.z;
        parent = this.parent; valid = true; onChange();
      } else if (this.matrixWorldNeedsUpdate || force) {
        // Explicit local updates and externally forced parent updates may affect shadows.
        onChange();
      }
      this.matrixAutoUpdate = changed;
      try { update.call(this, force); }
      finally { this.matrixAutoUpdate = true; }
    };
  });
}
