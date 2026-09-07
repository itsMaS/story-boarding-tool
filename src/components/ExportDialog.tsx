import { useRef, useState } from 'react';
import { exportSize, renderSlides, RESOLUTION_PRESETS, canvasToBlob } from '../export/frames';
import { encodeGif } from '../export/gif';
import { contactSheet, zipSlides } from '../export/stills';
import { encodeVideo } from '../export/video';
import { totalDuration } from '../model/project';
import { downloadBlob, safeFilename } from '../storage/fileio';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { Dialog } from './Dialog';

type Format = 'gif' | 'mp4' | 'webm' | 'png' | 'sheet' | 'current';

const FORMATS: Array<{ id: Format; label: string; hint: string }> = [
  { id: 'mp4', label: 'MP4', hint: 'H.264 video, widest compatibility. Includes sounds.' },
  { id: 'webm', label: 'WebM', hint: 'VP9 video, smaller files. Includes sounds.' },
  { id: 'gif', label: 'GIF', hint: 'Animated GIF, one frame per slide. No audio.' },
  { id: 'png', label: 'PNG per slide', hint: 'Zip of one PNG per slide.' },
  { id: 'sheet', label: 'Contact sheet', hint: 'One PNG with all slides in a grid.' },
  { id: 'current', label: 'Current slide', hint: 'Single PNG of the selected slide.' },
];

export function ExportDialog() {
  const project = useProjectStore((s) => s.project)!;
  const currentSlideId = useUiStore((s) => s.currentSlideId);
  const showToast = useUiStore((s) => s.showToast);
  const [format, setFormat] = useState<Format>(() => (localStorage.getItem('sb.export.format') as Format) || 'mp4');
  const [preset, setPreset] = useState(() => localStorage.getItem('sb.export.res') || '720p');
  const [custom, setCustom] = useState(720);
  const [fps, setFps] = useState(() => Number(localStorage.getItem('sb.export.fps')) || 12);
  const [audio, setAudio] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ fraction: number; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const shortEdge = preset === 'custom' ? custom : RESOLUTION_PRESETS.find((p) => p.id === preset)?.shortEdge ?? 720;
  const size = exportSize(project.canvas, shortEdge);
  const hasSounds = project.slides.some((s) => s.sounds.length > 0);
  const isVideo = format === 'mp4' || format === 'webm';

  const run = async () => {
    localStorage.setItem('sb.export.format', format);
    localStorage.setItem('sb.export.res', preset);
    localStorage.setItem('sb.export.fps', String(fps));
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setProgress({ fraction: 0, message: 'Rendering slides…' });
    const started = performance.now();
    try {
      const frames = await renderSlides(project, size, captions);
      let blob: Blob;
      let ext: string;
      if (format === 'gif') {
        blob = await encodeGif(frames, { signal: ac.signal, onProgress: (d, t) => setProgress({ fraction: d / t, message: `Encoding frame ${d}/${t}` }) });
        ext = 'gif';
      } else if (isVideo) {
        blob = await encodeVideo(project, frames, format, {
          fps,
          includeAudio: audio && hasSounds,
          signal: ac.signal,
          onProgress: (fraction, message) => setProgress({ fraction, message }),
        });
        ext = format;
      } else if (format === 'png') {
        blob = await zipSlides(frames, (d, t) => setProgress({ fraction: d / t, message: `Zipping ${d}/${t}` }));
        ext = 'zip';
      } else if (format === 'sheet') {
        blob = await contactSheet(project, frames);
        ext = 'png';
      } else {
        const idx = Math.max(0, project.slides.findIndex((s) => s.id === currentSlideId));
        blob = await canvasToBlob(frames[idx].canvas);
        ext = 'png';
      }
      downloadBlob(blob, safeFilename(project.name, ext));
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      showToast(`Exported ${(blob.size / 1024 / 1024).toFixed(2)} MB in ${secs}s`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') showToast('Export cancelled');
      else {
        console.error(err);
        showToast(`Export failed: ${(err as Error).message}`, 'error');
      }
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <Dialog title="Export">
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <span className="label">Format</span>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={`btn justify-start ${format === f.id ? 'btn-active' : ''}`}
                onClick={() => setFormat(f.id)}
                title={f.hint}
                disabled={busy}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{FORMATS.find((f) => f.id === format)?.hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label">Resolution</span>
            <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)} disabled={busy}>
              {RESOLUTION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom short edge…</option>
            </select>
            {preset === 'custom' && (
              <input type="number" className="input" min={64} max={4096} value={custom} onChange={(e) => setCustom(Number(e.target.value))} />
            )}
            <span className="text-xs text-muted">
              Output {size.width}×{size.height}
            </span>
          </label>
          {isVideo && (
            <label className="flex flex-col gap-1">
              <span className="label">Frame rate</span>
              <select className="input" value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={busy}>
                {[6, 8, 10, 12, 15, 24, 25, 30, 60].map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Slides are held frames, so low fps keeps files small.</span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} disabled={busy} />
            Render captions
          </label>
          {isVideo && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} disabled={busy || !hasSounds} />
              Include sounds {hasSounds ? '' : '(none in project)'}
            </label>
          )}
        </div>

        <div className="text-xs text-muted">
          {project.slides.length} slides · {totalDuration(project).toFixed(1)}s. Everything is rendered in your browser; nothing is uploaded.
          {isVideo && ' The first video export downloads a 30 MB encoder which the browser then caches.'}
        </div>

        {progress && (
          <div>
            <div className="h-2 overflow-hidden rounded bg-ink">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted">{progress.message}</div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {busy ? (
            <button className="btn btn-danger" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : (
            <button className="btn btn-primary" onClick={run} data-testid="export-run">
              Export {FORMATS.find((f) => f.id === format)?.label}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
