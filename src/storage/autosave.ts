import { renderToCanvas } from '../canvas/render';
import { useProjectStore } from '../store/projectStore';
import { saveProject, setMeta } from './db';

const DEBOUNCE_MS = 600;
const THUMB_WIDTH = 320;

/**
 * Watches the project store and writes the project to IndexedDB shortly after
 * every change. Also remembers the last open project so it can be restored.
 */
export function startAutosave(): () => void {
  let timer: number | null = null;
  let lastSavedRevision = -1;

  const flush = async () => {
    timer = null;
    const { project, revision } = useProjectStore.getState();
    if (!project || revision === lastSavedRevision) return;
    lastSavedRevision = revision;
    let thumbnail: string | undefined;
    try {
      const first = project.slides[0];
      const canvas = renderToCanvas(project.contents[first.contentId], project.canvas, {
        width: THUMB_WIDTH,
        height: Math.round((THUMB_WIDTH * project.canvas.height) / project.canvas.width),
      }, { background: '#ffffff' });
      thumbnail = canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      thumbnail = undefined;
    }
    await saveProject(project, thumbnail);
    await setMeta('lastProjectId', project.id);
  };

  const unsubscribe = useProjectStore.subscribe((state, prev) => {
    if (state.project !== prev.project && state.project) {
      if (state.project.id !== prev.project?.id) lastSavedRevision = -1;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(flush, DEBOUNCE_MS);
    }
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('beforeunload', flush);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('beforeunload', flush);
    if (timer !== null) window.clearTimeout(timer);
  };
}

/** Immediately writes the current project. Used before risky operations like closing. */
export async function saveNow(): Promise<void> {
  const { project } = useProjectStore.getState();
  if (project) {
    await saveProject(project);
    await setMeta('lastProjectId', project.id);
  }
}
