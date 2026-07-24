import { uiNodeSchema, type UiNode } from "@afrodite/ui-ir";
import { z } from "zod";

export const PREVIEW_CHANNEL = "afrodite.preview.v1" as const;

export const previewDiagnosticSchema = z.object({
  code: z.enum(["COMPONENT_NOT_REGISTERED", "RENDER_FAILED", "INVALID_MESSAGE"]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  componentName: z.string().min(1).optional(),
});

export const previewRenderRequestSchema = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  type: z.literal("render"),
  requestId: z.string().min(1),
  node: uiNodeSchema,
});

export const previewReadyMessageSchema = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  type: z.literal("ready"),
  hostVersion: z.literal(1),
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
    node,
  });
}

export function createPreviewReadyMessage(): PreviewReadyMessage {
  return {
    channel: PREVIEW_CHANNEL,
    type: "ready",
    hostVersion: 1,
  };
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
