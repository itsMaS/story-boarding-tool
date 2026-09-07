import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
// Bundled locally so export works offline and without a CDN. Vite copies these as assets.
import ffmpegCoreUrl from '@ffmpeg/core?url';
import ffmpegWasmUrl from '@ffmpeg/core/wasm?url';
import type { Project, SlideSound } from '../model/types';
import { slideDuration } from '../model/project';
import { canvasToBlob, type SlideFrame } from './frames';

export type VideoFormat = 'mp4' | 'webm';

export interface VideoOptions {
  fps: number;
  includeAudio: boolean;
  onProgress?: (fraction: number, message: string) => void;
  signal?: AbortSignal;
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

/** Loads the single-threaded ffmpeg core (no COOP/COEP headers needed, so it works on GitHub Pages). */
export function loadFfmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      onProgress?.('Downloading video encoder (about 30 MB, cached by the browser)…');
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(ffmpegCoreUrl, 'text/javascript'),
        toBlobURL(ffmpegWasmUrl, 'application/wasm'),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

interface PlacedSound {
  sound: SlideSound;
  /** Absolute start time in the video, seconds. */
  at: number;
}

function placeSounds(project: Project): PlacedSound[] {
  const out: PlacedSound[] = [];
  let t = 0;
  for (const slide of project.slides) {
    for (const s of slide.sounds) out.push({ sound: s, at: t + s.offset });
    t += slideDuration(project, slide);
  }
  return out;
}

async function dataUrlToBytes(src: string): Promise<Uint8Array> {
  const res = await fetch(src);
  return new Uint8Array(await res.arrayBuffer());
}

function extensionFor(src: string): string {
  const m = /^data:audio\/([a-z0-9.+-]+)/i.exec(src);
  const sub = m?.[1]?.toLowerCase() ?? 'mp3';
  if (sub === 'mpeg' || sub === 'mp3') return 'mp3';
  if (sub === 'ogg' || sub === 'vorbis') return 'ogg';
  if (sub === 'wav' || sub === 'x-wav' || sub === 'wave') return 'wav';
  if (sub === 'webm') return 'webm';
  if (sub === 'mp4' || sub === 'm4a' || sub === 'aac') return 'm4a';
  if (sub === 'flac') return 'flac';
  return 'bin';
}

export async function encodeVideo(
  project: Project,
  frames: SlideFrame[],
  format: VideoFormat,
  opts: VideoOptions,
): Promise<Blob> {
  const ffmpeg = await loadFfmpeg((m) => opts.onProgress?.(0, m));
  const total = frames.reduce((s, f) => s + f.durationSec, 0);
  const files: string[] = [];
  const cleanup = async () => {
    for (const f of files) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {
        /* ignore */
      }
    }
  };

  const onLog = ({ message }: { message: string }) => {
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (m) {
      const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      opts.onProgress?.(Math.min(0.99, 0.2 + (0.8 * t) / Math.max(total, 0.01)), 'Encoding…');
    }
  };
  ffmpeg.on('log', onLog);

  try {
    // Slide stills + a concat list that holds each for its duration.
    let list = '';
    for (const f of frames) {
      if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const name = `slide${String(f.index).padStart(4, '0')}.png`;
      const blob = await canvasToBlob(f.canvas);
      await ffmpeg.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
      files.push(name);
      list += `file '${name}'\nduration ${f.durationSec.toFixed(3)}\n`;
      opts.onProgress?.((0.2 * (f.index + 1)) / frames.length, `Preparing slide ${f.index + 1}/${frames.length}`);
    }
    // concat demuxer quirk: repeat the last file so its duration is honoured.
    list += `file 'slide${String(frames[frames.length - 1].index).padStart(4, '0')}.png'\n`;
    await ffmpeg.writeFile('list.txt', list);
    files.push('list.txt');

    const args: string[] = ['-f', 'concat', '-safe', '0', '-i', 'list.txt'];
    const sounds = opts.includeAudio ? placeSounds(project) : [];
    const filters: string[] = [];
    const mixInputs: string[] = [];
    for (let i = 0; i < sounds.length; i++) {
      const { sound, at } = sounds[i];
      const name = `snd${i}.${extensionFor(sound.src)}`;
      await ffmpeg.writeFile(name, await dataUrlToBytes(sound.src));
      files.push(name);
      args.push('-i', name);
      const delayMs = Math.max(0, Math.round(at * 1000));
      filters.push(`[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${sound.volume.toFixed(3)},adelay=${delayMs}|${delayMs}[a${i}]`);
      mixInputs.push(`[a${i}]`);
    }

    const out = `out.${format}`;
    if (sounds.length) {
      filters.push(`${mixInputs.join('')}amix=inputs=${sounds.length}:normalize=0:dropout_transition=0,apad[aout]`);
      args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]');
    }
    args.push('-r', String(opts.fps), '-t', total.toFixed(3), '-pix_fmt', 'yuv420p');
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart');
      if (sounds.length) args.push('-c:a', 'aac', '-b:a', '160k');
    } else {
      args.push('-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '32', '-b:v', '0');
      if (sounds.length) args.push('-c:a', 'libopus', '-b:a', '128k');
    }
    args.push('-y', out);
    files.push(out);

    opts.onProgress?.(0.2, 'Encoding…');
    const abort = () => ffmpeg.terminate();
    opts.signal?.addEventListener('abort', abort, { once: true });
    const code = await ffmpeg.exec(args);
    opts.signal?.removeEventListener('abort', abort);
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    return new Blob([data.slice()], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    ffmpeg.off('log', onLog);
    if (!opts.signal?.aborted) await cleanup();
    else ffmpegPromise = null;
  }
}
