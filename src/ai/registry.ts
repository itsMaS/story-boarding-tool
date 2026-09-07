import { custom } from './providers/custom';
import { fal } from './providers/fal';
import { gemini } from './providers/gemini';
import { replicate } from './providers/replicate';
import { runware } from './providers/runware';
import type { ImageProvider, ProviderModel } from './types';

/** Order here is the order shown in the UI. */
export const providers: ImageProvider[] = [gemini, fal, runware, replicate, custom];

export function getProvider(id: string): ImageProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function getModel(provider: ImageProvider, modelId: string): ProviderModel {
  return provider.models.find((m) => m.id === modelId) ?? provider.models[0];
}
