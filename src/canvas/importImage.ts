import { newId } from '../model/ids';
import type { CanvasSize, ImageObject } from '../model/types';
import { loadImage } from './imageCache';

export const MAX_IMAGE_EDGE = 2048;

/** Decodes an image blob, downscales it to MAX_IMAGE_EDGE and returns a data URL. */
export async function blobToDataUrl(blob: Blob, maxEdge = MAX_IMAGE_EDGE): Promise<{ src: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const keepAlpha = blob.type === 'image/png' || blob.type === 'image/webp' || blob.type === 'image/gif';
  const src = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  return { src, width, height };
}

/** Builds an ImageObject centred on the canvas, fitted to `fit` of the shorter canvas edge. */
export function placeImage(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  canvas: CanvasSize,
  fit = 0.6,
): ImageObject {
  const maxW = canvas.width * fit;
  const maxH = canvas.height * fit;
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1.5);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    id: newId('o'),
    type: 'image',
    src,
    naturalWidth,
    naturalHeight,
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    lockAspect: true,
  };
}

export async function importImageBlob(blob: Blob, canvas: CanvasSize): Promise<ImageObject> {
  const { src, width, height } = await blobToDataUrl(blob);
  await loadImage(src);
  return placeImage(src, width, height, canvas);
}

/** Extracts image blobs from a paste or drop event. */
export function imagesFromDataTransfer(dt: DataTransfer | null): Blob[] {
  if (!dt) return [];
  const out: Blob[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (out.length === 0) {
    for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) out.push(f);
  }
  return out;
}
