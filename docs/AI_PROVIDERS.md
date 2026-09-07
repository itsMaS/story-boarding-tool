# AI provider exploration

Goal: turn rough doodles into cleaner sketches in the storyboard's style, and turn photos or game screenshots into doodles. Constraints: free or very cheap per image, near-realtime, callable directly from a static site on GitHub Pages with the user's own key.

Research date: September 2026. Prices and model names drift; treat them as approximate and check the provider's pricing page.

## Summary

| Provider | Best models for us | Cost / image | Latency | Browser CORS | Style refs |
|---|---|---|---|---|---|
| **Google Gemini** | `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview` | $0.04–0.07, free tier | 3–10 s | Verified working | Yes, multiple images in one call |
| **fal.ai** | `fast-lightning-sdxl/image-to-image`, `flux-kontext/dev`, `flux-pro/kontext/max/multi` | $0.003 / $0.025 / $0.08 | 1 s / 3–6 s / 6–12 s | Documented as usable in browser (key-exposure warning only) | Multi-image only on Kontext max |
| **Runware** | FLUX Schnell, SDXL, FLUX dev img2img | $0.0006–0.004 | ~1 s | SDK documented for browsers | ControlNet / IP-Adapter available |
| Replicate | `flux-kontext-dev`, `sdxl-lightning-4step` | $0.0014–0.025 | 2–8 s | **Blocked by design** | No |
| Hugging Face Inference Providers | routes to fal / Replicate | provider price | slower (routing) | Works | No |
| Stability AI | `control/sketch`, `control/style` | $0.03, 25 free credits | 5–10 s | Unverified, likely works | Style image endpoint |
| Together AI | FLUX Kontext | $0.025+ | 3–8 s | Undocumented | Reference images on FLUX.2 |
| OpenAI `images/edits` | `gpt-image-1-mini` | $0.005–0.011 | **20–130 s** | Works with a warning | Yes |

## Recommendation and what is implemented

Implemented in `src/ai/providers/`, in the order they appear in the UI:

1. **Gemini** — the only provider whose CORS was verified with a real preflight. One JSON call takes the sketch, up to three reference panels, and the prompt, which covers both use cases. Free tier for casual use.
2. **fal.ai** — cheapest fast path. SDXL Lightning img2img answers in about a second for a fraction of a cent, Kontext dev for better instruction following.
3. **Runware** — lowest cost overall at sub-second speed. Prompt-guided img2img for now; ControlNet and IP-Adapter can be added to the same request later for tighter structure and style control.
4. **Replicate** — only via the local proxy (`npm run proxy`), because Replicate refuses browser origins.
5. **Custom endpoint** — a generic JSON contract for self-hosted models (Stable Diffusion WebUI, ComfyUI behind a small adapter, or any future provider).

Skipped: OpenAI image edits (too slow for a near-realtime loop), Segmind (requires a top-up and has CORS problems), Together (CORS undocumented; easy to add later using the fal adapter as a template).

## How the abstraction works

- `src/ai/types.ts` defines `ImageProvider`: id, key label, model list with cost and latency hints, a `needsProxy` flag, and one `generate(request, {apiKey, model, proxyUrl})` method.
- `src/ai/registry.ts` lists providers. The AI dialog and Settings dialog render entirely from that list, so adding a provider never touches UI code.
- `src/ai/prompt.ts` builds the prompt from the mode (polish doodle / image to doodle), the project's style prompt, and the user's instruction.
- `src/ai/flatten.ts` renders the selection or slide to a PNG capped at the configured edge length and renders reference slides.
- `src/ai/keys.ts` stores keys in localStorage per provider. They are only ever sent to that provider or to the user's own local proxy.
- `src/ai/proxy.ts` rewrites a URL through `proxy/server.mjs` when configured.

## Custom endpoint

Set the "Custom endpoint" key field to `https://host/path` optionally followed by a space and a bearer token. The app POSTs JSON:

```json
{
  "prompt": "…",
  "mode": "polish" | "to-doodle",
  "image": "data:image/png;base64,…",
  "references": ["data:image/png;base64,…"],
  "width": 1024,
  "height": 576,
  "strength": 0.6
}
```

and expects `{ "image": "data:image/png;base64,…" }` (an https URL also works).

## Verifying CORS yourself

From the browser console on the deployed site:

```js
fetch('https://fal.run/fal-ai/fast-lightning-sdxl/image-to-image', { method: 'OPTIONS' }).then(r => console.log(r.status, r.headers.get('access-control-allow-origin')))
```

If a provider rejects the origin, start the proxy and set its URL in Settings → Advanced.
