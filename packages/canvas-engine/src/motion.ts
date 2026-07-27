import {
  animationClipSchema,
  animationClipsSchema,
  type AnimationClip,
  type MotionKeyframe,
  type MotionTrack,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index";
import { findNode } from "./index";

export interface ResolvedMotionStyle {
  readonly opacity?: number;
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scale?: number;
  readonly rotate?: number;
  readonly borderRadius?: number;
  readonly backgroundColor?: string;
}

export type MotionPreset =
  | "fade-in"
  | "slide-up"
  | "scale-in"
  | "spin"
  | "pulse"
  | "color-shift";

let motionCommandSequence = 0;
let defaultClipSequence = 0;

export function createDefaultAnimationClip(name = "New animation"): AnimationClip {
  return createAnimationPreset("fade-in", name);
}

export function createAnimationPreset(
  preset: MotionPreset,
  name = presetName(preset),
): AnimationClip {
  defaultClipSequence += 1;
  const base = {
    id: `${preset}-${defaultClipSequence}`,
    name,
    enabled: true,
    priority: 0,
    blend: "replace" as const,
    trigger: { type: "manual" as const },
    timeline: {
      durationMs: preset === "spin" ? 600 : 300,
      delayMs: 0,
      easing: preset === "pulse" ? "ease-in-out" as const : "ease-out" as const,
      iterations: preset === "pulse" ? 2 : 1,
      direction: preset === "pulse" ? "alternate" as const : "normal" as const,
      fill: "both" as const,
    },
  };

  switch (preset) {
    case "slide-up":
      return animationClipSchema.parse({
        ...base,
        tracks: [{
          id: "translate-y",
          property: "transform.y",
          keyframes: [{ offset: 0, value: 24 }, { offset: 1, value: 0 }],
        }],
      });
    case "scale-in":
      return animationClipSchema.parse({
        ...base,
        tracks: [{
          id: "scale",
          property: "transform.scale",
          keyframes: [{ offset: 0, value: 0.92 }, { offset: 1, value: 1 }],
        }],
      });
    case "spin":
      return animationClipSchema.parse({
        ...base,
        timeline: { ...base.timeline, easing: "linear" },
        tracks: [{
          id: "rotate",
          property: "transform.rotate",
          keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 360 }],
        }],
      });
    case "pulse":
      return animationClipSchema.parse({
        ...base,
        blend: "multiply",
        tracks: [{
          id: "scale",
          property: "transform.scale",
          keyframes: [{ offset: 0, value: 1 }, { offset: 1, value: 1.06 }],
        }],
      });
    case "color-shift":
      return animationClipSchema.parse({
        ...base,
        tracks: [{
          id: "background-color",
          property: "backgroundColor",
          keyframes: [{ offset: 0, value: "#111827" }, { offset: 1, value: "#ff3bbd" }],
        }],
      });
    case "fade-in":
    default:
      return animationClipSchema.parse({
        ...base,
        tracks: [{
          id: "opacity",
          property: "opacity",
          keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
        }],
      });
  }
}

export function duplicateAnimationClip(
  clip: AnimationClip,
  existing: readonly AnimationClip[],
): AnimationClip {
  const base = `${clip.id}-copy`;
  let id = base;
  let sequence = 2;
  while (existing.some((candidate) => candidate.id === id)) id = `${base}-${sequence++}`;
  return animationClipSchema.parse({ ...cloneJson(clip), id, name: `${clip.name} copy` });
}

export function createReplaceAnimationsCommand(
  document: UiDocument,
  nodeId: string,
  animations: readonly AnimationClip[],
  label = "Update animations",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const before = node.animations ? cloneAnimations(node.animations) : undefined;
  const parsed = animationClipsSchema.parse(animations);
  const after = cloneAnimations(parsed);

  return {
    id: createMotionCommandId(nodeId),
    label,
    apply: (current) => replaceNodeAnimations(current, nodeId, after),
    revert: (current) => replaceNodeAnimations(current, nodeId, before),
  };
}

