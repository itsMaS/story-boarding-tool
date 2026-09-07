import { useEffect, useRef } from 'react';
import { renderToCanvas } from '../canvas/render';
import type { CanvasSize, SlideContent } from '../model/types';

interface Props {
  content: SlideContent | undefined;
  canvasSize: CanvasSize;
  width: number;
  caption?: string;
  className?: string;
}

/** Small canvas that re-renders when the content object identity changes. */
export function SlideThumbnail({ content, canvasSize, width, caption, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * canvasSize.height) / canvasSize.width);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const off = renderToCanvas(content, canvasSize, { width: width * dpr, height: height * dpr }, {
        background: '#ffffff',
        caption,
        onImageLoaded: draw,
      });
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
    };
    draw();
    return () => {
      cancelled = true;
    };
  }, [content, canvasSize, width, height, caption]);

  return <canvas ref={ref} className={className} style={{ width, height }} />;
}
