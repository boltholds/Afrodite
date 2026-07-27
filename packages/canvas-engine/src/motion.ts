import {
  animationClipSchema,
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

let motionCommandSequence = 0;
let defaultClipSequence = 0;

export function createDefaultAnimationClip(name = "New animation"): AnimationClip {
  defaultClipSequence += 1;
  return animationClipSchema.parse({
    id: `animation-${defaultClipSequence}`,
    name,
    enabled: true,
    trigger: { type: "manual" },
    timeline: {
      durationMs: 300,
      delayMs: 0,
      easing: "ease-out",
      iterations: 1,
      direction: "normal",
      fill: "both",
    },
    tracks: [{
      id: "opacity",
      property: "opacity",
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 1 },
      ],
    }],
  });
}

export function createReplaceAnimationsCommand(
  document: UiDocument,
  nodeId: string,
  animations: readonly AnimationClip[],
  label = "Update animations",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId);
  const before = node.animations ? cloneAnimations(node.animations) : undefined;
  const parsed = animationClipSchema.array().max(32).parse(animations);
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
    result[track.property] = resolveTrackValue(track, progress);
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
    return interpolateKeyframes(left, right, segment);
  }
  return last.value;
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
  return JSON.parse(JSON.stringify(animations)) as AnimationClip[];
}

function createMotionCommandId(nodeId: string): string {
  motionCommandSequence += 1;
  return `motion:${nodeId}:${motionCommandSequence}`;
}
