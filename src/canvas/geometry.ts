import type { ImageObject, SceneObject, StrokeObject, StrokePoint } from '../model/types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function strokeBounds(s: StrokeObject): Rect {
  if (s.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = s.size / 2;
  return { x: minX - pad, y: minY - pad, width: maxX - minX + s.size, height: maxY - minY + s.size };
}

/** Axis-aligned bounds of a possibly rotated image. */
export function imageBounds(img: ImageObject): Rect {
  const corners = imageCorners(img);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function imageCorners(img: ImageObject): Point[] {
  const cx = img.x + img.width / 2;
  const cy = img.y + img.height / 2;
  const hw = img.width / 2;
  const hh = img.height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((c) => rotatePoint(c, img.rotation, { x: 0, y: 0 })).map((c) => ({ x: c.x + cx, y: c.y + cy }));
}

export function objectBounds(o: SceneObject): Rect {
  return o.type === 'stroke' ? strokeBounds(o) : imageBounds(o);
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rotatePoint(p: Point, angle: number, origin: Point): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/** Distance from a point to a line segment. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx - p.x;
  const py = a.y + t * dy - p.y;
  return Math.sqrt(px * px + py * py);
}

/** True if the point is on (or within `slack` of) the stroke. */
export function hitStroke(s: StrokeObject, p: Point, slack = 4): boolean {
  const tol = s.size / 2 + slack;
  if (s.points.length === 1) {
    const q = s.points[0];
    return Math.hypot(q.x - p.x, q.y - p.y) <= tol;
  }
  for (let i = 1; i < s.points.length; i++) {
    if (distToSegment(p, s.points[i - 1], s.points[i]) <= tol) return true;
  }
  return false;
}

/** True if the point is inside the (rotated) image rectangle. */
export function hitImage(img: ImageObject, p: Point): boolean {
  const cx = img.x + img.width / 2;
  const cy = img.y + img.height / 2;
  const local = rotatePoint(p, -img.rotation, { x: cx, y: cy });
  return Math.abs(local.x - cx) <= img.width / 2 && Math.abs(local.y - cy) <= img.height / 2;
}

export function hitObject(o: SceneObject, p: Point): boolean {
  return o.type === 'stroke' ? hitStroke(o, p) : hitImage(o, p);
}

/** Topmost object under the point, or undefined. */
export function pickObject(objects: SceneObject[], p: Point): SceneObject | undefined {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type === 'stroke' && o.eraser) continue;
    if (hitObject(o, p)) return o;
  }
  return undefined;
}

export function translateObject<T extends SceneObject>(o: T, dx: number, dy: number): T {
  if (o.type === 'stroke') {
    return { ...o, points: o.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  }
  return { ...o, x: o.x + dx, y: o.y + dy };
}

/**
 * Scales an object so that its bounds map from `from` to `to`.
 * Strokes have their points remapped; images get new position and size.
 */
export function fitObjectToRect<T extends SceneObject>(o: T, from: Rect, to: Rect): T {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  if (o.type === 'stroke') {
    const scale = Math.sqrt(Math.abs(sx * sy));
    return {
      ...o,
      size: Math.max(0.5, o.size * scale),
      points: o.points.map((p) => ({
        ...p,
        x: to.x + (p.x - from.x) * sx,
        y: to.y + (p.y - from.y) * sy,
      })),
    };
  }
  return {
    ...o,
    x: to.x + (o.x - from.x) * sx,
    y: to.y + (o.y - from.y) * sy,
    width: o.width * sx,
    height: o.height * sy,
  };
}

export function flipObject<T extends SceneObject>(o: T, axis: 'h' | 'v', around: Rect): T {
  const cx = around.x + around.width / 2;
  const cy = around.y + around.height / 2;
  if (o.type === 'stroke') {
    return {
      ...o,
      points: o.points.map((p) => (axis === 'h' ? { ...p, x: 2 * cx - p.x } : { ...p, y: 2 * cy - p.y })),
    };
  }
  const ocx = o.x + o.width / 2;
  const ocy = o.y + o.height / 2;
  if (axis === 'h') {
    return { ...o, x: 2 * cx - ocx - o.width / 2, flipH: !o.flipH, rotation: -o.rotation };
  }
  return { ...o, y: 2 * cy - ocy - o.height / 2, flipV: !o.flipV, rotation: -o.rotation };
}

export function rotateObject<T extends SceneObject>(o: T, angle: number, origin: Point): T {
  if (o.type === 'stroke') {
    return { ...o, points: o.points.map((p) => ({ ...p, ...rotatePoint(p, angle, origin) })) };
  }
  const c = rotatePoint({ x: o.x + o.width / 2, y: o.y + o.height / 2 }, angle, origin);
  return { ...o, x: c.x - o.width / 2, y: c.y - o.height / 2, rotation: o.rotation + angle };
}

export function pointsLength(points: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}
