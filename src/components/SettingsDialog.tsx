import { useState } from 'react';
import { getKey, getSettings, setKey, setSettings } from '../ai/keys';
import { DEFAULT_STYLE_PROMPT } from '../ai/prompt';
import { providers } from '../ai/registry';
import { FREESOUND_KEY_URL } from '../sound/freesound';
import { useProjectStore } from '../store/projectStore';
import { Dialog } from './Dialog';
import { SlideThumbnail } from './SlideThumbnail';

export function SettingsDialog() {
  const project = useProjectStore((s) => s.project)!;
  const setDefaultDuration = useProjectStore((s) => s.setDefaultDuration);
  const setStyle = useProjectStore((s) => s.setStyle);
  const [ai, setAi] = useState(getSettings);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  const toggleRef = (slideId: string) => {
    const ids = project.style.referenceSlideIds;
    setStyle({ referenceSlideIds: ids.includes(slideId) ? ids.filter((i) => i !== slideId) : [...ids, slideId].slice(-3) });
  };

  return (
    <Dialog title="Settings" width="max-w-3xl">
      <div className="flex flex-col gap-6 text-sm">
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Project</h3>
          <label className="flex items-center gap-3">
            <span className="label w-40">Default slide duration</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className="input w-24"
              value={project.defaultDuration}
              onChange={(e) => setDefaultDuration(Number(e.target.value))}
            />
            <span className="text-muted">seconds (slides without their own duration use this)</span>
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Storyboard style (for AI)</h3>
          <textarea
            className="input h-16 resize-none"
            value={project.style.prompt}
            placeholder={DEFAULT_STYLE_PROMPT}
            onChange={(e) => setStyle({ prompt: e.target.value })}
          />
          <p className="text-xs text-muted">Describe the look you want every AI result to match. Then pick up to three reference slides that already have that look:</p>
          <div className="flex flex-wrap gap-2">
            {project.slides.map((s, i) => {
              const on = project.style.referenceSlideIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`relative rounded border-2 p-0.5 ${on ? 'border-accent' : 'border-line hover:border-muted'}`}
                  onClick={() => toggleRef(s.id)}
                  title={on ? 'Remove reference' : 'Use as style reference'}
                >
                  <SlideThumbnail content={project.contents[s.contentId]} canvasSize={project.canvas} width={96} />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                  {on && <span className="absolute right-1 top-1 rounded bg-accent px-1 text-[10px] text-white">ref</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-medium">API keys</h3>
          <p className="text-xs text-muted">
            Keys are stored only in this browser's localStorage and sent only to the provider they belong to (or through your own local proxy). Every AI and sound feature is optional; the app works fully without keys.
          </p>
          {providers.map((p) => (
            <KeyField
              key={p.id}
              id={p.id}
              label={p.keyLabel}
              name={p.name}
              hint={p.keyHint}
              keyUrl={p.keyUrl}
              docsUrl={p.docsUrl}
              onChange={refresh}
            />
          ))}
          <KeyField
            id="freesound"
            name="freesound.org"
            label="freesound API key"
            hint="Needed for the sound search. Free for non-commercial use."
            keyUrl={FREESOUND_KEY_URL}
            docsUrl="https://freesound.org/docs/api/"
            onChange={refresh}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Advanced</h3>
          <label className="flex items-center gap-3">
            <span className="label w-40">Local proxy URL</span>
            <input
              className="input flex-1"
              value={ai.proxyUrl}
              placeholder="http://localhost:8787"
              onChange={(e) => setAi(setSettings({ proxyUrl: e.target.value.trim() }))}
            />
          </label>
          <p className="text-xs text-muted">
            Optional. Run <code className="kbd">npm run proxy</code> from the repo to reach providers that block browser calls (Replicate) or sound previews without CORS headers.
          </p>
          <label className="flex items-center gap-3">
            <span className="label w-40">Max image edge sent</span>
            <select className="input" value={ai.maxEdge} onChange={(e) => setAi(setSettings({ maxEdge: Number(e.target.value) }))}>
              {[512, 768, 1024, 1536].map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Smaller is faster and cheaper.</span>
          </label>
        </section>
      </div>
    </Dialog>
  );
}

function KeyField({
  id,
  name,
  label,
  hint,
  keyUrl,
  docsUrl,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  keyUrl: string;
  docsUrl: string;
  onChange: () => void;
}) {
  const [value, setValue] = useState(() => getKey(id));
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="w-40 shrink-0 text-sm">{name}</span>
        <input
          type={show ? 'text' : 'password'}
          className="input flex-1 font-mono text-xs"
          value={value}
          placeholder={label}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setKey(id, e.target.value.trim());
            onChange();
          }}
          data-testid={`key-${id}`}
        />
        <button className="btn py-1 text-xs" onClick={() => setShow((s) => !s)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="pl-40 text-[11px] text-muted">
        {hint}{' '}
        {keyUrl && (
          <a className="underline" href={keyUrl} target="_blank" rel="noreferrer">
            Get a key
          </a>
        )}{' '}
        <a className="underline" href={docsUrl} target="_blank" rel="noreferrer">
          Docs
        </a>
      </p>
    </div>
  );
}
