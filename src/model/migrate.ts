import { SCHEMA_VERSION, type Project } from './types';

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM. A file at version N is run
 * through migrations[N], migrations[N+1], ... until it reaches SCHEMA_VERSION.
 */
const migrations: Record<number, Migration> = {
  // 0 -> 1: files written before versioning existed had no schemaVersion field.
  0: (data) => ({ ...data, schemaVersion: 1 }),
};

export class ProjectFormatError extends Error {}

export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a project file');
  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `This file was saved by a newer version (schema ${version}); this app supports up to ${SCHEMA_VERSION}.`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new ProjectFormatError(`No migration from schema ${version}`);
    data = step(data);
    version++;
  }
  validate(data);
  return data as unknown as Project;
}

function validate(data: Record<string, unknown>): void {
  if (typeof data.id !== 'string' || !Array.isArray(data.slides) || typeof data.contents !== 'object') {
    throw new ProjectFormatError('Project file is missing required fields');
  }
  const contents = data.contents as Record<string, unknown>;
  for (const slide of data.slides as Array<{ contentId?: string }>) {
    if (!slide.contentId || !contents[slide.contentId]) {
      throw new ProjectFormatError('Slide refers to missing content');
    }
  }
}
