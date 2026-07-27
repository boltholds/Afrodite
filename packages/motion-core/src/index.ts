import {
  createSourcePatchPlan,
  type AdapterDiagnostic,
  type SourcePatchPlan,
  type SourceSnapshot,
  type TextEdit,
  type VerificationStep,
} from "@afrodite/framework-core";
import type {
  AnimationClip,
  MotionTrack,
  MotionTrackProperty,
  SourceBinding,
} from "@afrodite/ui-ir";

export interface MotionOwnership {
  readonly strategy: "css-keyframes";
  readonly stylesheetPath: string;
  readonly className: string;
  readonly managedClipIds: readonly string[];
}

export interface MotionPatchOperation {
  readonly kind: "update-motion";
  readonly nodeId: string;
  readonly binding: SourceBinding;
  readonly ownership: MotionOwnership;
  readonly before: readonly AnimationClip[];
  readonly after: readonly AnimationClip[];
}

export interface MotionStrategy {
  readonly id: string;
  supports(operation: MotionPatchOperation): boolean;
  plan(operation: MotionPatchOperation, source: SourceSnapshot): SourcePatchPlan;
}

export class MotionStrategyRegistry {
  readonly #strategies = new Map<string, MotionStrategy>();

  register(strategy: MotionStrategy): void {
    if (this.#strategies.has(strategy.id)) throw new Error(`Motion strategy ${strategy.id} is already registered`);
    this.#strategies.set(strategy.id, strategy);
  }

  list(): readonly MotionStrategy[] {
    return [...this.#strategies.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  resolve(operation: MotionPatchOperation): MotionStrategy | undefined {
    return this.list().find((strategy) => strategy.supports(operation));
  }
}

export function createDefaultMotionStrategyRegistry(): MotionStrategyRegistry {
  const registry = new MotionStrategyRegistry();
  registry.register(createCssKeyframesMotionStrategy());
  return registry;
}

export function resolveMotionSourcePath(operation: MotionPatchOperation): string {
  return operation.ownership.stylesheetPath;
}

export function createCssKeyframesMotionStrategy(): MotionStrategy {
  const id = "afrodite.motion.css-keyframes";
  return {
    id,
    supports: (operation) => operation.ownership.strategy === "css-keyframes",
    plan: (operation, source) => planCssKeyframes(operation, source, id),
  };
}

function planCssKeyframes(
  operation: MotionPatchOperation,
  source: SourceSnapshot,
  adapterId: string,
): SourcePatchPlan {
  const diagnostics: AdapterDiagnostic[] = [];
  const edits: TextEdit[] = [];
  validateOperation(operation, source, diagnostics);

  const managed = operation.after
    .filter((clip) => operation.ownership.managedClipIds.includes(clip.id))
    .filter((clip) => clip.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  if (!diagnostics.some(isError)) {
    const generated = managed.length > 0 ? createMotionRegion(operation, managed) : "";
    const existing = findGeneratedRegion(source.content, operation.nodeId, diagnostics, source);
    if (!diagnostics.some(isError)) {
      if (existing) {
        edits.push({
          start: existing.start,
          end: existing.end,
          replacement: generated,
        });
      } else if (generated) {
        const separator = source.content.length === 0 || source.content.endsWith("\n") ? "" : "\n";
        edits.push({
          start: source.content.length,
          end: source.content.length,
          replacement: `${separator}${generated}\n`,
        });
      }
    }
  }

  return createSourcePatchPlan({
    frameworkId: operation.binding.frameworkId ?? "unknown",
    adapterId,
    operation: "update-style",
    source,
    edits,
    diagnostics,
    verification: stylesheetVerification(source.repositoryPath),
  });
}

function validateOperation(
  operation: MotionPatchOperation,
  source: SourceSnapshot,
  diagnostics: AdapterDiagnostic[],
): void {
  if (operation.ownership.stylesheetPath !== source.repositoryPath) {
    diagnostics.push(diagnostic(
      "MOTION_SOURCE_PATH_MISMATCH",
      "error",
      `Motion ownership targets ${operation.ownership.stylesheetPath}, but the snapshot is ${source.repositoryPath}.`,
      source,
      operation.nodeId,
    ));
  }

  const styleOwnership = operation.binding.styleOwnership;
  if (!styleOwnership || styleOwnership.strategy !== "css-module") {
    diagnostics.push(diagnostic(
      "MOTION_CSS_MODULE_OWNERSHIP_REQUIRED",
      "error",
      "CSS keyframe materialization requires an existing CSS Module source binding.",
      source,
      operation.nodeId,
    ));
  } else if (
    styleOwnership.stylesheetPath !== operation.ownership.stylesheetPath
    || styleOwnership.className !== operation.ownership.className
  ) {
    diagnostics.push(diagnostic(
      "MOTION_SELECTOR_OWNERSHIP_MISMATCH",
      "error",
      "Motion selector scope must match the CSS Module stylesheet and class stored in SourceBinding.styleOwnership.",
      source,
      operation.nodeId,
    ));
  }

  if (new Set(operation.ownership.managedClipIds).size !== operation.ownership.managedClipIds.length) {
    diagnostics.push(diagnostic(
      "MOTION_MANAGED_CLIP_IDS_DUPLICATE",
      "error",
      "Managed animation clip IDs must be unique.",
      source,
      operation.nodeId,
    ));
  }

  const afterIds = new Set(operation.after.map((clip) => clip.id));
  for (const clipId of operation.ownership.managedClipIds) {
    if (!afterIds.has(clipId)) {
      diagnostics.push(diagnostic(
        "MOTION_MANAGED_CLIP_NOT_FOUND",
        "error",
        `Managed animation clip ${clipId} is not present on the node.`,
        source,
        operation.nodeId,
      ));
    }
  }

  const clips = operation.after.filter((clip) => operation.ownership.managedClipIds.includes(clip.id));
  for (const clip of clips) {
    if (clip.blend !== "replace") {
      diagnostics.push(diagnostic(
        "MOTION_BLEND_NOT_PATCHABLE",
        "error",
        `Clip ${clip.id} uses ${clip.blend} composition. CSS source materialization currently proves replace composition only.`,
        source,
        operation.nodeId,
      ));
    }
    if (clip.trigger.type === "manual" || clip.trigger.type === "click") {
      diagnostics.push(diagnostic(
        "MOTION_TRIGGER_NOT_PATCHABLE",
        "error",
        `Clip ${clip.id} uses ${clip.trigger.type}. Afrodite will not invent JavaScript event or application-state wiring.`,
        source,
        operation.nodeId,
      ));
    }
  }

  for (let leftIndex = 0; leftIndex < clips.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clips.length; rightIndex += 1) {
      const left = clips[leftIndex]!;
      const right = clips[rightIndex]!;
      if (!triggersMayOverlap(left, right)) continue;
      const overlap = cssChannels(left).filter((channel) => cssChannels(right).includes(channel));
      if (overlap.length > 0) {
        diagnostics.push(diagnostic(
          "MOTION_CSS_CHANNEL_CONFLICT",
          "error",
          `Clips ${left.id} and ${right.id} may run together and both write ${overlap.join(", ")}. Split the channels or keep the composition document-only.`,
          source,
          operation.nodeId,
        ));
      }
    }
  }
}

function createMotionRegion(
  operation: MotionPatchOperation,
  clips: readonly AnimationClip[],
): string {
  const start = startMarker(operation.nodeId);
  const end = endMarker(operation.nodeId);
  const keyframes = clips.map((clip) => createKeyframes(operation.nodeId, clip)).join("\n\n");
  const selectors = groupBySelector(operation.ownership.className, clips)
    .map(([selector, selectorClips]) => createSelectorRule(selector, selectorClips, operation.nodeId))
    .join("\n\n");
  return `${start}\n${keyframes}\n\n${selectors}\n${end}`;
}

function createKeyframes(nodeId: string, clip: AnimationClip): string {
  const offsets = [...new Set(clip.tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.offset)))]
    .sort((left, right) => left - right);
  const frames = offsets.map((offset) => {
    const declarations = declarationsAt(clip.tracks, offset);
    return `  ${formatPercent(offset)} {\n${declarations.map((entry) => `    ${entry}`).join("\n")}\n  }`;
  });
  return `@keyframes ${keyframeName(nodeId, clip.id)} {\n${frames.join("\n")}\n}`;
}

