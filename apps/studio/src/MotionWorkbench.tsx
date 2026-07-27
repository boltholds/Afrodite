import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  createDefaultAnimationClip,
  createReplaceAnimationsCommand,
  resolveMotionStyle,
  type ResolvedMotionStyle,
} from "@afrodite/canvas-engine/motion";
import {
  currentLiveProjectSessionState,
  executeLiveCommand,
  replaceCurrentLiveProjectSessionState,
  selectLiveNode,
  type LiveProjectSessionState,
} from "@afrodite/project-session";
import {
  animationClipSchema,
  parseUiDocument,
  type AnimationClip,
  type MotionKeyframe,
  type MotionTrack,
  type MotionTrackProperty,
  type MotionTrigger,
  type UiNode,
} from "@afrodite/ui-ir";
import { findNode } from "@afrodite/canvas-engine";

const TRACK_PROPERTIES: readonly MotionTrackProperty[] = [
  "opacity",
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.rotate",
  "borderRadius",
  "backgroundColor",
];

const fallbackDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.motion-empty",
  name: "Motion workspace",
  root: {
    id: "node.motion-root",
    kind: "element",
    element: "main",
    name: "Open Project session first",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

export function MotionWorkbench() {
  const initial = currentLiveProjectSessionState() ?? {
    workspace: "canvas" as const,
    history: { present: fallbackDocument, past: [], future: [] },
    selectedNodeId: fallbackDocument.root.id,
    revision: 0,
    commandLayouts: {},
    layoutTransitions: [],
    syncCursorByNode: {},
    sourceSnapshots: {},
    patchPlans: {},
    writeResults: {},
  } satisfies LiveProjectSessionState;
  const [session, setSession] = createSignal<LiveProjectSessionState>(initial);
  const [selectedClipId, setSelectedClipId] = createSignal("");
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [jsonDraft, setJsonDraft] = createSignal("[]");
  const [jsonErrors, setJsonErrors] = createSignal<readonly string[]>([]);
  const [status, setStatus] = createSignal("Motion workspace ready.");
  let animationFrame = 0;
  let playbackStartedAt = 0;
  let playbackOrigin = 0;

  const document = createMemo(() => session().history.present);
  const nodes = createMemo(() => flatten(document().root));
  const selectedNode = createMemo(() => findNode(document().root, session().selectedNodeId));
  const clips = createMemo(() => selectedNode()?.animations ?? []);
  const selectedClip = createMemo(() => clips().find((clip) => clip.id === selectedClipId()) ?? clips()[0]);
  const totalDuration = createMemo(() => {
    const clip = selectedClip();
    return clip ? clip.timeline.delayMs + clip.timeline.durationMs * clip.timeline.iterations : 0;
  });
  const previewStyle = createMemo<ResolvedMotionStyle>(() => {
    const clip = selectedClip();
    return clip ? resolveMotionStyle(clip, elapsedMs()) : {};
  });

  createEffect(() => {
    const current = clips();
    const active = selectedClipId();
    if (!current.some((clip) => clip.id === active)) setSelectedClipId(current[0]?.id ?? "");
    setJsonDraft(JSON.stringify(current, null, 2));
    setJsonErrors([]);
    setElapsedMs((value) => Math.min(value, totalDuration()));
  });

  onMount(() => {
    const synchronize = window.setInterval(() => {
      const current = currentLiveProjectSessionState();
      if (current && current !== session()) setSession(current);
    }, 500);
    onCleanup(() => {
      window.clearInterval(synchronize);
      window.cancelAnimationFrame(animationFrame);
    });
  });

  const updateSession = (next: LiveProjectSessionState) => {
    replaceCurrentLiveProjectSessionState(next);
    setSession(next);
  };

  const selectNode = (nodeId: string) => {
    stopPlayback();
    setElapsedMs(0);
    updateSession(selectLiveNode(session(), nodeId));
  };

  const commitAnimations = (animations: readonly AnimationClip[], label: string) => {
    const node = selectedNode();
    if (!node) return;
    try {
      const command = createReplaceAnimationsCommand(document(), node.id, animations, label);
      updateSession(executeLiveCommand(session(), command, { invalidateAllPatchState: true }));
      setStatus(label);
      setJsonErrors([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Motion update failed.");
    }
  };

  const addClip = () => {
    const clip = withUniqueClipId(createDefaultAnimationClip(), clips());
    commitAnimations([...clips(), clip], `Create animation ${clip.name}`);
    setSelectedClipId(clip.id);
    setElapsedMs(0);
  };

  const deleteClip = () => {
    const clip = selectedClip();
    if (!clip) return;
    commitAnimations(clips().filter((candidate) => candidate.id !== clip.id), `Delete animation ${clip.name}`);
    setElapsedMs(0);
  };

  const updateClip = (transform: (clip: AnimationClip) => AnimationClip, label: string) => {
    const active = selectedClip();
    if (!active) return;
    const next = clips().map((clip) => clip.id === active.id ? transform(clone(clip)) : clip);
    commitAnimations(next, label);
  };

  const addTrack = () => {
    const clip = selectedClip();
    if (!clip) return;
    const used = new Set(clip.tracks.map((track) => track.property));
    const property = TRACK_PROPERTIES.find((candidate) => !used.has(candidate));
    if (!property) {
      setStatus("Every supported motion property already has a track.");
      return;
    }
    const track = createTrack(property, clip.tracks);
    updateClip((current) => ({ ...current, tracks: [...current.tracks, track] }), `Add ${property} track`);
  };

  const updateTrack = (trackId: string, transform: (track: MotionTrack) => MotionTrack, label: string) => {
    updateClip((clip) => ({
      ...clip,
      tracks: clip.tracks.map((track) => track.id === trackId ? transform(clone(track)) : track),
    }), label);
  };

  const deleteTrack = (trackId: string) => {
    const clip = selectedClip();
    if (!clip || clip.tracks.length <= 1) {
      setStatus("An animation clip requires at least one track.");
      return;
    }
    updateClip((current) => ({
      ...current,
      tracks: current.tracks.filter((track) => track.id !== trackId),
    }), "Delete motion track");
  };

  const updateKeyframe = (
    track: MotionTrack,
    index: number,
    patch: Partial<MotionKeyframe>,
  ) => {
    updateTrack(track.id, (current) => ({
      ...current,
      keyframes: current.keyframes.map((keyframe, keyframeIndex) => keyframeIndex === index
        ? { ...keyframe, ...patch }
        : keyframe),
    }), `Update ${track.property} keyframe`);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft()) as unknown;
      const result = animationClipSchema.array().max(32).safeParse(parsed);
      if (!result.success) {
        setJsonErrors(result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`));
        setStatus("Animation JSON contains validation errors.");
        return;
      }
      commitAnimations(result.data, "Apply animation JSON");
    } catch (error) {
      setJsonErrors([error instanceof Error ? error.message : "Invalid JSON."]);
      setStatus("Animation JSON is not valid JSON.");
    }
  };

  const play = () => {
    if (!selectedClip()) return;
    const total = totalDuration();
    if (elapsedMs() >= total) setElapsedMs(0);
    playbackOrigin = elapsedMs() >= total ? 0 : elapsedMs();
    playbackStartedAt = performance.now();
    setPlaying(true);
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(tick);
  };

  const pause = () => {
    setPlaying(false);
    window.cancelAnimationFrame(animationFrame);
  };

  const stopPlayback = () => {
    pause();
    setElapsedMs(0);
  };

  const restart = () => {
    stopPlayback();
    play();
  };

  const tick = (timestamp: number) => {
    if (!playing()) return;
    const next = Math.min(totalDuration(), playbackOrigin + timestamp - playbackStartedAt);
    setElapsedMs(next);
    if (next >= totalDuration()) {
      setPlaying(false);
      return;
    }
    animationFrame = window.requestAnimationFrame(tick);
  };

  return (
    <div class="motion-shell">
      <header class="motion-header">
        <div class="brand"><strong>Afrodite</strong><span>Semantic Motion & JSON</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="motion-grid">
        <aside class="motion-panel motion-nodes">
          <div class="section-heading"><h2>Nodes</h2><span>{nodes().length}</span></div>
          <For each={nodes()}>{(node) => (
            <button classList={{ selected: node.id === session().selectedNodeId }} onClick={() => selectNode(node.id)}>
              <strong>{node.name}</strong><small>{node.animations?.length ?? 0} clips</small>
            </button>
          )}</For>
        </aside>

        <main class="motion-stage-column">
          <section class="motion-stage-card">
            <div class="section-heading"><h2>Playback preview</h2><span>{Math.round(elapsedMs())} / {Math.round(totalDuration())} ms</span></div>
            <div class="motion-preview-stage">
              <div class="motion-preview-object" style={motionStyleToCss(previewStyle())}>
                {selectedNode()?.name ?? "Select a node"}
              </div>
            </div>
            <input
              class="motion-scrubber"
              type="range"
              min="0"
              max={Math.max(1, totalDuration())}
              step="1"
              value={elapsedMs()}
              onInput={(event) => { pause(); setElapsedMs(Number(event.currentTarget.value)); }}
            />
            <div class="motion-playback-actions">
              <button onClick={playing() ? pause : play}>{playing() ? "Pause" : "Play"}</button>
              <button onClick={restart}>Restart</button>
              <button onClick={stopPlayback}>Stop</button>
            </div>
            <p class="panel-hint">Preview is manual. Trigger metadata does not create runtime state, hooks, or event handlers.</p>
          </section>

          <section class="motion-panel motion-timeline-panel">
            <div class="section-heading"><h2>Clips</h2><span>{clips().length}</span></div>
            <div class="motion-clip-tabs">
              <For each={clips()}>{(clip) => (
                <button classList={{ selected: clip.id === selectedClip()?.id }} onClick={() => { setSelectedClipId(clip.id); stopPlayback(); }}>
                  {clip.name}
                </button>
              )}</For>
              <button class="primary" onClick={addClip}>+ Clip</button>
            </div>

            <Show when={selectedClip()} fallback={<p>Create an animation clip for the selected node.</p>}>
              {(clipAccessor) => {
                const clip = clipAccessor();
                return (
                  <>
                    <div class="motion-fields">
                      <label>Name<input value={clip.name} onChange={(event) => updateClip((current) => ({ ...current, name: event.currentTarget.value }), "Rename animation")} /></label>
                      <label>Trigger<select value={clip.trigger.type} onChange={(event) => updateClip((current) => ({ ...current, trigger: createTrigger(event.currentTarget.value, current.trigger) }), "Change animation trigger")}>
                        <option value="manual">Manual</option><option value="mount">Mount</option><option value="hover">Hover</option>
                        <option value="focus">Focus</option><option value="click">Click</option><option value="state">State</option>
                      </select></label>
                      <Show when={clip.trigger.type === "state"}>
                        <label>State<input value={clip.trigger.type === "state" ? clip.trigger.state : ""} onChange={(event) => updateClip((current) => ({ ...current, trigger: { type: "state", state: event.currentTarget.value } }), "Change animation state trigger")} /></label>
                      </Show>
                      <label>Duration<input type="number" min="1" value={clip.timeline.durationMs} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, durationMs: positiveNumber(event.currentTarget.value, 300) } }), "Change animation duration")} /></label>
                      <label>Delay<input type="number" min="0" value={clip.timeline.delayMs} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, delayMs: nonNegativeNumber(event.currentTarget.value) } }), "Change animation delay")} /></label>
                      <label>Iterations<input type="number" min="1" max="100" value={clip.timeline.iterations} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, iterations: Math.min(100, Math.round(positiveNumber(event.currentTarget.value, 1))) } }), "Change animation iterations")} /></label>
                      <label>Easing<select value={clip.timeline.easing} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, easing: event.currentTarget.value as AnimationClip["timeline"]["easing"] } }), "Change animation easing")}>
                        <option value="linear">Linear</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in/out</option>
                      </select></label>
                      <label>Direction<select value={clip.timeline.direction} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, direction: event.currentTarget.value as AnimationClip["timeline"]["direction"] } }), "Change animation direction")}>
                        <option value="normal">Normal</option><option value="reverse">Reverse</option><option value="alternate">Alternate</option><option value="alternate-reverse">Alternate reverse</option>
                      </select></label>
                      <label>Fill<select value={clip.timeline.fill} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, fill: event.currentTarget.value as AnimationClip["timeline"]["fill"] } }), "Change animation fill")}>
                        <option value="none">None</option><option value="forwards">Forwards</option><option value="backwards">Backwards</option><option value="both">Both</option>
                      </select></label>
                    </div>

                    <div class="motion-track-heading"><h3>Tracks</h3><button onClick={addTrack}>+ Track</button></div>
                    <For each={clip.tracks}>{(track) => (
                      <article class="motion-track-card">
                        <div class="motion-track-header">
                          <select value={track.property} onChange={(event) => {
                            const property = event.currentTarget.value as MotionTrackProperty;
                            updateTrack(track.id, (current) => ({ ...current, property, keyframes: defaultKeyframes(property) }), `Change track to ${property}`);
                          }}>
                            <For each={TRACK_PROPERTIES}>{(property) => <option value={property}>{property}</option>}</For>
                          </select>
                          <code>{track.id}</code>
                          <button class="danger" onClick={() => deleteTrack(track.id)}>Delete</button>
                        </div>
                        <div class="motion-keyframe-table">
                          <For each={track.keyframes}>{(keyframe, index) => (
                            <div class="motion-keyframe-row">
                              <label>Offset<input type="number" min="0" max="1" step="0.01" disabled={index() === 0 || index() === track.keyframes.length - 1} value={keyframe.offset} onChange={(event) => updateKeyframe(track, index(), { offset: Number(event.currentTarget.value) })} /></label>
                              <label>Value<input value={String(keyframe.value)} onChange={(event) => updateKeyframe(track, index(), { value: track.property === "backgroundColor" ? event.currentTarget.value : Number(event.currentTarget.value) })} /></label>
                              <span>{Math.round(keyframe.offset * 100)}%</span>
                            </div>
                          )}</For>
                        </div>
                      </article>
                    )}</For>
                    <button class="danger" onClick={deleteClip}>Delete clip</button>
                  </>
                );
              }}
            </Show>
          </section>
        </main>

        <aside class="motion-panel motion-json-panel">
          <div class="section-heading"><h2>Animation JSON</h2><span>same UI IR</span></div>
          <p class="panel-hint">This is exactly <code>selectedNode.animations</code>. Apply creates one reversible command.</p>
          <textarea spellcheck={false} value={jsonDraft()} onInput={(event) => setJsonDraft(event.currentTarget.value)} />
          <Show when={jsonErrors().length > 0}><div class="diagnostics"><For each={jsonErrors()}>{(error) => <p>{error}</p>}</For></div></Show>
          <button class="primary" onClick={applyJson}>Apply animation JSON</button>
          <details><summary>Resolved style</summary><pre>{JSON.stringify(previewStyle(), null, 2)}</pre></details>
        </aside>
      </div>
    </div>
  );
}

function flatten(node: UiNode): UiNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function createTrigger(value: string, previous: MotionTrigger): MotionTrigger {
  if (value === "state") return { type: "state", state: previous.type === "state" ? previous.state : "loading" };
  if (value === "mount" || value === "hover" || value === "focus" || value === "click" || value === "manual") {
    return { type: value };
  }
  return { type: "manual" };
}

function createTrack(property: MotionTrackProperty, existing: readonly MotionTrack[]): MotionTrack {
  const base = property.replace(/[^A-Za-z0-9]+/g, "-");
  let id = base;
  let sequence = 2;
  while (existing.some((track) => track.id === id)) id = `${base}-${sequence++}`;
  return { id, property, keyframes: defaultKeyframes(property) };
}

function defaultKeyframes(property: MotionTrackProperty): MotionKeyframe[] {
  switch (property) {
    case "opacity": return [{ offset: 0, value: 0 }, { offset: 1, value: 1 }];
    case "transform.scale": return [{ offset: 0, value: 1 }, { offset: 1, value: 1.05 }];
    case "transform.rotate": return [{ offset: 0, value: 0 }, { offset: 1, value: 360 }];
    case "borderRadius": return [{ offset: 0, value: 0 }, { offset: 1, value: 16 }];
    case "backgroundColor": return [{ offset: 0, value: "#111827" }, { offset: 1, value: "#ff3bbd" }];
    default: return [{ offset: 0, value: 0 }, { offset: 1, value: 24 }];
  }
}

function withUniqueClipId(clip: AnimationClip, existing: readonly AnimationClip[]): AnimationClip {
  if (!existing.some((candidate) => candidate.id === clip.id)) return clip;
  let sequence = 2;
  let id = `${clip.id}-${sequence}`;
  while (existing.some((candidate) => candidate.id === id)) id = `${clip.id}-${++sequence}`;
  return { ...clip, id };
}

function motionStyleToCss(style: ResolvedMotionStyle): Record<string, string | number | undefined> {
  return {
    opacity: style.opacity,
    transform: `translate(${style.translateX ?? 0}px, ${style.translateY ?? 0}px) scale(${style.scale ?? 1}) rotate(${style.rotate ?? 0}deg)`,
    "border-radius": `${style.borderRadius ?? 12}px`,
    "background-color": style.backgroundColor,
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "animations";
  return `animations.${path.map(String).join(".")}`;
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
