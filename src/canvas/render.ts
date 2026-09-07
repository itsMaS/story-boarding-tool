import type { CanvasSize, ImageObject, SceneObject, SlideContent, StrokeObject } from '../model/types';
import { getCachedImage, loadImage } from './imageCache';

export interface RenderOptions {
  /** Called once per image that was not yet decoded, after it loads. */
  onImageLoaded?: () => void;
  /** Draw caption bar at the bottom. */
  caption?: string;
  /** Fill colour behind everything. Transparent when omitted. */
  background?: string;
  /** Ids to skip (used while dragging a temporary copy). */
  skipIds?: Set<string>;
}

export const CAPTION_FONT_FRACTION = 0.032;

/** Width of a stroke segment at a given pressure. */
export function strokeWidth(s: StrokeObject, pressure: number): number {
  return Math.max(0.5, s.size * (0.4 + 0.9 * pressure));
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeObject): void {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.globalAlpha = s.eraser ? 1 : s.opacity;
  ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.eraser ? '#000' : s.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, strokeWidth(s, pts[0].p) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Draw quadratic segments through midpoints, each with its own width.
  // Overlapping round caps hide the seams between segments.
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const mid = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
    ctx.lineWidth = strokeWidth(s, (prev.p + cur.p) / 2);
    ctx.beginPath();
    if (i === 1) ctx.moveTo(prev.x, prev.y);
    else {
      const prevMid = { x: (pts[i - 2].x + prev.x) / 2, y: (pts[i - 2].y + prev.y) / 2 };
      ctx.moveTo(prevMid.x, prevMid.y);
    }
    if (i === pts.length - 1) ctx.quadraticCurveTo(prev.x, prev.y, cur.x, cur.y);
    else ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
    ctx.stroke();
    prev = cur;
  }
  ctx.restore();
}

export function drawImage(ctx: CanvasRenderingContext2D, o: ImageObject, opts: RenderOptions): void {
  const img = getCachedImage(o.src);
  if (!img) {
    loadImage(o.src)
      .then(() => opts.onImageLoaded?.())
      .catch(() => undefined);
    return;
  }
  ctx.save();
  ctx.globalAlpha = o.opacity;
  ctx.translate(o.x + o.width / 2, o.y + o.height / 2);
  ctx.rotate(o.rotation);
  ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  const sx = o.crop.x * img.naturalWidth;
  const sy = o.crop.y * img.naturalHeight;
  const sw = Math.max(1, o.crop.w * img.naturalWidth);
  const sh = Math.max(1, o.crop.h * img.naturalHeight);
  ctx.drawImage(img, sx, sy, sw, sh, -o.width / 2, -o.height / 2, o.width, o.height);
  ctx.restore();
}

export function drawObject(ctx: CanvasRenderingContext2D, o: SceneObject, opts: RenderOptions = {}): void {
  if (o.type === 'stroke') drawStroke(ctx, o);
  else drawImage(ctx, o, opts);
}

export function drawCaption(ctx: CanvasRenderingContext2D, size: CanvasSize, caption: string): void {
  if (!caption.trim()) return;
  const fontSize = Math.round(size.height * CAPTION_FONT_FRACTION);
  const pad = fontSize * 0.6;
  ctx.save();
  ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const lines = wrapText(ctx, caption, size.width - pad * 4);
  const barH = lines.length * fontSize * 1.3 + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, size.height - barH, size.width, barH);
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => {
    ctx.fillText(line, size.width / 2, size.height - barH + pad + fontSize * 0.65 + i * fontSize * 1.3);
  });
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * Renders slide content into a context whose coordinate space is already the
 * project canvas (0..width, 0..height). The context is cleared first.
 */
export function renderContent(
  ctx: CanvasRenderingContext2D,
  content: SlideContent | undefined,
  size: CanvasSize,
  opts: RenderOptions = {},
): void {
  ctx.save();
  ctx.setTransform(ctx.getTransform());
  ctx.clearRect(0, 0, size.width, size.height);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  // Objects are drawn into an isolated group so eraser strokes only cut
  // drawn content, never the background fill.
  if (content) {
    const needsIsolation = opts.background && content.objects.some((o) => o.type === 'stroke' && o.eraser);
    if (needsIsolation) {
      const layer = createLayer(size);
      const lctx = layer.getContext('2d')!;
      for (const o of content.objects) {
        if (opts.skipIds?.has(o.id)) continue;
        drawObject(lctx, o, opts);
      }
      ctx.drawImage(layer, 0, 0);
    } else {
      for (const o of content.objects) {
        if (opts.skipIds?.has(o.id)) continue;
        drawObject(ctx, o, opts);
      }
    }
  }
  if (opts.caption) drawCaption(ctx, size, opts.caption);
  ctx.restore();
}

const layerPool: HTMLCanvasElement[] = [];
function createLayer(size: CanvasSize): HTMLCanvasElement {
  let c = layerPool.find((l) => l.width === size.width && l.height === size.height);
  if (!c) {
    c = document.createElement('canvas');
    c.width = size.width;
    c.height = size.height;
    layerPool.push(c);
    if (layerPool.length > 3) layerPool.shift();
  } else {
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }
  return c;
}

/** Renders a slide into a fresh offscreen canvas at the given pixel size (letterboxed if aspect differs). */
export function renderToCanvas(
  content: SlideContent | undefined,
  size: CanvasSize,
  out: CanvasSize,
  opts: RenderOptions & { background?: string } = {},
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(out.width));
  canvas.height = Math.max(1, Math.round(out.height));
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(canvas.width / size.width, canvas.height / size.height);
  const ox = (canvas.width - size.width * scale) / 2;
  const oy = (canvas.height - size.height * scale) / 2;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  renderContent(ctx, content, size, opts);
  return canvas;
}

export function collectImageSrcs(contents: Iterable<SlideContent>): Set<string> {
  const set = new Set<string>();
  for (const c of contents) for (const o of c.objects) if (o.type === 'image') set.add(o.src);
  return set;
}
