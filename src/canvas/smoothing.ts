import type { StrokePoint } from '../model/types';

/**
 * Light input smoothing: an exponential moving average on position with a
 * small window so fast strokes still keep their shape. Pressure is averaged
 * over a slightly wider window because stylus pressure is noisy.
 */
export class StrokeSmoother {
  private last: StrokePoint | null = null;
  private pressures: number[] = [];
  readonly points: StrokePoint[] = [];

  constructor(
    private readonly positionAlpha = 0.55,
    private readonly minDistance = 1.5,
  ) {}

  add(raw: StrokePoint): StrokePoint | null {
    this.pressures.push(raw.p);
    if (this.pressures.length > 4) this.pressures.shift();
    const p = this.pressures.reduce((a, b) => a + b, 0) / this.pressures.length;

    if (!this.last) {
      const first = { x: raw.x, y: raw.y, p };
      this.last = first;
      this.points.push(first);
      return first;
    }
    const x = this.last.x + (raw.x - this.last.x) * this.positionAlpha;
    const y = this.last.y + (raw.y - this.last.y) * this.positionAlpha;
    if (Math.hypot(x - this.last.x, y - this.last.y) < this.minDistance) return null;
    const next = { x, y, p };
    this.last = next;
    this.points.push(next);
    return next;
  }

  /** Snap the tail to where the pointer actually lifted so short strokes don't fall short. */
  finish(raw: StrokePoint): StrokePoint[] {
    if (this.last && Math.hypot(raw.x - this.last.x, raw.y - this.last.y) >= this.minDistance) {
      this.points.push({ x: raw.x, y: raw.y, p: this.last.p });
    }
    return this.points;
  }
}

/** Drops points that are nearly collinear, keeping the shape within `tolerance` px. */
export function simplify(points: StrokePoint[], tolerance = 0.6): StrokePoint[] {
  if (points.length < 3) return points;
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (cross / len > tolerance || Math.abs(b.p - a.p) > 0.08) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}
