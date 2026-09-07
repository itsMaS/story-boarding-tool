import { describe, expect, it } from 'vitest';
import { createProject, createSlide, linkedSiblings, pruneContents, slideAtTime, totalDuration } from './project';
import { migrateProject, ProjectFormatError } from './migrate';
import { SCHEMA_VERSION } from './types';

describe('project model', () => {
  it('creates a project with one slide and matching content', () => {
    const p = createProject('Test', '4:3');
    expect(p.slides).toHaveLength(1);
    expect(p.contents[p.slides[0].contentId]).toBeDefined();
    expect(p.canvas).toEqual({ width: 1600, height: 1200 });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('computes durations with per-slide overrides', () => {
    const p = createProject('T');
    p.slides.push(createSlide(p.slides[0].contentId, { duration: 5 }));
    expect(totalDuration(p)).toBe(7);
    expect(slideAtTime(p, 1.5)).toEqual({ index: 0, start: 0 });
    expect(slideAtTime(p, 2)).toEqual({ index: 1, start: 2 });
    expect(slideAtTime(p, 99)).toEqual({ index: 1, start: 2 });
  });

  it('finds linked siblings', () => {
    const p = createProject('T');
    const a = p.slides[0];
    const b = createSlide(a.contentId);
    p.slides.push(b);
    expect(linkedSiblings(p, a.id)).toEqual([b.id]);
    expect(linkedSiblings(p, b.id)).toEqual([a.id]);
  });

  it('prunes unused contents', () => {
    const p = createProject('T');
    p.contents['orphan'] = { id: 'orphan', objects: [] };
    expect(Object.keys(pruneContents(p).contents)).toEqual([p.slides[0].contentId]);
  });
});

describe('migrations', () => {
  it('accepts a current file', () => {
    const p = createProject('T');
    expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('upgrades an unversioned file', () => {
    const p = createProject('T') as unknown as Record<string, unknown>;
    delete p.schemaVersion;
    expect(migrateProject(p).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects newer files and garbage', () => {
    expect(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(ProjectFormatError);
    expect(() => migrateProject('nope')).toThrow(ProjectFormatError);
    expect(() => migrateProject({ schemaVersion: 1, id: 'x', slides: [{ contentId: 'missing' }], contents: {} })).toThrow(
      ProjectFormatError,
    );
  });
});
