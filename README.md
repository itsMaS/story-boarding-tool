# Storyboarder

A fast, web-based storyboard prototyping tool. Draw on slides, set durations, play the animatic back, view every slide at once, and export to GIF, MP4, WebM or PNG. Optionally polish doodles with an AI image provider using your own API key, and attach sound effects from files or freesound.org.

Everything runs in the browser. Projects auto-save to the browser and can be downloaded as a single `.json` file. No backend, no account.

Live: https://itsmas.github.io/story-boarding-tool/

## Features

- **Drawing**: pressure-aware pen and eraser, colour palette, opacity, light smoothing, onion skin of the previous slide.
- **Images**: paste, drag-and-drop or pick files. Move, resize, rotate, flip, crop, opacity, z-order, multi-select with marquee.
- **Slides**: per-slide or default duration, captions rendered in playback and export, duplicate, and **linked duplicates** that share their drawing so editing one updates all.
- **Playback**: play, pause, scrub, loop, speed, with per-slide sound effects.
- **Overview**: all slides as a grid, drag to reorder, edit durations inline.
- **Export**: MP4 (H.264), WebM (VP8), GIF, PNG per slide (zip), contact sheet. Sounds are muxed into video exports. All client-side via ffmpeg.wasm.
- **AI polish** (optional): turn a rough doodle into a cleaner sketch in your storyboard's style, or turn a photo or screenshot into a doodle. Providers: Google Gemini, fal.ai, Runware, Replicate (via proxy), or a custom endpoint. See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md).
- **Sounds** (optional): search and import freesound.org previews with your own key; attribution is kept.

Press `?` in the app for the full list of keyboard shortcuts.

## Run locally

```
npm install
npm run dev
```

Optional local proxy for providers that block browser calls (Replicate) or sound previews without CORS headers:

```
npm run proxy      # http://localhost:8787, then set it in Settings → Advanced
```

## Develop

```
npm run typecheck
npm test           # vitest unit tests
npm run build
npm run test:e2e   # playwright smoke test against the built app
```

## Deploy

The live site is the `gh-pages` branch. In the repository settings choose Pages → Build and deployment → Source **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**.

- Every push to `main` rebuilds and publishes `gh-pages` through `.github/workflows/deploy.yml`.
- `npm run deploy` builds locally and pushes `gh-pages` directly, for when Actions are unavailable.

## Project decisions

See [docs/DECISIONS.md](docs/DECISIONS.md) for the 40 product decisions this build follows and [CLAUDE.md](CLAUDE.md) for the code conventions.
