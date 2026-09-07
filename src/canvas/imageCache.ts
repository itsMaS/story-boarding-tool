/**
 * Decoded image cache keyed by data URL. The renderer draws whatever is loaded
 * and reports pending images so callers can re-render when they arrive.
 */
const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function getCachedImage(src: string): HTMLImageElement | undefined {
  const img = cache.get(src);
  return img && img.complete && img.naturalWidth > 0 ? img : undefined;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = getCachedImage(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      pending.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      reject(new Error('Image failed to decode'));
    };
    img.src = src;
  });
  pending.set(src, promise);
  return promise;
}

export function preloadImages(srcs: Iterable<string>): Promise<void> {
  return Promise.all(Array.from(srcs).map((s) => loadImage(s).catch(() => undefined))).then(() => undefined);
}

export function evictImage(src: string): void {
  cache.delete(src);
}
