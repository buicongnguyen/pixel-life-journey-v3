# Blender workflow

Open **Live 3D** in the game HUD. This optional view shows the same player and
station positions as the game, with orbit/zoom controls. Keep using the original
game controls to move and interact. Closing it releases its WebGL resources.

## Make an avatar

1. Start a fresh Blender scene. Model a low-poly character with feet at Z=0.
2. Use Principled BSDF materials. Apply object rotation and scale. Keep the mesh
   below roughly 10,000 triangles and textures at 1024px or smaller for this prototype.
3. Select the avatar objects, then File → Export → glTF 2.0. Choose **GLB**, Selected
   Objects, and embed textures. Avoid Draco/Meshopt compression for this importer.
4. Open the file input in Live 3D and select the exported file (under 10 MB).
   The importer centers the model and fits its largest dimension to 0.8 scene units.
   Files stay local; external image/buffer URLs are rejected.
5. Move in the game: the imported avatar follows the authoritative player position.

For a repeatable starter asset, run from the repository root:

```sh
blender --background --python scripts/blender-avatar.py
```

The script exports `public/models/blender-avatar.glb`. Blender is not required to
play; the procedural avatar works without any model. This release displays static
meshes; animation clips, age-specific rigs, authored rooms and a full 3D control
scheme are future work. Importing a model does not change collision geometry.

A tiny generated [sample avatar](public/models/sample-avatar.glb) is included for
testing the importer without Blender. It can be reproduced with
`node scripts/generate-avatar-fixture.mjs`.

Reference: [Blender glTF export manual](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)
and [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).
