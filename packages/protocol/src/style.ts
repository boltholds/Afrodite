import { layoutSchema, sourceBindingSchema, styleOwnershipSchema } from "@afrodite/ui-ir";
import { z } from "zod";

export const bridgeStyleOperationSchema = z.object({
  kind: z.literal("update-style"),
  nodeId: z.string().min(1),
  binding: sourceBindingSchema,
  ownership: styleOwnershipSchema,
  before: layoutSchema,
  after: layoutSchema,
});

export const bridgeStylePlanRequestSchema = z.object({
  operation: bridgeStyleOperationSchema,
});

export type BridgeStyleOperation = z.infer<typeof bridgeStyleOperationSchema>;
export type BridgeStylePlanRequest = z.infer<typeof bridgeStylePlanRequestSchema>;
