# Performance review — 2026-10-25

The review was completed locally on 2026-10-25 without committing or publishing.
On 2026-10-28, the user authorized committing, pushing, and deploying these changes
through the existing GitHub Pages workflow.
Baseline: `7cfe2e858c4e673c0c0c32e2e3fd940ee49059d1`, including the earlier static-room
batching. This review does not count that earlier optimization as a new saving.

## Method and scope

Used `C:/Users/n/.claude/skills/smooth-dense-scenes/SKILL.md` and its
`references/cpu-and-buffer-optimization.md`. The supplied path omitted the separator
between `n` and `.claude`; the existing installed skill was used. No skill was
installed or changed, and neighboring repositories were not modified.

Installed engine: Three.js **0.186.0**, inspected locally. Its renderer methods are
instance methods, its Object3D supports pivots, and its render-info reset occurs
**before** shadows. Therefore the older skill's blanket warning about render-info
excluding shadows does not apply unchanged here. Measurements count raw WebGL draws
and attribute view/shadow work separately, rather than relying on that assumption.

The application has two renderers: the original Canvas life simulation and an
optional Three.js companion. The latter consumes read-only simulation snapshots;
it does not own gameplay. There are no instanced particle buffers in this renderer.

Measurements used Chromium/ANGLE D3D11 on an NVIDIA RTX 4080 SUPER:

| Configuration | Desktop | Phone-shaped stress test |
| --- | --- | --- |
| CSS viewport | 1440 × 900 | 390 × 844 |
| Device pixel ratio | 1 | 2, capped by game at 1.75 |
| Actual companion drawing buffer | 550 × 430 | 357 × 367 |
| CPU throttling | None | 4× |
| Quality | Original antialiasing, PBR materials, environment, 2048 shadows | Same |

The controlled fixture uses the actual companion renderer and Blender assets,
five stations, a nursery room, and fixed camera. Idle and moving samples each
contain 120 frames after warm-up. Moving samples change position, direction,
avatar bob, and station inactive scaling. A fixed cosmetic clock makes screenshots
repeatable. The original Canvas game was profiled separately in chapter 3, using
a seeded random generator and its real keyboard/pointer handlers. Its simulation
continues normally during that check.

Instrumentation is confined to the test browser. The runner injects an observer
into the served response, handles Vite timestamp query strings, and does not add
a production debug API. It records Matrix4 composition/multiplication, raw draws,
`bufferData` and `bufferSubData` calls/bytes, callback CPU work, CPU samples, and
memory proxies. WebGL2 source offsets/lengths are counted in elements multiplied
by element size. Operation wrappers are removed before the separate 180-frame
moving CPU sample. Initial loading/shader compilation is outside steady-state
samples; zero uploads below does not describe cold loading, uniforms, or textures.

## Findings and reviewed implementation plan

1. **Idle shadows repeated unchanged draw submission.** The baseline spends 46 of
   104 draws on shadows every frame. Keep the shadow texture and redraw it when a
   game-owned caster changes, is created/removed, or the quality toggle changes.
   This preserves shadows rather than lowering their resolution or dropping casters.
2. **Unchanged transforms were rebuilt.** Even a still scene composes 94 matrices
   and performs 185 matrix multiplications per frame. Cache local poses on live,
   game-owned object trees and let Three retain normal world-transform propagation.
   Stop the identity scene root from forcing the entire hierarchy dirty.
3. **Buffer uploads are already selective in practice.** Both baseline idle and
   moving fixtures make zero steady-state `bufferSubData` calls and zero new
   `bufferData` allocations. Movement uses transforms/uniforms, not rewritten vertex
   or instance buffers. Adding dirty upload ranges or instancing infrastructure
   would not remove measured buffer work, so neither was introduced.
4. **The main game's effects are Canvas floating text.** They expire and are drawn
   from their live list; there is no empty GPU particle pool being uploaded. Twenty
   simultaneous short-lived floats expired, and a new effect then appeared and
   moved. There was no evidence warranting a particle-system rewrite, density cut,
   or altered scheduling. Existing effects remain unchanged.
5. **Cleanup omitted explicit shadow-target disposal.** Dispose the directional
   light's shadow targets on close, before disposing/losing the WebGL context.

Logic review before acceptance: do not blanket-freeze descendants; a parent move
must update children. Keep direct `updateMatrix`/`updateWorldMatrix`, picking,
reparenting, scaling, and force updates valid. Do not cache imported rigs, custom
traversal implementations, manual-matrix paths, or pivots. Do not skip simulation
updates, lower visual quality, or change controls. Moving frames retain shadow
updates at their original cadence. Imported GLBs use the conservative per-frame
shadow path, because their hierarchy is not owned by this cache.

