import { blobToBase64, base64ToBlob } from '../encoding';
import { fetchMaybeProxied } from '../proxy';
import { ProviderError, type ImageProvider } from '../types';

/**
 * Google Gemini image generation ("Nano Banana"). One JSON call takes the
 * sketch plus reference images plus the prompt. CORS from a static site is
 * allowed. Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */
export const gemini: ImageProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyLabel: 'Gemini API key',
  keyHint: 'Free tier available. Key from Google AI Studio.',
  needsProxy: false,
  models: [
    {
      id: 'gemini-2.5-flash-image',
      label: 'Gemini 2.5 Flash Image',
      costUsd: 0.039,
      approxLatency: '3–8 s',
      supportsReferences: true,
      supportsStrength: false,
      note: 'Best all-rounder; understands style references.',
    },
    {
      id: 'gemini-3.1-flash-image-preview',
      label: 'Gemini 3.1 Flash Image (preview)',
      costUsd: 0.067,
      approxLatency: '4–10 s',
      supportsReferences: true,
      supportsStrength: false,
    },
  ],
  async generate(req, opts) {
    const started = performance.now();
    const parts: unknown[] = [{ text: req.prompt }];
    parts.push({ text: 'Input sketch to redraw:' }, { inline_data: { mime_type: req.image.type || 'image/png', data: await blobToBase64(req.image) } });
    for (const ref of req.references) {
      parts.push({ text: 'Style reference panel:' }, { inline_data: { mime_type: ref.type || 'image/png', data: await blobToBase64(ref) } });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
    const res = await fetchMaybeProxied(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
        signal: req.signal,
      },
      opts.proxyUrl,
    );
    if (!res.ok) throw new ProviderError(await errorText(res), res.status);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) {
      const reason = json.promptFeedback?.blockReason ?? json.candidates?.[0]?.finishReason ?? 'no image in response';
      throw new ProviderError(`Gemini returned no image (${reason})`);
    }
    return { blob: base64ToBlob(part.inlineData.data, part.inlineData.mimeType), latencyMs: performance.now() - started };
  },
};

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
