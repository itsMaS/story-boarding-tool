import { useEffect, useState } from 'react';
import { ASPECT_PRESETS, type AspectPreset, type ProjectSummary } from '../model/types';
import { deleteProject, getProject, listProjects } from '../storage/db';
import { saveNow } from '../storage/autosave';
import { pickFile, readProjectFile } from '../storage/fileio';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { Dialog } from './Dialog';

interface Props {
  /** When true the dialog cannot be dismissed (no project open yet). */
  required?: boolean;
}

export function ProjectsDialog({ required = false }: Props) {
  const project = useProjectStore((s) => s.project);
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const setCurrentSlide = useUiStore((s) => s.setCurrentSlide);
  const setView = useUiStore((s) => s.setView);
  const showToast = useUiStore((s) => s.showToast);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState('Untitled storyboard');
  const [aspect, setAspect] = useState<AspectPreset>('16:9');

  const refresh = () => listProjects().then(setList);
  useEffect(() => {
    void refresh();
  }, []);

  const open = async (id: string) => {
    await saveNow();
    const p = await getProject(id);
    if (!p) return showToast('Project not found', 'error');
    loadProject(p);
    setCurrentSlide(p.slides[0].id);
    setView('edit');
    closeDialog();
  };

  const create = async () => {
    await saveNow();
    const p = newProject(name.trim() || 'Untitled storyboard', aspect);
    setCurrentSlide(p.slides[0].id);
    setView('edit');
    closeDialog();
  };

  const importFile = async () => {
    const [file] = await pickFile('.json,application/json');
    if (!file) return;
    try {
      await saveNow();
      const p = await readProjectFile(file);
      loadProject(p);
      setCurrentSlide(p.slides[0].id);
      setView('edit');
      closeDialog();
      showToast(`Opened ${p.name}`);
    } catch (err) {
      showToast(`Could not open file: ${(err as Error).message}`, 'error');
    }
  };

  const remove = async (s: ProjectSummary) => {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    await deleteProject(s.id);
    if (project?.id === s.id) useProjectStore.getState().closeProject();
    void refresh();
  };

  return (
    <Dialog title="Projects" width="max-w-3xl" onClose={required ? () => undefined : undefined}>
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <h3 className="mb-2 text-sm font-medium">Saved in this browser</h3>
          {list.length === 0 && <p className="text-sm text-muted">No projects yet.</p>}
          <ul className="flex flex-col gap-2">
            {list.map((s) => (
              <li key={s.id} className={`flex items-center gap-3 rounded-md border p-2 ${s.id === project?.id ? 'border-accent' : 'border-line'}`}>
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => open(s.id)} data-testid="project-row">
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt="" className="h-14 w-24 rounded bg-white object-contain" />
                  ) : (
                    <div className="h-14 w-24 rounded bg-white" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.slideCount} slides · {s.aspect} · {new Date(s.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </button>
                <button className="btn btn-danger py-1 text-xs" onClick={() => remove(s)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button className="btn mt-3" onClick={importFile}>
            ⭱ Open .json file…
          </button>
        </div>
        <div className="panel flex flex-col gap-2 p-3">
          <h3 className="text-sm font-medium">New project</h3>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" data-testid="new-project-name" />
          <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value as AspectPreset)}>
            {(Object.keys(ASPECT_PRESETS) as AspectPreset[]).map((k) => (
              <option key={k} value={k}>
                {ASPECT_PRESETS[k].label} ({ASPECT_PRESETS[k].width}×{ASPECT_PRESETS[k].height})
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={create} data-testid="create-project">
            Create
          </button>
          <p className="text-xs text-muted">Projects auto-save to this browser. Use "Save file" to keep a portable copy.</p>
        </div>
      </div>
    </Dialog>
  );
}
