"""Build the game's original art library. Blender 4.5 LTS, background mode.

blender --background --factory-startup --python scripts/blender-assets.py
Outputs an editable .blend and self-contained GLB. All art is generated locally.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector

random.seed(19)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
M = {}
def material(name, color, rough=.45, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    M[name] = m
    return m

for spec in [
    ('porcelain',(.91,.88,.8),.23,0), ('milk',(.93,.91,.78),.3,0),
    ('silicone',(.82,.63,.4),.4,0), ('blue',(.045,.26,.38),.3,0),
    ('red',(.45,.035,.018),.33,0), ('green',(.10,.27,.065),.65,0),
    ('leaf',(.24,.42,.07),.75,0), ('wood',(.28,.135,.055),.62,0),
    ('leather',(.13,.055,.025),.6,0), ('paper',(.85,.81,.66),.8,0),
    ('steel',(.48,.52,.55),.23,.9), ('rubber',(.018,.024,.03),.86,0),
    ('gold',(.65,.39,.09),.25,.8), ('cloth',(.22,.36,.38),.95,0),
    ('cream',(.70,.63,.47),.85,0), ('skin',(.57,.32,.19),.63,0),
    ('hair',(.045,.023,.016),.83,0), ('eyes',(.008,.014,.019),.24,0),
    ('bun',(.64,.29,.065),.72,0), ('meat',(.14,.048,.021),.84,0),
    ('cheese',(.95,.50,.045),.4,0), ('screen',(.035,.15,.20),.2,.3),
    ('terracotta',(.45,.19,.10),.9,0), ('pink',(.50,.24,.23),.9,0),
]: material(*spec)

# Exported image textures, rather than Blender-only procedural nodes.
import numpy as np
for name, kind in [('wood','wood'), ('cloth','cloth'), ('leather','leather'), ('bun','bun')]:
    n=256
    yy,xx=np.mgrid[0:n,0:n]
    rng=np.random.default_rng(11)
    noise=rng.random((n,n))
    if kind=='wood': value=.80+.10*np.sin(xx*.55+np.sin(yy*.035)*3)+noise*.1
    elif kind=='cloth': value=.83+((xx%3==0)|(yy%3==0))*.1+noise*.07
    elif kind=='bun': value=.70+noise*.30
    else: value=.82+noise*.18
    color=np.array(M[name].diffuse_color[:3])
    pixels=np.ones((n,n,4),dtype=np.float32)
    pixels[:,:,:3]=value[:,:,None]*color
    image=bpy.data.images.new(name+'Surface',width=n,height=n)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    tex=M[name].node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
    M[name].node_tree.links.new(tex.outputs['Color'],M[name].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

current=None
parts=[]
def begin(name):
    global current,parts
    current=bpy.data.objects.new('asset_'+name,None)
    bpy.context.collection.objects.link(current)
    parts=[]
def finish():
    # Join by material to keep browser draw calls bounded while retaining UVs.
    groups={}
    for o in parts: groups.setdefault(o.data.materials[0].name,[]).append(o)
    for material_name,group in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group: o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        group[0].name=current.name+'_'+material_name
    current['source']='Original Blender procedural art'
def attach(obj,mat):
    obj.data.materials.append(M[mat]); obj.parent=current; parts.append(obj)
    return obj
def cube(loc,size,mat,bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Soft manufactured edges','BEVEL'); b.width=bevel; b.segments=3
        bpy.ops.object.modifier_apply(modifier=b.name)
        b=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=b.name)
    return attach(o,mat)
def sphere(loc,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc)
    o=bpy.context.object; o.scale=size
    for p in o.data.polygons:p.use_smooth=True
    return attach(o,mat)
def cylinder(loc,r,depth,mat,top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=top if top is not None else r,depth=depth,location=loc)
    o=bpy.context.object
    bevel=o.modifiers.new('Rim bevel','BEVEL');bevel.width=min(.015,r*.15);bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for p in o.data.polygons:p.use_smooth=True
    return attach(o,mat)
def rod(a,b,r,mat):
    a,b=Vector(a),Vector(b); o=cylinder((a+b)/2,r,(b-a).length,mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def torus(loc,r,t,mat,rot=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=32,minor_segments=10,location=loc)
    o=bpy.context.object
    if rot:o.rotation_euler=rot
    for p in o.data.polygons:p.use_smooth=True
    return attach(o,mat)

begin('bottle')
cylinder((0,0,.32),.16,.59,'porcelain',.145)
cylinder((0,0,.63),.165,.10,'blue')
for z in [.605,.63,.655]:torus((0,0,z),.16,.009,'blue')
sphere((0,0,.72),(.095,.095,.10),'silicone')
cylinder((0,0,.80),.036,.07,'silicone',.023)
for i in range(6):cube((.025,-.158,.15+i*.06),(.09 if i%2==0 else .055,.008,.008),'blue',.002)
finish()

begin('book')
cube((0,0,.12),(.54,.40,.18),'paper',.012)
for z in [.025,.215]:cube((0,0,z),(.58,.44,.025),'leather',.012)
cube((-.278,0,.12),(.035,.44,.21),'leather',.016)
for z in [.075,.13,.18]:cube((.015,-.201,z),(.51,.004,.002),'cream',0)
cube((.04,0,.233),(.30,.018,.006),'gold',.002)
cube((.04,-.06,.233),(.22,.01,.006),'gold',.002)
finish()

begin('apple')
for x in [-.09,.09]:sphere((x,0,.23),(.18,.21,.22),'red')
rod((0,0,.40),(.035,0,.55),.018,'wood')
o=sphere((.11,0,.49),(.115,.046,.015),'leaf');o.rotation_euler.y=-.3
finish()

begin('burger')
cylinder((0,0,.045),.34,.04,'porcelain')
sphere((0,0,.14),(.26,.26,.09),'bun')
cylinder((0,0,.23),.265,.07,'meat')
cube((0,0,.28),(.49,.47,.022),'cheese',.01)
for i in range(9):
    a=i*math.tau/9;sphere((math.cos(a)*.20,math.sin(a)*.20,.32),(.12,.1,.028),'leaf')
sphere((0,0,.42),(.27,.27,.13),'bun')
for i in range(22):
    a=random.random()*math.tau;r=random.random()*.20
    sphere((math.cos(a)*r,math.sin(a)*r,.427+.13*math.sqrt(1-(r/.27)**2)),(.009,.021,.006),'paper')
finish()

begin('dumbbell')
rod((-.35,0,.19),(.35,0,.19),.045,'steel')
for x in [-.29,-.22,.22,.29]:
    o=cylinder((x,0,.19),.18,.065,'rubber');o.rotation_euler.y=math.pi/2
for x in [-.35,.35]:
    o=cylinder((x,0,.19),.072,.03,'steel');o.rotation_euler.y=math.pi/2
for x in [-.1,-.06,-.02,.02,.06,.1]:
    o=torus((x,0,.19),.046,.003,'rubber',(0,math.pi/2,0))
finish()

begin('bed')
cube((0,0,.24),(.86,1.22,.16),'wood')
cube((0,0,.38),(.82,1.16,.20),'cream',.08)
cube((0,.16,.50),(.84,.80,.08),'cloth',.045)
for x in [-.19,.19]:cube((x,-.39,.53),(.35,.26,.13),'porcelain',.08)
cube((0,-.63,.54),(.92,.08,.72),'wood',.05)
for x in [-.35,.35]:
    for y in [-.5,.5]:cylinder((x,y,.12),.045,.22,'wood')
finish()

begin('laptop')
cube((0,0,.045),(.64,.44,.055),'steel',.02)
cube((0,-.035,.077),(.25,.13,.006),'rubber',.012)
for row in range(4):
    for col in range(10):cube((-.255+col*.057,.03+row*.045,.08),(.042,.033,.008),'rubber',.004)
screen=cube((0,.215,.30),(.65,.028,.46),'rubber',.022)
cube((0,.195,.30),(.60,.009,.405),'screen',.01)
for i in range(5):cube((-.09,.188,.41-i*.05),(.30-i*.027,.003,.013),'blue',.002)
finish()

begin('teddy')
sphere((0,0,.26),(.19,.14,.23),'leather')
sphere((0,0,.56),(.22,.17,.21),'leather')
for side in [-1,1]:
    sphere((side*.18,0,.73),(.085,.06,.09),'leather')
    sphere((side*.11,-.06,.10),(.1,.15,.09),'leather')
    sphere((side*.22,0,.32),(.09,.08,.16),'leather')
    sphere((side*.075,-.163,.59),(.024,.017,.029),'eyes')
sphere((0,-.16,.49),(.10,.064,.073),'cream')
sphere((0,-.216,.52),(.033,.02,.021),'eyes')
cube((0,-.13,.37),(.18,.045,.05),'blue',.02)
finish()

begin('money')
for i in range(3):
    cube((0,0,.035+i*.075),(.52,.26,.06),'paper',.01)
    cube((0,0,.071+i*.075),(.12,.265,.012),'green',.002)
for x,y in [(.3,-.1),(.27,.1),(-.25,.15)]:
    for z in [.025,.06,.095]:cylinder((x,y,z),.09,.028,'gold')
finish()

begin('plant')
cylinder((0,0,.19),.16,.36,'terracotta',.23)
torus((0,0,.36),.22,.023,'terracotta')
cylinder((0,0,.345),.2,.018,'wood')
for i in range(8):
    a=i*2.4;h=.55+(i%3)*.14
    end=(math.cos(a)*.22,math.sin(a)*.22,h)
    rod((0,0,.35),end,.014,'green')
    o=sphere(end,(.10,.045,.21),'leaf');o.rotation_euler=(.5*math.cos(a),.5*math.sin(a),a)
finish()

begin('car')
cube((0,0,.22),(.52,.93,.22),'blue',.10)
cube((0,-.05,.39),(.44,.46,.23),'blue',.075)
cube((0,-.245,.42),(.36,.022,.14),'screen',.025)
cube((0,.18,.43),(.35,.024,.14),'screen',.025)
for side in [-1,1]:
    cube((side*.226,-.035,.43),(.015,.31,.12),'screen',.02)
    for y in [-.30,.30]:
        o=cylinder((side*.265,y,.16),.115,.07,'rubber');o.rotation_euler.y=math.pi/2
        o=cylinder((side*.305,y,.16),.060,.012,'steel');o.rotation_euler.y=math.pi/2
    cube((side*.16,-.462,.24),(.115,.025,.055),'porcelain',.012)
    cube((side*.16,.462,.24),(.105,.024,.05),'red',.012)
finish()

for name,shirt in [('person','blue'),('woman','pink'),('child','cloth')]:
    begin(name)
    sphere((0,0,.96),(.23,.125,.31),shirt)
    cylinder((0,0,1.22),.065,.13,'skin')
    sphere((0,0,1.44),(.15,.135,.21),'skin')
    sphere((0,.015,1.56),(.157,.138,.115),'hair')
    for side in [-1,1]:
        sphere((side*.15,0,1.44),(.032,.038,.06),'skin')
        sphere((side*.052,-.125,1.47),(.031,.012,.018),'porcelain')
        sphere((side*.052,-.138,1.47),(.012,.007,.013),'eyes')
        rod((side*.12,0,.78),(side*.13,0,.19),.083,'rubber')
        cube((side*.13,-.05,.10),(.17,.29,.13),'leather',.05)
        rod((side*.23,0,1.12),(side*.30,-.025,.73),.062,shirt)
        sphere((side*.31,-.025,.68),(.052,.045,.085),'skin')
    sphere((0,-.14,1.40),(.032,.04,.04),'skin')
    cube((0,-.123,1.345),(.065,.011,.01),'leather',.004)
    if name=='woman':
        sphere((0,.09,1.39),(.16,.10,.24),'hair')
        cylinder((0,0,.70),.24,.38,'pink',.16)
    if name=='child':current.scale=(.68,.68,.68)
    finish()

begin('sofa')
cube((0,0,.30),(1.35,.65,.35),'cloth',.10)
cube((0,.26,.63),(1.36,.18,.55),'cloth',.09)
for x in [-.62,.62]:cube((x,0,.51),(.16,.64,.32),'cloth',.07)
for x in [-.29,.29]:cube((x,-.06,.51),(.54,.49,.13),'cloth',.06)
for x in [-.50,.50]:
    for y in [-.22,.22]:cylinder((x,y,.10),.035,.18,'wood')
finish()

begin('desk')
cube((0,0,.75),(1.15,.60,.075),'wood',.025)
for x in [-.5,.5]:
    for y in [-.23,.23]:rod((x,y,.04),(x,y,.72),.034,'steel')
cube((.30,0,.62),(.37,.48,.18),'wood',.018)
cube((.30,-.253,.62),(.14,.022,.018),'steel',.005)
finish()

begin('salad')
cylinder((0,0,.035),.29,.055,'porcelain',.33)
torus((0,0,.07),.30,.018,'porcelain')
for i in range(16):
    a=i*2.4;r=.08+(i%3)*.055
    o=sphere((math.cos(a)*r,math.sin(a)*r,.09+(i%2)*.04),(.11,.065,.028),'leaf');o.rotation_euler.z=a
for a in [0,1.9,3.8]:sphere((math.cos(a)*.13,math.sin(a)*.13,.16),(.055,.055,.05),'red')
finish()

begin('baby')
sphere((0,0,.25),(.17,.13,.22),'cream')
sphere((0,-.035,.55),(.18,.16,.19),'skin')
for side in [-1,1]:
    sphere((side*.18,0,.55),(.027,.035,.046),'skin')
    sphere((side*.065,-.18,.58),(.025,.012,.023),'eyes')
    sphere((side*.18,-.035,.28),(.067,.07,.12),'cream')
    sphere((side*.20,-.05,.18),(.055,.048,.055),'skin')
    sphere((side*.10,-.065,.08),(.073,.10,.065),'cream')
sphere((0,-.19,.51),(.027,.03,.027),'skin')
torus((0,-.193,.46),.031,.009,'blue',(math.pi/2,0,0))
finish()

# Library-only source file; runtime arranges assets in the current life chapter.
bpy.context.preferences.filepaths.save_version=0
(ROOT/'art').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art'/'life-art.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'life-art.glb'),export_format='GLB',export_apply=True)
print('LIFE_ART_COMPLETE',OUT/'life-art.glb')
