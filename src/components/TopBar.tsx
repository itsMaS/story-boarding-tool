import { useState } from 'react';
import { totalDuration } from '../model/project';
import { exportProjectFile } from '../storage/fileio';
import { useProjectStore } from '../store/projectStore';
import { useUiStore, type View } from '../store/uiStore';

const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: 'edit', label: 'Edit', hint: 'Draw on the current slide' },
  { id: 'overview', label: 'Overview', hint: 'All slides at once (Tab)' },
  { id: 'play', label: 'Play', hint: 'Playback (Space)' },
];

export function TopBar() {
  const project = useProjectStore((s) => s.project);
  const renameProject = useProjectStore((s) => s.renameProject);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const openDialog = useUiStore((s) => s.openDialog);
  const [editing, setEditing] = useState(false);

  if (!project) return null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <button className="btn" onClick={() => openDialog('projects')} title="Projects" data-testid="open-projects">
        ☰ Projects
      </button>
      {editing ? (
        <input
          autoFocus
          className="input w-56"
          defaultValue={project.name}
          onBlur={(e) => {
            renameProject(e.target.value.trim() || project.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button className="truncate px-2 text-sm font-medium hover:underline" onClick={() => setEditing(true)} title="Rename">
          {project.name}
        </button>
      )}
      <span className="text-xs text-muted">
        {project.slides.length} slides · {totalDuration(project).toFixed(1)}s · {project.aspect}
      </span>

      <div className="mx-auto flex rounded-md border border-line bg-ink p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`rounded px-3 py-1 text-sm ${view === v.id ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
            onClick={() => setView(v.id)}
            title={v.hint}
            data-testid={`view-${v.id}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <button className="btn" onClick={() => exportProjectFile(project)} title="Download project as .json">
        ⭳ Save file
      </button>
      <button className="btn" onClick={() => openDialog('settings')} title="Project settings, style prompt, API keys">
        ⚙ Settings
      </button>
      <button className="btn btn-primary" onClick={() => openDialog('export')} title="Export GIF / MP4 / WebM / PNG (Ctrl+E)" data-testid="open-export">
        Export
      </button>
    </header>
  );
}