export function createUpsertAnimationClipCommand(
  document: UiDocument,
  nodeId: string,
  clip: AnimationClip,
  label = "Update animation clip",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const parsed = animationClipSchema.parse(clip);
  const animations = cloneAnimations(node.animations ?? []);
  const index = animations.findIndex((candidate) => candidate.id === parsed.id);
  if (index >= 0) animations[index] = parsed;
  else animations.push(parsed);
  return createReplaceAnimationsCommand(document, nodeId, animations, label);
}

export function createDeleteAnimationClipCommand(
  document: UiDocument,
  nodeId: string,
  clipId: string,
  label = "Delete animation clip",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const animations = (node.animations ?? []).filter((clip) => clip.id !== clipId);
  if (animations.length === (node.animations ?? []).length) {
    throw new Error(`Animation clip ${clipId} was not found on node ${nodeId}`);
  }
  return createReplaceAnimationsCommand(document, nodeId, animations, label);
}

export function resolveMotionStyle(
  clip: AnimationClip,
  elapsedMs: number,
): ResolvedMotionStyle {
  if (!clip.enabled) return {};
  const progress = resolveMotionProgress(clip, elapsedMs);
  if (progress === undefined) return {};
  const result: Record<string, number | string> = {};
  for (const track of clip.tracks) {
    result[track.property] = resolveMotionTrackValue(track, progress);
  }
  return {
    ...(typeof result.opacity === "number" ? { opacity: result.opacity } : {}),
    ...(typeof result["transform.x"] === "number" ? { translateX: result["transform.x"] } : {}),
    ...(typeof result["transform.y"] === "number" ? { translateY: result["transform.y"] } : {}),
    ...(typeof result["transform.scale"] === "number" ? { scale: result["transform.scale"] } : {}),
    ...(typeof result["transform.rotate"] === "number" ? { rotate: result["transform.rotate"] } : {}),
    ...(typeof result.borderRadius === "number" ? { borderRadius: result.borderRadius } : {}),
    ...(typeof result.backgroundColor === "string" ? { backgroundColor: result.backgroundColor } : {}),
  };
}

export function resolveMotionComposition(
  clips: readonly AnimationClip[],
  elapsedMs: number,
  activeClipIds?: ReadonlySet<string>,
): ResolvedMotionStyle {
  const active = clips
    .filter((clip) => clip.enabled && (!activeClipIds || activeClipIds.has(clip.id)))
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  const result: Record<keyof ResolvedMotionStyle, number | string | undefined> = {
    opacity: undefined,
    translateX: undefined,
    translateY: undefined,
    scale: undefined,
    rotate: undefined,
    borderRadius: undefined,
    backgroundColor: undefined,
  };

  for (const clip of active) {
    const style = resolveMotionStyle(clip, elapsedMs);
    composeNumber(result, "opacity", style.opacity, clip.blend, 1, true);
    composeNumber(result, "translateX", style.translateX, clip.blend, 0);
    composeNumber(result, "translateY", style.translateY, clip.blend, 0);
    composeNumber(result, "scale", style.scale, clip.blend, 1, false, true);
    composeNumber(result, "rotate", style.rotate, clip.blend, 0);
    composeNumber(result, "borderRadius", style.borderRadius, clip.blend, 0, false, true);
    if (style.backgroundColor !== undefined) result.backgroundColor = style.backgroundColor;
  }

  return {
    ...(typeof result.opacity === "number" ? { opacity: result.opacity } : {}),
    ...(typeof result.translateX === "number" ? { translateX: result.translateX } : {}),
    ...(typeof result.translateY === "number" ? { translateY: result.translateY } : {}),
    ...(typeof result.scale === "number" ? { scale: result.scale } : {}),
    ...(typeof result.rotate === "number" ? { rotate: result.rotate } : {}),
    ...(typeof result.borderRadius === "number" ? { borderRadius: result.borderRadius } : {}),
    ...(typeof result.backgroundColor === "string" ? { backgroundColor: result.backgroundColor } : {}),
  };
}

