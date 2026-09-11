# Blender artwork and rendering

The game now ships actual Blender 4.5 LTS artwork rather than capsule/diamond
placeholders. **Live 3D** automatically loads 18 original models: bottle, book,
apple, salad, burger, dumbbell, bed, laptop, teddy, money, plant, car, three older
character variants, baby, sofa and desk. The library includes beveled edges,
surface normals, embedded wood/fabric/leather/bread textures and PBR materials.

The Canvas game also uses transparent Blender Cycles renders for supported item
icons, with the original emoji as a loading/error fallback. These load as needed;
the Canvas game does not load Three.js or the 3D model library.

## Edit and rebuild

- Open `art/life-art.blend` to edit the source models and materials. Each asset is
  an Empty named `asset_<kind>` with child meshes. Keep those names when exporting.
- `public/models/life-art.glb` is the self-contained runtime library (~3.8 MB).
- `public/art-icons/` holds the 256px transparent PNG sprites (~0.6 MB total).
- `public/models/blender-avatar.glb` is a standalone detailed avatar (~0.3 MB).

Rebuild the original generated artwork (overwrites generated art; preserve any
manual edits separately first):

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/blender-assets.py
blender --background art/life-art.blend --python-exit-code 1 --python scripts/blender-thumbnails.py
blender --background --factory-startup --python-exit-code 1 --python scripts/blender-avatar.py
npm test
npm run build
```

All three Blender commands were executed successfully for this release. The GLB
is uncompressed and needs no external decoder or asset service. Library instances
share geometry/textures; those resources are released when the 3D view closes.

## In the game

- Open **Live 3D**, drag to orbit, or scroll to inspect a prop up close. Hover a
  prop to identify it. Expand the view or choose **Follow player** for a closer look.
- Soft shadows can be disabled on slower hardware. The renderer caps pixel ratio.
- Continue using the game's movement/interaction controls. The 3D camera never
  changes simulation positions, collisions, money, age or choice rules.
- To import another avatar, expand **Use your own Blender avatar** and select a
  self-contained GLB under 10 MB. Embed textures; avoid Draco/Meshopt compression.
  Imported models are fitted to the scene and cast/receive shadows. Files stay local.

## Visual scope

This release targets a polished, stylized miniature world: recognizable shapes,
coherent materials, furnished rooms, warm/cool lighting, reflections and contact
shadows. It is not photorealistic AAA art. Scanned textures, production character
sculpting/rigging, facial animation, motion capture, detailed outdoor environments,
and platform-specific LOD/performance work remain a larger art-production phase.
The existing 2D characters and backgrounds retain their established style.

Sources: [Blender 4.5 LTS](https://www.blender.org/releases/4-5/),
[Blender glTF export](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html),
[Three.js image-based lighting](https://threejs.org/docs/pages/RoomEnvironment.html).
