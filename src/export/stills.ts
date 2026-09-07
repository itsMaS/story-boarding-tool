import { zipSync } from 'fflate';
import type { Project } from '../model/types';
import { slideDuration } from '../model/project';
import { canvasToBlob, type SlideFrame } from './frames';

/** Zips one PNG per slide. */
export async function zipSlides(frames: SlideFrame[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of frames) {
    const blob = await canvasToBlob(f.canvas);
    entries[`slide-${String(f.index + 1).padStart(3, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
    onProgress?.(f.index + 1, frames.length);
  }
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped.slice()], { type: 'application/zip' });
}

/** Renders a numbered contact sheet of every slide. */
export async function contactSheet(project: Project, frames: SlideFrame[], columns = 4): Promise<Blob> {
  const thumbW = 480;
  const thumbH = Math.round((thumbW * project.canvas.height) / project.canvas.width);
  const gap = 24;
  const labelH = 36;
  const cols = Math.max(1, Math.min(columns, frames.length));
  const rows = Math.ceil(frames.length / cols);
  const headerH = 80;
  const canvas = document.createElement('canvas');
  canvas.width = gap + cols * (thumbW + gap);
  canvas.height = headerH + gap + rows * (thumbH + labelH + gap);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText(project.name, gap, 50);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#666';
  ctx.fillText(`${project.slides.length} slides · ${frames.reduce((s, f) => s + f.durationSec, 0).toFixed(1)}s`, gap, 72);

  frames.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (thumbW + gap);
    const y = headerH + gap + row * (thumbH + labelH + gap);
    ctx.drawImage(f.canvas, x, y, thumbW, thumbH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, thumbW, thumbH);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`${i + 1}`, x, y + thumbH + 22);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`${slideDuration(project, project.slides[i]).toFixed(1)}s`, x + 30, y + thumbH + 22);
    const caption = project.slides[i].caption.replace(/\s+/g, ' ').trim();
    if (caption) {
      const max = thumbW - 90;
      let text = caption;
      while (ctx.measureText(text).width > max && text.length > 3) text = text.slice(0, -4) + '…';
      ctx.fillText(text, x + 80, y + thumbH + 22);
    }
  });
  return canvasToBlob(canvas);
}
