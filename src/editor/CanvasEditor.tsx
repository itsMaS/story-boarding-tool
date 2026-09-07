import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fitObjectToRect,
  objectBounds,
  pickObject,
  rectContains,
  rectsIntersect,
  rotateObject,
  translateObject,
  unionRects,
  type Point,
  type Rect,
} from '../canvas/geometry';
import { importImageBlob, imagesFromDataTransfer } from '../canvas/importImage';
import { drawStroke, renderContent, renderToCanvas } from '../canvas/render';
import { simplify, StrokeSmoother } from '../canvas/smoothing';
import { newId } from '../model/ids';
import type { SceneObject, SlideContent, StrokeObject } from '../model/types';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { fitLayout, toCanvasPoint, toCssPoint, type Layout } from './layout';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

type Drag =
  | { kind: 'draw'; smoother: StrokeSmoother; stroke: StrokeObject; base: HTMLCanvasElement }
  | { kind: 'move'; start: Point; originals: SceneObject[]; moved: boolean }
  | { kind: 'resize'; handle: HandleId; startBounds: Rect; originals: SceneObject[] }
  | { kind: 'rotate'; center: Point; startAngle: number; originals: SceneObject[] }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean };

const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 28;

interface Props {
  slideId: string;
}

export function CanvasEditor({ slideId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const draftRef = useRef<SceneObject[] | null>(null);
  const pointerCssRef = useRef<Point | null>(null);
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  const project = useProjectStore((s) => s.project);
  const setObjects = useProjectStore((s) => s.setObjects);
  const tool = useUiStore((s) => s.tool);
  const color = useUiStore((s) => s.color);
  const size = useUiStore((s) => s.size);
  const eraserSize = useUiStore((s) => s.eraserSize);
  const opacity = useUiStore((s) => s.opacity);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelection = useUiStore((s) => s.setSelection);
  const onionSkin = useUiStore((s) => s.onionSkin);
  const showToast = useUiStore((s) => s.showToast);

  const slideIndex = project?.slides.findIndex((s) => s.id === slideId) ?? -1;
  const slide = slideIndex >= 0 ? project!.slides[slideIndex] : undefined;
  const content = slide ? project!.contents[slide.contentId] : undefined;
  const prevSlide = slideIndex > 0 ? project!.slides[slideIndex - 1] : undefined;
  const prevContent = prevSlide && prevSlide.contentId !== slide?.contentId ? project!.contents[prevSlide.contentId] : undefined;
  const canvasSize = project?.canvas;

  // --- layout -------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !canvasSize) return;
    const update = () => setLayout(fitLayout({ width: el.clientWidth, height: el.clientHeight }, canvasSize));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasSize]);

  // --- drawing the main canvas ------------------------------------------
  const onionCache = useRef<{ id: string; objects: SceneObject[]; canvas: HTMLCanvasElement } | null>(null);

  const drawMain = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas || !layout || !canvasSize) return;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(layout.cssWidth * dpr);
    const pxH = Math.round(layout.cssHeight * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext('2d')!;
    const s = layout.scale * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);

    const drag = dragRef.current;
    const objects = draftRef.current ?? content?.objects ?? [];
    const drawContent: SlideContent = { id: content?.id ?? '', objects };

    if (drag?.kind === 'draw') {
      // Fast path while drawing: base snapshot + in-progress stroke.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(drag.base, 0, 0);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      if (drag.stroke.eraser) {
        // Eraser preview: draw the stroke as a faint white cut on top.
        drawStroke(ctx, { ...drag.stroke, eraser: false, color: '#ffffff', opacity: 1 });
      } else {
        drawStroke(ctx, drag.stroke);
      }
      return;
    }

    renderContent(ctx, undefined, canvasSize, { background: '#ffffff' });
    if (onionSkin && prevContent) {
      let cached = onionCache.current;
      if (!cached || cached.id !== prevContent.id || cached.objects !== prevContent.objects) {
        cached = {
          id: prevContent.id,
          objects: prevContent.objects,
          canvas: renderToCanvas(prevContent, canvasSize, { width: pxW, height: pxH }, { onImageLoaded: rerender }),
        };
        onionCache.current = cached;
      }
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(cached.canvas, 0, 0);
      ctx.restore();
      ctx.setTransform(s, 0, 0, s, 0, 0);
    }
    // Draw objects into an isolated layer so erasers don't cut the background.
    const layer = renderToCanvas(drawContent, canvasSize, { width: pxW, height: pxH }, { onImageLoaded: rerender });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }, [layout, canvasSize, content, onionSkin, prevContent, rerender]);

  // --- overlay: selection, marquee, brush cursor ------------------------
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(layout.cssWidth * dpr);
    const pxH = Math.round(layout.cssHeight * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
    const local: Layout = { ...layout, offsetX: 0, offsetY: 0 };
    const drag = dragRef.current;
    const objects = draftRef.current ?? content?.objects ?? [];

    if (tool === 'select') {
      const selected = objects.filter((o) => selectedIds.includes(o.id));
      for (const o of selected) {
        const b = objectBounds(o);
        const a = toCssPoint(local, b.x, b.y);
        ctx.strokeStyle = 'rgba(79,140,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(a.x, a.y, b.width * local.scale, b.height * local.scale);
      }
      if (selected.length > 0) {
        const b = unionRects(selected.map(objectBounds));
        const a = toCssPoint(local, b.x, b.y);
        const w = b.width * local.scale;
        const h = b.height * local.scale;
        ctx.strokeStyle = '#4f8cff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(a.x, a.y, w, h);
        for (const [, pos] of handlePositions({ x: a.x, y: a.y, width: w, height: h })) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#4f8cff';
          ctx.beginPath();
          ctx.rect(pos.x - HANDLE_PX / 2, pos.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
          ctx.fill();
          ctx.stroke();
        }
        const rot = rotateHandlePos({ x: a.x, y: a.y, width: w, height: h });
        ctx.beginPath();
        ctx.moveTo(a.x + w / 2, a.y);
        ctx.lineTo(rot.x, rot.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rot.x, rot.y, HANDLE_PX / 2 + 1, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
      }
      if (drag?.kind === 'marquee') {
        const a = toCssPoint(local, Math.min(drag.start.x, drag.current.x), Math.min(drag.start.y, drag.current.y));
        const w = Math.abs(drag.current.x - drag.start.x) * local.scale;
        const h = Math.abs(drag.current.y - drag.start.y) * local.scale;
        ctx.fillStyle = 'rgba(79,140,255,0.12)';
        ctx.strokeStyle = '#4f8cff';
        ctx.setLineDash([4, 3]);
        ctx.fillRect(a.x, a.y, w, h);
        ctx.strokeRect(a.x, a.y, w, h);
        ctx.setLineDash([]);
      }
    } else if (pointerCssRef.current) {
      const p = pointerCssRef.current;
      const r = ((tool === 'eraser' ? eraserSize : size) * local.scale) / 2;
      ctx.beginPath();
      ctx.arc(p.x - layout.offsetX, p.y - layout.offsetY, Math.max(2, r), 0, Math.PI * 2);
      ctx.strokeStyle = tool === 'eraser' ? '#e5484d' : 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(p.x - layout.offsetX, p.y - layout.offsetY, Math.max(2, r) + 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [layout, content, tool, selectedIds, size, eraserSize]);

  useEffect(() => {
    drawMain();
    drawOverlay();
  });

  const scheduleRedraw = useMemo(() => {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        drawMain();
        drawOverlay();
      });
    };
  }, [drawMain, drawOverlay]);

  // --- pointer handling ---------------------------------------------------
  const cssPoint = (e: React.PointerEvent | PointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const canvasPoint = (e: React.PointerEvent | PointerEvent): Point => {
    const c = cssPoint(e);
    return toCanvasPoint(layout!, c.x, c.y);
  };

  const commit = (objects: SceneObject[]) => {
    if (content) setObjects(content.id, objects);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!layout || !content || !canvasSize) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    const css = cssPoint(e);
    pointerCssRef.current = css;

    if (tool === 'pen' || tool === 'eraser') {
      const smoother = new StrokeSmoother();
      const pressure = e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5;
      smoother.add({ x: p.x, y: p.y, p: pressure });
      const stroke: StrokeObject = {
        id: newId('o'),
        type: 'stroke',
        points: smoother.points,
        color,
        size: tool === 'eraser' ? eraserSize : size,
        eraser: tool === 'eraser',
        opacity: tool === 'eraser' ? 1 : opacity,
      };
      const base = document.createElement('canvas');
      base.width = mainRef.current!.width;
      base.height = mainRef.current!.height;
      base.getContext('2d')!.drawImage(mainRef.current!, 0, 0);
      dragRef.current = { kind: 'draw', smoother, stroke, base };
      scheduleRedraw();
      return;
    }

    // select tool
    const selected = content.objects.filter((o) => selectedIds.includes(o.id));
    if (selected.length > 0) {
      const b = unionRects(selected.map(objectBounds));
      const handle = hitHandle(layout, b, css);
      if (handle === 'rotate') {
        const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        dragRef.current = { kind: 'rotate', center, startAngle: Math.atan2(p.y - center.y, p.x - center.x), originals: selected };
        return;
      }
      if (handle) {
        dragRef.current = { kind: 'resize', handle, startBounds: b, originals: selected };
        return;
      }
    }
    const hit = pickObject(content.objects, p);
    if (hit) {
      let ids = selectedIds;
      if (e.shiftKey) {
        ids = ids.includes(hit.id) ? ids.filter((i) => i !== hit.id) : [...ids, hit.id];
        setSelection(ids);
        return;
      }
      if (!ids.includes(hit.id)) {
        ids = [hit.id];
        setSelection(ids);
      }
      const originals = content.objects.filter((o) => ids.includes(o.id));
      dragRef.current = { kind: 'move', start: p, originals, moved: false };
      return;
    }
    if (!e.shiftKey) setSelection([]);
    dragRef.current = { kind: 'marquee', start: p, current: p, additive: e.shiftKey };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!layout || !content) return;
    pointerCssRef.current = cssPoint(e);
    const drag = dragRef.current;
    if (!drag) {
      if (tool !== 'select') scheduleRedraw();
      return;
    }
    const p = canvasPoint(e);
    switch (drag.kind) {
      case 'draw': {
        const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
        for (const ev of events.length ? events : [e.nativeEvent]) {
          const cp = canvasPoint(ev);
          const pressure = ev.pointerType === 'mouse' ? 0.5 : ev.pressure || 0.5;
          drag.smoother.add({ x: cp.x, y: cp.y, p: pressure });
        }
        break;
      }
      case 'move': {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true;
        const moved = new Map(drag.originals.map((o) => [o.id, translateObject(o, dx, dy)]));
        draftRef.current = content.objects.map((o) => moved.get(o.id) ?? o);
        break;
      }
      case 'resize': {
        const next = resizeRect(drag.startBounds, drag.handle, p, e.shiftKey || singleLockedImage(drag.originals));
        const changed = new Map(drag.originals.map((o) => [o.id, fitObjectToRect(o, drag.startBounds, next)]));
        draftRef.current = content.objects.map((o) => changed.get(o.id) ?? o);
        break;
      }
      case 'rotate': {
        let angle = Math.atan2(p.y - drag.center.y, p.x - drag.center.x) - drag.startAngle;
        if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
        const changed = new Map(drag.originals.map((o) => [o.id, rotateObject(o, angle, drag.center)]));
        draftRef.current = content.objects.map((o) => changed.get(o.id) ?? o);
        break;
      }
      case 'marquee':
        drag.current = p;
        break;
    }
    scheduleRedraw();
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !content || !layout) return;
    switch (drag.kind) {
      case 'draw': {
        const p = canvasPoint(e);
        const pts = simplify(drag.smoother.finish({ x: p.x, y: p.y, p: 0.5 }));
        const stroke = { ...drag.stroke, points: pts };
        commit([...content.objects, stroke]);
        break;
      }
      case 'move':
        if (drag.moved && draftRef.current) commit(draftRef.current);
        break;
      case 'resize':
      case 'rotate':
        if (draftRef.current) commit(draftRef.current);
        break;
      case 'marquee': {
        const r: Rect = {
          x: Math.min(drag.start.x, drag.current.x),
          y: Math.min(drag.start.y, drag.current.y),
          width: Math.abs(drag.current.x - drag.start.x),
          height: Math.abs(drag.current.y - drag.start.y),
        };
        const inside = content.objects
          .filter((o) => !(o.type === 'stroke' && o.eraser))
          .filter((o) => rectsIntersect(r, objectBounds(o)))
          .map((o) => o.id);
        setSelection(drag.additive ? Array.from(new Set([...selectedIds, ...inside])) : inside);
        break;
      }
    }
    draftRef.current = null;
    scheduleRedraw();
  };

  const onPointerLeave = () => {
    pointerCssRef.current = null;
    scheduleRedraw();
  };

  // --- paste / drop -------------------------------------------------------
  const addImages = useCallback(
    async (blobs: Blob[]) => {
      if (!content || !canvasSize || blobs.length === 0) return;
      const store = useProjectStore.getState();
      const current = store.project?.contents[content.id];
      if (!current) return;
      try {
        const imgs = await Promise.all(blobs.map((b) => importImageBlob(b, canvasSize)));
        imgs.forEach((img, i) => {
          img.x += i * 24;
          img.y += i * 24;
        });
        store.setObjects(content.id, [...current.objects, ...imgs]);
        useUiStore.getState().setTool('select');
        setSelection(imgs.map((i) => i.id));
      } catch (err) {
        showToast(`Could not import image: ${(err as Error).message}`, 'error');
      }
    },
    [content, canvasSize, setSelection, showToast],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const blobs = imagesFromDataTransfer(e.clipboardData);
      if (blobs.length) {
        e.preventDefault();
        void addImages(blobs);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void addImages(imagesFromDataTransfer(e.dataTransfer));
  };

  const cursor = tool === 'select' ? 'default' : 'none';

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#0b0d11]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      data-testid="canvas-editor"
    >
      {layout && (
        <div
          className="absolute shadow-[0_0_0_1px_#2c313c,0_20px_60px_rgba(0,0,0,0.5)]"
          style={{ left: layout.offsetX, top: layout.offsetY, width: layout.cssWidth, height: layout.cssHeight, cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={onPointerLeave}
        >
          <canvas ref={mainRef} className="absolute inset-0" style={{ width: layout.cssWidth, height: layout.cssHeight }} />
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0"
            style={{ width: layout.cssWidth, height: layout.cssHeight }}
          />
        </div>
      )}
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function handlePositions(r: Rect): Array<[HandleId, Point]> {
  const { x, y, width: w, height: h } = r;
  return [
    ['nw', { x, y }],
    ['n', { x: x + w / 2, y }],
    ['ne', { x: x + w, y }],
    ['e', { x: x + w, y: y + h / 2 }],
    ['se', { x: x + w, y: y + h }],
    ['s', { x: x + w / 2, y: y + h }],
    ['sw', { x, y: y + h }],
    ['w', { x, y: y + h / 2 }],
  ];
}

function rotateHandlePos(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y - ROTATE_OFFSET_PX };
}

function hitHandle(layout: Layout, bounds: Rect, css: Point): HandleId | null {
  const a = toCssPoint(layout, bounds.x, bounds.y);
  const r: Rect = { x: a.x, y: a.y, width: bounds.width * layout.scale, height: bounds.height * layout.scale };
  const tol = HANDLE_PX;
  const rot = rotateHandlePos(r);
  if (Math.hypot(css.x - rot.x, css.y - rot.y) <= tol) return 'rotate';
  for (const [id, pos] of handlePositions(r)) {
    if (Math.abs(css.x - pos.x) <= tol && Math.abs(css.y - pos.y) <= tol) return id;
  }
  return null;
}

function singleLockedImage(objs: SceneObject[]): boolean {
  return objs.length === 1 && objs[0].type === 'image' && objs[0].lockAspect;
}

function resizeRect(start: Rect, handle: HandleId, p: Point, keepAspect: boolean): Rect {
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.width;
  let y2 = start.y + start.height;
  if (handle.includes('w')) x1 = p.x;
  if (handle.includes('e')) x2 = p.x;
  if (handle.includes('n')) y1 = p.y;
  if (handle.includes('s')) y2 = p.y;
  const minSize = 4;
  if (x2 - x1 < minSize) {
    if (handle.includes('w')) x1 = x2 - minSize;
    else x2 = x1 + minSize;
  }
  if (y2 - y1 < minSize) {
    if (handle.includes('n')) y1 = y2 - minSize;
    else y2 = y1 + minSize;
  }
  if (keepAspect && start.width > 0 && start.height > 0) {
    const aspect = start.width / start.height;
    const corner = handle.length === 2;
    let w = x2 - x1;
    let h = y2 - y1;
    if (corner) {
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
    } else if (handle === 'e' || handle === 'w') h = w / aspect;
    else w = h * aspect;
    if (handle.includes('w')) x1 = x2 - w;
    else x2 = x1 + w;
    if (handle.includes('n')) y1 = y2 - h;
    else y2 = y1 + h;
    if (!corner && (handle === 'e' || handle === 'w')) {
      const cy = start.y + start.height / 2;
      y1 = cy - h / 2;
      y2 = cy + h / 2;
    } else if (!corner) {
      const cx = start.x + start.width / 2;
      x1 = cx - w / 2;
      x2 = cx + w / 2;
    }
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export { rectContains };
