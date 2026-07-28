import { layoutOverrideSchema } from "@afrodite/ui-ir";
import { z } from "zod";
import {
  bridgeErrorSchema,
  bridgePatchPlanViewSchema,
} from "./bridge";
import { uiDocumentProtocolSchema } from "./ui-document";

export const SEMANTIC_OPERATION_API_VERSION = 1 as const;

const semanticOperationCommandBaseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("convert_to_grid"),
    nodeId: z.string().min(1),
    gap: z.number().finite().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("create_responsive_variant"),
    nodeId: z.string().min(1),
    variantId: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
    name: z.string().min(1).optional(),
    minWidth: z.number().int().nonnegative(),
    maxWidth: z.number().int().nonnegative().optional(),
    layout: layoutOverrideSchema,
  }),
  z.object({
    type: z.literal("replace_spacing_with_token"),
    nodeId: z.string().min(1),
    property: z.enum(["gap", "padding"]),
    tokenName: z.string().regex(/^--[A-Za-z0-9_-]+$/),
    tokenFilePath: z.string().min(1),
  }),
  z.object({
    type: z.literal("explain_unpatchable_region"),
    nodeId: z.string().min(1),
  }),
]);

export const semanticOperationCommandSchema = semanticOperationCommandBaseSchema.superRefine(
  (command, context) => {
    if (
      command.type === "create_responsive_variant"
      && command.maxWidth !== undefined
      && command.maxWidth <= command.minWidth
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxWidth"],
        message: "maxWidth must be greater than minWidth.",
      });
    }
  },
);

export const semanticDiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  requirement: z.string().min(1).optional(),
});

export const semanticCapabilityVerdictSchema = z.object({
  documentMutation: z.boolean(),
  sourcePlanning: z.boolean(),
  sourceRepresentation: z.enum(["inline", "css-module", "utility", "design-token"]).optional(),
  requirements: z.array(z.string()),
});

export const semanticExplanationSchema = z.object({
  summary: z.string().min(1),
  facts: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export const semanticPlanRequestSchema = z.object({
  apiVersion: z.literal(SEMANTIC_OPERATION_API_VERSION).default(SEMANTIC_OPERATION_API_VERSION),
  document: uiDocumentProtocolSchema,
  command: semanticOperationCommandSchema,
});

export const semanticPlanViewSchema = z.object({
  apiVersion: z.literal(SEMANTIC_OPERATION_API_VERSION),
  planId: z.string().min(1),
  documentVersion: z.string().min(1),
  status: z.enum(["ready", "blocked", "informational"]),
  applicationMode: z.enum(["document-and-source", "document-only", "informational"]),
  capabilities: semanticCapabilityVerdictSchema,
  diagnostics: z.array(semanticDiagnosticSchema),
  documentAfter: uiDocumentProtocolSchema.optional(),
  explanation: semanticExplanationSchema.optional(),
  sourcePlans: z.array(bridgePatchPlanViewSchema),
});

export const semanticPlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plan: semanticPlanViewSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type SemanticOperationCommand = z.infer<typeof semanticOperationCommandSchema>;
export type SemanticDiagnostic = z.infer<typeof semanticDiagnosticSchema>;
export type SemanticCapabilityVerdict = z.infer<typeof semanticCapabilityVerdictSchema>;
export type SemanticExplanation = z.infer<typeof semanticExplanationSchema>;
export type SemanticPlanRequest = z.infer<typeof semanticPlanRequestSchema>;
export type SemanticPlanView = z.infer<typeof semanticPlanViewSchema>;
export type SemanticPlanResponse = z.infer<typeof semanticPlanResponseSchema>;
