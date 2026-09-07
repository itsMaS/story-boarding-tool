import { blobToDataUrl } from '../encoding';
import { ProviderError, type ImageProvider } from '../types';
import { fetchImage } from './fal';

/**
 * Generic HTTP endpoint for self-hosted or future providers. The "API key"
 * field holds the endpoint URL, optionally followed by a space and a bearer token.
 *
 * Request (POST, JSON):
 *   { prompt, mode, image: dataUrl, references: dataUrl[], width, height, strength }
 * Response (JSON): { image: dataUrl | https URL }
 */
export const custom: ImageProvider = {
  id: 'custom',
  name: 'Custom endpoint',
  docsUrl: 'https://github.com/itsMaS/story-boarding-tool/blob/main/docs/AI_PROVIDERS.md#custom-endpoint',
  keyUrl: '',
  keyLabel: 'Endpoint URL [space] optional token',
  keyHint: 'e.g. http://localhost:5000/sketch  or  https://my.host/api  my-secret-token',
  needsProxy: false,
  models: [
    { id: 'default', label: 'Default', costUsd: 0, approxLatency: 'depends', supportsReferences: true, supportsStrength: true },
  ],
  async generate(req, opts) {
    const [url, token] = opts.apiKey.trim().split(/\s+/, 2);
    if (!url) throw new ProviderError('Set the endpoint URL in Settings');
    const started = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        prompt: req.prompt,
        mode: req.mode,
        image: await blobToDataUrl(req.image),
        references: await Promise.all(req.references.map(blobToDataUrl)),
        width: req.width,
        height: req.height,
        strength: req.strength,
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new ProviderError(`Endpoint returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as { image?: string };
    if (!json.image) throw new ProviderError('Endpoint response has no "image" field');
    return { blob: await fetchImage(json.image, undefined, req.signal), latencyMs: performance.now() - started };
  },
};
