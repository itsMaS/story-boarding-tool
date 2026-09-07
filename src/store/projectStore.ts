import { create } from 'zustand';
import { newId } from '../model/ids';
import { createContent, createProject, createSlide, pruneContents } from '../model/project';
import type { AspectPreset, Project, SceneObject, Slide, SlideSound, StyleSettings } from '../model/types';

interface History {
  past: SceneObject[][];
  future: SceneObject[][];
}

export interface ProjectState {
  project: Project | null;
  /** Undo history keyed by content id. Lives only in memory. */
  history: Record<string, History>;
  /** Incremented on every persisted change; the autosaver watches it. */
  revision: number;

  newProject: (name: string, aspect: AspectPreset) => Project;
  loadProject: (project: Project) => void;
  closeProject: () => void;
  renameProject: (name: string) => void;
  setDefaultDuration: (seconds: number) => void;
  setStyle: (patch: Partial<StyleSettings>) => void;

  /** Replace the objects of a content. Records an undo step unless `record` is false. */
  setObjects: (contentId: string, objects: SceneObject[], record?: boolean) => void;
  undo: (contentId: string) => void;
  redo: (contentId: string) => void;
  canUndo: (contentId: string) => boolean;
  canRedo: (contentId: string) => boolean;

  addSlide: (afterSlideId: string | null, mode: 'blank' | 'duplicate' | 'link') => Slide;
  deleteSlide: (slideId: string) => void;
  moveSlide: (fromIndex: number, toIndex: number) => void;
  updateSlide: (slideId: string, patch: Partial<Omit<Slide, 'id' | 'contentId'>>) => void;
  /** Gives a linked slide its own independent copy of the content. */
  unlinkSlide: (slideId: string) => void;

