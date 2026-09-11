"""Export the detailed library character as a standalone importable avatar.
Run in a fresh Blender session; loads art/life-art.blend as the source document.
blender --background --factory-startup --python scripts/blender-avatar.py
"""
import bpy
from pathlib import Path
import runpy
root=Path(__file__).resolve().parents[1]
source=root/'art'/'life-art.blend'
if not source.exists():runpy.run_path(str(root/'scripts'/'blender-assets.py'))
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.ops.object.select_all(action='DESELECT')
avatar=bpy.data.objects['asset_person']
avatar.select_set(True)
for obj in avatar.children_recursive:obj.select_set(True)
bpy.context.view_layer.objects.active=avatar
output=root/'public'/'models'/'blender-avatar.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True)
print('Exported',output)
