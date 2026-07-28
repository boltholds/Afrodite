import { sourceBindingSchema } from "@afrodite/ui-ir";
import { z } from "zod";
import {
  bridgeDiagnosticSchema,
  bridgePatchPlanViewSchema,
} from "./bridge";

export const bindingMarkerStateSchema = z.enum([
  "missing",
  "static",
  "dynamic",
  "duplicate",
]);

export const bindingCandidateSchema = z.object({
  candidateId: z.string().min(1),
  repositoryPath: z.string().min(1),
  elementName: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  snippet: z.string(),
  markerState: bindingMarkerStateSchema,
  existingMarker: z.string().optional(),
  patchable: z.boolean(),
  diagnostics: z.array(bridgeDiagnosticSchema),
});

export interface BindingDiscoveryRequest {
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly exportName?: string;
  readonly componentId?: string;
}

interface BindingDiscoveryRequestInput {
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly exportName?: string | undefined;
  readonly componentId?: string | undefined;
}

const bindingDiscoveryRequestInputSchema = z.object({
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  exportName: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
});

export const bindingDiscoveryRequestSchema: z.ZodType<
  BindingDiscoveryRequest,
  z.ZodTypeDef,
  BindingDiscoveryRequestInput
> = bindingDiscoveryRequestInputSchema.transform((input) => ({
  adapterId: input.adapterId,
  repositoryPath: input.repositoryPath,
  ...(input.exportName === undefined ? {} : { exportName: input.exportName }),
  ...(input.componentId === undefined ? {} : { componentId: input.componentId }),
}));

export const bindingDiscoveryResultSchema = z.object({
  frameworkId: z.string().min(1),
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  candidates: z.array(bindingCandidateSchema),
  diagnostics: z.array(bridgeDiagnosticSchema),
});

export const bindingDiscoveryResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), discovery: bindingDiscoveryResultSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);

export interface BindingMarkerPlanRequest {
  readonly nodeId: string;
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly candidateId: string;
  readonly stableMarker: string;
  readonly expectedSourceVersion: string;
  readonly exportName?: string;
  readonly componentId?: string;
}

interface BindingMarkerPlanRequestInput {
  readonly nodeId: string;
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly candidateId: string;
  readonly stableMarker: string;
  readonly expectedSourceVersion: string;
  readonly exportName?: string | undefined;
  readonly componentId?: string | undefined;
}

const bindingMarkerPlanRequestInputSchema = z.object({
  nodeId: z.string().min(1),
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  candidateId: z.string().min(1),
  stableMarker: z.string().min(1).max(200),
  expectedSourceVersion: z.string().min(1),
  exportName: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
});

export const bindingMarkerPlanRequestSchema: z.ZodType<
  BindingMarkerPlanRequest,
  z.ZodTypeDef,
  BindingMarkerPlanRequestInput
> = bindingMarkerPlanRequestInputSchema.transform((input) => ({
  nodeId: input.nodeId,
  adapterId: input.adapterId,
  repositoryPath: input.repositoryPath,
  candidateId: input.candidateId,
  stableMarker: input.stableMarker,
  expectedSourceVersion: input.expectedSourceVersion,
  ...(input.exportName === undefined ? {} : { exportName: input.exportName }),
  ...(input.componentId === undefined ? {} : { componentId: input.componentId }),
}));

export const bindingPatchPlanViewSchema = bridgePatchPlanViewSchema.extend({
  sourceWriteRequired: z.boolean(),
  proposedBinding: sourceBindingSchema,
});

export const bindingMarkerPlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plan: bindingPatchPlanViewSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);

export type BindingMarkerState = z.infer<typeof bindingMarkerStateSchema>;
export type BindingCandidate = z.infer<typeof bindingCandidateSchema>;
export type BindingDiscoveryResult = z.infer<typeof bindingDiscoveryResultSchema>;
export type BindingDiscoveryResponse = z.infer<typeof bindingDiscoveryResponseSchema>;
export type BindingPatchPlanView = z.infer<typeof bindingPatchPlanViewSchema>;
export type BindingMarkerPlanResponse = z.infer<typeof bindingMarkerPlanResponseSchema>;
