import type {
  AnimationClip,
  MotionBlendMode,
  MotionEasing,
  MotionTrackProperty,
  UiDocument,
  UiNode,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index.js";

let motionCommandSequence = 0;
let motionClipSequence = 0;

export interface MotionResolvedStyle {
  readonly opacity?: number;
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scale?: number;
  readonly rotate?: number;
  readonly borderRadius?: number;
  readonly backgroundColor?: string;
}

export type MotionPresetId =
  | "fade-in"
  | "slide-up"
  | "scale-in"
  | "spin"
  | "pulse"
  | "color-shift";

export const MOTION_PRESET_IDS = [
  "fade-in",
  "slide-up",
  "scale-in",
  "spin",
  "pulse",
  "color-shift",
] as const satisfies readonly MotionPresetId[];

export function createMotionPresetClip(
  presetId: MotionPresetId,
  clipId?: string,
): AnimationClip {
  const id = clipId ?? nextClipId(presetId);
  const timeline = {
    durationMs: presetId === "pulse" ? 900 : 320,
    delayMs: 0,
    easing: presetId === "spin" ? "linear" as const : "ease-out" as const,
    iterations: presetId === "pulse" || presetId === "spin" ? 2 : 1,
    direction: presetId === "pulse" ? "alternate" as const : "normal" as const,
    fill: "both" as const,
  };
  const common = {
    id,
    enabled: true,
    priority: 0,
    blend: "replace" as const,
    trigger: { type: "manual" as const },
    timeline,
  };
  switch (presetId) {
    case "fade-in":
      return {
        ...common,
        name: "Fade in",
        tracks: [{
          id: `${id}.opacity`,
          property: "opacity",
          keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
        }],
      };
    case "slide-up":
      return {
        ...common,
        name: "Slide up",
        tracks: [{
          id: `${id}.translate-y`,
          property: "transform.y",
          keyframes: [{ offset: 0, value: 24 }, { offset: 1, value: 0 }],
        }],
      };
    case "scale-in":
      return {
        ...common,
        name: "Scale in",
        tracks: [{
          id: `${id}.scale`,
          property: "transform.scale",
          keyframes: [{ offset: 0, value: 0.92 }, { offset: 1, value: 1 }],
        }],
      };
    case "spin":
      return {
        ...common,
        name: "Spin",
        tracks: [{
          id: `${id}.rotate`,
          property: "transform.rotate",
          keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 360 }],
        }],
      };
    case "pulse":
      return {
        ...common,
        name: "Pulse",
        tracks: [{
          id: `${id}.scale`,
          property: "transform.scale",
          keyframes: [{ offset: 0, value: 1 }, { offset: 1, value: 1.08 }],
        }],
      };
    case "color-shift":
      return {
        ...common,
        name: "Color shift",
        tracks: [{
          id: `${id}.background`,
          property: "backgroundColor",
          keyframes: [{ offset: 0, value: "#ff4fb8" }, { offset: 1, value: "#47e5ff" }],
        }],
      };
  }
}

export function duplicateAnimationClip(
  clip: AnimationClip,
  clipId?: string,
): AnimationClip {
  const id = clipId ?? nextClipId(`${clip.id}-copy`);
  return {
    ...cloneJson(clip),
    id,
    name: `${clip.name} copy`,
    tracks: clip.tracks.map((track, index) => ({
      ...cloneJson(track),
      id: `${id}.track-${index + 1}`,
    })),
  };
}

export function resolveMotionComposition(
  clips: readonly AnimationClip[],
  elapsedMs: number,
  activeClipIds?: ReadonlySet<string>,
): MotionResolvedStyle {
  const ordered = clips
    .filter((clip) => clip.enabled && (!activeClipIds || activeClipIds.has(clip.id)))
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  let result: MotionResolvedStyle = {};
  for (const clip of ordered) {
    result = blendResolvedStyle(result, resolveAnimationClip(clip, elapsedMs), clip.blend);
  }
  return result;
}

