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

export const stylePropertySchema = z.enum([
  "display",
  "direction",
  "gap",
  "padding",
  "width",
  "height",
]);

const managedPropertiesSchema = z.array(stylePropertySchema).min(1).superRefine((properties, context) => {
  if (new Set(properties).size !== properties.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Managed style properties must be unique." });
  }
});

const tokenMapSchema = z.object({
  display: z.string().min(1).optional(),
  direction: z.string().min(1).optional(),
  gap: z.string().min(1).optional(),
  padding: z.string().min(1).optional(),
  width: z.string().min(1).optional(),
  height: z.string().min(1).optional(),
});

export const styleOwnershipSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("inline"),
    managedProperties: managedPropertiesSchema,
  }),
  z.object({
    strategy: z.literal("css-module"),
    managedProperties: managedPropertiesSchema,
    stylesheetPath: z.string().min(1),
    className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
  }),
  z.object({
    strategy: z.literal("utility"),
    managedProperties: managedPropertiesSchema,
    dialect: z.literal("tailwind").default("tailwind"),
    attribute: z.enum(["class", "className"]).optional(),
  }),
  z.object({
    strategy: z.literal("design-token"),
    managedProperties: managedPropertiesSchema,
    tokenFilePath: z.string().min(1),
    tokens: tokenMapSchema.refine(
      (tokens) => Object.keys(tokens).length > 0,
      "At least one design-token binding is required.",
    ),
  }),
]).superRefine((ownership, context) => {
  if (ownership.strategy !== "design-token") return;
  for (const property of ownership.managedProperties) {
    if (!ownership.tokens[property]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tokens", property],
        message: `Managed property ${property} requires a token binding.`,
      });
    }
  }
});

export const sourceBindingSchema = z.object({
  frameworkId: frameworkIdentifierSchema.optional(),
  adapterId: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
  repositoryPath: z.string().min(1),
  exportName: z.string().min(1).optional(),
  stableMarker: z.string().min(1).optional(),
  styleOwnership: styleOwnershipSchema.optional(),
});

export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type StyleProperty = z.infer<typeof stylePropertySchema>;
export type StyleOwnership = z.infer<typeof styleOwnershipSchema>;
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
