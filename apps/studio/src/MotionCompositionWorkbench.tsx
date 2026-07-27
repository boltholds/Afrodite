import {
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
  parseUiDocument,
  type AnimationClip,
  type UiNode,
} from "@afrodite/ui-ir";
import type { BridgeMotionOperation, BridgePatchPlanView } from "@afrodite/protocol";
import { MotionWorkbench as DetailedMotionWorkbench } from "./MotionWorkbench";
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

const fallbackDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.motion-composition-empty",
  name: "Motion composition",
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

export function MotionCompositionWorkbench() {
  const initial = currentLiveProjectSessionState() ?? emptySession();
  const [session, setSession] = createSignal<LiveProjectSessionState>(initial);
  const [selectedClipId, setSelectedClipId] = createSignal("");
  const [activeClipIds, setActiveClipIds] = createSignal<readonly string[]>([]);
  const [managedClipIds, setManagedClipIds] = createSignal<readonly string[]>([]);
  const [preset, setPreset] = createSignal<MotionPreset>("fade-in");
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [status, setStatus] = createSignal("Motion compositor ready.");
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [stylesheetPath, setStylesheetPath] = createSignal("");
  const [className, setClassName] = createSignal("");
  const [sourcePlan, setSourcePlan] = createSignal<BridgePatchPlanView>();
  const [approvedPlanId, setApprovedPlanId] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [showDetailedEditor, setShowDetailedEditor] = createSignal(true);
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

  onMount(() => {
    synchronizeSession(initial);
    const timer = window.setInterval(() => {
      const current = currentLiveProjectSessionState();
      if (current && current !== session()) {
        setSession(current);
        synchronizeSession(current);
      }
    }, 350);
    onCleanup(() => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(animationFrame);
    });
  });

  const synchronizeSession = (next: LiveProjectSessionState) => {
    const node = findNode(next.history.present.root, next.selectedNodeId);
    const nextClips = node?.animations ?? [];
    setSelectedClipId((current) => nextClips.some((clip) => clip.id === current)
      ? current
      : nextClips[0]?.id ?? "");
    setActiveClipIds((current) => normalizeIds(current, nextClips));
    setManagedClipIds((current) => normalizeIds(current, nextClips));
    const ownership = node?.sourceBinding?.styleOwnership;
    if (ownership?.strategy === "css-module") {
      setStylesheetPath(ownership.stylesheetPath);
      setClassName(ownership.className);
    }
    setElapsedMs((value) => Math.min(value, durationOf(nextClips)));
    setSourcePlan(undefined);
    setApprovedPlanId("");
  };

  const updateSession = (next: LiveProjectSessionState) => {
    replaceCurrentLiveProjectSessionState(next);
    setSession(next);
    synchronizeSession(next);
  };

  const selectNode = (nodeId: string) => {
    stopPlayback();
    updateSession(selectLiveNode(session(), nodeId));
  };

  const commitClips = (nextClips: readonly AnimationClip[], label: string) => {
    const node = selectedNode();
    if (!node) return;
    try {
      const command = createReplaceAnimationsCommand(document(), node.id, nextClips, label);
      updateSession(executeLiveCommand(session(), command, { invalidateAllPatchState: true }));
      setStatus(label);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const addPreset = () => {
    const clip = uniqueClip(createAnimationPreset(preset()), clips());
    commitClips([...clips(), clip], `Create ${clip.name}`);
    setSelectedClipId(clip.id);
    setActiveClipIds((ids) => uniqueStrings([...ids, clip.id]));
    setManagedClipIds((ids) => uniqueStrings([...ids, clip.id]));
  };

  const duplicateSelected = () => {
    const clip = selectedClip();
    if (!clip) return;
    const copy = duplicateAnimationClip(clip, clips());
    commitClips([...clips(), copy], `Duplicate ${clip.name}`);
    setSelectedClipId(copy.id);
    setActiveClipIds((ids) => uniqueStrings([...ids, copy.id]));
    setManagedClipIds((ids) => uniqueStrings([...ids, copy.id]));
  };

  const updateSelected = (patch: Partial<AnimationClip>, label: string) => {
    const clip = selectedClip();
    if (!clip) return;
    commitClips(
      clips().map((candidate) => candidate.id === clip.id ? { ...candidate, ...patch } : candidate),
      label,
    );
  };

  const deleteSelected = () => {
    const clip = selectedClip();
    if (!clip) return;
    commitClips(clips().filter((candidate) => candidate.id !== clip.id), `Delete ${clip.name}`);
  };

  const toggleActive = (clipId: string, checked: boolean) => {
    setActiveClipIds((ids) => checked
      ? uniqueStrings([...ids, clipId])
      : ids.filter((id) => id !== clipId));
    setElapsedMs(0);
  };

  const toggleManaged = (clipId: string, checked: boolean) => {
    setManagedClipIds((ids) => checked
      ? uniqueStrings([...ids, clipId])
      : ids.filter((id) => id !== clipId));
    setSourcePlan(undefined);
    setApprovedPlanId("");
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
      setStatus("Stylesheet, CSS class, and at least one managed clip are required.");
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
    setBusy(true);
    try {
      sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
      const plan = await planMotionPatch(bridgeUrl(), bridgeToken(), operation);
      setSourcePlan(plan);
      setApprovedPlanId("");
      setStatus(plan.changed
        ? `Motion source plan ${plan.planId} is ready for review.`
        : "No applicable CSS change was proven. Inspect diagnostics.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const applySource = async () => {
    const plan = sourcePlan();
    if (!plan || approvedPlanId() !== plan.planId) return;
    setBusy(true);
    try {
      const result = await applyMotionPatch(
        bridgeUrl(),
        bridgeToken(),
        plan.planId,
        plan.sourceVersion,
      );
      setStatus(`Motion CSS write ended with ${result.status}.`);
      setSourcePlan(undefined);
      setApprovedPlanId("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
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
    <div class="motion-composition-shell">
      <header class="motion-header">
        <div class="brand"><strong>Afrodite</strong><span>Composed Motion & CSS Source</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="motion-composition-grid">
        <aside class="motion-panel motion-nodes">
          <div class="section-heading"><h2>Nodes</h2><span>{nodes().length}</span></div>
          <For each={nodes()}>{(node) => (
            <button classList={{ selected: node.id === session().selectedNodeId }} onClick={() => selectNode(node.id)}>
              <strong>{node.name}</strong><small>{node.animations?.length ?? 0} clips</small>
            </button>
          )}</For>
        </aside>

        <main class="motion-composition-main">
          <section class="motion-stage-card">
            <div class="section-heading"><h2>Combined preview</h2><span>{Math.round(elapsedMs())} / {Math.round(totalDuration())} ms</span></div>
            <div class="motion-preview-stage">
              <div class="motion-preview-object" style={motionStyleToCss(previewStyle())}>
                {selectedNode()?.name ?? "Select a node"}
              </div>
            </div>
            <input class="motion-scrubber" type="range" min="0" max={Math.max(1, totalDuration())} value={elapsedMs()} onInput={(event) => { pause(); setElapsedMs(Number(event.currentTarget.value)); }} />
            <div class="motion-playback-actions">
              <button onClick={playing() ? pause : play}>{playing() ? "Pause" : "Play active clips"}</button>
              <button onClick={stopPlayback}>Stop</button>
            </div>
          </section>

          <section class="motion-panel">
            <div class="section-heading"><h2>Animation library</h2><span>{clips().length}</span></div>
            <div class="motion-preset-row">
              <select value={preset()} onChange={(event) => setPreset(event.currentTarget.value as MotionPreset)}>
                <For each={PRESETS}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
              <button class="primary" onClick={addPreset}>+ Add animation</button>
              <button disabled={!selectedClip()} onClick={duplicateSelected}>Duplicate</button>
              <button class="danger" disabled={!selectedClip()} onClick={deleteSelected}>Delete</button>
            </div>

            <div class="motion-composition-list">
              <For each={clips()}>{(clip) => (
                <article classList={{ selected: clip.id === selectedClip()?.id }}>
                  <label><input type="checkbox" checked={activeSet().has(clip.id)} onChange={(event) => toggleActive(clip.id, event.currentTarget.checked)} />preview</label>
                  <button onClick={() => setSelectedClipId(clip.id)}>{clip.name}</button>
                  <code>{clip.id}</code>
                  <span>priority {clip.priority}</span>
                  <span>{clip.blend}</span>
                </article>
              )}</For>
            </div>

            <Show when={selectedClip()}>{(clipAccessor) => {
              const clip = clipAccessor();
              return <div class="motion-fields">
                <label>Name<input value={clip.name} onChange={(event) => updateSelected({ name: event.currentTarget.value }, "Rename animation")} /></label>
                <label>Priority<input type="number" min="-1000" max="1000" value={clip.priority} onChange={(event) => updateSelected({ priority: Math.round(Number(event.currentTarget.value)) }, "Change animation priority")} /></label>
                <label>Blend<select value={clip.blend} onChange={(event) => updateSelected({ blend: event.currentTarget.value as AnimationClip["blend"] }, "Change animation blend")}><option value="replace">Replace</option><option value="add">Add</option><option value="multiply">Multiply</option></select></label>
                <label>Enabled<input type="checkbox" checked={clip.enabled} onChange={(event) => updateSelected({ enabled: event.currentTarget.checked }, "Toggle animation")} /></label>
              </div>;
            }}</Show>
            <p class="panel-hint">Detailed tracks, keyframes, triggers, timeline fields, and exact animation JSON remain in the editor below.</p>
          </section>

          <section class="motion-panel motion-source-panel">
            <div class="section-heading"><h2>Verified CSS keyframes</h2><span>single stylesheet</span></div>
            <div class="motion-fields">
              <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
              <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
              <label>Stylesheet<input value={stylesheetPath()} onInput={(event) => { setStylesheetPath(event.currentTarget.value); setSourcePlan(undefined); }} /></label>
              <label>CSS class<input value={className()} onInput={(event) => { setClassName(event.currentTarget.value); setSourcePlan(undefined); }} /></label>
            </div>
            <div class="motion-managed-clips">
              <For each={clips()}>{(clip) => (
                <label><input type="checkbox" checked={managedClipIds().includes(clip.id)} onChange={(event) => toggleManaged(clip.id, event.currentTarget.checked)} />{clip.name} <code>{clip.id}</code></label>
              )}</For>
            </div>
            <p class="panel-hint">CSS output supports replace composition for mount, hover, focus, and explicit data-state triggers. Manual/click, additive source blend, and overlapping transform channels remain document-only.</p>
            <button class="primary" disabled={busy()} onClick={() => void planSource()}>Plan exact CSS diff</button>
            <Show when={sourcePlan()}>{(planAccessor) => {
              const plan = planAccessor();
              return <div class="motion-source-review">
                <div class="semantic-batch-source-meta"><code>{plan.repositoryPath}</code><code>{plan.sourceVersion}</code><code>{plan.planId}</code></div>
                <For each={plan.diagnostics}>{(diagnostic) => <p class={`severity-${diagnostic.severity}`}><code>{diagnostic.code}</code> {diagnostic.message}</p>}</For>
                <pre class="motion-source-diff">{plan.diff}</pre>
                <Show when={plan.changed}>
                  <label><input type="checkbox" checked={approvedPlanId() === plan.planId} onChange={(event) => setApprovedPlanId(event.currentTarget.checked ? plan.planId : "")} />I reviewed this exact plan ID and stylesheet version.</label>
                  <button class="primary" disabled={busy() || approvedPlanId() !== plan.planId} onClick={() => void applySource()}>Apply verified motion CSS</button>
                </Show>
              </div>;
            }}</Show>
          </section>

          <section class="motion-panel motion-detailed-toggle">
            <label><input type="checkbox" checked={showDetailedEditor()} onChange={(event) => setShowDetailedEditor(event.currentTarget.checked)} />Show detailed timeline, tracks, keyframes, and JSON editor</label>
          </section>
          <Show when={showDetailedEditor()}><DetailedMotionWorkbench /></Show>
        </main>
      </div>
    </div>
  );
}

function emptySession(): LiveProjectSessionState {
  return {
    workspace: "canvas",
    history: { present: fallbackDocument, past: [], future: [] },
    selectedNodeId: fallbackDocument.root.id,
    revision: 0,
    commandLayouts: {},
    layoutTransitions: [],
    syncCursorByNode: {},
    sourceSnapshots: {},
    patchPlans: {},
    writeResults: {},
  };
}

function normalizeIds(current: readonly string[], clips: readonly AnimationClip[]): readonly string[] {
  const available = new Set(clips.map((clip) => clip.id));
  const next = current.length === 0
    ? clips.map((clip) => clip.id)
    : current.filter((id) => available.has(id));
  return sameStrings(current, next) ? current : next;
}

function durationOf(clips: readonly AnimationClip[]): number {
  return resolveMotionCompositionDuration(clips, new Set(clips.map((clip) => clip.id)));
}

function flatten(node: UiNode): UiNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function uniqueClip(clip: AnimationClip, existing: readonly AnimationClip[]): AnimationClip {
  if (!existing.some((candidate) => candidate.id === clip.id)) return clip;
  let sequence = 2;
  let id = `${clip.id}-${sequence}`;
  while (existing.some((candidate) => candidate.id === id)) id = `${clip.id}-${++sequence}`;
  return { ...clip, id };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function motionStyleToCss(style: ResolvedMotionStyle): Record<string, string | number | undefined> {
  return {
    opacity: style.opacity,
    transform: `translate(${style.translateX ?? 0}px, ${style.translateY ?? 0}px) scale(${style.scale ?? 1}) rotate(${style.rotate ?? 0}deg)`,
    "border-radius": `${style.borderRadius ?? 12}px`,
    "background-color": style.backgroundColor,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof MotionBridgeClientError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "Motion operation failed.";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
