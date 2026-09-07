import { useEffect, useState } from 'react';
import { AiDialog } from './components/AiDialog';
import { ExportDialog } from './components/ExportDialog';
import { ObjectInspector } from './components/ObjectInspector';
import { Overview } from './components/Overview';
import { Player } from './components/Player';
import { ProjectsDialog } from './components/ProjectsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { SlideStrip } from './components/SlideStrip';
import { SoundsDialog } from './components/SoundsDialog';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { CanvasEditor } from './editor/CanvasEditor';
import { useShortcuts } from './editor/useShortcuts';
import { startAutosave } from './storage/autosave';
import { getMeta, getProject, listProjects } from './storage/db';
import { useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';

export function App() {
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const view = useUiStore((s) => s.view);
  const dialog = useUiStore((s) => s.dialog);
  const currentSlideId = useUiStore((s) => s.currentSlideId);
  const setCurrentSlide = useUiStore((s) => s.setCurrentSlide);
  const toast = useUiStore((s) => s.toast);
  const [booted, setBooted] = useState(false);

  useShortcuts();

  // Restore the last open project on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lastId = await getMeta<string>('lastProjectId');
        const id = lastId ?? (await listProjects())[0]?.id;
        const p = id ? await getProject(id) : undefined;
        if (p && !cancelled) {
          loadProject(p);
          setCurrentSlide(p.slides[0].id);
        }
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, setCurrentSlide]);

  useEffect(() => startAutosave(), []);

  // Keep the current slide valid.
  useEffect(() => {
    if (!project) return;
    if (!project.slides.some((s) => s.id === currentSlideId)) setCurrentSlide(project.slides[0].id);
  }, [project, currentSlideId, setCurrentSlide]);

  if (!booted) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  if (!project) return <ProjectsDialog required />;

  const slide = project.slides.find((s) => s.id === currentSlideId) ?? project.slides[0];

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {view === 'edit' && (
          <>
            <Toolbar contentId={slide.contentId} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <CanvasEditor slideId={slide.id} />
              </div>
              <SlideStrip />
            </div>
            <ObjectInspector contentId={slide.contentId} />
          </>
        )}
        {view === 'overview' && (
          <div className="flex min-w-0 flex-1 flex-col">
            <Overview />
          </div>
        )}
        {view === 'play' && (
          <div className="flex min-w-0 flex-1 flex-col">
            <Player />
          </div>
        )}
      </div>

      {dialog === 'projects' && <ProjectsDialog />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'ai' && <AiDialog slideId={slide.id} />}
      {dialog === 'sounds' && <SoundsDialog slideId={slide.id} />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}

      {toast && (
        <div
          className={`fixed bottom-44 left-1/2 z-[60] -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg ${
            toast.kind === 'error' ? 'bg-danger text-white' : 'bg-panel-2 text-white'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
