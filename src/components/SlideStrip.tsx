import { useState } from 'react';
import { isLinked, slideDuration } from '../model/project';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { SlideThumbnail } from './SlideThumbnail';

const THUMB_W = 128;

export function SlideStrip() {
  const project = useProjectStore((s) => s.project);
  const addSlide = useProjectStore((s) => s.addSlide);
  const deleteSlide = useProjectStore((s) => s.deleteSlide);
  const moveSlide = useProjectStore((s) => s.moveSlide);
  const currentSlideId = useUiStore((s) => s.currentSlideId);
  const setCurrentSlide = useUiStore((s) => s.setCurrentSlide);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (!project) return null;
  const current = project.slides.find((s) => s.id === currentSlideId);
  const currentContentId = current?.contentId;

  const add = (mode: 'blank' | 'duplicate' | 'link') => {
    const slide = addSlide(currentSlideId, mode);
    setCurrentSlide(slide.id);
  };

  return (
    <footer className="flex h-40 shrink-0 items-stretch gap-2 border-t border-line bg-panel px-2 py-2" data-testid="slide-strip">
      <div className="flex flex-col gap-1">
        <button className="btn text-xs" onClick={() => add('blank')} title="New blank slide after current (N)" data-testid="add-slide">
          + Blank
        </button>
        <button className="btn text-xs" onClick={() => add('duplicate')} title="Duplicate current slide (Ctrl+Shift+D)">
          ⧉ Duplicate
        </button>
        <button className="btn text-xs" onClick={() => add('link')} title="Duplicate as linked slide: edits stay in sync (Ctrl+Shift+L)">
          🔗 Link copy
        </button>
        <button
          className="btn btn-danger text-xs"
          disabled={project.slides.length <= 1}
          onClick={() => {
            if (!current) return;
            const idx = project.slides.indexOf(current);
            const next = project.slides[idx + 1] ?? project.slides[idx - 1];
            deleteSlide(current.id);
            setCurrentSlide(next.id);
          }}
          title="Delete current slide"
        >
          ✕ Delete
        </button>
      </div>
      <div className="flex flex-1 items-start gap-2 overflow-x-auto overflow-y-hidden pb-1">
        {project.slides.map((slide, i) => {
          const linked = isLinked(project, slide);
          const sibling = linked && slide.contentId === currentContentId && slide.id !== currentSlideId;
          const active = slide.id === currentSlideId;
          return (
            <div
              key={slide.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) moveSlide(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onClick={() => setCurrentSlide(slide.id)}
              className={`relative shrink-0 cursor-pointer rounded-md border-2 p-0.5 transition-colors ${
                active ? 'border-accent' : sibling ? 'border-link' : 'border-transparent hover:border-line'
              } ${overIndex === i && dragIndex !== i ? 'ring-2 ring-accent-2' : ''}`}
              data-testid={`slide-thumb-${i}`}
            >
              <SlideThumbnail
                content={project.contents[slide.contentId]}
                canvasSize={project.canvas}
                width={THUMB_W}
                caption={slide.caption}
                className="rounded-sm"
              />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
                {slideDuration(project, slide)}s
              </span>
              {linked && (
                <span
                  className="absolute right-1 top-1 rounded bg-link px-1 text-[10px] text-black"
                  title="Linked slide: shares its drawing with other slides"
                >
                  🔗
                </span>
              )}
              {slide.sounds.length > 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white" title="Has sounds">
                  🔊{slide.sounds.length}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {current && <SlideProps slideId={current.id} />}
    </footer>
  );
}

function SlideProps({ slideId }: { slideId: string }) {
  const project = useProjectStore((s) => s.project)!;
  const updateSlide = useProjectStore((s) => s.updateSlide);
  const unlinkSlide = useProjectStore((s) => s.unlinkSlide);
  const slide = project.slides.find((s) => s.id === slideId)!;
  const linked = isLinked(project, slide);
  const siblings = project.slides.filter((s) => s.contentId === slide.contentId).length;

  return (
    <div className="flex w-56 shrink-0 flex-col gap-1.5 border-l border-line pl-2 text-xs">
      <label className="flex items-center justify-between gap-2">
        <span className="label">Duration</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="input w-16 py-1"
            value={slide.duration ?? ''}
            placeholder={String(project.defaultDuration)}
            onChange={(e) => updateSlide(slide.id, { duration: e.target.value === '' ? undefined : Number(e.target.value) })}
            data-testid="slide-duration"
          />
          s
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Caption</span>
        <textarea
          className="input h-12 resize-none py-1"
          value={slide.caption}
          placeholder="Shown at the bottom in playback and export"
          onChange={(e) => updateSlide(slide.id, { caption: e.target.value })}
        />
      </label>
      {linked ? (
        <div className="flex items-center justify-between gap-1 text-link">
          <span>🔗 Linked with {siblings - 1} other</span>
          <button className="btn py-1 text-[11px]" onClick={() => unlinkSlide(slide.id)} title="Make this slide independent">
            Unlink
          </button>
        </div>
      ) : (
        <span className="text-muted">Not linked</span>
      )}
    </div>
  );
}
