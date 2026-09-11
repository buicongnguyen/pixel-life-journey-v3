"""Render transparent item sprites from art/life-art.blend for the Canvas game.
blender --background art/life-art.blend --python scripts/blender-thumbnails.py
"""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'art-icons';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=256
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.7,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,pos,power,size in [('Key',(-3,-4,6),500,4),('Fill',(4,-1,3),260,3),('Rim',(0,4,4),450,3)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=pos
    obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('IconCamera');camera_data.type='ORTHO'
camera=bpy.data.objects.new('IconCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
roots=[o for o in scene.objects if o.name.startswith('asset_') and o.type=='EMPTY']
bpy.context.view_layer.update()
for root in roots:
    if root.name in ['asset_person','asset_woman','asset_child','asset_baby','asset_sofa','asset_desk']:continue
    for o in scene.objects:
        if o.type=='MESH':o.hide_render=o.parent!=root
    vertices=[o.matrix_world@Vector(v) for o in root.children if o.type=='MESH' for v in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
    center=(lo+hi)/2
    camera.location=center+Vector((2.6,-4.4,2.7))
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale=max(hi-lo)*1.42
    scene.render.filepath=str(OUT/(root.name.removeprefix('asset_')+'.png'))
    bpy.ops.render.render(write_still=True)
print('THUMBNAILS_COMPLETE')
