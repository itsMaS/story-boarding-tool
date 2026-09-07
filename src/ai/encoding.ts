export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return `data:${blob.type || 'image/png'};base64,${await blobToBase64(blob)}`;
}

export function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Rounds to a multiple of `step`, clamped to [min, max]. */
export function roundTo(n: number, step: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n / step) * step));
}
