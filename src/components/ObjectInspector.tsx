import { flipObject, objectBounds, unionRects } from '../canvas/geometry';
import type { ImageObject, SceneObject } from '../model/types';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

interface Props {
  contentId: string;
}

/** Right-hand panel for the selected objects. */
export function ObjectInspector({ contentId }: Props) {
  const project = useProjectStore((s) => s.project);
  const setObjects = useProjectStore((s) => s.setObjects);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelection = useUiStore((s) => s.setSelection);
  const tool = useUiStore((s) => s.tool);
  const openDialog = useUiStore((s) => s.openDialog);

  const content = project?.contents[contentId];
  if (!content || tool !== 'select' || selectedIds.length === 0) return null;
  const ids = new Set(selectedIds);
  const selected = content.objects.filter((o) => ids.has(o.id));
  if (selected.length === 0) return null;
  const single = selected.length === 1 ? selected[0] : null;
  const image = single?.type === 'image' ? single : null;

  const patch = (fn: (o: SceneObject) => SceneObject) =>
    setObjects(contentId, content.objects.map((o) => (ids.has(o.id) ? fn(o) : o)));
  const patchImage = (p: Partial<ImageObject>) => patch((o) => (o.type === 'image' ? { ...o, ...p } : o));

  const reorder = (mode: 'front' | 'back' | 'forward' | 'backward') => {
    const objs = [...content.objects];
    if (mode === 'front') {
      const sel = objs.filter((o) => ids.has(o.id));
      setObjects(contentId, [...objs.filter((o) => !ids.has(o.id)), ...sel]);
    } else if (mode === 'back') {
      const sel = objs.filter((o) => ids.has(o.id));
      setObjects(contentId, [...sel, ...objs.filter((o) => !ids.has(o.id))]);
    } else if (mode === 'forward') {
      for (let i = objs.length - 2; i >= 0; i--) if (ids.has(objs[i].id) && !ids.has(objs[i + 1].id)) [objs[i], objs[i + 1]] = [objs[i + 1], objs[i]];
      setObjects(contentId, objs);
    } else {
      for (let i = 1; i < objs.length; i++) if (ids.has(objs[i].id) && !ids.has(objs[i - 1].id)) [objs[i], objs[i - 1]] = [objs[i - 1], objs[i]];
      setObjects(contentId, objs);
    }
  };

  const around = unionRects(selected.map(objectBounds));
  const opacity = single ? single.opacity : selected[0].opacity;

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3 text-sm" data-testid="inspector">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {single ? (single.type === 'image' ? 'Image' : 'Stroke') : `${selected.length} objects`}
        </span>
        <button className="btn py-1 text-xs" onClick={() => setSelection([])}>
          Deselect
        </button>
      </div>

      <Section label="Arrange">
        <div className="grid grid-cols-2 gap-1">
          <button className="btn text-xs" onClick={() => reorder('front')} title="Bring to front">
            ⤒ Front
          </button>
          <button className="btn text-xs" onClick={() => reorder('back')} title="Send to back">
            ⤓ Back
          </button>
          <button className="btn text-xs" onClick={() => reorder('forward')} title="Bring forward (])">
            ↑ Forward
          </button>
          <button className="btn text-xs" onClick={() => reorder('backward')} title="Send backward ([)">
            ↓ Backward
          </button>
          <button className="btn text-xs" onClick={() => patch((o) => flipObject(o, 'h', around))} title="Flip horizontal (H)">
            ⇋ Flip H
          </button>
          <button className="btn text-xs" onClick={() => patch((o) => flipObject(o, 'v', around))} title="Flip vertical (F)">
            ⇅ Flip V
          </button>
        </div>
      </Section>

      <Section label="Opacity">
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => patch((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))}
          className="w-full"
        />
      </Section>

      {image && (
        <>
          <Section label="Rotation">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-180}
                max={180}
                value={Math.round((image.rotation * 180) / Math.PI)}
                onChange={(e) => patchImage({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                className="flex-1"
              />
              <button className="btn py-1 text-xs" onClick={() => patchImage({ rotation: 0 })}>
                0°
              </button>
            </div>
          </Section>
          <Section label="Size">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={image.lockAspect}
                onChange={(e) => patchImage({ lockAspect: e.target.checked })}
              />
              Lock aspect ratio
            </label>
            <button
              className="btn mt-1 w-full text-xs"
              onClick={() => {
                const aspect = (image.naturalWidth * image.crop.w) / (image.naturalHeight * image.crop.h);
                patchImage({ height: image.width / aspect });
              }}
            >
              Reset proportions
            </button>
          </Section>
          <Section label="Crop (fractions of source)">
            <CropEditor image={image} onChange={(crop) => patchImage({ crop })} />
          </Section>
        </>
      )}

      <Section label="AI">
        <button className="btn w-full text-xs" onClick={() => openDialog('ai')}>
          ✨ Polish selection with AI
        </button>
      </Section>

      <Section label="Delete">
        <button
          className="btn btn-danger w-full text-xs"
          onClick={() => {
            setObjects(contentId, content.objects.filter((o) => !ids.has(o.id)));
            setSelection([]);
          }}
        >
          Delete (Del)
        </button>
      </Section>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function CropEditor({ image, onChange }: { image: ImageObject; onChange: (c: ImageObject['crop']) => void }) {
  const c = image.crop;
  const set = (key: 'left' | 'top' | 'right' | 'bottom', v: number) => {
    const right = c.x + c.w;
    const bottom = c.y + c.h;
    let next = { ...c };
    if (key === 'left') next = { ...c, x: Math.min(v, right - 0.05), w: right - Math.min(v, right - 0.05) };
    if (key === 'top') next = { ...c, y: Math.min(v, bottom - 0.05), h: bottom - Math.min(v, bottom - 0.05) };
    if (key === 'right') next = { ...c, w: Math.max(0.05, v - c.x) };
    if (key === 'bottom') next = { ...c, h: Math.max(0.05, v - c.y) };
    onChange(next);
  };
  const row = (label: string, key: 'left' | 'top' | 'right' | 'bottom', value: number) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-12 text-muted">{label}</span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => set(key, Number(e.target.value) / 100)} className="flex-1" />
    </label>
  );
  return (
    <div className="flex flex-col gap-1">
      {row('Left', 'left', c.x)}
      {row('Top', 'top', c.y)}
      {row('Right', 'right', c.x + c.w)}
      {row('Bottom', 'bottom', c.y + c.h)}
      <button className="btn text-xs" onClick={() => onChange({ x: 0, y: 0, w: 1, h: 1 })}>
        Reset crop
      </button>
    </div>
  );
}
