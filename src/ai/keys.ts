/**
 * API keys live in localStorage only. They are sent to the provider they
 * belong to (or through the user's own local proxy) and nowhere else.
 */
const KEYS = 'sb.keys';
const SETTINGS = 'sb.ai';

export interface AiSettings {
  providerId: string;
  modelId: string;
  proxyUrl: string;
  strength: number;
  /** Longest edge of the image sent to the provider. */
  maxEdge: number;
}

const DEFAULTS: AiSettings = { providerId: 'gemini', modelId: 'gemini-2.5-flash-image', proxyUrl: '', strength: 0.6, maxEdge: 1024 };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export function getKey(providerId: string): string {
  return read<Record<string, string>>(KEYS, {})[providerId] ?? '';
}

export function setKey(providerId: string, key: string): void {
  const all = read<Record<string, string>>(KEYS, {});
  if (key) all[providerId] = key;
  else delete all[providerId];
  localStorage.setItem(KEYS, JSON.stringify(all));
}

export function getSettings(): AiSettings {
  return read<AiSettings>(SETTINGS, DEFAULTS);
}

export function setSettings(patch: Partial<AiSettings>): AiSettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(SETTINGS, JSON.stringify(next));
  return next;
}
