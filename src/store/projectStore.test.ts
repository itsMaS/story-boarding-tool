import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from './projectStore';
import type { StrokeObject } from '../model/types';

const stroke = (id: string): StrokeObject => ({
  id,
  type: 'stroke',
  points: [{ x: 0, y: 0, p: 0.5 }],
  color: '#000',
  size: 4,
  eraser: false,
  opacity: 1,
});

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().newProject('Test', '16:9');
  });

  const store = () => useProjectStore.getState();
  const contentId = () => store().project!.slides[0].contentId;

  it('records undo history per content', () => {
    const cid = contentId();
    store().setObjects(cid, [stroke('a')]);
    store().setObjects(cid, [stroke('a'), stroke('b')]);
    expect(store().project!.contents[cid].objects).toHaveLength(2);
    store().undo(cid);
    expect(store().project!.contents[cid].objects).toHaveLength(1);
    store().undo(cid);
    expect(store().project!.contents[cid].objects).toHaveLength(0);
    expect(store().canUndo(cid)).toBe(false);
    store().redo(cid);
    expect(store().project!.contents[cid].objects).toHaveLength(1);
    store().setObjects(cid, [stroke('c')]);
    expect(store().canRedo(cid)).toBe(false);
  });

  it('links and unlinks slides', () => {
    const cid = contentId();
    const first = store().project!.slides[0];
    const linked = store().addSlide(first.id, 'link');
    expect(linked.contentId).toBe(cid);
    store().setObjects(cid, [stroke('a')]);
    expect(store().project!.contents[linked.contentId].objects).toHaveLength(1);

    store().unlinkSlide(linked.id);
    const after = store().project!.slides.find((s) => s.id === linked.id)!;
    expect(after.contentId).not.toBe(cid);
    expect(store().project!.contents[after.contentId].objects).toHaveLength(1);
    store().setObjects(cid, []);
    expect(store().project!.contents[after.contentId].objects).toHaveLength(1);
  });

  it('duplicates with fresh ids and prunes on delete', () => {
    const cid = contentId();
    store().setObjects(cid, [stroke('a')]);
    const dup = store().addSlide(store().project!.slides[0].id, 'duplicate');
    expect(dup.contentId).not.toBe(cid);
    expect(store().project!.contents[dup.contentId].objects[0].id).not.toBe('a');
    store().deleteSlide(dup.id);
    expect(store().project!.contents[dup.contentId]).toBeUndefined();
    expect(store().project!.slides).toHaveLength(1);
    store().deleteSlide(store().project!.slides[0].id);
    expect(store().project!.slides).toHaveLength(1);
  });

  it('reorders slides', () => {
    const a = store().project!.slides[0];
    const b = store().addSlide(a.id, 'blank');
    const c = store().addSlide(b.id, 'blank');
    store().moveSlide(2, 0);
    expect(store().project!.slides.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it('clamps durations', () => {
    const id = store().project!.slides[0].id;
    store().updateSlide(id, { duration: 0 });
    expect(store().project!.slides[0].duration).toBe(0.1);
    store().setDefaultDuration(9999);
    expect(store().project!.defaultDuration).toBe(600);
  });
});
