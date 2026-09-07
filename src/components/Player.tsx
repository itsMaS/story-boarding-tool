import { useCallback, useEffect, useRef, useState } from 'react';
import { renderContent } from '../canvas/render';
import { slideAtTime, slideDuration, totalDuration } from '../model/project';
import { playSlideSounds } from '../sound/audio';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { fitLayout, type Layout } from '../editor/layout';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export function Player() {
  const project = useProjectStore((s) => s.project);
  const currentSlideId = useUiStore((s) => s.currentSlideId);
  const setCurrentSlide = useUiStore((s) => s.setCurrentSlide);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const soundStopRef = useRef<(() => void) | null>(null);
  const soundSlideRef = useRef<number>(-1);

  const total = project ? totalDuration(project) : 0;

  // Start at the slide that was selected when the player opened.
  const [initialTime] = useState(() => {
    if (!project) return 0;
    const idx = project.slides.findIndex((s) => s.id === currentSlideId);
    let t = 0;
    for (let i = 0; i < idx; i++) t += slideDuration(project, project.slides[i]);
    return t;
  });
  useEffect(() => {
    timeRef.current = initialTime;
    setTime(initialTime);
  }, [initialTime]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !project) return;
    const update = () => setLayout(fitLayout({ width: el.clientWidth, height: el.clientHeight }, project.canvas, 16));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project]);

  const stopSounds = () => {
    soundStopRef.current?.();
    soundStopRef.current = null;
    soundSlideRef.current = -1;
  };

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !project || !layout) return;
      const { index } = slideAtTime(project, t);
      const slide = project.slides[index];
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(layout.cssWidth * dpr);
      const h = Math.round(layout.cssHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d')!;
      const s = layout.scale * dpr;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      renderContent(ctx, project.contents[slide.contentId], project.canvas, {
        background: '#ffffff',
        caption: slide.caption,
        onImageLoaded: () => draw(timeRef.current),
      });
    },
    [project, layout],
  );

  // Playback loop.
  useEffect(() => {
    if (!project) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      if (playing) {
        let t = timeRef.current + dt;
        if (t >= total) {
          if (loop) t = t % Math.max(total, 0.001);
          else {
            t = total;
            setPlaying(false);
          }
        }
        timeRef.current = t;
        setTime(t);
        const { index, start } = slideAtTime(project, t);
        if (index !== soundSlideRef.current) {
          soundStopRef.current?.();
          soundSlideRef.current = index;
          const slide = project.slides[index];
          soundStopRef.current = slide.sounds.length ? playSlideSounds(slide.sounds, t - start, speed) : null;
          setCurrentSlide(slide.id);
        }
      }
      draw(timeRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [project, playing, loop, speed, total, draw, setCurrentSlide]);

  useEffect(() => () => stopSounds(), []);
  useEffect(() => {
    if (!playing) stopSounds();
  }, [playing]);

  if (!project) return null;
  const { index } = slideAtTime(project, time);

  const seek = (t: number) => {
    stopSounds();
    timeRef.current = Math.max(0, Math.min(total, t));
    setTime(timeRef.current);
  };
  const step = (dir: 1 | -1) => {
    const target = Math.max(0, Math.min(project.slides.length - 1, index + dir));
    let t = 0;
    for (let i = 0; i < target; i++) t += slideDuration(project, project.slides[i]);
    seek(t);
    setCurrentSlide(project.slides[target].id);
  };

  return (
    <div className="flex h-full flex-col" data-testid="player">
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-black">
        {layout && (
          <canvas
            ref={canvasRef}
            className="absolute"
            style={{ left: layout.offsetX, top: layout.offsetY, width: layout.cssWidth, height: layout.cssHeight }}
            onClick={() => setPlaying((p) => !p)}
          />
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-panel px-3 py-2 text-sm">
        <button className="btn btn-icon" onClick={() => step(-1)} title="Previous slide">
          ⏮
        </button>
        <button className="btn btn-icon" onClick={() => setPlaying((p) => !p)} title="Play / pause (Space)" data-testid="play-toggle">
          {playing ? '⏸' : '▶'}
        </button>
        <button className="btn btn-icon" onClick={() => step(1)} title="Next slide">
          ⏭
        </button>
        <button
          className="btn btn-icon"
          onClick={() => {
            seek(0);
            setPlaying(false);
          }}
          title="Stop"
        >
          ⏹
        </button>
        <span className="w-24 tabular-nums text-muted">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={total}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Scrub"
        />
        <span className="text-muted">
          Slide {index + 1}/{project.slides.length}
        </span>
        <button className={`btn ${loop ? 'btn-active' : ''}`} onClick={() => setLoop((l) => !l)} title="Loop">
          🔁
        </button>
        <select className="input py-1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
