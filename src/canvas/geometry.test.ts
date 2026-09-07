import { describe, expect, it } from 'vitest';
import { fitObjectToRect, flipObject, hitImage, hitStroke, imageBounds, pickObject, strokeBounds } from './geometry';
import type { ImageObject, StrokeObject } from '../model/types';
import { StrokeSmoother, simplify } from './smoothing';

const stroke: StrokeObject = {
  id: 's1',
  type: 'stroke',
  color: '#000',
  size: 4,
  eraser: false,
  opacity: 1,
  points: [
    { x: 10, y: 10, p: 0.5 },
    { x: 50, y: 10, p: 0.5 },
  ],
};

const image: ImageObject = {
  id: 'i1',
  type: 'image',
  src: 'data:,',
  naturalWidth: 100,
  naturalHeight: 50,
  x: 100,
  y: 100,
  width: 100,
  height: 50,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  lockAspect: true,
};

describe('geometry', () => {
  it('computes stroke bounds with padding', () => {
    expect(strokeBounds(stroke)).toEqual({ x: 8, y: 8, width: 44, height: 4 });
  });

  it('hit-tests strokes with tolerance', () => {
    expect(hitStroke(stroke, { x: 30, y: 12 })).toBe(true);
    expect(hitStroke(stroke, { x: 30, y: 30 })).toBe(false);
  });

  it('hit-tests rotated images', () => {
    const rotated = { ...image, rotation: Math.PI / 2 };
    // Centre stays at (150,125); rotated 90deg the box is 50 wide, 100 tall.
    expect(hitImage(rotated, { x: 150, y: 170 })).toBe(true);
    expect(hitImage(rotated, { x: 195, y: 125 })).toBe(false);
    expect(imageBounds(rotated).width).toBeCloseTo(50);
  });

  it('picks topmost non-eraser object', () => {
    const eraser = { ...stroke, id: 'e', eraser: true };
    expect(pickObject([stroke, eraser], { x: 30, y: 10 })?.id).toBe('s1');
  });

  it('fits objects to a new rect', () => {
    const from = { x: 0, y: 0, width: 100, height: 100 };
    const to = { x: 0, y: 0, width: 200, height: 200 };
    const scaled = fitObjectToRect(stroke, from, to);
    expect(scaled.points[1]).toEqual({ x: 100, y: 20, p: 0.5 });
    expect(scaled.size).toBe(8);
    const img = fitObjectToRect(image, from, to);
    expect(img.x).toBe(200);
    expect(img.width).toBe(200);
  });

  it('flips strokes around a rect', () => {
    const flipped = flipObject(stroke, 'h', { x: 0, y: 0, width: 60, height: 20 });
    expect(flipped.points[0].x).toBe(50);
    expect(flipped.points[1].x).toBe(10);
  });
});

describe('smoothing', () => {
  it('smooths and drops tiny movements', () => {
    const s = new StrokeSmoother();
    s.add({ x: 0, y: 0, p: 1 });
    expect(s.add({ x: 0.5, y: 0, p: 1 })).toBeNull();
    const pt = s.add({ x: 10, y: 0, p: 1 });
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeGreaterThan(0);
    expect(pt!.x).toBeLessThan(10);
    const pts = s.finish({ x: 10, y: 0, p: 1 });
    expect(pts[pts.length - 1].x).toBe(10);
  });

  it('simplifies collinear points', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0, p: 0.5 }));
    expect(simplify(pts)).toHaveLength(2);
  });
});
