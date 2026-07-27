import { z } from "zod";
import { animationClipsSchema, type AnimationClip } from "./motion";

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

export const positionSchema = z.object({
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
});

export const appearanceSchema = z.object({
  borderRadius: z.number().finite().nonnegative().default(0),
});

export const layoutOverrideSchema = z.object({
  display: z.enum(["block", "flex", "grid"]).optional(),
  direction: layoutDirectionSchema.optional(),
  gap: z.number().nonnegative().optional(),
  padding: z.number().nonnegative().optional(),
  sizing: z.object({
    width: sizingValueSchema.optional(),
    height: sizingValueSchema.optional(),
  }).optional(),
}).superRefine((override, context) => {
  const sizingChanged = override.sizing
    && (override.sizing.width !== undefined || override.sizing.height !== undefined);
  if (
    override.display === undefined
    && override.direction === undefined
    && override.gap === undefined
    && override.padding === undefined
    && !sizingChanged
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A layout override must change at least one property.",
    });
  }
});

export const interactionStateSchema = z.enum([
  "hover",
  "focus",
  "disabled",
  "loading",
  "error",
]);

const variantIdSchema = z.string().regex(
  /^[A-Za-z][A-Za-z0-9._-]*$/,
  "Variant identifiers must start with a letter and use letters, digits, dots, underscores, or hyphens.",
);

export const responsiveVariantSchema = z.object({
  id: variantIdSchema,
  name: z.string().min(1).optional(),
  minWidth: z.number().int().nonnegative(),
  maxWidth: z.number().int().nonnegative().optional(),
  layout: layoutOverrideSchema,
}).superRefine((variant, context) => {
  if (variant.maxWidth !== undefined && variant.maxWidth <= variant.minWidth) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxWidth"],
      message: "Responsive variant maxWidth must be greater than minWidth.",
    });
  }
});

export const stateVariantSchema = z.object({
  id: variantIdSchema,
  name: z.string().min(1).optional(),
  state: interactionStateSchema,
  layout: layoutOverrideSchema,
});

export const uiVariantsSchema = z.object({
  responsive: z.array(responsiveVariantSchema).default([]),
  states: z.array(stateVariantSchema).default([]),
}).superRefine((variants, context) => {
  const ids = [...variants.responsive, ...variants.states].map((variant) => variant.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Variant identifiers must be unique within a node.",
    });
  }

  const states = variants.states.map((variant) => variant.state);
  if (new Set(states).size !== states.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["states"],
      message: "A node may define only one override for each interaction state.",
    });
  }
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

export const sourceRegionModeSchema = z.enum([
  "editable",
  "requires-binding",
  "read-only",
]);

export const sourceRegionKindSchema = z.enum([
  "element",
  "component",
  "fragment",
  "text",
  "expression",
  "conditional",
  "iteration",
  "call",
  "unsupported",
]);

export const sourceRegionSchema = z.object({
  frameworkId: frameworkIdentifierSchema,
  adapterId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  exportName: z.string().min(1).optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  mode: sourceRegionModeSchema,
  regionKind: sourceRegionKindSchema,
  excerpt: z.string().max(500),
  reason: z.string().min(1).optional(),
}).superRefine((region, context) => {
  if (region.end < region.start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "Source region end must not precede its start.",
    });
  }
  if (region.mode === "read-only" && !region.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "Read-only source regions require an explicit reason.",
    });
  }
});

export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type Position = z.infer<typeof positionSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type LayoutOverride = z.infer<typeof layoutOverrideSchema>;
export type InteractionState = z.infer<typeof interactionStateSchema>;
export type ResponsiveVariant = z.infer<typeof responsiveVariantSchema>;
export type StateVariant = z.infer<typeof stateVariantSchema>;
export type UiVariants = z.infer<typeof uiVariantsSchema>;
export type StyleProperty = z.infer<typeof stylePropertySchema>;
export type StyleOwnership = z.infer<typeof styleOwnershipSchema>;
export type SourceBinding = z.infer<typeof sourceBindingSchema>;
export type SourceRegionMode = z.infer<typeof sourceRegionModeSchema>;
export type SourceRegionKind = z.infer<typeof sourceRegionKindSchema>;
export type SourceRegion = z.infer<typeof sourceRegionSchema>;

interface UiNodeBase {
  id: string;
  name: string;
  layout: Layout;
  position?: Position | undefined;
  appearance?: Appearance | undefined;
  variants?: UiVariants | undefined;
  animations?: AnimationClip[] | undefined;
  props: Record<string, unknown>;
  sourceBinding?: SourceBinding | undefined;
  sourceRegion?: SourceRegion | undefined;
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
    })
  | (UiNodeBase & {
      kind: "source-region";
      regionKind: SourceRegionKind;
      sourceRegion: SourceRegion;
    });

export interface UiNodeInputBase {
  id: string;
  name: string;
  layout: z.input<typeof layoutSchema>;
  position?: z.input<typeof positionSchema> | undefined;
  appearance?: z.input<typeof appearanceSchema> | undefined;
  variants?: z.input<typeof uiVariantsSchema> | undefined;
  animations?: z.input<typeof animationClipsSchema> | undefined;
  props?: Record<string, unknown> | undefined;
  sourceBinding?: z.input<typeof sourceBindingSchema> | undefined;
  sourceRegion?: z.input<typeof sourceRegionSchema> | undefined;
  children?: UiNodeInput[] | undefined;
}

export type UiNodeInput =
  | (UiNodeInputBase & {
      kind: "element";
      element: string;
    })
  | (UiNodeInputBase & {
      kind: "component";
      component: string;
    })
  | (UiNodeInputBase & {
      kind: "source-region";
      regionKind: z.input<typeof sourceRegionKindSchema>;
      sourceRegion: z.input<typeof sourceRegionSchema>;
    });

const uiNodeBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layout: layoutSchema,
  position: positionSchema.optional(),
  appearance: appearanceSchema.optional(),
  variants: uiVariantsSchema.optional(),
  animations: animationClipsSchema.optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  sourceBinding: sourceBindingSchema.optional(),
  sourceRegion: sourceRegionSchema.optional(),
});

export const uiNodeSchema: z.ZodType<UiNode, z.ZodTypeDef, UiNodeInput> = z.lazy(() =>
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
      z.object({
        kind: z.literal("source-region"),
        regionKind: sourceRegionKindSchema,
        sourceRegion: sourceRegionSchema,
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
