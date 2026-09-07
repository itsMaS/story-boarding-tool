import { throughProxy } from '../ai/proxy';

/**
 * Minimal freesound.org API v2 client. Token auth is passed as a query
 * parameter so requests stay "simple" CORS requests without a preflight.
 * Docs: https://freesound.org/docs/api/
 */
export interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  duration: number;
  license: string;
  url: string;
  tags: string[];
  previews: Record<string, string>;
}

export interface FreesoundSearch {
  count: number;
  next: string | null;
  results: FreesoundResult[];
}

export const FREESOUND_KEY_URL = 'https://freesound.org/apiv2/apply';

export async function searchFreesound(
  apiKey: string,
  query: string,
  opts: { page?: number; pageSize?: number; maxDuration?: number; signal?: AbortSignal } = {},
): Promise<FreesoundSearch> {
  const params = new URLSearchParams({
    query,
    fields: 'id,name,username,duration,license,url,previews,tags',
    page: String(opts.page ?? 1),
    page_size: String(opts.pageSize ?? 20),
    sort: 'score',
    token: apiKey,
  });
  if (opts.maxDuration) params.set('filter', `duration:[0 TO ${opts.maxDuration}]`);
  const res = await fetch(`https://freesound.org/apiv2/search/?${params}`, { signal: opts.signal });
  if (res.status === 401) throw new Error('freesound rejected the API key');
  if (res.status === 429) throw new Error('freesound rate limit reached (60/min, 2000/day)');
  if (!res.ok) throw new Error(`freesound error ${res.status}`);
  return (await res.json()) as FreesoundSearch;
}

export function bestPreview(r: FreesoundResult): string | undefined {
  return r.previews['preview-hq-mp3'] ?? r.previews['preview-lq-mp3'] ?? r.previews['preview-hq-ogg'] ?? r.previews['preview-lq-ogg'];
}

export function licenseName(url: string): string {
  if (/zero|publicdomain/.test(url)) return 'CC0';
  if (/by-nc/.test(url)) return 'CC BY-NC';
  if (/by/.test(url)) return 'CC BY';
  if (/sampling/.test(url)) return 'Sampling+';
  return url;
}

/** Downloads a preview and returns it as a data URL, falling back to the local proxy on CORS failure. */
export async function fetchPreviewAsDataUrl(url: string, proxyUrl?: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (!proxyUrl) throw new Error(`Could not download preview (${(err as Error).message}). Set a local proxy URL in Settings if the browser blocks it.`);
    res = await fetch(throughProxy(proxyUrl, url));
    if (!res.ok) throw new Error(`Proxy download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const typed = blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: url.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg' });
  return blobToDataUrl(typed);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