function declarationsAt(tracks: readonly MotionTrack[], progress: number): string[] {
  const declarations: string[] = [];
  const values = new Map<MotionTrackProperty, number | string>();
  for (const track of tracks) values.set(track.property, resolveTrackValue(track, progress));

  const opacity = values.get("opacity");
  if (typeof opacity === "number") declarations.push(`opacity: ${formatNumber(opacity)};`);

  const transformProperties: readonly MotionTrackProperty[] = [
    "transform.x",
    "transform.y",
    "transform.scale",
    "transform.rotate",
  ];
  if (transformProperties.some((property) => values.has(property))) {
    const x = numeric(values.get("transform.x"), 0);
    const y = numeric(values.get("transform.y"), 0);
    const scale = numeric(values.get("transform.scale"), 1);
    const rotate = numeric(values.get("transform.rotate"), 0);
    declarations.push(`transform: translate(${formatNumber(x)}px, ${formatNumber(y)}px) scale(${formatNumber(scale)}) rotate(${formatNumber(rotate)}deg);`);
  }

  const radius = values.get("borderRadius");
  if (typeof radius === "number") declarations.push(`border-radius: ${formatNumber(radius)}px;`);
  const background = values.get("backgroundColor");
  if (typeof background === "string") declarations.push(`background-color: ${background};`);
  return declarations;
}

