import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name = 'Smoke test') {
  await page.goto('/');
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('canvas-editor')).toBeVisible();
}

async function drawStroke(page: Page, from: [number, number], to: [number, number]) {
  const editor = page.getByTestId('canvas-editor');
  const box = (await editor.boundingBox())!;
  const x = (fx: number) => box.x + box.width * fx;
  const y = (fy: number) => box.y + box.height * fy;
  await page.mouse.move(x(from[0]), y(from[1]));
  await page.mouse.down();
  await page.mouse.move(x((from[0] + to[0]) / 2), y((from[1] + to[1]) / 2), { steps: 10 });
  await page.mouse.move(x(to[0]), y(to[1]), { steps: 10 });
  await page.mouse.up();
}

test('creates a project, draws, adds slides, links, plays and exports a GIF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createProject(page);

  // Draw with the pen, then undo/redo.
  await drawStroke(page, [0.3, 0.3], [0.7, 0.6]);
  await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();

  // Select the stroke and delete it with the keyboard, then undo.
  await page.getByTestId('tool-select').click();
  const editor = page.getByTestId('canvas-editor');
  const box = (await editor.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await expect(page.getByTestId('inspector')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('inspector')).toBeHidden();
  await page.keyboard.press('Control+z');

  // Slides: blank, linked copy, per-slide duration.
  await page.getByTestId('add-slide').click();
  await expect(page.getByTestId('slide-thumb-1')).toBeVisible();
  await page.getByTitle('Duplicate as linked slide: edits stay in sync (Ctrl+Shift+L)').click();
  await expect(page.getByTestId('slide-thumb-2')).toBeVisible();
  await expect(page.getByText('Linked with 1 other')).toBeVisible();
  await page.getByTestId('slide-duration').fill('0.5');

  // Overview shows all three slides.
  await page.getByTestId('view-overview').click();
  await expect(page.getByTestId('overview')).toBeVisible();
  await expect(page.getByText('🔗 linked')).toHaveCount(2);

  // Playback.
  await page.getByTestId('view-play').click();
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('view-edit').click();

  // Export a GIF.
  await page.getByTestId('open-export').click();
  await page.getByRole('button', { name: 'GIF', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.gif$/);

  // Reload restores the project from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('slide-thumb-2')).toBeVisible();
  expect(errors).toEqual([]);
});

test('AI and sounds dialogs open without keys and point to settings', async ({ page }) => {
  await createProject(page, 'Dialogs');
  await page.getByTestId('open-ai').click();
  await expect(page.getByText('No key for Google Gemini.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTitle('Sounds for this slide (S)').click();
  await expect(page.getByText('Add your freesound API key in')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTitle('Project settings, style prompt, API keys').click();
  await page.getByTestId('key-freesound').fill('abc');
  await page.keyboard.press('Escape');
  await page.getByTitle('Sounds for this slide (S)').click();
  await expect(page.getByPlaceholder('door creak, whoosh, footsteps…')).toBeVisible();
});
