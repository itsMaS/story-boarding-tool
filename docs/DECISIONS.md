# Product decisions

Recorded from the initial 40-question kickoff. Numbers match the original question list.

## Canvas, drawing, slides

1. **Canvas size**: presets per project (16:9, 4:3, 9:16, 1:1), chosen at project creation.
2. **Drawing engine**: vector strokes stored as point lists, re-rendered by a single pure renderer.
3. **Tools for v1**: pen, eraser, color, size.
4. **Smoothing**: light smoothing.
5. **Pressure**: use pointer pressure when the device reports it.
6. **Layers**: none; every slide is a single z-ordered list of objects.
7. **Drawing over images**: strokes and images share one z-order.
8. **Undo**: per slide content, unlimited while the project is open.
9. **Durations**: project default duration plus per-slide override.
10. **Transitions**: hard cut only.
11. **Captions**: rendered caption bar that appears in playback and export.
12. **Onion skin**: previous slide ghost toggle.

## Playback and overview

13. **Overview**: responsive thumbnail grid, drag to reorder, duration badge. **Linked slides**: duplicate-with-link shares drawing content between slides so editing one edits all; linked slides are indicated in the overview, and selecting one highlights its siblings.
14. **Playback**: play, pause, scrub, loop, speed multiplier.
15. **Audio**: per-slide sound effects, played at slide start. A freesound.org browser lets the user search and import clips with their own freesound API key. Sounds are muxed into MP4 / WebM export.
16. **Slide ops**: duplicate, duplicate-with-link, insert before/after, delete, reorder.

## Images and objects

17. **Image input**: paste, drag and drop, file picker.
18. **Transforms**: move, resize, rotate, flip H/V, z-order, delete, plus crop, opacity and aspect-lock toggle.
19. **Selection**: shift-click and marquee multi-select; group move and delete.
20. **Image storage**: data URLs inside the project JSON so a project is one portable file.
21. **Image limits**: pasted images are downscaled to 2048px on the longest side.

## Export

22. **Engine**: fully client-side. gifenc for GIF, ffmpeg.wasm for MP4 and WebM.
23. **Resolution**: 480p, 720p, 1080p presets plus custom.
24. **Frame rate**: user picks in the export dialog.
25. **Stills**: PNG per slide and a PNG contact sheet of the overview.

## Persistence

26. **Saving**: auto-save to IndexedDB plus explicit save/load of a `.json` project file.
27. **Projects**: in-app project list with new, open, rename, delete.
28. **Format**: versioned JSON with a `schemaVersion` field and migrations.

## AI

29. **Priority**: doodle to polished sketch first, photo/screenshot to doodle second.
30. **Providers**: explore fal.ai, Replicate, Together first, with Gemini and OpenAI image edit as fallbacks. See `docs/AI_PROVIDERS.md`.
31. **Local models**: the provider interface allows a custom endpoint later; not built in v1.
32. **Style**: project-level style prompt plus reference slides sent as style images.
33. **Result handling**: the AI result replaces the selection directly; undo restores the original.
34. **Input**: user chooses between the flattened selection and the whole slide.
35. **Keys**: localStorage per provider with a clear notice that keys stay in the browser.
36. **Cost**: show estimated cost per call and measured latency, with a session total.
37. **CORS**: call providers directly from the browser; ship an optional tiny local proxy (`proxy/`) for providers that block browser calls.

## Technical

38. **Stack**: Vite, TypeScript, React, Zustand, Tailwind, Canvas 2D.
39. **Testing/CI**: Vitest unit tests, one Playwright smoke test, GitHub Actions builds and deploys Pages on every push to `main`.
40. **Devices**: desktop first with full keyboard shortcuts; touch and stylus drawing supported.