function createSelectorRule(
  selector: string,
  clips: readonly AnimationClip[],
  nodeId: string,
): string {
  const ordered = clips.slice().sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const names = ordered.map((clip) => keyframeName(nodeId, clip.id));
  const durations = ordered.map((clip) => `${formatNumber(clip.timeline.durationMs)}ms`);
  const delays = ordered.map((clip) => `${formatNumber(clip.timeline.delayMs)}ms`);
  const easings = ordered.map((clip) => clip.timeline.easing);
  const iterations = ordered.map((clip) => String(clip.timeline.iterations));
  const directions = ordered.map((clip) => clip.timeline.direction);
  const fills = ordered.map((clip) => clip.timeline.fill);
  return `${selector} {\n  animation-name: ${names.join(", ")};\n  animation-duration: ${durations.join(", ")};\n  animation-delay: ${delays.join(", ")};\n  animation-timing-function: ${easings.join(", ")};\n  animation-iteration-count: ${iterations.join(", ")};\n  animation-direction: ${directions.join(", ")};\n  animation-fill-mode: ${fills.join(", ")};\n}`;
}

function groupBySelector(
  className: string,
  clips: readonly AnimationClip[],
): Array<readonly [string, AnimationClip[]]> {
  const groups = new Map<string, AnimationClip[]>();
  for (const clip of clips) {
    const selector = triggerSelector(className, clip);
    const current = groups.get(selector) ?? [];
    current.push(clip);
    groups.set(selector, current);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function triggerSelector(className: string, clip: AnimationClip): string {
  const base = `.${className}`;
  switch (clip.trigger.type) {
    case "mount": return base;
    case "hover": return `${base}:hover`;
    case "focus": return `${base}:focus`;
    case "state": return `${base}[data-state=${JSON.stringify(clip.trigger.state)}]`;
    case "click":
    case "manual":
      return base;
  }
}

function triggersMayOverlap(left: AnimationClip, right: AnimationClip): boolean {
  if (
    left.trigger.type === "state"
    && right.trigger.type === "state"
    && left.trigger.state !== right.trigger.state
  ) return false;
  return true;
}

function cssChannels(clip: AnimationClip): string[] {
  return [...new Set(clip.tracks.map((track) => {
    if (track.property.startsWith("transform.")) return "transform";
    if (track.property === "borderRadius") return "border-radius";
    if (track.property === "backgroundColor") return "background-color";
    return track.property;
  }))];
}

function resolveTrackValue(track: MotionTrack, progress: number): number | string {
  const first = track.keyframes[0]!;
  const last = track.keyframes.at(-1)!;
  if (progress <= first.offset) return first.value;
  if (progress >= last.offset) return last.value;
  for (let index = 1; index < track.keyframes.length; index += 1) {
    const right = track.keyframes[index]!;
    if (progress > right.offset) continue;
    const left = track.keyframes[index - 1]!;
    const segment = (progress - left.offset) / (right.offset - left.offset);
    if (typeof left.value === "number" && typeof right.value === "number") {
      return left.value + (right.value - left.value) * segment;
    }
    return segment < 1 ? left.value : right.value;
  }
  return last.value;
}

function findGeneratedRegion(
  content: string,
  nodeId: string,
  diagnostics: AdapterDiagnostic[],
  source: SourceSnapshot,
): { readonly start: number; readonly end: number } | undefined {
  const start = content.indexOf(startMarker(nodeId));
  const endStart = content.indexOf(endMarker(nodeId));
  if (start < 0 && endStart < 0) return undefined;
  if (start < 0 || endStart < 0 || endStart < start) {
    diagnostics.push(diagnostic(
      "MOTION_REGION_INVALID",
      "error",
      `Generated motion region for ${nodeId} is incomplete or reversed.`,
      source,
      nodeId,
    ));
    return undefined;
  }
  if (
    content.indexOf(startMarker(nodeId), start + startMarker(nodeId).length) >= 0
    || content.indexOf(endMarker(nodeId), endStart + endMarker(nodeId).length) >= 0
  ) {
    diagnostics.push(diagnostic(
      "MOTION_REGION_AMBIGUOUS",
      "error",
      `Generated motion region for ${nodeId} appears more than once.`,
      source,
      nodeId,
    ));
    return undefined;
  }
  return { start, end: endStart + endMarker(nodeId).length };
}

function keyframeName(nodeId: string, clipId: string): string {
  return `afrodite-${slug(nodeId)}-${slug(clipId)}`;
}

function startMarker(nodeId: string): string {
  return `/* afrodite-motion:${nodeId}:start */`;
}

function endMarker(nodeId: string): string {
  return `/* afrodite-motion:${nodeId}:end */`;
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "motion";
}

function formatPercent(offset: number): string {
  return `${formatNumber(offset * 100)}%`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function numeric(value: number | string | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stylesheetVerification(repositoryPath: string): VerificationStep[] {
  return [
    {
      kind: "format",
      command: `pnpm exec prettier --check ${JSON.stringify(repositoryPath)}`,
      required: false,
    },
    {
      kind: "build",
      command: "pnpm build",
      required: true,
    },
  ];
}

function diagnostic(
  code: string,
  severity: AdapterDiagnostic["severity"],
  message: string,
  source: SourceSnapshot,
  nodeId: string,
): AdapterDiagnostic {
  return {
    code,
    severity,
    message,
    repositoryPath: source.repositoryPath,
    nodeId,
  };
}

function isError(diagnostic: AdapterDiagnostic): boolean {
  return diagnostic.severity === "error";
}
