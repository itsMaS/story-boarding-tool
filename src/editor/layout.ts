import type { CanvasSize } from '../model/types';

export interface Layout {
  /** CSS pixels per canvas unit. */
  scale: number;
  /** CSS pixel offset of the canvas origin inside the container. */
  offsetX: number;
  offsetY: number;
  /** CSS pixel size of the rendered canvas. */
  cssWidth: number;
  cssHeight: number;
}

export function fitLayout(container: { width: number; height: number }, canvas: CanvasSize, padding = 24): Layout {
  const availW = Math.max(1, container.width - padding * 2);
  const availH = Math.max(1, container.height - padding * 2);
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  const cssWidth = canvas.width * scale;
  const cssHeight = canvas.height * scale;
  return {
    scale,
    offsetX: (container.width - cssWidth) / 2,
    offsetY: (container.height - cssHeight) / 2,
    cssWidth,
    cssHeight,
  };
}

export function toCanvasPoint(layout: Layout, cssX: number, cssY: number): { x: number; y: number } {
  return { x: (cssX - layout.offsetX) / layout.scale, y: (cssY - layout.offsetY) / layout.scale };
}

export function toCssPoint(layout: Layout, x: number, y: number): { x: number; y: number } {
  return { x: layout.offsetX + x * layout.scale, y: layout.offsetY + y * layout.scale };
}
