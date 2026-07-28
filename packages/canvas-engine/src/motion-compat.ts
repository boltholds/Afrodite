import type { AnimationClip } from "@afrodite/ui-ir";
import {
  createMotionPresetClip,
  duplicateAnimationClip as duplicateAnimationClipBase,
  resolveAnimationClip,
} from "./motion.js";

export {
  MOTION_PRESET_IDS,
  blendResolvedStyle,
  createAddAnimationCommand,
  createMotionPresetClip,
  createRemoveAnimationCommand,
  createReplaceAnimationCommand,
  createReplaceAnimationsCommand,
  createUpdateAnimationCommand,
  resolveAnimationClip,
  resolveMotionComposition,
} from "./motion.js";

export type {
  MotionPresetId,
  MotionResolvedStyle,
} from "./motion.js";

export type MotionPreset = import("./motion.js").MotionPresetId;
export type ResolvedMotionStyle = import("./motion.js").MotionResolvedStyle;

export function createAnimationPreset(preset: MotionPreset): AnimationClip {
  return createMotionPresetClip(preset);
}

export function createDefaultAnimationClip(): AnimationClip {
  return createMotionPresetClip("fade-in");
}

export function resolveMotionStyle(
  clip: AnimationClip,
  elapsedMs: number,
): ResolvedMotionStyle {
  return resolveAnimationClip(clip, elapsedMs);
}

export function resolveMotionCompositionDuration(
  clips: readonly AnimationClip[],
  activeClipIds?: ReadonlySet<string>,
): number {
  return clips.reduce((duration, clip) => {
    if (!clip.enabled || (activeClipIds && !activeClipIds.has(clip.id))) return duration;
    return Math.max(
      duration,
      clip.timeline.delayMs + clip.timeline.durationMs * clip.timeline.iterations,
    );
  }, 0);
}

export function duplicateAnimationClip(
  clip: AnimationClip,
  clipIdOrExisting?: string | readonly AnimationClip[],
): AnimationClip {
  if (typeof clipIdOrExisting === "string" || clipIdOrExisting === undefined) {
    return duplicateAnimationClipBase(clip, clipIdOrExisting);
  }

  const existingIds = new Set(clipIdOrExisting.map((candidate) => candidate.id));
  let sequence = 1;
  let id = `${clip.id}-copy`;
  while (existingIds.has(id)) {
    sequence += 1;
    id = `${clip.id}-copy-${sequence}`;
  }
  return duplicateAnimationClipBase(clip, id);
}
