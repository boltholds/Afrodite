import { z } from "zod";
import {
  animationClipsSchema,
  sourceBindingSchema,
} from "@afrodite/ui-ir";

export const motionOwnershipSchema = z.object({
  strategy: z.literal("css-keyframes"),
  stylesheetPath: z.string().min(1),
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
  managedClipIds: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9._-]*$/)).min(1).max(32),
}).superRefine((ownership, context) => {
  if (new Set(ownership.managedClipIds).size !== ownership.managedClipIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["managedClipIds"],
      message: "Managed motion clip IDs must be unique.",
    });
  }
});

export const bridgeMotionOperationSchema = z.object({
  kind: z.literal("update-motion"),
  nodeId: z.string().min(1),
  binding: sourceBindingSchema,
  ownership: motionOwnershipSchema,
  before: animationClipsSchema,
  after: animationClipsSchema,
});

export const bridgeMotionPlanRequestSchema = z.object({
  operation: bridgeMotionOperationSchema,
});

export type MotionOwnership = z.infer<typeof motionOwnershipSchema>;
export type BridgeMotionOperation = z.infer<typeof bridgeMotionOperationSchema>;
export type BridgeMotionPlanRequest = z.infer<typeof bridgeMotionPlanRequestSchema>;
