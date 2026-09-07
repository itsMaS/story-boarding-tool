import { objectBounds, unionRects, type Rect } from '../canvas/geometry';
import { preloadImages } from '../canvas/imageCache';
import { collectImageSrcs, renderContent } from '../canvas/render';
import { canvasToBlob } from '../export/frames';
import type { Project, SceneObject, SlideContent } from '../model/types';

export interface Flattened {
  blob: Blob;
  /** Canvas-space rect the image covers. */
  rect: Rect;
  width: number;
  height: number;
}

/**
 * Renders a set of objects (or the whole slide) to a PNG no larger than
 * `maxEdge` on its longest side, on a white background.
 */
export async function flattenObjects(project: Project, content: SlideContent, ids: string[] | null, maxEdge: number): Promise<Flattened> {
  await preloadImages(collectImageSrcs([content]));
  const objects = ids ? content.objects.filter((o) => ids.includes(o.id)) : content.objects;
  let rect: Rect;
  if (ids) {
    const b = unionRects(objects.map(objectBounds));
    const pad = Math.max(8, Math.min(b.width, b.height) * 0.06);
    rect = clampRect({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }, project.canvas);
  } else {
    rect = { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height };
  }
  const scale = Math.min(1, maxEdge / Math.max(rect.width, rect.height));
  const width = Math.max(64, Math.round(rect.width * scale));
  const height = Math.max(64, Math.round(rect.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale);
  // Keep eraser strokes that precede the selection so the flattened picture matches what the user sees.
  const withErasers = ids ? keepErasers(content.objects, objects) : objects;
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const lctx = layer.getContext('2d')!;
  lctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale);
  renderContent(lctx, { id: content.id, objects: withErasers }, project.canvas, {});
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  return { blob: await canvasToBlob(canvas), rect, width, height };
}

function keepErasers(all: SceneObject[], selected: SceneObject[]): SceneObject[] {
  const sel = new Set(selected.map((o) => o.id));
  const firstIdx = all.findIndex((o) => sel.has(o.id));
  return all.filter((o, i) => sel.has(o.id) || (o.type === 'stroke' && o.eraser && i > firstIdx));
}

function clampRect(r: Rect, size: { width: number; height: number }): Rect {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, width: Math.min(size.width - x, r.width - (x - r.x)), height: Math.min(size.height - y, r.height - (y - r.y)) };
}

/** Renders reference slides for style guidance. */
export async function renderReferences(project: Project, maxEdge: number, excludeContentId?: string): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const id of project.style.referenceSlideIds) {
    const slide = project.slides.find((s) => s.id === id);
    if (!slide || slide.contentId === excludeContentId) continue;
    const content = project.contents[slide.contentId];
    if (!content || content.objects.length === 0) continue;
    out.push((await flattenObjects(project, content, null, maxEdge)).blob);
  }
  return out;
}
