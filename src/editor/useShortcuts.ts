import { useEffect } from 'react';
import { flipObject, objectBounds, translateObject, unionRects } from '../canvas/geometry';
import { newId } from '../model/ids';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Global keyboard shortcuts for the editor. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      const store = useProjectStore.getState();
      const project = store.project;
      if (!project) return;
      if (ui.dialog !== 'none') {
        if (e.key === 'Escape') ui.closeDialog();
        return;
      }
      if (isTyping()) return;

      const mod = e.ctrlKey || e.metaKey;
      const slide = project.slides.find((s) => s.id === ui.currentSlideId) ?? project.slides[0];
      const content = project.contents[slide.contentId];
      const idx = project.slides.indexOf(slide);
      const selected = content.objects.filter((o) => ui.selectedIds.includes(o.id));
      const key = e.key.toLowerCase();

      const go = (i: number) => {
        const target = project.slides[Math.max(0, Math.min(project.slides.length - 1, i))];
        if (target) ui.setCurrentSlide(target.id);
      };

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo(content.id);
        else store.undo(content.id);
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        store.redo(content.id);
        return;
      }
      if (mod && key === 'a' && ui.view === 'edit') {
        e.preventDefault();
        ui.setTool('select');
        ui.setSelection(content.objects.filter((o) => !(o.type === 'stroke' && o.eraser)).map((o) => o.id));
        return;
      }
      if (mod && e.shiftKey && key === 'd') {
        e.preventDefault();
        ui.setCurrentSlide(store.addSlide(slide.id, 'duplicate').id);
        return;
      }
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        ui.setCurrentSlide(store.addSlide(slide.id, 'link').id);
        return;
      }
      if (mod && key === 'd' && selected.length) {
        e.preventDefault();
        const copies = selected.map((o) => translateObject({ ...o, id: newId('o') }, 24, 24));
        store.setObjects(content.id, [...content.objects, ...copies]);
        ui.setSelection(copies.map((c) => c.id));
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        ui.openDialog('export');
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        ui.showToast('Auto-saved. Use Project → Download to export a file.');
        return;
      }
      if (mod) return;

      switch (key) {
        case 'p':
          ui.setTool('pen');
          break;
        case 'e':
          ui.setTool('eraser');
          break;
        case 'v':
          ui.setTool('select');
          break;
        case 'o':
          ui.toggleOnionSkin();
          break;
        case 'a':
          ui.openDialog('ai');
          break;
        case 's':
          ui.openDialog('sounds');
          break;
        case '?':
          ui.openDialog('shortcuts');
          break;
        case 'n':
          ui.setCurrentSlide(store.addSlide(slide.id, 'blank').id);
          break;
        case 'tab':
          e.preventDefault();
          ui.setView(ui.view === 'overview' ? 'edit' : 'overview');
          break;
        case ' ':
          e.preventDefault();
          ui.setView(ui.view === 'play' ? 'edit' : 'play');
          break;
        case 'escape':
          if (ui.view !== 'edit') ui.setView('edit');
          else ui.setSelection([]);
          break;
        case 'pageup':
          e.preventDefault();
          go(idx - 1);
          break;
        case 'pagedown':
          e.preventDefault();
          go(idx + 1);
          break;
        case '[':
        case ']': {
          if (!selected.length) break;
          e.preventDefault();
          const objs = [...content.objects];
          const ids = new Set(ui.selectedIds);
          if (key === ']') {
            for (let i = objs.length - 2; i >= 0; i--) {
              if (ids.has(objs[i].id) && !ids.has(objs[i + 1].id)) [objs[i], objs[i + 1]] = [objs[i + 1], objs[i]];
            }
          } else {
            for (let i = 1; i < objs.length; i++) {
              if (ids.has(objs[i].id) && !ids.has(objs[i - 1].id)) [objs[i], objs[i - 1]] = [objs[i - 1], objs[i]];
            }
          }
          store.setObjects(content.id, objs);
          break;
        }
        case 'h':
        case 'f': {
          if (!selected.length || ui.tool !== 'select') break;
          const around = unionRects(selected.map(objectBounds));
          const ids = new Set(ui.selectedIds);
          store.setObjects(
            content.id,
            content.objects.map((o) => (ids.has(o.id) ? flipObject(o, key === 'h' ? 'h' : 'v', around) : o)),
          );
          break;
        }
        case 'delete':
        case 'backspace': {
          if (!selected.length) break;
          e.preventDefault();
          const ids = new Set(ui.selectedIds);
          store.setObjects(content.id, content.objects.filter((o) => !ids.has(o.id)));
          ui.setSelection([]);
          break;
        }
        case 'arrowleft':
        case 'arrowright':
        case 'arrowup':
        case 'arrowdown': {
          e.preventDefault();
          if (selected.length && ui.tool === 'select') {
            const step = e.shiftKey ? 10 : 1;
            const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
            const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
            const ids = new Set(ui.selectedIds);
            store.setObjects(content.id, content.objects.map((o) => (ids.has(o.id) ? translateObject(o, dx, dy) : o)));
          } else if (key === 'arrowleft' || key === 'arrowup') go(idx - 1);
          else go(idx + 1);
          break;
        }
        case '-':
        case '_':
          if (ui.tool === 'eraser') ui.setEraserSize(ui.eraserSize - 4);
          else ui.setSize(ui.size - 2);
          break;
        case '=':
        case '+':
          if (ui.tool === 'eraser') ui.setEraserSize(ui.eraserSize + 4);
          else ui.setSize(ui.size + 2);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