export function resolveMotionCompositionDuration(
  clips: readonly AnimationClip[],
  activeClipIds?: ReadonlySet<string>,
): number {
  return clips
    .filter((clip) => clip.enabled && (!activeClipIds || activeClipIds.has(clip.id)))
    .reduce((maximum, clip) => Math.max(
      maximum,
      clip.timeline.delayMs + clip.timeline.durationMs * clip.timeline.iterations,
    ), 0);
}

export function resolveMotionProgress(
  clip: AnimationClip,
  elapsedMs: number,
): number | undefined {
  const { durationMs, delayMs, iterations, direction, fill, easing } = clip.timeline;
  const local = elapsedMs - delayMs;
  const activeDuration = durationMs * iterations;

  if (local < 0) {
    if (fill !== "backwards" && fill !== "both") return undefined;
    return applyEasing(applyDirection(0, 0, direction), easing);
  }

  if (local >= activeDuration) {
    if (fill !== "forwards" && fill !== "both") return undefined;
    return applyEasing(applyDirection(1, iterations - 1, direction), easing);
  }

  const iteration = Math.min(iterations - 1, Math.floor(local / durationMs));
  const raw = (local - iteration * durationMs) / durationMs;
  return applyEasing(applyDirection(raw, iteration, direction), easing);
}

export function resolveMotionTrackValue(track: MotionTrack, progress: number): number | string {
  const first = track.keyframes[0]!;
  const last = track.keyframes.at(-1)!;
  if (progress <= first.offset) return first.value;
  if (progress >= last.offset) return last.value;

  for (let index = 1; index < track.keyframes.length; index += 1) {
    const right = track.keyframes[index]!;
    if (progress > right.offset) continue;
    const left = track.keyframes[index - 1]!;
    const segment = (progress - left.offset) / (right.offset - left.offset);
    return interpolateKeyframes(left, right, segment);
  }
  return last.value;
}

function composeNumber(
  result: Record<keyof ResolvedMotionStyle, number | string | undefined>,
  key: keyof ResolvedMotionStyle,
  value: number | undefined,
  blend: AnimationClip["blend"],
  identity: number,
  clampUnit = false,
  clampNonNegative = false,
): void {
  if (value === undefined) return;
  const current = typeof result[key] === "number" ? result[key] as number : identity;
  let next = value;
  if (blend === "add") next = current + value;
  if (blend === "multiply") next = current * value;
  if (clampUnit) next = Math.max(0, Math.min(1, next));
  if (clampNonNegative) next = Math.max(0, next);
  result[key] = next;
}

function interpolateKeyframes(
  left: MotionKeyframe,
  right: MotionKeyframe,
  progress: number,
): number | string {
  if (typeof left.value === "number" && typeof right.value === "number") {
    return left.value + (right.value - left.value) * progress;
  }
  return progress < 1 ? left.value : right.value;
}

function applyDirection(
  progress: number,
  iteration: number,
  direction: AnimationClip["timeline"]["direction"],
): number {
  switch (direction) {
    case "reverse": return 1 - progress;
    case "alternate": return iteration % 2 === 0 ? progress : 1 - progress;
    case "alternate-reverse": return iteration % 2 === 0 ? 1 - progress : progress;
    default: return progress;
  }
}

function applyEasing(
  progress: number,
  easing: AnimationClip["timeline"]["easing"],
): number {
  const clamped = Math.max(0, Math.min(1, progress));
  switch (easing) {
    case "ease-in": return clamped * clamped;
    case "ease-out": return 1 - (1 - clamped) * (1 - clamped);
    case "ease-in-out": return clamped < 0.5
      ? 2 * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    default: return clamped;
  }
}

function presetName(preset: MotionPreset): string {
  return preset.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" ");
}

function requireEditableNode(document: UiDocument, nodeId: string): UiNode {
  const node = findNode(document.root, nodeId);
  if (!node) throw new Error(`Cannot edit animation: node ${nodeId} was not found`);
  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    throw new Error(`Cannot edit animation: node ${nodeId} is read-only`);
  }
  return node;
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
  return cloneJson(animations);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMotionCommandId(nodeId: string): string {
  motionCommandSequence += 1;
  return `motion:${nodeId}:${motionCommandSequence}`;
}
