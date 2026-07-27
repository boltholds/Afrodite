import { z } from "zod";

const motionIdentifierSchema = z.string().regex(
  /^[A-Za-z][A-Za-z0-9._-]*$/,
  "Motion identifiers must start with a letter and use letters, digits, dots, underscores, or hyphens.",
);

export const motionTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mount") }),
  z.object({ type: z.literal("hover") }),
  z.object({ type: z.literal("focus") }),
  z.object({ type: z.literal("click") }),
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("state"), state: z.string().min(1) }),
]);

export const motionEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

export const motionDirectionSchema = z.enum([
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
]);

export const motionFillSchema = z.enum([
  "none",
  "forwards",
  "backwards",
  "both",
]);

export const motionTimelineSchema = z.object({
  durationMs: z.number().finite().positive().max(600_000),
  delayMs: z.number().finite().nonnegative().max(600_000).default(0),
  easing: motionEasingSchema.default("ease-out"),
  iterations: z.number().int().positive().max(100).default(1),
  direction: motionDirectionSchema.default("normal"),
  fill: motionFillSchema.default("both"),
});

export const motionTrackPropertySchema = z.enum([
  "opacity",
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.rotate",
  "borderRadius",
  "backgroundColor",
]);

export const motionKeyframeSchema = z.object({
  offset: z.number().finite().min(0).max(1),
  value: z.union([z.number().finite(), z.string().min(1)]),
});

const numericMotionProperties = new Set([
  "opacity",
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.rotate",
  "borderRadius",
]);

export const motionTrackSchema = z.object({
  id: motionIdentifierSchema,
  property: motionTrackPropertySchema,
  keyframes: z.array(motionKeyframeSchema).min(2).max(64),
}).superRefine((track, context) => {
  const offsets = track.keyframes.map((keyframe) => keyframe.offset);
  if (offsets[0] !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["keyframes", 0, "offset"],
      message: "The first keyframe offset must be 0.",
    });
  }
  if (offsets.at(-1) !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["keyframes", track.keyframes.length - 1, "offset"],
      message: "The last keyframe offset must be 1.",
    });
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index]! <= offsets[index - 1]!) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyframes", index, "offset"],
        message: "Keyframe offsets must be strictly increasing.",
      });
    }
  }

  const expectsNumber = numericMotionProperties.has(track.property);
  track.keyframes.forEach((keyframe, index) => {
    if (expectsNumber && typeof keyframe.value !== "number") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyframes", index, "value"],
        message: `${track.property} keyframes require numeric values.`,
      });
    }
    if (!expectsNumber && typeof keyframe.value !== "string") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyframes", index, "value"],
        message: `${track.property} keyframes require string values.`,
      });
    }
  });
});

export const animationClipSchema = z.object({
  id: motionIdentifierSchema,
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  trigger: motionTriggerSchema,
  timeline: motionTimelineSchema,
  tracks: z.array(motionTrackSchema).min(1).max(32),
}).superRefine((clip, context) => {
  const ids = clip.tracks.map((track) => track.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tracks"],
      message: "Track identifiers must be unique within an animation clip.",
    });
  }
  const properties = clip.tracks.map((track) => track.property);
  if (new Set(properties).size !== properties.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tracks"],
      message: "An animation clip may define only one track per property.",
    });
  }
});

export const animationClipsSchema = z.array(animationClipSchema).max(32).superRefine((clips, context) => {
  const ids = clips.map((clip) => clip.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Animation clip identifiers must be unique within a node.",
    });
  }
});

export type MotionTrigger = z.infer<typeof motionTriggerSchema>;
export type MotionEasing = z.infer<typeof motionEasingSchema>;
export type MotionDirection = z.infer<typeof motionDirectionSchema>;
export type MotionFill = z.infer<typeof motionFillSchema>;
export type MotionTimeline = z.infer<typeof motionTimelineSchema>;
export type MotionTrackProperty = z.infer<typeof motionTrackPropertySchema>;
export type MotionKeyframe = z.infer<typeof motionKeyframeSchema>;
export type MotionTrack = z.infer<typeof motionTrackSchema>;
export type AnimationClip = z.infer<typeof animationClipSchema>;
