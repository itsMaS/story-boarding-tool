import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { SlideFrame } from './frames';

export interface GifOptions {
  loop?: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Encodes one GIF frame per slide, holding each for the slide's duration.
 * Slides are static so this is far smaller than encoding at a frame rate.
 */
export async function encodeGif(frames: SlideFrame[], opts: GifOptions = {}): Promise<Blob> {
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const f = frames[i];
    const ctx = f.canvas.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, f.canvas.width, f.canvas.height);
    const palette = quantize(data, 256, { format: 'rgb444' });
    const index = applyPalette(data, palette, 'rgb444');
    // GIF delays are in 10ms units and capped at 65535 by the format.
    const delay = Math.min(655350, Math.max(20, Math.round(f.durationSec * 1000)));
    gif.writeFrame(index, width, height, { palette, delay, repeat: opts.loop === false ? -1 : 0 });
    opts.onProgress?.(i + 1, frames.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes().slice()], { type: 'image/gif' });
}
