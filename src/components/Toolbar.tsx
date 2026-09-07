import { useProjectStore } from '../store/projectStore';
import { useUiStore, type Tool } from '../store/uiStore';

const TOOLS: Array<{ id: Tool; label: string; key: string; icon: string }> = [
  { id: 'pen', label: 'Pen', key: 'P', icon: '✏️' },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: '🧽' },
  { id: 'select', label: 'Select / move', key: 'V', icon: '↖️' },
];

interface Props {
  contentId: string | undefined;
}

export function Toolbar({ contentId }: Props) {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const color = useUiStore((s) => s.color);
  const setColor = useUiStore((s) => s.setColor);
  const size = useUiStore((s) => s.size);
  const setSize = useUiStore((s) => s.setSize);
  const eraserSize = useUiStore((s) => s.eraserSize);
  const setEraserSize = useUiStore((s) => s.setEraserSize);
  const opacity = useUiStore((s) => s.opacity);
  const setOpacity = useUiStore((s) => s.setOpacity);
  const palette = useUiStore((s) => s.palette);
  const onionSkin = useUiStore((s) => s.onionSkin);
  const toggleOnionSkin = useUiStore((s) => s.toggleOnionSkin);
  const openDialog = useUiStore((s) => s.openDialog);

  const history = useProjectStore((s) => s.history);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = !!contentId && (history[contentId]?.past.length ?? 0) > 0;
  const canRedo = !!contentId && (history[contentId]?.future.length ?? 0) > 0;

  return (
    <aside className="flex w-14 flex-col items-center gap-2 border-r border-line bg-panel py-2" data-testid="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`btn btn-icon ${tool === t.id ? 'btn-active' : ''}`}
          title={`${t.label} (${t.key})`}
          onClick={() => setTool(t.id)}
          data-testid={`tool-${t.id}`}
        >
          <span aria-hidden>{t.icon}</span>
        </button>
      ))}

      <div className="my-1 h-px w-8 bg-line" />

      <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-md border border-line" title="Colour">
        <span className="absolute inset-0" style={{ background: color }} />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          data-testid="color-input"
        />
      </label>
      <div className="grid grid-cols-2 gap-1">
        {palette.slice(0, 8).map((c) => (
          <button
            key={c}
            className={`h-4 w-4 rounded-sm border ${c === color ? 'border-accent' : 'border-line'}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            title={c}
          />
        ))}
      </div>

      <div className="my-1 h-px w-8 bg-line" />

      {tool === 'eraser' ? (
        <VerticalSlider label="Eraser size" value={eraserSize} min={2} max={300} onChange={setEraserSize} />
      ) : (
        <VerticalSlider label="Brush size" value={size} min={1} max={120} onChange={setSize} />
      )}
      <VerticalSlider
        label="Opacity"
        value={Math.round(opacity * 100)}
        min={5}
        max={100}
        onChange={(v) => setOpacity(v / 100)}
        suffix="%"
      />

      <div className="my-1 h-px w-8 bg-line" />

      <button className="btn btn-icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => contentId && undo(contentId)}>
        ↶
      </button>
      <button className="btn btn-icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => contentId && redo(contentId)}>
        ↷
      </button>
      <button
        className={`btn btn-icon ${onionSkin ? 'btn-active' : ''}`}
        title="Onion skin: show previous slide (O)"
        onClick={toggleOnionSkin}
      >
        🧅
      </button>

      <div className="flex-1" />
      <button className="btn btn-icon" title="AI polish (A)" onClick={() => openDialog('ai')} data-testid="open-ai">
        ✨
      </button>
      <button className="btn btn-icon" title="Sounds for this slide (S)" onClick={() => openDialog('sounds')}>
        🔊
      </button>
      <button className="btn btn-icon" title="Keyboard shortcuts (?)" onClick={() => openDialog('shortcuts')}>
        ?
      </button>
    </aside>
  );
}

function VerticalSlider({
  label,
  value,
  min,
  max,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1" title={label}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-20 w-5"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        aria-label={label}
      />
      <span className="text-[10px] text-muted">
        {value}
        {suffix}
      </span>
    </div>
  );
}
