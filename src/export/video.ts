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

/**
 * WebM uses VP8. The libvpx-vp9 encoder in the single-threaded ffmpeg.wasm
 * core crashes with "memory access out of bounds" after the first few
 * frames (tested with both realtime and good deadlines), while VP8 encodes
 * a 720p animatic in a few seconds.
 */
function webmVideoArgs(): string[] {
  return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M', '-qmin', '4', '-qmax', '40'];
}

const WATCHDOG_MS = 45_000;
const CRASH_MESSAGE = 'The video encoder crashed or stopped responding (it may have run out of memory). Try a lower resolution or frame rate.';

export async function encodeVideo(
  project: Project,
  frames: SlideFrame[],
  format: VideoFormat,
  opts: VideoOptions,
): Promise<Blob> {
  const debug = typeof localStorage !== 'undefined' && !!localStorage.getItem('sb.debug');
  const trace = (msg: string) => debug && console.debug('[export]', msg);
  trace('loading ffmpeg');
  const ffmpeg = await loadFfmpeg((m) => opts.onProgress?.(0, m));
  trace('ffmpeg loaded');
  const total = frames.reduce((s, f) => s + f.durationSec, 0);
  const onLog = ({ message }: { message: string }) => {
    if (debug) console.debug('[ffmpeg]', message);
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
      list += `file '${name}'\nduration ${f.durationSec.toFixed(3)}\n`;
      opts.onProgress?.((0.2 * (f.index + 1)) / frames.length, `Preparing slide ${f.index + 1}/${frames.length}`);
    }
    // concat demuxer quirk: repeat the last file so its duration is honoured.
    list += `file 'slide${String(frames[frames.length - 1].index).padStart(4, '0')}.png'\n`;
    await ffmpeg.writeFile('list.txt', list);

    const args: string[] = ['-f', 'concat', '-safe', '0', '-i', 'list.txt'];
    const sounds = opts.includeAudio ? placeSounds(project) : [];
    const filters: string[] = [];
    const mixInputs: string[] = [];
    for (let i = 0; i < sounds.length; i++) {
      const { sound, at } = sounds[i];
      const name = `snd${i}.${extensionFor(sound.src)}`;
      await ffmpeg.writeFile(name, await dataUrlToBytes(sound.src));
      args.push('-i', name);
      const delayMs = Math.max(0, Math.round(at * 1000));
      filters.push(`[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${sound.volume.toFixed(3)},adelay=${delayMs}|${delayMs}[a${i}]`);
      mixInputs.push(`[a${i}]`);
    }

    const out = `out.${format}`;
    // The concat input is variable-rate (one frame per slide). Convert to a
    // constant frame rate inside the filter graph and trim there: using the
    // output "-t" option instead drops the trailing frame before it can
    // trigger duplication, which truncates the last slide.
    filters.push(`[0:v]fps=${opts.fps},trim=end=${total.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[vout]`);
    if (sounds.length) {
      filters.push(
        `${mixInputs.join('')}amix=inputs=${sounds.length}:normalize=0:dropout_transition=0,apad,atrim=end=${total.toFixed(3)},asetpts=PTS-STARTPTS[aout]`,
      );
    }
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]');
    if (sounds.length) args.push('-map', '[aout]');
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart');
      if (sounds.length) args.push('-c:a', 'aac', '-b:a', '160k');
    } else {
      args.push(...webmVideoArgs());
      if (sounds.length) args.push('-c:a', 'libopus', '-b:a', '128k');
    }
    args.push('-y', out);

    opts.onProgress?.(0.2, 'Encoding…');
    const abort = () => ffmpeg.terminate();
    opts.signal?.addEventListener('abort', abort, { once: true });
    trace(`exec ${args.join(' ')}`);
    // ffmpeg.wasm swallows wasm crashes inside the worker, leaving exec()
    // pending forever. Treat a long silence from the encoder as a crash.
    let lastLog = Date.now();
    const bump = () => (lastLog = Date.now());
    ffmpeg.on('log', bump);
    const code = await new Promise<number>((resolve, reject) => {
      const timer = window.setInterval(() => {
        if (Date.now() - lastLog > WATCHDOG_MS) {
          window.clearInterval(timer);
          ffmpeg.terminate();
          reject(new Error(CRASH_MESSAGE));
        }
      }, 1000);
      ffmpeg.exec(args).then(
        (c) => {
          window.clearInterval(timer);
          resolve(c);
        },
        (err) => {
          window.clearInterval(timer);
          // A wasm crash rejects with an empty or non-Error value.
          reject(err instanceof Error && err.message ? err : new Error(CRASH_MESSAGE));
        },
      );
    });
    ffmpeg.off('log', bump);
    trace(`exec done code=${code}`);
    opts.signal?.removeEventListener('abort', abort);
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    return new Blob([data.slice()], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    ffmpeg.off('log', onLog);
    // A core that already ran one encode can hang on the next (seen with
    // VP9 after H.264), so every export gets a fresh instance. The wasm is
    // served from the app bundle and cached, so reloading is cheap.
    try {
      ffmpeg.terminate();
    } catch {
      /* already gone */
    }
    ffmpegPromise = null;
  }
}
