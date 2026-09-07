/**
 * Project data model. Everything in a project is plain JSON so it can be
 * saved to IndexedDB and to a portable .json file.
 *
 * Bump SCHEMA_VERSION and add a step in ./migrate.ts whenever the shape changes.
 */
export const SCHEMA_VERSION = 1;

export type AspectPreset = '16:9' | '4:3' | '9:16' | '1:1';

export const ASPECT_PRESETS: Record<AspectPreset, { width: number; height: number; label: string }> = {
  '16:9': { width: 1920, height: 1080, label: 'Widescreen 16:9' },
  '4:3': { width: 1600, height: 1200, label: 'Classic 4:3' },
  '9:16': { width: 1080, height: 1920, label: 'Vertical 9:16' },
  '1:1': { width: 1440, height: 1440, label: 'Square 1:1' },
};

export interface CanvasSize {
  width: number;
  height: number;
}

/** A point in canvas coordinates with pointer pressure (0..1, 0.5 when unknown). */
export interface StrokePoint {
  x: number;
  y: number;
  p: number;
}

export interface StrokeObject {
  id: string;
  type: 'stroke';
  points: StrokePoint[];
  color: string;
  /** Base line width in canvas pixels. */
  size: number;
  /** Eraser strokes punch through everything below them in z-order. */
  eraser: boolean;
  opacity: number;
}

export interface CropRect {
  /** Normalised 0..1 fractions of the source image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageObject {
  id: string;
  type: 'image';
  /** Data URL. Images are downscaled on import so this stays reasonable. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, clockwise, around the object centre. */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
  crop: CropRect;
  lockAspect: boolean;
}

export type SceneObject = StrokeObject | ImageObject;

/** Drawing content. Several slides can point at the same content (linked slides). */
export interface SlideContent {
  id: string;
  objects: SceneObject[];
}

export interface SoundAttribution {
  author: string;
  license: string;
  url: string;
}

export interface SlideSound {
  id: string;
  name: string;
  /** Data URL of the audio file. */
  src: string;
  /** 0..1 */
  volume: number;
  /** Seconds after the slide starts. */
  offset: number;
  durationSec?: number;
  attribution?: SoundAttribution;
}

export interface Slide {
  id: string;
  contentId: string;
  /** Seconds. Undefined means "use project default". */
  duration?: number;
  caption: string;
  sounds: SlideSound[];
}

export interface StyleSettings {
  prompt: string;
  /** Slides whose flattened render is sent as a style reference to AI providers. */
  referenceSlideIds: string[];
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  aspect: AspectPreset;
  canvas: CanvasSize;
  defaultDuration: number;
  slides: Slide[];
  contents: Record<string, SlideContent>;
  style: StyleSettings;
}

/** Lightweight summary used by the project list. */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  slideCount: number;
  aspect: AspectPreset;
  thumbnail?: string;
}
