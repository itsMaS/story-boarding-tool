import { useState } from 'react';
import { isLinked, slideDuration } from '../model/project';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { SlideThumbnail } from './SlideThumbnail';

export function Overview() {
  const project = useProjectStore((s) => s.project);
  const moveSlide = useProjectStore((s) => s.moveSlide);
  const updateSlide = useProjectStore((s) => s.updateSlide);
  const addSlide = useProjectStore((s) => s.addSlide);
  const currentSlideId = useUiStore((s) => s.currentSlideId);
  const setCurrentSlide = useUiStore((s) => s.setCurrentSlide);
  const setView = useUiStore((s) => s.setView);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [thumbW, setThumbW] = useState(260);

  if (!project) return null;
  const current = project.slides.find((s) => s.id === currentSlideId);

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="overview">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
        <span className="text-muted">Click a slide to select, double-click to edit, drag to reorder.</span>
        <span className="ml-auto label">Size</span>
        <input type="range" min={140} max={480} value={thumbW} onChange={(e) => setThumbW(Number(e.target.value))} />
        <button
          className="btn"
          onClick={() => {
            const s = addSlide(project.slides[project.slides.length - 1].id, 'blank');
            setCurrentSlide(s.id);
          }}
        >
          + Slide
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-wrap gap-4">
          {project.slides.map((slide, i) => {
            const linked = isLinked(project, slide);
            const sibling = linked && current && slide.contentId === current.contentId && slide.id !== current.id;
            const active = slide.id === currentSlideId;
            return (
              <div
                key={slide.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) moveSlide(dragIndex, i);
                  setDragIndex(null);
                }}
                onClick={() => setCurrentSlide(slide.id)}
                onDoubleClick={() => {
                  setCurrentSlide(slide.id);
                  setView('edit');
                }}
                className={`panel relative cursor-pointer overflow-hidden border-2 ${
                  active ? 'border-accent' : sibling ? 'border-link' : 'border-line hover:border-muted'
                }`}
                style={{ width: thumbW }}
              >
                <SlideThumbnail
                  content={project.contents[slide.contentId]}
                  canvasSize={project.canvas}
                  width={thumbW - 4}
                  caption={slide.caption}
                />
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="font-semibold text-muted">{i + 1}</span>
                  {linked && (
                    <span className="rounded bg-link/20 px-1 text-link" title="Linked slide">
                      🔗 linked
                    </span>
                  )}
                  {slide.sounds.length > 0 && <span title="Sounds">🔊{slide.sounds.length}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      className="input w-14 py-0.5 text-xs"
                      value={slide.duration ?? ''}
                      placeholder={String(project.defaultDuration)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateSlide(slide.id, { duration: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      title={`Duration (default ${project.defaultDuration}s)`}
                    />
                    <span className="text-muted">s</span>
                  </span>
                </div>
                <span className="sr-only">{slideDuration(project, slide)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
