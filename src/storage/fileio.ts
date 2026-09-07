import { migrateProject } from '../model/migrate';
import type { Project } from '../model/types';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string, ext: string): string {
  const base = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'storyboard';
  return `${base}.${ext}`;
}

export function exportProjectFile(project: Project): void {
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  downloadBlob(blob, safeFilename(project.name, 'storyboard.json'));
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  return migrateProject(JSON.parse(text));
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}
