import { uiDocumentSchema } from "@afrodite/ui-ir";
import { z } from "zod";
import { frameworkIdSchema } from "./catalog";
import { bridgeDiagnosticSchema, bridgeErrorSchema } from "./bridge";

export const screenImportRequestSchema = z.object({
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  exportName: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  documentName: z.string().min(1).optional(),
  maxDepth: z.number().int().min(1).max(128).optional(),
});

export const screenImportStatsSchema = z.object({
  totalNodes: z.number().int().nonnegative(),
  editableNodes: z.number().int().nonnegative(),
  requiresBindingNodes: z.number().int().nonnegative(),
  readOnlyRegions: z.number().int().nonnegative(),
});

export const screenImportResultSchema = z.object({
  frameworkId: frameworkIdSchema,
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  exportName: z.string().min(1).optional(),
  document: uiDocumentSchema.optional(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  stats: screenImportStatsSchema,
});

export const screenImportResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: screenImportResultSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type ScreenImportRequest = z.infer<typeof screenImportRequestSchema>;
export type ScreenImportStats = z.infer<typeof screenImportStatsSchema>;
export type ScreenImportResult = z.infer<typeof screenImportResultSchema>;
export type ScreenImportResponse = z.infer<typeof screenImportResponseSchema>;
