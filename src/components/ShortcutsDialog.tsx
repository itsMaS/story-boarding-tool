import { Dialog } from './Dialog';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Tools',
    items: [
      ['P', 'Pen'],
      ['E', 'Eraser'],
      ['V', 'Select / move'],
      ['- / +', 'Brush size'],
      ['O', 'Onion skin'],
      ['A', 'AI polish'],
      ['S', 'Sounds'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
      ['Ctrl+A', 'Select all'],
      ['Ctrl+D', 'Duplicate selection'],
      ['Delete', 'Delete selection'],
      ['Arrows', 'Nudge selection (Shift = 10px)'],
      ['[ / ]', 'Send backward / bring forward'],
      ['H / F', 'Flip horizontal / vertical'],
      ['Shift+drag', 'Add to selection, keep aspect, snap rotation'],
      ['Ctrl+V', 'Paste image'],
    ],
  },
  {
    title: 'Slides',
    items: [
      ['N', 'New blank slide'],
      ['Ctrl+Shift+D', 'Duplicate slide'],
      ['Ctrl+Shift+L', 'Duplicate as linked slide'],
      ['PgUp / PgDn', 'Previous / next slide'],
      ['Tab', 'Toggle overview'],
      ['Space', 'Play / back to edit'],
      ['Esc', 'Back to edit, or clear selection'],
      ['Ctrl+E', 'Export'],
    ],
  },
];

export function ShortcutsDialog() {
  return (
    <Dialog title="Keyboard shortcuts">
      <div className="grid gap-4 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-sm font-medium">{g.title}</h3>
            <ul className="flex flex-col gap-1 text-xs">
              {g.items.map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-2">
                  <span className="kbd">{k}</span>
                  <span className="text-right text-muted">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
