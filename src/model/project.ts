import { newId } from './ids';
import {
  ASPECT_PRESETS,
  SCHEMA_VERSION,
  type AspectPreset,
  type Project,
  type Slide,
  type SlideContent,
  type SceneObject,
} from './types';

export function createContent(objects: SceneObject[] = []): SlideContent {
  return { id: newId('c'), objects };
}

export function createSlide(contentId: string, partial: Partial<Slide> = {}): Slide {
  return { id: newId('s'), contentId, caption: '', sounds: [], ...partial };
}

export function createProject(name: string, aspect: AspectPreset = '16:9'): Project {
  const content = createContent();
  const preset = ASPECT_PRESETS[aspect];
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('p'),
    name,
    createdAt: now,
    updatedAt: now,
    aspect,
    canvas: { width: preset.width, height: preset.height },
    defaultDuration: 2,
    slides: [createSlide(content.id)],
    contents: { [content.id]: content },
    style: { prompt: '', referenceSlideIds: [] },
  };
}

export function slideDuration(project: Project, slide: Slide): number {
  return slide.duration ?? project.defaultDuration;
}

export function totalDuration(project: Project): number {
  return project.slides.reduce((sum, s) => sum + slideDuration(project, s), 0);
}

/** Ids of the other slides that share this slide's content. */
export function linkedSiblings(project: Project, slideId: string): string[] {
  const slide = project.slides.find((s) => s.id === slideId);
  if (!slide) return [];
  return project.slides.filter((s) => s.contentId === slide.contentId && s.id !== slideId).map((s) => s.id);
}

export function isLinked(project: Project, slide: Slide): boolean {
  return project.slides.filter((s) => s.contentId === slide.contentId).length > 1;
}

/** Slide index and start time for a playhead position in seconds. */
export function slideAtTime(project: Project, t: number): { index: number; start: number } {
  let acc = 0;
  for (let i = 0; i < project.slides.length; i++) {
    const d = slideDuration(project, project.slides[i]);
    if (t < acc + d) return { index: i, start: acc };
    acc += d;
  }
  const last = Math.max(0, project.slides.length - 1);
  return { index: last, start: acc - slideDuration(project, project.slides[last]) };
}

/** Removes contents no slide refers to any more. */
export function pruneContents(project: Project): Project {
  const used = new Set(project.slides.map((s) => s.contentId));
  const contents: Project['contents'] = {};
  for (const id of used) if (project.contents[id]) contents[id] = project.contents[id];
  return { ...project, contents };
}