Implemented in `src/transform-cache.ts` and `src/view3d.ts`. Pose components use
JavaScript-number precision; the cache wraps only each opted-in object's
`updateMatrixWorld`, restores automatic-update flags in `finally`, and preserves
the original traversal/force behavior. New clones receive their own cache; shared
Blender templates are untouched. Cache lifetime follows the live objects, with no
global registry retaining removed rooms or avatars. Explicit invalidation covers
station removal, room/avatar replacement, and shadow toggle re-enabling.
Code review also added visibility-change invalidation: hiding/revealing a cached
object cannot leave its previous shadow behind simply because its pose is stable.

## Before/after work counts

These are repeatable medians per rendered frame, **not FPS gains**. Desktop and
phone-shaped measurements gave the same operation counts.

| Work per frame | Idle before | Idle after | Moving before | Moving after |
| --- | ---: | ---: | ---: | ---: |
| Raw draws including shadows | 104 | **58** | 104 | 104 |
| View submissions | 58 | 58 | 58 | 58 |
| Shadow submissions | 46 | **0** | 46 | 46 |
| Submitted triangles, all passes | 125,088 | **62,956** | 125,088 | 125,088 |
| Matrix4 compositions | 94 | **8** | 94 | **14** |
| Matrix4 multiplications | 185 | **57** | 185 | **115** |
| `bufferSubData` calls / bytes | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| `bufferData` calls / bytes after warm-up | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Idle draw submissions fall **44.2%**; compositions fall **91.5% idle / 85.1%
moving**; multiplications fall **69.2% idle / 37.8% moving**. Lower submitted idle
triangle work reflects reuse of the shadow map, not removal of model geometry.
Camera changes still render the complete view. The moving scene is intentionally
not reduced to a stationary/frozen case to inflate the result.

## CPU observations and remaining bottlenecks

Top 3D CPU samples are renderer/program setup, draw submission, native work, and
uniform updates. Matrix work is removable waste, but was not the only or dominant
sampled function. Raw vertex-buffer uploads are not a bottleneck in these fixtures.
Native `(program)` samples are not GPU execution time and cannot identify a precise
GPU bottleneck by themselves.

| Observed CPU work, milliseconds | Before median / p95 | Initial optimized run | Final correctness run |
| --- | ---: | ---: | ---: |
| Desktop moving companion callback, operation counters removed | 1.10 / 1.50 | 0.70 / 0.90 | 1.20 / 1.60 |
| Phone-shaped moving companion callback, counters removed | 5.30 / 16.40 | 5.30 / 8.30 | 8.80 / 12.00 |

A second unchanged optimized phone run recorded **4.40 / 8.80 ms**. These divergent
separate-run timings prompted an interleaved regression check rather than selecting
the favorable run. After removing operation wrappers and stopping the CPU profiler,
the fixture alternates original and optimized traversal/shadow behavior in the
**same page**, reversing arm order each pair. It restores ordinary Object3D methods,
automatic identity-root updates, and per-frame shadows for the original arm. Each
of 12 pairs uses four warm-up and eight measured frames per arm, resetting cosmetic
time. A separate 12-pair null control runs the optimized path in both arms.

| Phone-shaped paired mean callback work | A | B | B/A |
| --- | ---: | ---: | ---: |
| Original → optimized, idle | 5.497 ms | 4.766 ms | 0.867 |
| Original → optimized, moving | 5.138 ms | 5.238 ms | 1.019 |
| Optimized → optimized, moving control | 4.766 ms | 4.593 ms | 0.964 |

| Desktop paired mean callback work | A | B | B/A |
| --- | ---: | ---: | ---: |
| Original → optimized, idle | 0.851 ms | 0.718 ms | 0.843 |
| Original → optimized, moving | 0.816 ms | 0.779 ms | 0.955 |
| Optimized → optimized, moving control | 0.815 ms | 0.827 ms | 1.015 |

The moving difference is about **+1.9%**, smaller than the identical-path control's
**3.6%** swing. This check does not substantiate a moving CPU regression or speedup.
Idle callback work is lower in this paired sample, consistent with the removed
shadow submissions. This is still a small desktop-emulated experiment, not evidence
of real-phone FPS, thermal, GPU-time, or battery improvements. **FPS improvements
remain unproven**. Screenshot null controls establish image repeatability separately.
The desktop moving sample is 4.5% lower against a 1.5% identical-path swing; treat
that as a modest observed callback-time reduction in this fixture, not an
end-to-end game FPS claim or a substitute for the inconclusive mobile moving result.

Actual chapter-3 Canvas measurements (unchanged renderer):

| CPU work | Desktop median / p95 | Phone-shaped median / p95 |
| --- | ---: | ---: |
| Simulation update | <0.1 / 0.1 ms | <0.1 / 0.3 ms |
| Canvas render | 1.8 / 2.4 ms | 8.6 / 13.8 ms |

