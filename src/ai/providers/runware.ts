import { base64ToBlob, blobToDataUrl, roundTo } from '../encoding';
import { fetchMaybeProxied } from '../proxy';
import { ProviderError, type ImageProvider } from '../types';

/**
 * Runware REST API. Cheapest sub-second SD/SDXL/FLUX inference with
 * ControlNet and IP-Adapter support. Docs: https://runware.ai/docs
 */
export const runware: ImageProvider = {
  id: 'runware',
  name: 'Runware',
  docsUrl: 'https://runware.ai/docs/en/image-inference/api-reference',
  keyUrl: 'https://my.runware.ai/keys',
  keyLabel: 'Runware API key',
  keyHint: 'Very cheap (under a cent per image). Signup credit included.',
  needsProxy: false,
  models: [
    {
      id: 'runware:100@1',
      label: 'FLUX Schnell img2img',
      costUsd: 0.0006,
      approxLatency: '~1 s',
      supportsReferences: false,
      supportsStrength: true,
    },
    {
      id: 'civitai:101055@128078',
      label: 'SDXL img2img',
      costUsd: 0.0026,
      approxLatency: '~1 s',
      supportsReferences: false,
      supportsStrength: true,
    },
    {
      id: 'runware:101@1',
      label: 'FLUX dev img2img',
      costUsd: 0.0038,
      approxLatency: '2–4 s',
      supportsReferences: false,
      supportsStrength: true,
    },
  ],
  async generate(req, opts) {
    const started = performance.now();
    const task = {
      taskType: 'imageInference',
      taskUUID: crypto.randomUUID(),
      model: opts.model,
      positivePrompt: req.prompt,
      seedImage: await blobToDataUrl(req.image),
      strength: req.strength,
      width: roundTo(req.width, 64, 128, 2048),
      height: roundTo(req.height, 64, 128, 2048),
      outputType: 'base64Data',
      outputFormat: 'PNG',
      numberResults: 1,
      steps: opts.model === 'runware:100@1' ? 4 : 20,
    };
    const res = await fetchMaybeProxied(
      'https://api.runware.ai/v1',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify([task]),
        signal: req.signal,
      },
      opts.proxyUrl,
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ imageBase64Data?: string }>;
      errors?: Array<{ message?: string }>;
      errorMessage?: string;
    };
    if (!res.ok || json.errors?.length) {
      throw new ProviderError(json.errors?.[0]?.message ?? json.errorMessage ?? `HTTP ${res.status}`, res.status);
    }
    const b64 = json.data?.[0]?.imageBase64Data;
    if (!b64) throw new ProviderError('Runware returned no image');
    return { blob: base64ToBlob(b64, 'image/png'), latencyMs: performance.now() - started };
  },
};
