import { useEffect, useRef, useState } from 'react';
import { getKey, getSettings } from '../ai/keys';
import { newId } from '../model/ids';
import { slideDuration } from '../model/project';
import type { SlideSound } from '../model/types';
import { previewSound } from '../sound/audio';
import {
  bestPreview,
  blobToDataUrl,
  fetchPreviewAsDataUrl,
  FREESOUND_KEY_URL,
  licenseName,
  searchFreesound,
  type FreesoundResult,
} from '../sound/freesound';
import { pickFile } from '../storage/fileio';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { Dialog } from './Dialog';

interface Props {
  slideId: string;
}

export function SoundsDialog({ slideId }: Props) {
  const project = useProjectStore((s) => s.project)!;
  const addSound = useProjectStore((s) => s.addSound);
  const updateSound = useProjectStore((s) => s.updateSound);
  const removeSound = useProjectStore((s) => s.removeSound);
  const showToast = useUiStore((s) => s.showToast);
  const openDialog = useUiStore((s) => s.openDialog);
  const slide = project.slides.find((s) => s.id === slideId)!;
  const index = project.slides.indexOf(slide);
  const duration = slideDuration(project, slide);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundResult[]>([]);
  const [count, setCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const apiKey = getKey('freesound');

  useEffect(
    () => () => {
      stopRef.current?.();
      audioRef.current?.pause();
    },
    [],
  );

  const stopAll = () => {
    stopRef.current?.();
    stopRef.current = null;
    audioRef.current?.pause();
  };

  const play = (s: SlideSound) => {
    stopAll();
    stopRef.current = previewSound(s.src, s.volume);
  };

  const playRemote = (r: FreesoundResult) => {
    stopAll();
    const url = bestPreview(r);
    if (!url) return;
    const a = new Audio(url);
    audioRef.current = a;
    void a.play().catch(() => showToast('Preview blocked by browser', 'error'));
  };

  const addFile = async () => {
    const files = await pickFile('audio/*', true);
    for (const f of files) {
      const src = await blobToDataUrl(f);
      addSound(slide.id, { id: newId('snd'), name: f.name.replace(/\.[^.]+$/, ''), src, volume: 1, offset: 0 });
    }
  };

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!apiKey) return openDialog('settings');
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchFreesound(apiKey, query.trim(), { pageSize: 24, maxDuration: 30 });
      setResults(res.results);
      setCount(res.count);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const importResult = async (r: FreesoundResult) => {
    const url = bestPreview(r);
    if (!url) return showToast('No preview available for this sound', 'error');
    setImporting(r.id);
    try {
      const src = await fetchPreviewAsDataUrl(url, getSettings().proxyUrl || undefined);
      addSound(slide.id, {
        id: newId('snd'),
        name: r.name,
        src,
        volume: 1,
        offset: 0,
        durationSec: r.duration,
        attribution: { author: r.username, license: r.license, url: r.url },
      });
      showToast(`Added "${r.name}"`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog title={`Sounds · slide ${index + 1}`} width="max-w-3xl">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">On this slide</h3>
          {slide.sounds.length === 0 && <p className="text-xs text-muted">No sounds yet. Add a file or search freesound.</p>}
          {slide.sounds.map((s) => (
            <div key={s.id} className="panel flex flex-col gap-1.5 p-2 text-xs">
              <div className="flex items-center gap-2">
                <button className="btn btn-icon h-7 w-7 text-xs" onClick={() => play(s)} title="Preview">
                  ▶
                </button>
                <input
                  className="input flex-1 py-0.5"
                  value={s.name}
                  onChange={(e) => updateSound(slide.id, s.id, { name: e.target.value })}
                />
                <button className="btn btn-danger py-0.5" onClick={() => removeSound(slide.id, s.id)}>
                  ✕
                </button>
              </div>
              <label className="flex items-center gap-2">
                <span className="w-14 text-muted">Start</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.05}
                  value={s.offset}
                  onChange={(e) => updateSound(slide.id, s.id, { offset: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-10 text-right tabular-nums">{s.offset.toFixed(2)}s</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-14 text-muted">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(s.volume * 100)}
                  onChange={(e) => updateSound(slide.id, s.id, { volume: Number(e.target.value) / 100 })}
                  className="flex-1"
                />
                <span className="w-10 text-right tabular-nums">{Math.round(s.volume * 100)}%</span>
              </label>
              {s.attribution && (
                <div className="text-[11px] text-muted">
                  by {s.attribution.author} · {licenseName(s.attribution.license)} ·{' '}
                  <a className="underline" href={s.attribution.url} target="_blank" rel="noreferrer">
                    freesound
                  </a>
                </div>
              )}
            </div>
          ))}
          <button className="btn" onClick={addFile}>
            ⭱ Add audio file…
          </button>
          <p className="text-[11px] text-muted">Sounds play when the slide starts (plus the offset) in playback and MP4/WebM export.</p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Search freesound.org</h3>
          {!apiKey ? (
            <p className="text-xs text-muted">
              Add your freesound API key in{' '}
              <button className="underline" onClick={() => openDialog('settings')}>
                Settings
              </button>{' '}
              to search. Keys are free at{' '}
              <a className="underline" href={FREESOUND_KEY_URL} target="_blank" rel="noreferrer">
                freesound.org/apiv2/apply
              </a>
              .
            </p>
          ) : (
            <form onSubmit={search} className="flex gap-1">
              <input className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="door creak, whoosh, footsteps…" />
              <button className="btn btn-primary" disabled={searching}>
                {searching ? '…' : 'Search'}
              </button>
            </form>
          )}
          {count > 0 && <span className="text-[11px] text-muted">{count} results (showing up to 24, max 30s)</span>}
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {results.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded border border-line p-1.5 text-xs">
                <button className="btn btn-icon h-7 w-7 text-xs" onClick={() => playRemote(r)} title="Preview">
                  ▶
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={r.name}>
                    {r.name}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {r.duration.toFixed(1)}s · {r.username} · {licenseName(r.license)}
                  </div>
                </div>
                <button className="btn py-1" disabled={importing === r.id} onClick={() => importResult(r)}>
                  {importing === r.id ? '…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Imported sounds keep their author and license so you can credit them. CC BY and BY-NC sounds require attribution.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
