# 3D rendering review

Reuses Claude's `smooth-dense-scenes` skill, found at
`C:/Users/n/.claude/skills/smooth-dense-scenes/SKILL.md` while reviewing the
neighboring `3D_game_scene` project. The probe and screenshot comparison are
copied here so this project does not depend on that skill remaining installed.
The probe additionally fails on captured page errors or an exceeded optional
`--max-calls` p95 budget. Playwright is a development-only prerequisite.

## Run

Start `npm run dev -- --host 127.0.0.1 --port 5191 --strictPort` and let Vite finish
optimizing dependencies before measurement. In another PowerShell terminal:

```powershell
# Use an existing Playwright installation, or install it in your tooling environment.
$env:PLAYWRIGHT_MODULE = 'C:/Users/n/source/repos/3D_game_scene/node_modules/playwright/index.mjs'
New-Item -ItemType Directory -Force logs/performance | Out-Null
node scripts/performance/profile-3d.mjs http://127.0.0.1:5191/ --frames 120 --max-calls 110 --screenshot logs/performance/after.png --json
node scripts/performance/profile-3d.mjs http://127.0.0.1:5191/ --viewport 390x844 --mobile --throttle 4 --frames 120 --max-calls 110 --json
node scripts/performance/pixel-diff.mjs logs/performance/before.png logs/performance/after.png --threshold 0 --out logs/performance/diff.png --json
```

The fixture uses the real companion renderer, local Blender library, five fixed
stations, a still avatar, and a nursery room. It replaces the page contents only
inside the test browser. It needs the development server's `/src/view3d.ts` route;
it is not a published game page. Run before and after a change, and capture the
same build twice as a screenshot noise control. Do not edit source files during
a run: development-server reloads invalidate the fixture. Pixel-diff reports
numbers, not a pass/fail verdict; inspect differences before accepting them.

## Review checklist

1. Count raw WebGL draws, including shadow passes. Do not assume every Three.js
   version resets `renderer.info` at the same point: this project's r186 resets
   before shadow rendering, unlike the older version discussed in the source skill.
2. Identify repeated work before changing it. Batch exact material matches on
   static opaque geometry. Preserve normals, UVs, PBR parameters, shadow flags,
   interaction ownership, and transforms. Moving characters and transparent
   markers require separate handling; do not merge them into the room.
3. Dispose replaced geometry, but retain shared Blender assets until the library
   is closed. Test resource ownership and scene bounds.
4. Recheck draws, triangles, images, runtime errors, tests, and production build.
   Test other stages and camera angles before extending the batching rules.
5. Report draw-call savings separately from speed. Uncapped headless frame times
   and CPU throttling on a desktop GPU do not establish real-phone FPS. For a
   speed claim, use interleaved baseline/modified runs, same-build controls, and
   real-device testing as described in the original skill.

## Measured change, 2026-10-25

Static room boxes now merge by identical material. Room meshes fall from 13 to 5;
all 156 room triangles remain. Shared furniture, characters, and game logic are
unchanged. Original temporary geometry is disposed after merging; the room owns
the merged resources and materials. Failed merges retain the original surfaces.

| Deterministic desktop fixture | Before | After |
| --- | ---: | ---: |
| Raw draw calls, median and p95 | 120 | 104 |
| Triangles including shadow passes | 125,088 | 125,088 |
| Page errors | 0 | 0 |

This is 16 fewer draws, or 13.3%. Hardware: NVIDIA RTX 4080 SUPER through ANGLE
D3D11, 1440×900 viewport, 550×430 WebGL buffer, antialiasing and shadows enabled.
The unchanged-build control repeated 104 draws and had zero differing pixels.
Before/after at threshold zero: 491 changed pixels, 0.038% of the full screenshot
or 0.208% of the WebGL buffer; largest channel delta 24/255. Small shading changes
are expected from baked float transforms; this is not pixel-identical to baseline.

Phone-shaped run: 390×844, DPR 2 capped by the game, CPU throttle 4, 104 draws,
125,088 triangles, no page errors. It recorded 12/121 frames over 33.4 ms (p95
48.4 ms), so this does **not** establish smooth real-phone performance. No FPS
improvement is claimed. The small scene already falls below the source skill's
200-draw guideline; broader instancing should wait for evidence of a bottleneck.

Validation: 33 tests pass; TypeScript and production build pass. The existing
large Three.js chunk warning remains. Raw captures/results are in ignored
`logs/performance/`, not in the published site.
