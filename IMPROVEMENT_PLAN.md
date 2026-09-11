# Evaluation, implementation plan and review

## Evaluation (11 September 2026)

The existing game has twelve continuous stages, an unusually rich economy, family
relationships, biography replay, training and rewind. Its strongest feature is the
connection between choices and the final story. Its main weaknesses are a very large
engine, opaque goals, conflicting stat descriptions and a renderer coupled to state.
The working tree already contains biography validation, rewind, late-start and family
visibility fixes; preserve these and include them in regression validation.

## Release scope and acceptance criteria

1. **Correctness:** unify direct health limits with the 120-point composite meter;
   make the weight label agree with the band that applies penalties; replace the
   collision-prone arithmetic HUD cache with explicit values. Test boundaries.
2. **Interesting play:** add a visible chapter challenge for varied positive choices.
   Progress comes from recorded history, never frame counts or paid rewards. Three
   distinct beneficial choices earn a chapter badge; repeated actions cannot farm it.
   Show progress and the next growth age. Rewind naturally restores badge progress.
   Biography mode uses its authored moments, without imposing game challenges.
3. **3D/Blender:** add a lazy-loaded live 3D diorama with player, people, hazards and
   chapter gate driven by a read-only render snapshot of the existing engine. Keep
   the original controls and game visible. This is a playable companion view, not a
   replacement physics engine or a finished 3D art conversion. Import a local,
   self-contained Blender GLB as the avatar; provide a repeatable Blender asset script.
   Close/unavailable WebGL must leave the game usable; release GPU resources on close.
4. **Review:** run tests, TypeScript and production build; inspect browser gameplay,
   goals, 3D startup/close and GLB error recovery. Review import lifetime, missing
   objects, rewind and progression for regressions. Fix findings before publishing.
5. **Delivery:** use the existing SSH origin and the same Actions Pages deployment
   pattern as sibling v4. Add tests before build in CI. Commit reviewed changes,
   push main, and check the exact commit's workflow and published assets.

## Logic review before implementation

- Keep simulation authoritative: the 3D renderer receives positions and cannot
  change money, collisions, choices or age. This avoids divergent 2D/3D rules.
- Derive challenges from history and stage content. No new snapshot state or bonus
  money means no rewind reward duplication or economic inflation.
- Exclude negative-effect choices and picker-only options from challenges; target
  at most the number of eligible choices so a small chapter remains achievable.
- GLB loads are asynchronous: reject stale results after close or a newer import;
  reject external resources and dispose replaced models and textures.
- Current documentation overstates scientific accuracy. Describe the longevity,
  cognition and weight mechanics as fictional balance rules, not predictions.
- Scope the art upgrade honestly: authored scenes, animated age-specific rigs,
  camera-relative movement and mobile performance profiling belong to a later full
  3D conversion, after this shared-state prototype proves useful.

## Next iterations

1. Extract action transactions and time advancement into a DOM-free simulation;
   test full seeded lifetimes and exact rewind equivalence.
2. Offer optional education, single-life and family paths rather than mandatory
   university/marriage; add relationship compatibility beyond wealth/body gates.
3. Introduce seeded scenario challenges (community, creativity, financial recovery)
   with story-based outcomes and comparable replay summaries.
4. Build seven Blender room kits and age-specific animated avatars; test draw calls,
   texture memory and low-end mobile controls before replacing the Canvas view.

## Completed review and validation

- Implemented the release scope above, preserving the pre-existing working-tree
  fixes. Additional review fixes: adult starts initialize age-adjusted learning;
  rewind discards abandoned future snapshots; training respects lifespan as well
  as zero health; text fields retain their normal keyboard input; focus loss
  releases held movement keys; 3D distinguishes harmful events and inactive hazards.
- `npm test`: 20 passing tests cover content invariants, numeric limits, biography
  sanitization, challenge deduplication/rewind, required-choice sequencing, adult
  initialization, training death and rewind branch consistency.
- `npm run build`: TypeScript and production build pass. The optional Three.js
  chunk is approximately 648 kB (166 kB gzip) and is requested only on opening 3D.
- `npm audit`: zero reported vulnerabilities after updating development dependencies.
- Browser: checked new-life setup, challenge HUD, late-start career → commute →
  partner → play, 3D rendering and close, and successful sample GLB import. No
  browser console errors in the final open/close check.
- Limits: Blender is not installed on this machine, so the Blender Python exporter
  is provided but not executed here. A generated self-contained GLB validated the
  actual browser importer. Full mobile profiling, animated rigs and complete
  seeded-lifetime regression coverage remain follow-up work. Invalid/oversized
  model guards were code-reviewed; their browser error flows were not exercised.

## References

### Completed visual follow-up

The later realism request replaces the original primitive 3D placeholders with
18 models generated and exported in Blender 4.5.9 LTS. The release includes the
editable source, embedded textured PBR materials, furnished rooms, reflection
lighting, soft shadows, expanded/follow cameras and 12 Cycles-rendered Canvas
item sprites. See `BLENDER.md` for the executed build pipeline and art scope.

Validation: 32 tests pass, including GLB integrity, embedded resources, normal
attributes, geometry/size budgets, transparent sprites and item-to-model mapping.
Production build passes. Browser review covered normal play, automatic 3D loading,
expanded/follow cameras, shadow toggle and close/reopen; no console errors were
observed. Full low-end/mobile FPS profiling and photorealistic character animation
are not claimed. The earlier note that Blender was unavailable applies only to
the initial prototype, not this follow-up.

- [Blender GLB export](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js model loading](https://threejs.org/manual/en/loading-3d-models.html)
