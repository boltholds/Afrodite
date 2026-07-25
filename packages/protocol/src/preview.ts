import { uiNodeSchema, type UiNode } from "@afrodite/ui-ir";
import { z } from "zod";
import { frameworkIdSchema } from "./catalog";

export const PREVIEW_CHANNEL = "afrodite.preview.v1" as const;

export const previewRuntimeSchema = z.object({
  frameworkId: frameworkIdSchema,
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1),
});

export const previewDiagnosticSchema = z.object({
  code: z.enum([
    "FRAMEWORK_NOT_SUPPORTED",
    "COMPONENT_NOT_REGISTERED",
    "RENDER_FAILED",
    "INVALID_MESSAGE",
  ]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  componentName: z.string().min(1).optional(),
  frameworkId: frameworkIdSchema.optional(),
});

export const previewRenderRequestSchema = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  type: z.literal("render"),
  requestId: z.string().min(1),
  requiredFrameworks: z.array(frameworkIdSchema).default([]),
  node: uiNodeSchema,
});

export const previewReadyMessageSchema = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  type: z.literal("ready"),
  hostVersion: z.literal(1),
  runtimes: z.array(previewRuntimeSchema).default([]),
});

export const previewRenderResultSchema = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  type: z.literal("render-result"),
  requestId: z.string().min(1),
  ok: z.boolean(),
  diagnostics: z.array(previewDiagnosticSchema),
});

export const previewMessageSchema = z.discriminatedUnion("type", [
  previewRenderRequestSchema,
  previewReadyMessageSchema,
  previewRenderResultSchema,
]);

export type PreviewRuntime = z.infer<typeof previewRuntimeSchema>;
export type PreviewDiagnostic = z.infer<typeof previewDiagnosticSchema>;
export type PreviewRenderRequest = z.infer<typeof previewRenderRequestSchema>;
export type PreviewReadyMessage = z.infer<typeof previewReadyMessageSchema>;
export type PreviewRenderResult = z.infer<typeof previewRenderResultSchema>;
export type PreviewMessage = z.infer<typeof previewMessageSchema>;

export function decodePreviewMessage(input: unknown): PreviewMessage | undefined {
  const parsed = previewMessageSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

export function createPreviewRenderRequest(
  node: UiNode,
  requestId: string,
): PreviewRenderRequest {
  return previewRenderRequestSchema.parse({
    channel: PREVIEW_CHANNEL,
    type: "render",
    requestId,
    requiredFrameworks: collectFrameworkIds(node),
    node,
  });
}

export function createPreviewReadyMessage(
  runtimes: readonly PreviewRuntime[] = [],
): PreviewReadyMessage {
  return previewReadyMessageSchema.parse({
    channel: PREVIEW_CHANNEL,
    type: "ready",
    hostVersion: 1,
    runtimes,
  });
}

export function createPreviewRenderResult(
  requestId: string,
  diagnostics: readonly PreviewDiagnostic[],
): PreviewRenderResult {
  return {
    channel: PREVIEW_CHANNEL,
    type: "render-result",
    requestId,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics: [...diagnostics],
  };
}

function collectFrameworkIds(node: UiNode): string[] {
  const ids = new Set<string>();

  const visit = (current: UiNode) => {
    if (current.sourceBinding?.frameworkId) ids.add(current.sourceBinding.frameworkId);
    for (const child of current.children) visit(child);
  };

  visit(node);
  return [...ids].sort();
}
