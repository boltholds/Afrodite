import { z } from "zod";

export const layoutDirectionSchema = z.enum(["row", "column"]);

const sizingValueSchema = z.union([
  z.number().nonnegative(),
  z.enum(["fill", "hug"]),
]);

export const layoutSchema = z.object({
  display: z.enum(["block", "flex", "grid"]).default("block"),
  direction: layoutDirectionSchema.default("column"),
  gap: z.number().nonnegative().optional(),
  padding: z.number().nonnegative().optional(),
  sizing: z.object({
    width: sizingValueSchema,
    height: sizingValueSchema,
  }),
});

const frameworkIdentifierSchema = z.string().regex(
  /^[a-z][a-z0-9.-]*$/,
  "Framework identifiers must use lowercase letters, digits, dots, and hyphens.",
);

export const sourceBindingSchema = z.object({
  frameworkId: frameworkIdentifierSchema.optional(),
  adapterId: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
  repositoryPath: z.string().min(1),
  exportName: z.string().min(1).optional(),
  stableMarker: z.string().min(1).optional(),
});

export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type SourceBinding = z.infer<typeof sourceBindingSchema>;

interface UiNodeBase {
  id: string;
  name: string;
  layout: Layout;
  props: Record<string, unknown>;
  sourceBinding?: SourceBinding | undefined;
  children: UiNode[];
}

export type UiNode =
  | (UiNodeBase & {
      kind: "element";
      element: string;
    })
  | (UiNodeBase & {
      kind: "component";
      component: string;
    });

const uiNodeBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layout: layoutSchema,
  props: z.record(z.string(), z.unknown()).default({}),
  sourceBinding: sourceBindingSchema.optional(),
});

export const uiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.intersection(
    uiNodeBaseSchema,
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("element"),
        element: z.string().min(1),
        children: z.array(uiNodeSchema).default([]),
      }),
      z.object({
        kind: z.literal("component"),
        component: z.string().min(1),
        children: z.array(uiNodeSchema).default([]),
      }),
    ]),
  ),
);

export const uiDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  root: uiNodeSchema,
});

export type UiDocument = z.infer<typeof uiDocumentSchema>;

export function parseUiDocument(input: unknown): UiDocument {
  return uiDocumentSchema.parse(input);
}
