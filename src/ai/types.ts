/**
 * Provider-agnostic image-to-image interface. Adding a provider means
 * implementing ImageProvider and registering it in ./registry.ts; the UI reads
 * everything it needs (models, costs, key labels) from the provider object.
 */

export type AiMode = 'polish' | 'to-doodle';

export interface ImageRequest {
  mode: AiMode;
  /** Flattened PNG of the selection or slide. */
  image: Blob;
  /** Full prompt already assembled from style + mode + user instruction. */
  prompt: string;
  /** Style reference renders (may be empty). */
  references: Blob[];
  /** Requested output size; providers may round it. */
  width: number;
  height: number;
  /** 0..1, how far the result may drift from the input. */
  strength: number;
  signal?: AbortSignal;
}

export interface ImageResult {
  blob: Blob;
  latencyMs: number;
}

export interface ProviderModel {
  id: string;
  label: string;
  /** Approximate USD per generated image, for the cost display. */
  costUsd: number;
  approxLatency: string;
  supportsReferences: boolean;
  /** Whether `strength` is honoured. */
  supportsStrength: boolean;
  note?: string;
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  /** Base URL of the optional local proxy, e.g. http://localhost:8787 */
  proxyUrl?: string;
}

export interface ImageProvider {
  id: string;
  name: string;
  docsUrl: string;
  keyUrl: string;
  keyLabel: string;
  /** Short note shown under the key field. */
  keyHint?: string;
  models: ProviderModel[];
  /** True when the API is known to block browser calls; the proxy is then required. */
  needsProxy: boolean;
  generate(req: ImageRequest, opts: GenerateOptions): Promise<ImageResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}