These measurements include timing/profiler overhead and timer quantization. Canvas
character/limb/face/station drawing and native rendering dominate the original
game's sampled work. Its draw list already reuses entries. A future pass could
measure exact static Canvas-layer caching; it must preserve animated people,
doors, and room decorations. It was not mixed into this change without image and
animation evidence. The two renderers can run together, so the controlled companion
fixture alone is not an end-to-end gameplay frame-rate benchmark.

## Memory and lifecycle

The initial scene remains **84 nodes, 42 unique scene geometries, 1,592,856 bytes
of unique geometry-array backing buffers, 8 renderer textures, and 7 programs**,
before and after. There is no geometry duplication from caching. These are
resource/CPU-array measurements, not a claim of exact GPU VRAM use; driver copies,
render targets, texture formats, and transient GPU allocations are not fully
represented by `renderer.info`.

Nursery → office → home → nursery warms additional shared library geometries:
renderer geometry count grows 42 → 46 and stays there for that set. A wider
correctness sequence adds the child avatar and other model variants; three further
room cycles stabilize at **52 geometries, 8 textures**, rather than growing each
cycle. Assets remain shared until the library closes. Closing/reopening returns
the initial scene budget. On final close, geometry count is zero; explicit shadow
disposal reduces the remaining renderer texture counter from **3 to 1** before
context loss. The residual counter is not proof of live VRAM after context loss.

Sampled JS heap after the separate CPU phase was desktop **8.96 → 9.96 MB** and
phone-shaped **9.92 → 10.33 MB**; the repeated optimized phone run was **8.62 MB**.
Final correctness runs sampled **9.24 MB desktop / 10.00 MB phone-shaped**.
These measurements include the page, profiler, fixture, allocations since GC, and
development modules. They do not demonstrate a heap saving or establish an exact
cache cost. Per-object pose metadata adds bounded CPU memory; no memory reduction
is claimed beyond explicit resource disposal. Long-session/device memory remains
a follow-up, not something these short tests prove.

## Correctness, visuals, and code review

- **38 unit tests pass**, including new ordinary-vs-cached transform comparisons
  through movement, rotation, animated children, zero/nonuniform path scaling,
  hidden/revealed children, reparenting, explicit parent-first/forced updates,
  manual matrices, pivots, ray picking, custom traversal exclusion, and exception
  cleanup. Signed zero is treated numerically in matrix comparisons.
- Desktop baseline/optimized screenshots: **0 differing pixels out of 237,050**.
  Phone-shaped baseline/optimized: **0 out of 172,200**, at threshold zero.
  Unchanged-build screenshot controls are also checked separately.
- Cached shadows versus freshly forced shadows: **zero pixel differences** after
  turning/moving, bobbing, inactive-item scaling, child-avatar replacement, station
  removal, room change, hiding/revealing, and shadows off/on. Hover picking still
  identifies Mother. Repeated warmed room cycles enforce stable geometry, texture,
  and program counts; final-close checks enforce zero remaining geometries.
- Original keyboard movement/release and actual CDP touch input movement/release
  pass. Canvas effects expire/reappear/move; opening the companion retains movement
  in the real simulation, and closing it removes its panel.
- Self-contained GLB avatar import succeeds after the scene/lifecycle checks.
  Imported rigs remain outside the transform cache. No new animation support is
  claimed; existing import behavior is preserved.
- Production TypeScript/Vite build passes. Its pre-existing large Three.js chunk
  warning remains; model/texture resolution, lighting, control code, simulation,
  animation cadence, and shipping dependencies were not changed.

The headless development fixture logs Vite HMR WebSocket connection warnings under
Chromium's local-network policy. HTTP modules/assets load and all measured game
checks finish; no game page exceptions were observed. The observer initially
missed Vite's timestamp-suffixed module URL; that harness error was fixed before
accepting after measurements. No samples from failed runs are used above.

## Reproduce locally

Start the development server and let dependency optimization finish:

```powershell
npm run dev -- --host 127.0.0.1 --port 5191 --strictPort
```

In another terminal, point to an available Playwright installation (no runtime
dependency was added to the game):

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/n/source/repos/3D_game_scene/node_modules/playwright/index.mjs'
node scripts/performance/review.mjs local desktop http://127.0.0.1:5191 --verify
node scripts/performance/review.mjs local mobile http://127.0.0.1:5191 --verify
node scripts/performance/review.mjs paired mobile http://127.0.0.1:5191 --timing
node scripts/performance/game-review.mjs desktop
node scripts/performance/game-review.mjs mobile
npm test
npm run build
```

Run profiling browsers sequentially; do not edit loaded source during a sample.
Use the same commands on the baseline source to reproduce before measurements.
`scripts/performance/pixel-diff.mjs` compares saved screenshots at `--threshold 0`.
Raw JSON, CPU profiles, and screenshots are saved under ignored
`logs/performance-review/`, including `baseline-*`, `optimized-*`, `verified-*`,
`final-*`, `paired-*`, and `game-*`. CPU profiles can be opened in Chromium DevTools. The fixtures/scripts
are development-only and are not Vite production entry points.