export function blendResolvedStyle(
  current: MotionResolvedStyle,
  incoming: MotionResolvedStyle,
  blend: MotionBlendMode,
): MotionResolvedStyle {
  const next: MotionResolvedStyle = { ...current };
  const entries: Array<[keyof MotionResolvedStyle, number | string | undefined]> = [
    ["opacity", incoming.opacity],
    ["translateX", incoming.translateX],
    ["translateY", incoming.translateY],
    ["scale", incoming.scale],
    ["rotate", incoming.rotate],
    ["borderRadius", incoming.borderRadius],
    ["backgroundColor", incoming.backgroundColor],
  ];
  for (const [property, value] of entries) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      if (blend !== "replace") {
        throw new Error(`Motion blend ${blend} is unsupported for ${property}`);
      }
      Object.assign(next, { [property]: value });
      continue;
    }
    const base = typeof current[property] === "number"
      ? current[property] as number
      : defaultNumericValue(property);
    let resolved = value;
    if (blend === "add") resolved = base + value;
    if (blend === "multiply") resolved = base * value;
    if (property === "opacity") resolved = clamp(resolved, 0, 1);
    if (property === "scale" || property === "borderRadius") resolved = Math.max(0, resolved);
    Object.assign(next, { [property]: resolved });
  }
  return next;
}

export function createAddAnimationCommand(
  document: UiDocument,
  nodeId: string,
  clip: AnimationClip,
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  if (node.animations?.some((candidate) => candidate.id === clip.id)) {
    throw new Error(`Cannot add animation: clip ${clip.id} already exists on node ${nodeId}`);
  }
  return createReplaceAnimationsCommand(
    document,
    nodeId,
    [...(node.animations ?? []), cloneJson(clip)],
    `Add animation ${clip.name}`,
  );
}

export function createReplaceAnimationCommand(
  document: UiDocument,
  nodeId: string,
  clipId: string,
  clip: AnimationClip,
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const index = node.animations?.findIndex((candidate) => candidate.id === clipId) ?? -1;
  if (index < 0) throw new Error(`Cannot replace animation: clip ${clipId} was not found on node ${nodeId}`);
  if (clip.id !== clipId && node.animations?.some((candidate) => candidate.id === clip.id)) {
    throw new Error(`Cannot replace animation: clip ${clip.id} already exists on node ${nodeId}`);
  }
  const animations = cloneAnimations(node.animations ?? []);
  animations[index] = cloneJson(clip);
  return createReplaceAnimationsCommand(document, nodeId, animations, `Update animation ${clip.name}`);
}

export function createUpdateAnimationCommand(
  document: UiDocument,
  nodeId: string,
  clipId: string,
  update: (clip: AnimationClip) => AnimationClip,
  label = "Update animation",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const clip = node.animations?.find((candidate) => candidate.id === clipId);
  if (!clip) throw new Error(`Cannot update animation: clip ${clipId} was not found on node ${nodeId}`);
  return createReplaceAnimationCommand(document, nodeId, clipId, update(cloneJson(clip)));
}

export function createRemoveAnimationCommand(
  document: UiDocument,
  nodeId: string,
  clipId: string,
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const animations = node.animations ?? [];
  if (!animations.some((clip) => clip.id === clipId)) {
    throw new Error(`Cannot remove animation: clip ${clipId} was not found on node ${nodeId}`);
  }
  return createReplaceAnimationsCommand(
    document,
    nodeId,
    animations.filter((clip) => clip.id !== clipId),
    `Remove animation ${clipId}`,
  );
}

export function createReplaceAnimationsCommand(
  document: UiDocument,
  nodeId: string,
  animations: readonly AnimationClip[],
  label = "Replace animations",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const before = node.animations === undefined ? undefined : cloneAnimations(node.animations);
  const after = cloneAnimations(animations);
  motionCommandSequence += 1;
  return {
    id: `motion:${nodeId}:${motionCommandSequence}`,
    label,
    apply: (current) => replaceNodeAnimations(current, nodeId, after),
    revert: (current) => replaceNodeAnimations(current, nodeId, before),
  };
}

export function resolveAnimationClip(
  clip: AnimationClip,
  elapsedMs: number,
): MotionResolvedStyle {
  if (!clip.enabled) return {};
  const progress = resolveTimelineProgress(clip, elapsedMs);
  if (progress === undefined) return {};
  const output: Record<string, number | string> = {};
  for (const track of clip.tracks) {
    output[track.property] = resolveTrackValue(track.property, track.keyframes, progress);
  }
  return {
    ...(typeof output.opacity === "number" ? { opacity: clamp(output.opacity, 0, 1) } : {}),
    ...(typeof output["transform.x"] === "number" ? { translateX: output["transform.x"] } : {}),
    ...(typeof output["transform.y"] === "number" ? { translateY: output["transform.y"] } : {}),
    ...(typeof output["transform.scale"] === "number" ? { scale: Math.max(0, output["transform.scale"]) } : {}),
    ...(typeof output["transform.rotate"] === "number" ? { rotate: output["transform.rotate"] } : {}),
    ...(typeof output.borderRadius === "number" ? { borderRadius: Math.max(0, output.borderRadius) } : {}),
    ...(typeof output.backgroundColor === "string" ? { backgroundColor: output.backgroundColor } : {}),
  };
}

