import { blobToDataUrl, roundTo } from '../encoding';
import { fetchMaybeProxied } from '../proxy';
import { ProviderError, type ImageProvider } from '../types';

/**
 * fal.ai synchronous endpoints. Accepts data-URI images directly.
 * Docs: https://docs.fal.ai/model-endpoints/synchronous-requests
 */
export const fal: ImageProvider = {
  id: 'fal',
  name: 'fal.ai',
  docsUrl: 'https://fal.ai/models',
  keyUrl: 'https://fal.ai/dashboard/keys',
  keyLabel: 'fal.ai key',
  keyHint: 'Pay-as-you-go, fractions of a cent per image on the fast models.',
  needsProxy: false,
  models: [
    {
      id: 'fal-ai/fast-lightning-sdxl/image-to-image',
      label: 'SDXL Lightning img2img',
      costUsd: 0.003,
      approxLatency: '~1 s',
      supportsReferences: false,
      supportsStrength: true,
      note: 'Fastest and cheapest. Style comes from the prompt only.',
    },
    {
      id: 'fal-ai/flux-kontext/dev',
      label: 'FLUX Kontext dev',
      costUsd: 0.025,
      approxLatency: '3–6 s',
      supportsReferences: false,
      supportsStrength: false,
      note: 'Instruction-following edits, keeps composition well.',
    },
    {
      id: 'fal-ai/flux-pro/kontext/max/multi',
      label: 'FLUX Kontext max (multi-image)',
      costUsd: 0.08,
      approxLatency: '6–12 s',
      supportsReferences: true,
      supportsStrength: false,
      note: 'Takes the sketch plus reference panels.',
    },
  ],
  async generate(req, opts) {
    const started = performance.now();
    const image = await blobToDataUrl(req.image);
    let body: Record<string, unknown>;
    if (opts.model.startsWith('fal-ai/fast-lightning-sdxl')) {
      body = {
        image_url: image,
        prompt: req.prompt,
        strength: req.strength,
        num_inference_steps: 4,
        image_size: { width: roundTo(req.width, 8, 256, 1536), height: roundTo(req.height, 8, 256, 1536) },
        enable_safety_checker: false,
        sync_mode: true,
      };
    } else if (opts.model.includes('/multi')) {
      const refs = await Promise.all(req.references.map(blobToDataUrl));
      body = { image_urls: [image, ...refs], prompt: req.prompt, guidance_scale: 3.5, output_format: 'png', sync_mode: true };
    } else {
      body = { image_url: image, prompt: req.prompt, guidance_scale: 2.5, output_format: 'png', sync_mode: true };
    }
    const res = await fetchMaybeProxied(
      `https://fal.run/${opts.model}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Key ${opts.apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
      },
      opts.proxyUrl,
    );
    if (!res.ok) throw new ProviderError(await errorText(res), res.status);
    const json = (await res.json()) as { images?: Array<{ url: string; content_type?: string }>; detail?: unknown };
    const out = json.images?.[0];
    if (!out?.url) throw new ProviderError(`fal returned no image: ${JSON.stringify(json.detail ?? json).slice(0, 200)}`);
    const blob = await fetchImage(out.url, opts.proxyUrl, req.signal);
    return { blob, latencyMs: performance.now() - started };
  },
};

export async function fetchImage(url: string, proxyUrl?: string, signal?: AbortSignal): Promise<Blob> {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  const res = await fetchMaybeProxied(url, { signal }, proxyUrl);
  if (!res.ok) throw new ProviderError(`Could not download result image (HTTP ${res.status})`, res.status);
  return res.blob();
}

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown; message?: string };
    const d = j.detail ?? j.message;
    return typeof d === 'string' ? d : d ? JSON.stringify(d).slice(0, 300) : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
