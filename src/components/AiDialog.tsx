import { useEffect, useMemo, useRef, useState } from 'react';
import { useAiStore } from '../ai/aiStore';
import { flattenObjects, renderReferences } from '../ai/flatten';
import { getKey, getSettings, setSettings } from '../ai/keys';
import { buildPrompt } from '../ai/prompt';
import { getModel, getProvider, providers } from '../ai/registry';
import type { AiMode } from '../ai/types';
import { blobToDataUrl } from '../canvas/importImage';
import { loadImage } from '../canvas/imageCache';
import { newId } from '../model/ids';
import type { ImageObject } from '../model/types';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { Dialog } from './Dialog';

interface Props {
  slideId: string;
}

export function AiDialog({ slideId }: Props) {
  const project = useProjectStore((s) => s.project)!;
  const setObjects = useProjectStore((s) => s.setObjects);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelection = useUiStore((s) => s.setSelection);
  const setTool = useUiStore((s) => s.setTool);
  const openDialog = useUiStore((s) => s.openDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const showToast = useUiStore((s) => s.showToast);
  const record = useAiStore((s) => s.record);
  const calls = useAiStore((s) => s.calls);

  const slide = project.slides.find((s) => s.id === slideId)!;
  const content = project.contents[slide.contentId];
  const hasSelection = selectedIds.some((id) => content.objects.some((o) => o.id === id));

  const [settings, setLocal] = useState(getSettings);
  const [source, setSource] = useState<'selection' | 'slide'>(hasSelection ? 'selection' : 'slide');
  const [mode, setMode] = useState<AiMode>('polish');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ src: string; width: number; height: number; latencyMs: number } | null>(null);
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const provider = getProvider(settings.providerId) ?? providers[0];
  const model = getModel(provider, settings.modelId);
  const apiKey = getKey(provider.id);
  const refCount = project.style.referenceSlideIds.filter((id) => project.slides.some((s) => s.id === id)).length;
  const sessionCost = useMemo(() => calls.filter((c) => c.ok).reduce((s, c) => s + c.costUsd, 0), [calls]);
  const lastLatency = calls.length ? calls[calls.length - 1].latencyMs : null;

  const update = (patch: Partial<typeof settings>) => setLocal(setSettings(patch));

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (!apiKey) return openDialog('settings');
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setResult(null);
    const started = performance.now();
    try {
      setStatus('Flattening…');
      const ids = source === 'selection' ? selectedIds : null;
      const input = await flattenObjects(project, content, ids, settings.maxEdge);
      setInputPreview(URL.createObjectURL(input.blob));
      const references = model.supportsReferences ? await renderReferences(project, 768, content.id) : [];
      const prompt = buildPrompt(mode, project.style.prompt, instruction, references.length > 0);
      setStatus(`Calling ${provider.name} (${model.label})…`);
      const res = await provider.generate(
        { mode, image: input.blob, prompt, references, width: input.width, height: input.height, strength: settings.strength, signal: ac.signal },
        { apiKey, model: model.id, proxyUrl: settings.proxyUrl || undefined },
      );
      const { src, width, height } = await blobToDataUrl(res.blob);
      await loadImage(src);
      setResult({ src, width, height, latencyMs: res.latencyMs });
      record({ provider: provider.id, model: model.id, latencyMs: res.latencyMs, costUsd: model.costUsd, ok: true });
      setStatus(`Done in ${(res.latencyMs / 1000).toFixed(1)}s`);
    } catch (err) {
      const e = err as Error;
      record({ provider: provider.id, model: model.id, latencyMs: performance.now() - started, costUsd: 0, ok: false });
      if (e.name === 'AbortError') setStatus('Cancelled');
      else {
        console.error(err);
        setStatus('');
        showToast(`${provider.name}: ${e.message}`, 'error');
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  /** Replaces the selection (or the whole slide) with the result. Undo restores the original. */
  const apply = async () => {
    if (!result) return;
    const ids = source === 'selection' ? selectedIds : null;
    const input = await flattenObjects(project, content, ids, settings.maxEdge);
    const rect = input.rect;
    const img: ImageObject = {
      id: newId('o'),
      type: 'image',
      src: result.src,
      naturalWidth: result.width,
      naturalHeight: result.height,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      lockAspect: true,
    };
    const current = useProjectStore.getState().project!.contents[content.id];
    if (ids) {
      const set = new Set(ids);
      const firstIdx = Math.max(0, current.objects.findIndex((o) => set.has(o.id)));
      const rest = current.objects.filter((o) => !set.has(o.id));
      rest.splice(Math.min(firstIdx, rest.length), 0, img);
      setObjects(content.id, rest);
    } else {
      setObjects(content.id, [img]);
    }
    setTool('select');
    setSelection([img.id]);
    closeDialog();
    showToast('Applied. Ctrl+Z restores the original.');
  };

  return (
    <Dialog title="AI polish" width="max-w-4xl">
      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">Source</span>
              <div className="mt-1 flex gap-1">
                <button className={`btn flex-1 ${source === 'selection' ? 'btn-active' : ''}`} disabled={!hasSelection || busy} onClick={() => setSource('selection')}>
                  Selection
                </button>
                <button className={`btn flex-1 ${source === 'slide' ? 'btn-active' : ''}`} disabled={busy} onClick={() => setSource('slide')}>
                  Whole slide
                </button>
              </div>
              {!hasSelection && <p className="mt-1 text-[11px] text-muted">Select objects with V to polish just part of a slide.</p>}
            </div>
            <div>
              <span className="label">Mode</span>
              <div className="mt-1 flex gap-1">
                <button className={`btn flex-1 ${mode === 'polish' ? 'btn-active' : ''}`} disabled={busy} onClick={() => setMode('polish')} title="Doodle → cleaner sketch">
                  Polish doodle
                </button>
                <button className={`btn flex-1 ${mode === 'to-doodle' ? 'btn-active' : ''}`} disabled={busy} onClick={() => setMode('to-doodle')} title="Photo / screenshot → sketch">
                  Image → doodle
                </button>
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="label">Extra instruction (optional)</span>
            <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. make the character look angrier" disabled={busy} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Provider</span>
              <select
                className="input"
                value={provider.id}
                disabled={busy}
                onChange={(e) => {
                  const p = getProvider(e.target.value)!;
                  update({ providerId: p.id, modelId: p.models[0].id });
                }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {getKey(p.id) ? '' : ' (no key)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Model</span>
              <select className="input" value={model.id} disabled={busy} onChange={(e) => update({ modelId: e.target.value })}>
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-muted">
            ~${model.costUsd.toFixed(3)} per image · {model.approxLatency}
            {model.supportsReferences ? ` · uses ${refCount} reference slide${refCount === 1 ? '' : 's'}` : ' · prompt-only style'}
            {model.note ? ` · ${model.note}` : ''}
          </p>

          {model.supportsStrength && (
            <label className="flex items-center gap-2">
              <span className="label w-20">Strength</span>
              <input type="range" min={10} max={100} value={Math.round(settings.strength * 100)} disabled={busy} onChange={(e) => update({ strength: Number(e.target.value) / 100 })} className="flex-1" />
              <span className="w-10 text-right text-xs">{Math.round(settings.strength * 100)}%</span>
            </label>
          )}

          {!apiKey && (
            <p className="rounded border border-link/50 bg-link/10 p-2 text-xs">
              No key for {provider.name}.{' '}
              <button className="underline" onClick={() => openDialog('settings')}>
                Add it in Settings
              </button>
              . Keys stay in this browser.
            </p>
          )}

          <div className="flex items-center gap-2">
            {busy ? (
              <button className="btn btn-danger" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            ) : (
              <button className="btn btn-primary" onClick={run} data-testid="ai-run">
                ✨ Generate
              </button>
            )}
            <span className="text-xs text-muted">{status}</span>
            <span className="ml-auto text-[11px] text-muted" title="Estimated spend this session">
              Session ≈ ${sessionCost.toFixed(3)}
              {lastLatency !== null ? ` · last ${(lastLatency / 1000).toFixed(1)}s` : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="label">Result</span>
          <div className="flex min-h-40 items-center justify-center rounded border border-line bg-white">
            {result ? (
              <img src={result.src} alt="AI result" className="max-h-72 w-full object-contain" />
            ) : inputPreview && busy ? (
              <img src={inputPreview} alt="Input" className="max-h-72 w-full object-contain opacity-40" />
            ) : (
              <span className="p-4 text-center text-xs text-muted">The result appears here. Applying replaces the {source === 'selection' ? 'selection' : 'slide'}; undo brings the original back.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={!result || busy} onClick={apply} data-testid="ai-apply">
              Apply (replace)
            </button>
            <button className="btn" disabled={!result || busy} onClick={run} title="Generate again">
              ↻
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