function resolveTimelineProgress(clip: AnimationClip, elapsedMs: number): number | undefined {
  const { delayMs, durationMs, iterations, direction, fill, easing } = clip.timeline;
  const local = elapsedMs - delayMs;
  if (local < 0) return fill === "backwards" || fill === "both"
    ? directionalProgress(0, 0, direction, easing)
    : undefined;
  const totalDuration = durationMs * iterations;
  if (local >= totalDuration) {
    if (fill !== "forwards" && fill !== "both") return undefined;
    const finalIteration = Math.max(0, iterations - 1);
    return directionalProgress(1, finalIteration, direction, easing);
  }
  const rawIteration = local / durationMs;
  const iteration = Math.min(iterations - 1, Math.floor(rawIteration));
  const offset = rawIteration - iteration;
  return directionalProgress(offset, iteration, direction, easing);
}

function directionalProgress(
  progress: number,
  iteration: number,
  direction: AnimationClip["timeline"]["direction"],
  easing: MotionEasing,
): number {
  let reversed = false;
  if (direction === "reverse") reversed = true;
  if (direction === "alternate") reversed = iteration % 2 === 1;
  if (direction === "alternate-reverse") reversed = iteration % 2 === 0;
  return applyEasing(reversed ? 1 - progress : progress, easing);
}

function applyEasing(progress: number, easing: MotionEasing): number {
  const value = clamp(progress, 0, 1);
  if (easing === "linear") return value;
  if (easing === "ease-in") return value * value;
  if (easing === "ease-out") return 1 - ((1 - value) ** 2);
  return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
}

function resolveTrackValue(
  property: MotionTrackProperty,
  keyframes: AnimationClip["tracks"][number]["keyframes"],
  progress: number,
): number | string {
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.offset >= progress);
  if (nextIndex <= 0) return keyframes[0]!.value;
  const next = keyframes[nextIndex]!;
  const previous = keyframes[nextIndex - 1]!;
  if (typeof previous.value === "string" || typeof next.value === "string") return next.value;
  const span = next.offset - previous.offset;
  if (span <= 0) return next.value;
  const ratio = (progress - previous.offset) / span;
  return previous.value + ((next.value - previous.value) * ratio);
}

function defaultNumericValue(property: keyof MotionResolvedStyle): number {
  if (property === "opacity" || property === "scale") return 1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextClipId(seed: string): string {
  motionClipSequence += 1;
  return `${seed.replace(/[^A-Za-z0-9._-]+/g, "-")}-${motionClipSequence}`;
}

function requireEditableNode(document: UiDocument, nodeId: string): UiNode {
  const node = findNode(document.root, nodeId);
  if (!node) throw new Error(`Cannot edit animation: node ${nodeId} was not found`);
  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    throw new Error(`Cannot edit animation: node ${nodeId} is read-only`);
  }
  return node;
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function replaceNodeAnimations(
  document: UiDocument,
  nodeId: string,
  animations: readonly AnimationClip[] | undefined,
): UiDocument {
  let found = false;
  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    if (animations === undefined) {
      const { animations: _animations, ...withoutAnimations } = node;
      return withoutAnimations as UiNode;
    }
    return { ...node, animations: cloneAnimations(animations) };
  });
  if (!found) throw new Error(`Cannot edit animation: node ${nodeId} was not found`);
  return { ...document, root };
}

function updateNode(
  node: UiNode,
  nodeId: string,
  transform: (node: UiNode) => UiNode,
): UiNode {
  if (node.id === nodeId) return transform(node);
  return { ...node, children: node.children.map((child) => updateNode(child, nodeId, transform)) };
}

function cloneAnimations(animations: readonly AnimationClip[]): AnimationClip[] {
  return cloneJson([...animations]);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMotionCommandId(nodeId: string): string {
  motionCommandSequence += 1;
  return `motion:${nodeId}:${motionCommandSequence}`;
}
