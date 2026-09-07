# Storyboarder

Web-based storyboard prototyping tool. Draw on slides, set durations, play back, export to GIF / MP4 / WebM, optionally polish doodles with an AI image provider using the user's own API key.

## Git rules

- **Always push to `main`.** There is no PR flow for this repo. Commit small, descriptive changes directly on `main` and push after each logical unit of work.
- GitHub Pages deploys automatically from `main` via `.github/workflows/deploy.yml`. A red build on `main` breaks the live site, so run `npm run typecheck && npm test && npm run build` before pushing.

## Stack

- Vite + TypeScript + React 19 + Zustand + Tailwind v4 (via `@tailwindcss/vite`).
- Rendering is the plain Canvas 2D API. There is one pure renderer in `src/canvas/render.ts` used by the editor, thumbnails, playback and export, so anything drawn must go through it.
- Persistence: IndexedDB via `idb` (`src/storage/db.ts`), auto-save, plus explicit save/load of a versioned `.json` project file (`src/model/migrate.ts` holds schema migrations).
- Export is fully client-side: `gifenc` for GIF, `@ffmpeg/ffmpeg` (single-threaded core, no COOP/COEP needed) for MP4 and WebM, canvas `toBlob` for PNG.
- `vite.config.ts` uses `base: './'` so the same build works locally and under the `/story-boarding-tool/` Pages sub-path.

## Key design decisions

See `docs/DECISIONS.md` for the full list of 40 product decisions. The ones that shape the code:

- Slides reference a `SlideContent` by id. Duplicating "with link" makes two slides share one content id, so edits propagate. Duration, caption and sounds are per slide; drawing content is per `SlideContent`.
- Strokes are vector (point lists with pressure), images are raster objects; both live in one z-ordered `objects` array per `SlideContent`.
- Undo/redo history is per `SlideContent`, unlimited while the project is open.
- AI providers implement the `ImageProvider` interface in `src/ai/types.ts` and are registered in `src/ai/registry.ts`. Adding a provider must not require touching UI code. Keys are stored in `localStorage` per provider and never sent anywhere except that provider (or the optional local proxy in `proxy/`).
- The AI feature and the freesound.org sound browser are optional. The app must work fully with no keys configured.

## Commands

```
npm run dev        # local dev server
npm run typecheck  # tsc
npm test           # vitest unit tests
npm run test:e2e   # playwright smoke test (needs `npm run build` first)
npm run build      # production build to dist/
npm run proxy      # optional local CORS proxy for providers that block browser calls
```

## Conventions

- Keep logic out of components: pure functions in `model/`, `canvas/`, `export/`, `ai/`; state in `store/`; components only wire things together.
- Every new project-file field needs a migration step and a bump of `SCHEMA_VERSION` in `src/model/types.ts`.
- Don't add a backend. Anything that needs a server belongs in the optional `proxy/` script or a future cloud phase.