  addSound: (slideId: string, sound: SlideSound) => void;
  updateSound: (slideId: string, soundId: string, patch: Partial<SlideSound>) => void;
  removeSound: (slideId: string, soundId: string) => void;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: Date.now() };
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  const update = (fn: (p: Project) => Project) =>
    set((s) => (s.project ? { project: touch(fn(s.project)), revision: s.revision + 1 } : s));

  return {
    project: null,
    history: {},
    revision: 0,

    newProject: (name, aspect) => {
      const project = createProject(name, aspect);
      set({ project, history: {}, revision: 0 });
      return project;
    },
    loadProject: (project) => set({ project, history: {}, revision: 0 }),
    closeProject: () => set({ project: null, history: {}, revision: 0 }),
    renameProject: (name) => update((p) => ({ ...p, name })),
    setDefaultDuration: (seconds) => update((p) => ({ ...p, defaultDuration: clampDuration(seconds) })),
    setStyle: (patch) => update((p) => ({ ...p, style: { ...p.style, ...patch } })),

    setObjects: (contentId, objects, record = true) =>
      set((s) => {
        if (!s.project) return s;
        const content = s.project.contents[contentId];
        if (!content) return s;
        const history = { ...s.history };
        if (record) {
          const h = history[contentId] ?? { past: [], future: [] };
          history[contentId] = { past: [...h.past, content.objects], future: [] };
        }
        return {
          project: touch({ ...s.project, contents: { ...s.project.contents, [contentId]: { ...content, objects } } }),
          history,
          revision: s.revision + 1,
        };
      }),

    undo: (contentId) =>
      set((s) => {
        const h = s.history[contentId];
        if (!s.project || !h || h.past.length === 0) return s;
        const content = s.project.contents[contentId];
        const previous = h.past[h.past.length - 1];
        return {
          project: touch({
            ...s.project,
            contents: { ...s.project.contents, [contentId]: { ...content, objects: previous } },
          }),
          history: {
            ...s.history,
            [contentId]: { past: h.past.slice(0, -1), future: [content.objects, ...h.future] },
          },
          revision: s.revision + 1,
        };
      }),

    redo: (contentId) =>
      set((s) => {
        const h = s.history[contentId];
        if (!s.project || !h || h.future.length === 0) return s;
        const content = s.project.contents[contentId];
        const next = h.future[0];
        return {
          project: touch({
            ...s.project,
            contents: { ...s.project.contents, [contentId]: { ...content, objects: next } },
          }),
          history: {
            ...s.history,
            [contentId]: { past: [...h.past, content.objects], future: h.future.slice(1) },
          },
          revision: s.revision + 1,
        };
      }),

    canUndo: (contentId) => (get().history[contentId]?.past.length ?? 0) > 0,
    canRedo: (contentId) => (get().history[contentId]?.future.length ?? 0) > 0,

    addSlide: (afterSlideId, mode) => {
      const p = get().project;
      if (!p) throw new Error('No project');
      const index = afterSlideId ? p.slides.findIndex((s) => s.id === afterSlideId) : p.slides.length - 1;
      const source = index >= 0 ? p.slides[index] : undefined;
      let slide: Slide;
      let contents = p.contents;
      if (mode === 'link' && source) {
        slide = createSlide(source.contentId, { duration: source.duration, caption: source.caption, sounds: [] });
      } else if (mode === 'duplicate' && source) {
        const copy = createContent(p.contents[source.contentId].objects.map((o) => ({ ...o, id: newId('o') })));
        contents = { ...contents, [copy.id]: copy };
        slide = createSlide(copy.id, {
          duration: source.duration,
          caption: source.caption,
          sounds: source.sounds.map((snd) => ({ ...snd, id: newId('snd') })),
        });
      } else {
        const blank = createContent();
        contents = { ...contents, [blank.id]: blank };
        slide = createSlide(blank.id);
      }
      const slides = [...p.slides];
      slides.splice(index + 1, 0, slide);
      update((cur) => ({ ...cur, slides, contents }));
      return slide;
    },

    deleteSlide: (slideId) =>
      update((p) => {
        if (p.slides.length <= 1) return p;
        return pruneContents({ ...p, slides: p.slides.filter((s) => s.id !== slideId) });
      }),

    moveSlide: (from, to) =>
      update((p) => {
        if (from === to || from < 0 || from >= p.slides.length) return p;
        const slides = [...p.slides];
        const [moved] = slides.splice(from, 1);
        slides.splice(Math.max(0, Math.min(slides.length, to)), 0, moved);
        return { ...p, slides };
      }),

    updateSlide: (slideId, patch) =>
      update((p) => ({
        ...p,
        slides: p.slides.map((s) => {
          if (s.id !== slideId) return s;
          const next = { ...s, ...patch };
          if (next.duration !== undefined) next.duration = clampDuration(next.duration);
          return next;
        }),
      })),

    unlinkSlide: (slideId) =>
      update((p) => {
        const slide = p.slides.find((s) => s.id === slideId);
        if (!slide) return p;
        const copy = createContent(p.contents[slide.contentId].objects.map((o) => ({ ...o, id: newId('o') })));
        return {
          ...p,
          contents: { ...p.contents, [copy.id]: copy },
          slides: p.slides.map((s) => (s.id === slideId ? { ...s, contentId: copy.id } : s)),
        };
      }),

    addSound: (slideId, sound) =>
      update((p) => ({
        ...p,
        slides: p.slides.map((s) => (s.id === slideId ? { ...s, sounds: [...s.sounds, sound] } : s)),
      })),
    updateSound: (slideId, soundId, patch) =>
      update((p) => ({
        ...p,
        slides: p.slides.map((s) =>
          s.id === slideId ? { ...s, sounds: s.sounds.map((x) => (x.id === soundId ? { ...x, ...patch } : x)) } : s,
        ),
      })),
    removeSound: (slideId, soundId) =>
      update((p) => ({
        ...p,
        slides: p.slides.map((s) => (s.id === slideId ? { ...s, sounds: s.sounds.filter((x) => x.id !== soundId) } : s)),
      })),
  };
});

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 2;
  return Math.round(Math.max(0.1, Math.min(600, seconds)) * 100) / 100;
}
