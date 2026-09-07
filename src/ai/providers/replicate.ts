import { blobToDataUrl } from '../encoding';
import { fetchMaybeProxied } from '../proxy';
import { ProviderError, type ImageProvider } from '../types';
import { fetchImage } from './fal';

/**
 * Replicate. The API refuses browser CORS by design, so this provider only
 * works through the local proxy (npm run proxy). Docs: https://replicate.com/docs
 */
export const replicate: ImageProvider = {
  id: 'replicate',
  name: 'Replicate (needs local proxy)',
  docsUrl: 'https://replicate.com/docs/topics/predictions/create-a-prediction',
  keyUrl: 'https://replicate.com/account/api-tokens',
  keyLabel: 'Replicate API token',
  keyHint: 'Replicate blocks direct browser calls. Run "npm run proxy" and set the proxy URL.',
  needsProxy: true,
  models: [
    {
      id: 'black-forest-labs/flux-kontext-dev',
      label: 'FLUX Kontext dev',
      costUsd: 0.025,
      approxLatency: '4–8 s',
      supportsReferences: false,
      supportsStrength: false,
    },
    {
      id: 'bytedance/sdxl-lightning-4step',
      label: 'SDXL Lightning 4-step',
      costUsd: 0.0014,
      approxLatency: '~2 s',
      supportsReferences: false,
      supportsStrength: true,
      note: 'Text-to-image model; the sketch is passed as an init image where supported.',
    },
  ],
  async generate(req, opts) {
    if (!opts.proxyUrl) throw new ProviderError('Replicate requires the local proxy. Set the proxy URL in Settings.');
    const started = performance.now();
    const image = await blobToDataUrl(req.image);
    const input: Record<string, unknown> =
      opts.model === 'black-forest-labs/flux-kontext-dev'
        ? { prompt: req.prompt, input_image: image, output_format: 'png', go_fast: true }
        : { prompt: req.prompt, image, prompt_strength: req.strength, width: req.width, height: req.height, num_inference_steps: 4 };
    const res = await fetchMaybeProxied(
      `https://api.replicate.com/v1/models/${opts.model}/predictions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}`, prefer: 'wait=60' },
        body: JSON.stringify({ input }),
        signal: req.signal,
      },
      opts.proxyUrl,
      true,
    );
    const json = (await res.json().catch(() => ({}))) as { output?: string | string[]; error?: string; status?: string; detail?: string };
    if (!res.ok) throw new ProviderError(json.detail ?? json.error ?? `HTTP ${res.status}`, res.status);
    if (json.error) throw new ProviderError(json.error);
    const url = Array.isArray(json.output) ? json.output[0] : json.output;
    if (!url) throw new ProviderError(`Replicate returned no output (status ${json.status ?? 'unknown'})`);
    const blob = await fetchImage(url, opts.proxyUrl, req.signal);
    return { blob, latencyMs: performance.now() - started };
  },
};
