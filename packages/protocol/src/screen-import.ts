import { z } from "zod";
import { frameworkIdSchema } from "./catalog";
import { bridgeDiagnosticSchema, bridgeErrorSchema } from "./bridge";
import { uiDocumentProtocolSchema } from "./ui-document";

const componentBoundarySchema = z.string().min(1).max(500);

export const screenImportRequestSchema = z.object({
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  exportName: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  documentName: z.string().min(1).optional(),
  maxDepth: z.number().int().min(1).max(128).optional(),
  maxFiles: z.number().int().min(1).max(128).optional(),
  maxNodes: z.number().int().min(1).max(20_000).optional(),
  maxGraphDepth: z.number().int().min(0).max(32).optional(),
  expansionMode: z.enum(["all-local", "explicit"]).optional(),
  expandComponents: z.array(componentBoundarySchema).max(512).optional(),
  stopComponents: z.array(componentBoundarySchema).max(512).optional(),
});

export const screenImportStatsSchema = z.object({
  totalNodes: z.number().int().nonnegative(),
  editableNodes: z.number().int().nonnegative(),
  requiresBindingNodes: z.number().int().nonnegative(),
  readOnlyRegions: z.number().int().nonnegative(),
});

export const screenImportGraphFileSchema = z.object({
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  exportName: z.string().min(1),
  depth: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  root: z.boolean(),
});

export const screenImportGraphEdgeSchema = z.object({
  edgeId: z.string().min(1),
  fromRepositoryPath: z.string().min(1),
  fromExportName: z.string().min(1),
  fromNodeId: z.string().min(1),
  localName: z.string().min(1),
  moduleSpecifier: z.string().min(1),
  importedName: z.string().min(1),
  targetRepositoryPath: z.string().min(1).optional(),
  status: z.enum(["expanded", "boundary", "cycle", "missing", "budget", "failed"]),
  depth: z.number().int().nonnegative(),
  reason: z.string().min(1).optional(),
});

export const screenImportGraphBudgetSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxNodes: z.number().int().positive(),
  maxGraphDepth: z.number().int().nonnegative(),
  filesRead: z.number().int().nonnegative(),
  nodesMaterialized: z.number().int().nonnegative(),
  expandedComponents: z.number().int().nonnegative(),
  boundaries: z.number().int().nonnegative(),
  cycles: z.number().int().nonnegative(),
  missingImports: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const screenImportResultSchema = z.object({
  frameworkId: frameworkIdSchema,
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  exportName: z.string().min(1).optional(),
  document: uiDocumentProtocolSchema.optional(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  stats: screenImportStatsSchema,
  files: z.array(screenImportGraphFileSchema).optional(),
  edges: z.array(screenImportGraphEdgeSchema).optional(),
  graph: screenImportGraphBudgetSchema.optional(),
});

export const screenImportResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: screenImportResultSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type ScreenImportRequest = z.infer<typeof screenImportRequestSchema>;
export type ScreenImportStats = z.infer<typeof screenImportStatsSchema>;
export type ScreenImportGraphFile = z.infer<typeof screenImportGraphFileSchema>;
export type ScreenImportGraphEdge = z.infer<typeof screenImportGraphEdgeSchema>;
export type ScreenImportGraphBudget = z.infer<typeof screenImportGraphBudgetSchema>;
export type ScreenImportResult = z.infer<typeof screenImportResultSchema>;
export type ScreenImportResponse = z.infer<typeof screenImportResponseSchema>;
