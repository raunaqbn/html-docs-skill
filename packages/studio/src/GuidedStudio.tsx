'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioOverride, StudioSelection, GuidedStudioProps } from './model'
import { toTimelineItems } from './timeline'

const VOICES = ['warm-teacher', 'gentle-guide', 'precise-engineer', 'energetic-coach']

export function GuidedStudio(props: GuidedStudioProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [timeMs, setTimeMs] = useState(0)
  const [selection, setSelection] = useState<StudioSelection>()
  const [instruction, setInstruction] = useState('')
  const [override, setOverride] = useState<StudioOverride>({})
  const [tab, setTab] = useState<'story' | 'evidence'>('story')

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.source !== 'html-video-runtime' || event.data.type !== 'selection') return
      setSelection({ ...event.data, timeMs })
      setOverride({})
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [timeMs])

  function seek(next: number) {
    const value = Math.max(0, Math.min(props.composition.durationMs, next))
    setTimeMs(value)
    iframeRef.current?.contentWindow?.postMessage({
      source: 'html-docs-player',
      type: 'seek',
      timeMs: value,
    }, '*')
    props.onSeek?.(value)
  }

  const sceneItems = useMemo(
    () => toTimelineItems(props.composition.scenes, props.composition.durationMs),
    [props.composition],
  )
  const cueItems = useMemo(
    () => toTimelineItems(
      (props.composition.narration?.cues ?? []).map((cue) => ({
        id: cue.id,
        startMs: cue.startMs,
        endMs: cue.endMs,
      })),
      props.composition.durationMs,
    ),
    [props.composition],
  )
  const captionItems = useMemo(
    () => toTimelineItems(props.composition.captions?.groups ?? [], props.composition.durationMs),
    [props.composition],
  )

  return (
    <div className="hds-root">
      <style>{STYLES}</style>
      <header className="hds-header">
        <div>
          <span className="hds-kicker">Guided Studio</span>
          <strong>{props.composition.title}</strong>
        </div>
        <div className="hds-header-actions">
          <label>
            <span>Voice</span>
            <select
              value={props.voiceProfile ?? props.composition.narration?.voiceProfile ?? 'warm-teacher'}
              onChange={(event) => props.onVoiceProfileChange?.(event.target.value)}
            >
              {VOICES.map((voice) => <option key={voice}>{voice}</option>)}
            </select>
          </label>
          <button className="hds-primary" onClick={() => props.onCommitVersion?.()}>Commit version</button>
        </div>
      </header>

      <main className="hds-grid">
        <aside className="hds-left">
          <div className="hds-tabs">
            <button data-active={tab === 'story'} onClick={() => setTab('story')}>Storyboard</button>
            <button data-active={tab === 'evidence'} onClick={() => setTab('evidence')}>Evidence</button>
          </div>
          {tab === 'story' ? (
            <div className="hds-stack">
              {props.composition.scenes.map((scene) => (
                <button
                  className="hds-card"
                  key={scene.id}
                  data-active={timeMs >= scene.startMs && timeMs <= scene.startMs + scene.durationMs}
                  onClick={() => seek(scene.startMs)}
                >
                  <span>{formatClock(scene.startMs)}</span>
                  <strong>{scene.label ?? scene.id}</strong>
                  <small>{scene.teachingJob ?? 'Explain one clear idea.'}</small>
                  <em>{scene.layout ?? 'authored frame'}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="hds-stack">
              {(props.evidence ?? []).map((item) => (
                <a className="hds-card" key={item.id} href={item.uri} target="_blank" rel="noreferrer">
                  <span>{item.id}</span>
                  <strong>{item.title}</strong>
                  {item.locator && <small>{item.locator}</small>}
                </a>
              ))}
              {!props.evidence?.length && <p className="hds-empty">No evidence records were supplied.</p>}
            </div>
          )}
        </aside>

        <section className="hds-center">
          <div className="hds-preview" style={{ aspectRatio: `${props.composition.width}/${props.composition.height}` }}>
            <iframe
              ref={iframeRef}
              title={`${props.composition.title} live preview`}
              src={props.previewUrl}
              sandbox="allow-scripts"
              onLoad={() => seek(timeMs)}
            />
          </div>
          <div className="hds-transport">
            <button onClick={() => seek(timeMs - 5_000)}>−5s</button>
            <input
              aria-label="Preview time"
              type="range"
              min={0}
              max={props.composition.durationMs}
              step={20}
              value={timeMs}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <button onClick={() => seek(timeMs + 5_000)}>+5s</button>
            <span>{formatClock(timeMs)} / {formatClock(props.composition.durationMs)}</span>
          </div>
        </section>

        <aside className="hds-right">
          <Panel title="Selection">
            {selection ? (
              <>
                <code>{selection.elementId}</code>
                <small>{selection.sceneId} · {formatClock(selection.timeMs ?? 0)}</small>
                {selection.text && <p>{selection.text}</p>}
                <div className="hds-fields">
                  {(['x', 'y', 'width', 'height', 'fontSize', 'opacity'] as const).map((key) => (
                    <label key={key}>
                      <span>{key}</span>
                      <input
                        type="number"
                        value={override[key] ?? ''}
                        onChange={(event) => setOverride((current) => ({
                          ...current,
                          [key]: event.target.value === '' ? undefined : Number(event.target.value),
                        }))}
                      />
                    </label>
                  ))}
                  <label className="hds-wide">
                    <span>color</span>
                    <input
                      value={override.color ?? ''}
                      onChange={(event) => setOverride((current) => ({ ...current, color: event.target.value }))}
                    />
                  </label>
                </div>
                <button className="hds-primary hds-wide" onClick={() => props.onSaveOverride?.(selection, override)}>Save override</button>
              </>
            ) : <p className="hds-empty">Select a semantic element in the live preview.</p>}
          </Panel>
          <Panel title="Ask the agent">
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Make this mechanism easier to understand…"
            />
            <button
              className="hds-primary hds-wide"
              disabled={!instruction.trim()}
              onClick={async () => {
                await props.onCreateRequest?.(instruction.trim(), selection)
                setInstruction('')
              }}
            >
              Queue focused change
            </button>
          </Panel>
          <Panel title="Versions">
            <div className="hds-versions">
              {(props.versions ?? []).map((version) => (
                <div key={version.id}>
                  <span>v{version.version}{version.active ? ' · current' : ''}</span>
                  {version.score != null && <small>{version.score}/100</small>}
                  {!version.active && <button onClick={() => props.onRollback?.(version.id)}>Restore</button>}
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        <section className="hds-timeline">
          <div className="hds-wave" aria-label="Audio waveform">
            {downsample(props.waveform, 160).map((value, index) => (
              <i key={index} style={{ height: `${Math.max(5, Math.min(100, value * 100))}%` }} />
            ))}
            <b style={{ left: `${timeMs / Math.max(1, props.composition.durationMs) * 100}%` }} />
          </div>
          <TimelineLane label="Scenes" items={sceneItems} color="#d7ff45" onSelect={(id) => {
            const scene = props.composition.scenes.find((item) => item.id === id)
            if (scene) seek(scene.startMs)
          }} />
          <TimelineLane label="Cues" items={cueItems} color="#8ca8ff" onSelect={(id) => {
            const cue = props.composition.narration?.cues.find((item) => item.id === id)
            if (cue) seek(cue.startMs)
          }} />
          <TimelineLane label="Captions" items={captionItems} color="#70e1d2" onSelect={(id) => {
            const caption = props.composition.captions?.groups.find((item) => item.id === id)
            if (caption) seek(caption.startMs)
          }} />
        </section>
      </main>
    </div>
  )
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return <section className="hds-panel"><h2>{props.title}</h2>{props.children}</section>
}

function TimelineLane(props: {
  label: string
  color: string
  items: Array<{ id: string; left: number; width: number }>
  onSelect: (id: string) => void
}) {
  return (
    <div className="hds-lane">
      <span>{props.label}</span>
      <div>
        {props.items.map((item) => (
          <button
            key={item.id}
            title={item.id}
            onClick={() => props.onSelect(item.id)}
            style={{ left: `${item.left}%`, width: `${item.width}%`, background: props.color }}
          />
        ))}
      </div>
    </div>
  )
}

function downsample(values: number[], target: number) {
  if (values.length <= target) return values
  const output: number[] = []
  for (let index = 0; index < target; index += 1) {
    const start = Math.floor(index * values.length / target)
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / target))
    output.push(Math.max(...values.slice(start, end).map(Math.abs)))
  }
  return output
}

function formatClock(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const STYLES = `
.hds-root{--ink:#f7f7f1;--muted:#a3a39a;--panel:#151614;--line:rgba(255,255,255,.09);min-height:760px;background:#0c0d0b;color:var(--ink);font:500 13px/1.4 ui-sans-serif,system-ui,sans-serif}
.hds-root *{box-sizing:border-box}.hds-header{height:68px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:0 18px;background:#10110f}.hds-header>div:first-child{display:grid;gap:2px}.hds-kicker{color:#d7ff45;font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.hds-header strong{font-size:15px}.hds-header-actions{display:flex;align-items:end;gap:10px}.hds-header-actions label{display:grid;gap:3px}.hds-header-actions label span{font-size:9px;color:var(--muted);text-transform:uppercase}.hds-root select,.hds-root input,.hds-root textarea{border:1px solid var(--line);background:#090a08;color:var(--ink);border-radius:8px;padding:8px;outline:none}.hds-root button{font:inherit}.hds-primary{border:0;border-radius:8px;background:#d7ff45;color:#171914;padding:9px 12px;font-weight:800;cursor:pointer}.hds-primary:disabled{opacity:.4;cursor:not-allowed}
.hds-grid{display:grid;grid-template-columns:250px minmax(420px,1fr) 280px;grid-template-rows:minmax(450px,1fr) 230px;min-height:692px}.hds-left,.hds-right{min-width:0;overflow:auto;background:var(--panel)}.hds-left{border-right:1px solid var(--line);padding:12px}.hds-right{border-left:1px solid var(--line);padding:12px}.hds-center{min-width:0;padding:20px;display:grid;place-items:center;align-content:center;gap:12px}.hds-preview{width:min(100%,920px);overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#000;box-shadow:0 28px 90px rgba(0,0,0,.45)}.hds-preview iframe{display:block;width:100%;height:100%;border:0}.hds-transport{width:min(100%,920px);display:flex;align-items:center;gap:8px}.hds-transport input{flex:1;padding:0}.hds-transport button{border:1px solid var(--line);background:#181916;color:var(--ink);border-radius:7px;padding:6px 8px}.hds-transport span{font-variant-numeric:tabular-nums;color:var(--muted);font-size:11px}
.hds-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px}.hds-tabs button{border:0;border-radius:7px;padding:7px;background:transparent;color:var(--muted)}.hds-tabs button[data-active=true]{background:#282a25;color:var(--ink)}.hds-stack{display:grid;gap:8px}.hds-card{display:grid;gap:5px;text-align:left;border:1px solid var(--line);border-radius:10px;padding:10px;background:#1b1c19;color:var(--ink);text-decoration:none;cursor:pointer}.hds-card[data-active=true]{border-color:#d7ff45;box-shadow:inset 3px 0 #d7ff45}.hds-card span,.hds-card small,.hds-card em{color:var(--muted);font-size:10px;font-style:normal}.hds-card strong{font-size:12px}.hds-panel{border:1px solid var(--line);border-radius:10px;background:#191a17;padding:11px;margin-bottom:10px}.hds-panel h2{font-size:12px;margin:0 0 9px}.hds-panel code{display:block;color:#d7ff45;font-size:11px}.hds-panel small{display:block;color:var(--muted);margin-top:3px}.hds-panel p{font-size:11px;color:#c5c5bd}.hds-panel textarea{width:100%;min-height:84px;resize:vertical}.hds-fields{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}.hds-fields label{display:grid;gap:3px}.hds-fields label span{font-size:9px;color:var(--muted)}.hds-fields input{width:100%;padding:6px}.hds-wide{width:100%;grid-column:1/-1}.hds-versions{display:grid;gap:6px}.hds-versions>div{display:flex;gap:6px;align-items:center;border-top:1px solid var(--line);padding-top:6px}.hds-versions small{margin:0}.hds-versions button{margin-left:auto;border:0;background:transparent;color:#d7ff45;cursor:pointer}.hds-empty{color:var(--muted);font-size:11px}
.hds-timeline{grid-column:1/-1;border-top:1px solid var(--line);background:#111210;padding:12px 16px;overflow:hidden}.hds-wave{height:74px;position:relative;display:flex;align-items:center;gap:1px;border-bottom:1px solid var(--line);overflow:hidden}.hds-wave i{display:block;min-width:1px;flex:1;background:#eee;opacity:.32;border-radius:2px}.hds-wave b{position:absolute;inset-block:0;width:1px;background:#d7ff45}.hds-lane{display:grid;grid-template-columns:68px 1fr;align-items:center;height:38px;border-bottom:1px solid var(--line)}.hds-lane>span{color:var(--muted);font-size:10px}.hds-lane>div{height:25px;position:relative}.hds-lane button{position:absolute;top:4px;height:17px;border:0;border-radius:4px;opacity:.75;cursor:pointer;min-width:2px}
@media(max-width:980px){.hds-grid{grid-template-columns:210px 1fr;grid-template-rows:auto auto auto}.hds-right{grid-column:1/-1;border-left:0;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hds-panel{margin:0}.hds-timeline{grid-column:1/-1}.hds-header{height:auto;padding:12px;gap:10px;align-items:flex-start}.hds-header-actions{flex-wrap:wrap;justify-content:flex-end}}
@media(max-width:680px){.hds-root{min-height:0}.hds-grid{display:flex;flex-direction:column}.hds-left{order:2;border:0;border-top:1px solid var(--line);max-height:300px}.hds-center{order:1;padding:10px}.hds-right{order:3;display:block}.hds-panel{margin-bottom:8px}.hds-timeline{order:4}.hds-header{display:grid}.hds-header-actions{justify-content:flex-start}.hds-transport span{display:none}}
`
