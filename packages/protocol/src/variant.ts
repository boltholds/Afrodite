import {
  sourceBindingSchema,
  styleOwnershipSchema,
  uiVariantsSchema,
} from "@afrodite/ui-ir";
import { z } from "zod";

export const bridgeVariantOperationSchema = z.object({
  kind: z.literal("update-variants"),
  nodeId: z.string().min(1),
  binding: sourceBindingSchema,
  ownership: styleOwnershipSchema,
  before: uiVariantsSchema,
  after: uiVariantsSchema,
});

export const bridgeVariantPlanRequestSchema = z.object({
  operation: bridgeVariantOperationSchema,
});

export type BridgeVariantOperation = z.infer<typeof bridgeVariantOperationSchema>;
export type BridgeVariantPlanRequest = z.infer<typeof bridgeVariantPlanRequestSchema>;
