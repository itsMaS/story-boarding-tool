import { preloadImages } from '../canvas/imageCache';
import { collectImageSrcs, renderToCanvas } from '../canvas/render';
import { slideDuration } from '../model/project';
import type { CanvasSize, Project } from '../model/types';

export interface ExportSize {
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: Array<{ id: string; label: string; shortEdge: number | null }> = [
  { id: '480p', label: '480p', shortEdge: 480 },
  { id: '720p', label: '720p', shortEdge: 720 },
  { id: '1080p', label: '1080p', shortEdge: 1080 },
  { id: 'native', label: 'Native', shortEdge: null },
];

/** Output size for a preset, keeping the project aspect and even dimensions (codecs need even). */
export function exportSize(canvas: CanvasSize, shortEdge: number | null): ExportSize {
  if (shortEdge === null) return { width: even(canvas.width), height: even(canvas.height) };
  const landscape = canvas.width >= canvas.height;
  const scale = landscape ? shortEdge / canvas.height : shortEdge / canvas.width;
  return { width: even(canvas.width * scale), height: even(canvas.height * scale) };
}

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

export interface SlideFrame {
  index: number;
  canvas: HTMLCanvasElement;
  durationSec: number;
}

/** Renders one still per slide at the output size. */
export async function renderSlides(project: Project, size: ExportSize, includeCaptions = true): Promise<SlideFrame[]> {
  await preloadImages(collectImageSrcs(Object.values(project.contents)));
  return project.slides.map((slide, index) => ({
    index,
    durationSec: slideDuration(project, slide),
    canvas: renderToCanvas(project.contents[slide.contentId], project.canvas, size, {
      background: '#ffffff',
      caption: includeCaptions ? slide.caption : undefined,
    }),
  }));
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

/** Number of video frames a slide occupies at a given fps (at least one). */
export function framesForSlide(durationSec: number, fps: number): number {
  return Math.max(1, Math.round(durationSec * fps));
}
