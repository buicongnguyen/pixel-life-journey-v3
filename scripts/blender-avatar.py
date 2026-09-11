"""Run in a fresh Blender session: blender --background --python scripts/blender-avatar.py

Creates a small static avatar and exports a self-contained GLB for Live 3D.
Only objects created by this script are exported. Existing scenes are preserved.
"""
import bpy
from pathlib import Path

output = Path(__file__).resolve().parents[1] / "public" / "models"
output.mkdir(parents=True, exist_ok=True)
created = []

def part(name, location, scale, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    material = bpy.data.materials.new(name + "Material")
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*color, 1)
    obj.data.materials.append(material)
    created.append(obj)

part("Body", (0, 0, 0.95), (0.55, 0.3, 0.6), (0.15, 0.5, 0.85))
part("Head", (0, 0, 1.5), (0.44, 0.4, 0.44), (0.8, 0.57, 0.4))
for side in [-1, 1]:
    part("Leg", (side * 0.15, 0, 0.3), (0.22, 0.26, 0.6), (0.14, 0.2, 0.32))
    part("Arm", (side * 0.38, 0, 0.93), (0.18, 0.24, 0.57), (0.15, 0.5, 0.85))
bpy.ops.object.select_all(action="DESELECT")
for obj in created:
    obj.select_set(True)
bpy.context.view_layer.objects.active = created[0]
bpy.ops.export_scene.gltf(filepath=str(output / "blender-avatar.glb"), export_format="GLB", use_selection=True)
print("Exported", output / "blender-avatar.glb")
