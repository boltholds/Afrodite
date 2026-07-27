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
  createAnimationPreset,
  createReplaceAnimationsCommand,
  duplicateAnimationClip,
  resolveMotionComposition,
  resolveMotionCompositionDuration,
  type MotionPreset,
  type ResolvedMotionStyle,
} from "@afrodite/canvas-engine/motion";
import { findNode } from "@afrodite/canvas-engine";
import {
  currentLiveProjectSessionState,
  executeLiveCommand,
  replaceCurrentLiveProjectSessionState,
  selectLiveNode,
  type LiveProjectSessionState,
} from "@afrodite/project-session";
import {
  animationClipsSchema,
  parseUiDocument,
  type AnimationClip,
  type MotionKeyframe,
  type MotionTrack,
  type MotionTrackProperty,
  type MotionTrigger,
  type UiNode,
} from "@afrodite/ui-ir";
import type { BridgeMotionOperation, BridgePatchPlanView } from "@afrodite/protocol";
import {
  applyMotionPatch,
  MotionBridgeClientError,
  planMotionPatch,
} from "./motionBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";
const PRESETS: readonly MotionPreset[] = [
  "fade-in",
  "slide-up",
  "scale-in",
  "spin",
  "pulse",
  "color-shift",
];
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
  const [activeClipIds, setActiveClipIds] = createSignal<readonly string[]>([]);
  const [preset, setPreset] = createSignal<MotionPreset>("fade-in");
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [jsonDraft, setJsonDraft] = createSignal("[]");
  const [jsonErrors, setJsonErrors] = createSignal<readonly string[]>([]);
  const [status, setStatus] = createSignal("Motion composition workspace ready.");
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [stylesheetPath, setStylesheetPath] = createSignal("");
  const [className, setClassName] = createSignal("");
  const [managedClipIds, setManagedClipIds] = createSignal<readonly string[]>([]);
  const [sourcePlan, setSourcePlan] = createSignal<BridgePatchPlanView>();
  const [approvedPlanId, setApprovedPlanId] = createSignal("");
  const [sourceBusy, setSourceBusy] = createSignal(false);
  let animationFrame = 0;
  let playbackStartedAt = 0;
  let playbackOrigin = 0;

  const document = createMemo(() => session().history.present);
  const nodes = createMemo(() => flatten(document().root));
  const selectedNode = createMemo(() => findNode(document().root, session().selectedNodeId));
  const clips = createMemo(() => selectedNode()?.animations ?? []);
  const selectedClip = createMemo(() => clips().find((clip) => clip.id === selectedClipId()) ?? clips()[0]);
  const activeSet = createMemo(() => new Set(activeClipIds()));
  const totalDuration = createMemo(() => resolveMotionCompositionDuration(clips(), activeSet()));
  const previewStyle = createMemo<ResolvedMotionStyle>(() => resolveMotionComposition(
    clips(),
    elapsedMs(),
    activeSet(),
  ));

  createEffect(() => {
    const current = clips();
    const selected = selectedClipId();
    if (!current.some((clip) => clip.id === selected)) setSelectedClipId(current[0]?.id ?? "");
    const existingActive = new Set(activeClipIds());
    const nextActive = current.filter((clip) => existingActive.size === 0 || existingActive.has(clip.id)).map((clip) => clip.id);
    setActiveClipIds(nextActive);
    setManagedClipIds((ids) => ids.filter((id) => current.some((clip) => clip.id === id)));
    setJsonDraft(JSON.stringify(current, null, 2));
    setJsonErrors([]);
    setElapsedMs((value) => Math.min(value, totalDuration()));
  });

  createEffect(() => {
    const node = selectedNode();
    const ownership = node?.sourceBinding?.styleOwnership;
    if (ownership?.strategy === "css-module") {
      setStylesheetPath(ownership.stylesheetPath);
      setClassName(ownership.className);
      if (managedClipIds().length === 0) setManagedClipIds(clips().map((clip) => clip.id));
    }
    setSourcePlan(undefined);
    setApprovedPlanId("");
  });

  onMount(() => {
    const synchronize = window.setInterval(() => {
      const current = currentLiveProjectSessionState();
      if (current && current !== session()) setSession(current);
    }, 400);
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
      setSourcePlan(undefined);
      setApprovedPlanId("");
      setStatus(label);
      setJsonErrors([]);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const addClip = () => {
    const clip = withUniqueClipId(createAnimationPreset(preset()), clips());
    commitAnimations([...clips(), clip], `Create ${clip.name}`);
    setSelectedClipId(clip.id);
    setActiveClipIds([...activeClipIds(), clip.id]);
    setManagedClipIds([...managedClipIds(), clip.id]);
    setElapsedMs(0);
  };

  const duplicateClip = () => {
    const clip = selectedClip();
    if (!clip) return;
    const copy = duplicateAnimationClip(clip, clips());
    commitAnimations([...clips(), copy], `Duplicate ${clip.name}`);
    setSelectedClipId(copy.id);
    setActiveClipIds([...activeClipIds(), copy.id]);
    setManagedClipIds([...managedClipIds(), copy.id]);
  };

  const deleteClip = () => {
    const clip = selectedClip();
    if (!clip) return;
    commitAnimations(clips().filter((candidate) => candidate.id !== clip.id), `Delete ${clip.name}`);
    setElapsedMs(0);
  };

  const updateClip = (transform: (clip: AnimationClip) => AnimationClip, label: string) => {
    const active = selectedClip();
    if (!active) return;
    commitAnimations(
      clips().map((clip) => clip.id === active.id ? transform(clone(clip)) : clip),
      label,
    );
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
    updateClip((current) => ({
      ...current,
      tracks: [...current.tracks, createTrack(property, current.tracks)],
    }), `Add ${property} track`);
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

  const updateKeyframe = (track: MotionTrack, index: number, patch: Partial<MotionKeyframe>) => {
    updateTrack(track.id, (current) => ({
      ...current,
      keyframes: current.keyframes.map((keyframe, keyframeIndex) => keyframeIndex === index
        ? { ...keyframe, ...patch }
        : keyframe),
    }), `Update ${track.property} keyframe`);
  };

  const toggleActive = (clipId: string, checked: boolean) => {
    setActiveClipIds((ids) => checked
      ? [...new Set([...ids, clipId])]
      : ids.filter((id) => id !== clipId));
    setElapsedMs(0);
  };

  const toggleManaged = (clipId: string, checked: boolean) => {
    setManagedClipIds((ids) => checked
      ? [...new Set([...ids, clipId])]
      : ids.filter((id) => id !== clipId));
    setSourcePlan(undefined);
    setApprovedPlanId("");
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft()) as unknown;
      const result = animationClipsSchema.safeParse(parsed);
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

  const planSource = async () => {
    const node = selectedNode();
    if (!node?.sourceBinding) {
      setStatus("Select a source-bound node first.");
      return;
    }
    if (bridgeToken().length < 16) {
      setStatus("Enter the local project bridge token first.");
      return;
    }
    if (!stylesheetPath().trim() || !className().trim() || managedClipIds().length === 0) {
      setStatus("Stylesheet, class name, and at least one managed clip are required.");
      return;
    }
    const operation: BridgeMotionOperation = {
      kind: "update-motion",
      nodeId: node.id,
      binding: clone(node.sourceBinding),
      ownership: {
        strategy: "css-keyframes",
        stylesheetPath: stylesheetPath().trim(),
        className: className().trim(),
        managedClipIds: [...managedClipIds()],
      },
      before: clone(clips()),
      after: clone(clips()),
    };
    setSourceBusy(true);
    try {
      sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
      const plan = await planMotionPatch(bridgeUrl(), bridgeToken(), operation);
      setSourcePlan(plan);
      setApprovedPlanId("");
      setStatus(plan.changed
        ? `Motion source plan ${plan.planId} is ready for review.`
        : "Motion source plan produced no applicable change. Inspect diagnostics.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSourceBusy(false);
    }
  };

  const applySource = async () => {
    const plan = sourcePlan();
    if (!plan || approvedPlanId() !== plan.planId) return;
    setSourceBusy(true);
    try {
      const result = await applyMotionPatch(
        bridgeUrl(),
        bridgeToken(),
        plan.planId,
        plan.sourceVersion,
      );
      setStatus(`Motion source patch ended with ${result.status}.`);
      setSourcePlan(undefined);
      setApprovedPlanId("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSourceBusy(false);
    }
  };

  const play = () => {
    if (totalDuration() <= 0) return;
    if (elapsedMs() >= totalDuration()) setElapsedMs(0);
    playbackOrigin = elapsedMs() >= totalDuration() ? 0 : elapsedMs();
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
        <div class="brand"><strong>Afrodite</strong><span>Motion Composition & CSS Source</span></div>
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
            <div class="section-heading"><h2>Composed preview</h2><span>{Math.round(elapsedMs())} / {Math.round(totalDuration())} ms</span></div>
            <div class="motion-preview-stage">
              <div class="motion-preview-object" style={motionStyleToCss(previewStyle())}>
                {selectedNode()?.name ?? "Select a node"}
              </div>
            </div>
            <input class="motion-scrubber" type="range" min="0" max={Math.max(1, totalDuration())} step="1" value={elapsedMs()} onInput={(event) => { pause(); setElapsedMs(Number(event.currentTarget.value)); }} />
            <div class="motion-playback-actions">
              <button onClick={playing() ? pause : play}>{playing() ? "Pause" : "Play all active"}</button>
              <button onClick={restart}>Restart</button>
              <button onClick={stopPlayback}>Stop</button>
            </div>
            <p class="panel-hint">All checked clips run on the same playhead. Composition order is priority, then clip ID.</p>
          </section>

          <section class="motion-panel motion-timeline-panel">
            <div class="section-heading"><h2>Clips</h2><span>{clips().length}</span></div>
            <div class="motion-preset-row">
              <select value={preset()} onChange={(event) => setPreset(event.currentTarget.value as MotionPreset)}>
                <For each={PRESETS}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
              <button class="primary" onClick={addClip}>+ Add animation</button>
              <button onClick={duplicateClip} disabled={!selectedClip()}>Duplicate</button>
            </div>
            <div class="motion-clip-list">
              <For each={clips()}>{(clip) => (
                <article classList={{ selected: clip.id === selectedClip()?.id }}>
                  <label><input type="checkbox" checked={activeSet().has(clip.id)} onChange={(event) => toggleActive(clip.id, event.currentTarget.checked)} />preview</label>
                  <button onClick={() => { setSelectedClipId(clip.id); stopPlayback(); }}>{clip.name}</button>
                  <span>p{clip.priority}</span><span>{clip.blend}</span>
                </article>
              )}</For>
            </div>

            <Show when={selectedClip()} fallback={<p>Add an animation preset for the selected node.</p>}>
              {(clipAccessor) => {
                const clip = clipAccessor();
                return (
                  <>
                    <div class="motion-fields">
                      <label>Name<input value={clip.name} onChange={(event) => updateClip((current) => ({ ...current, name: event.currentTarget.value }), "Rename animation")} /></label>
                      <label>Enabled<input type="checkbox" checked={clip.enabled} onChange={(event) => updateClip((current) => ({ ...current, enabled: event.currentTarget.checked }), "Toggle animation")} /></label>
                      <label>Priority<input type="number" min="-1000" max="1000" value={clip.priority} onChange={(event) => updateClip((current) => ({ ...current, priority: Math.round(Number(event.currentTarget.value)) }), "Change animation priority")} /></label>
                      <label>Blend<select value={clip.blend} onChange={(event) => updateClip((current) => ({ ...current, blend: event.currentTarget.value as AnimationClip["blend"] }), "Change animation blend")}><option value="replace">Replace</option><option value="add">Add</option><option value="multiply">Multiply</option></select></label>
                      <label>Trigger<select value={clip.trigger.type} onChange={(event) => updateClip((current) => ({ ...current, trigger: createTrigger(event.currentTarget.value, current.trigger) }), "Change animation trigger")}><option value="manual">Manual</option><option value="mount">Mount</option><option value="hover">Hover</option><option value="focus">Focus</option><option value="click">Click</option><option value="state">State</option></select></label>
                      <Show when={clip.trigger.type === "state"}><label>State<input value={clip.trigger.type === "state" ? clip.trigger.state : ""} onChange={(event) => updateClip((current) => ({ ...current, trigger: { type: "state", state: event.currentTarget.value } }), "Change state trigger")} /></label></Show>
                      <label>Duration<input type="number" min="1" value={clip.timeline.durationMs} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, durationMs: positiveNumber(event.currentTarget.value, 300) } }), "Change duration")} /></label>
                      <label>Delay<input type="number" min="0" value={clip.timeline.delayMs} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, delayMs: nonNegativeNumber(event.currentTarget.value) } }), "Change delay")} /></label>
                      <label>Iterations<input type="number" min="1" max="100" value={clip.timeline.iterations} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, iterations: Math.min(100, Math.round(positiveNumber(event.currentTarget.value, 1))) } }), "Change iterations")} /></label>
                      <label>Easing<select value={clip.timeline.easing} onChange={(event) => updateClip((current) => ({ ...current, timeline: { ...current.timeline, easing: event.currentTarget.value as AnimationClip["timeline"]["easing"] } }), "Change easing")}><option value="linear">Linear</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in/out</option></select></label>
                    </div>
                    <div class="motion-track-heading"><h3>Tracks</h3><button onClick={addTrack}>+ Track</button></div>
                    <For each={clip.tracks}>{(track) => (
                      <article class="motion-track-card">
                        <div class="motion-track-header">
                          <select value={track.property} onChange={(event) => { const property = event.currentTarget.value as MotionTrackProperty; updateTrack(track.id, (current) => ({ ...current, property, keyframes: defaultKeyframes(property) }), `Change track to ${property}`); }}><For each={TRACK_PROPERTIES}>{(property) => <option value={property}>{property}</option>}</For></select>
                          <code>{track.id}</code><button class="danger" onClick={() => deleteTrack(track.id)}>Delete</button>
                        </div>
                        <div class="motion-keyframe-table"><For each={track.keyframes}>{(keyframe, index) => (
                          <div class="motion-keyframe-row">
                            <label>Offset<input type="number" min="0" max="1" step="0.01" disabled={index() === 0 || index() === track.keyframes.length - 1} value={keyframe.offset} onChange={(event) => updateKeyframe(track, index(), { offset: Number(event.currentTarget.value) })} /></label>
                            <label>Value<input value={String(keyframe.value)} onChange={(event) => updateKeyframe(track, index(), { value: track.property === "backgroundColor" ? event.currentTarget.value : Number(event.currentTarget.value) })} /></label>
                            <span>{Math.round(keyframe.offset * 100)}%</span>
                          </div>
                        )}</For></div>
                      </article>
                    )}</For>
                    <button class="danger" onClick={deleteClip}>Delete clip</button>
                  </>
                );
              }}
            </Show>
          </section>

          <section class="motion-panel motion-source-panel">
            <div class="section-heading"><h2>CSS keyframes source</h2><span>verified write</span></div>
            <div class="motion-fields">
              <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
              <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
              <label>Stylesheet<input value={stylesheetPath()} onInput={(event) => { setStylesheetPath(event.currentTarget.value); setSourcePlan(undefined); }} /></label>
              <label>CSS class<input value={className()} onInput={(event) => { setClassName(event.currentTarget.value); setSourcePlan(undefined); }} /></label>
            </div>
            <p class="panel-hint">Selector scope must match existing CSS Module ownership. Manual/click triggers, additive source composition, and conflicting CSS channels are rejected.</p>
            <div class="motion-managed-clips"><For each={clips()}>{(clip) => (
              <label><input type="checkbox" checked={managedClipIds().includes(clip.id)} onChange={(event) => toggleManaged(clip.id, event.currentTarget.checked)} />{clip.name} <code>{clip.id}</code></label>
            )}</For></div>
            <button class="primary" disabled={sourceBusy()} onClick={() => void planSource()}>Plan exact CSS diff</button>
            <Show when={sourcePlan()}>{(planAccessor) => {
              const plan = planAccessor();
              return <div class="motion-source-review">
                <div class="semantic-batch-source-meta"><code>{plan.repositoryPath}</code><code>{plan.sourceVersion}</code><code>{plan.planId}</code></div>
                <For each={plan.diagnostics}>{(diagnostic) => <p class={`severity-${diagnostic.severity}`}><code>{diagnostic.code}</code> {diagnostic.message}</p>}</For>
                <pre class="motion-source-diff">{plan.diff}</pre>
                <Show when={plan.changed}>
                  <label><input type="checkbox" checked={approvedPlanId() === plan.planId} onChange={(event) => setApprovedPlanId(event.currentTarget.checked ? plan.planId : "")} />I reviewed this exact plan ID and stylesheet version.</label>
                  <button class="primary" disabled={sourceBusy() || approvedPlanId() !== plan.planId} onClick={() => void applySource()}>Apply verified motion CSS</button>
                </Show>
              </div>;
            }}</Show>
          </section>
        </main>

        <aside class="motion-panel motion-json-panel">
          <div class="section-heading"><h2>Animation JSON</h2><span>same UI IR</span></div>
          <p class="panel-hint">This is exactly <code>selectedNode.animations</code>, including priority and blend.</p>
          <textarea spellcheck={false} value={jsonDraft()} onInput={(event) => setJsonDraft(event.currentTarget.value)} />
          <Show when={jsonErrors().length > 0}><div class="diagnostics"><For each={jsonErrors()}>{(error) => <p>{error}</p>}</For></div></Show>
          <button class="primary" onClick={applyJson}>Apply animation JSON</button>
          <details><summary>Composed resolved style</summary><pre>{JSON.stringify(previewStyle(), null, 2)}</pre></details>
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
  if (value === "mount" || value === "hover" || value === "focus" || value === "click" || value === "manual") return { type: value };
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
  return path.length === 0 ? "animations" : `animations.${path.map(String).join(".")}`;
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof MotionBridgeClientError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "Motion operation failed.";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
