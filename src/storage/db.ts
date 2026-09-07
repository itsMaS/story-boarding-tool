import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project, ProjectSummary } from '../model/types';

interface StoryboardDB extends DBSchema {
  projects: { key: string; value: Project };
  summaries: { key: string; value: ProjectSummary; indexes: { updatedAt: number } };
  meta: { key: string; value: { key: string; value: unknown } };
}

let dbPromise: Promise<IDBPDatabase<StoryboardDB>> | null = null;

function db(): Promise<IDBPDatabase<StoryboardDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StoryboardDB>('storyboarder', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        const s = d.createObjectStore('summaries', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project, thumbnail?: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'summaries'], 'readwrite');
  const existing = await tx.objectStore('summaries').get(project.id);
  await tx.objectStore('projects').put(project);
  await tx.objectStore('summaries').put({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    slideCount: project.slides.length,
    aspect: project.aspect,
    thumbnail: thumbnail ?? existing?.thumbnail,
  });
  await tx.done;
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'summaries'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('summaries').delete(id);
  await tx.done;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAllFromIndex('summaries', 'updatedAt');
  return all.reverse();
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get('meta', key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', { key, value });
}
