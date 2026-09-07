/** Rewrites a URL to go through the optional local proxy (see proxy/server.mjs). */
export function throughProxy(proxyUrl: string, target: string): string {
  return `${proxyUrl.replace(/\/+$/, '')}/${target}`;
}

/** Fetches a URL directly, or through the proxy when one is configured and `force` is set or the direct call fails. */
export async function fetchMaybeProxied(target: string, init: RequestInit, proxyUrl?: string, force = false): Promise<Response> {
  if (proxyUrl && force) return fetch(throughProxy(proxyUrl, target), init);
  try {
    return await fetch(target, init);
  } catch (err) {
    if (proxyUrl) return fetch(throughProxy(proxyUrl, target), init);
    throw err;
  }
}
