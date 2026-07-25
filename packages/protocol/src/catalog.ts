import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const frameworkIdSchema = z.string().regex(/^[a-z][a-z0-9.-]*$/);
export const frameworkCapabilitiesSchema = z.object({
  projectDetection: z.boolean(),
  staticIndexing: z.boolean(),
  runtimePreview: z.boolean(),
  sourcePatching: z.boolean(),
  propEditing: z.boolean(),
});
export const frameworkDescriptorSchema = z.object({
  frameworkId: frameworkIdSchema,
  adapterId: z.string().min(1),
  displayName: z.string().min(1),
  adapterVersion: z.string().min(1),
  sourceExtensions: z.array(z.string().min(1)),
  runtimePackages: z.array(z.string().min(1)),
  capabilities: frameworkCapabilitiesSchema,
});

export const diagnosticSeveritySchema = z.enum(["info", "warning", "error"]);
export const indexDiagnosticCodeSchema = z.enum([
  "TSCONFIG_NOT_FOUND",
  "TSCONFIG_READ_FAILED",
  "TYPESCRIPT_DIAGNOSTIC",
  "UNRESOLVED_PROPS",
  "UNSUPPORTED_PROP_TYPE",
  "ASYNC_COMPONENT_UNSUPPORTED",
  "SERVER_COMPONENT_UNSUPPORTED",
  "CONTEXT_DEPENDENCY_UNSUPPORTED",
]);
export const propValueKindSchema = z.enum([
  "string",
  "number",
  "boolean",
  "literal",
  "enum",
  "array",
  "object",
  "null",
  "unknown",
]);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export const sourceLocationSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export const indexDiagnosticSchema = z.object({
  code: indexDiagnosticCodeSchema,
  severity: diagnosticSeveritySchema,
  message: z.string().min(1),
  sourcePath: z.string().min(1).optional(),
  location: sourceLocationSchema.optional(),
  componentName: z.string().min(1).optional(),
  propName: z.string().min(1).optional(),
  frameworkId: frameworkIdSchema.optional(),
  adapterId: z.string().min(1).optional(),
});

export const indexedPropSchema = z.object({
  name: z.string().min(1),
  typeText: z.string().min(1),
  required: z.boolean(),
  serializable: z.boolean(),
  valueKind: propValueKindSchema,
  description: z.string().min(1).optional(),
  defaultValue: jsonValueSchema.optional(),
});

export const indexedComponentSchema = z.object({
  id: z.string().min(1),
  frameworkId: frameworkIdSchema.optional(),
  adapterId: z.string().min(1).optional(),
  name: z.string().min(1),
  exportName: z.string().min(1),
  sourcePath: z.string().min(1),
  location: sourceLocationSchema,
  declarationKind: z.enum(["function", "variable"]),
  props: z.array(indexedPropSchema),
});

export const componentCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  projectRoot: z.string().min(1),
  tsconfigPath: z.string().min(1),
  frameworks: z.array(frameworkDescriptorSchema).optional(),
  components: z.array(indexedComponentSchema),
  diagnostics: z.array(indexDiagnosticSchema),
});

export type FrameworkCapabilities = z.infer<typeof frameworkCapabilitiesSchema>;
export type FrameworkDescriptor = z.infer<typeof frameworkDescriptorSchema>;
export type DiagnosticSeverity = z.infer<typeof diagnosticSeveritySchema>;
export type IndexDiagnosticCode = z.infer<typeof indexDiagnosticCodeSchema>;
export type PropValueKind = z.infer<typeof propValueKindSchema>;
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type IndexDiagnostic = z.infer<typeof indexDiagnosticSchema>;
export type IndexedProp = z.infer<typeof indexedPropSchema>;
export type IndexedComponent = z.infer<typeof indexedComponentSchema>;
export type ComponentCatalog = z.infer<typeof componentCatalogSchema>;

export interface CatalogProtocolDiagnostic {
  code: "INVALID_CATALOG_JSON" | "INVALID_CATALOG_SCHEMA";
  severity: "error";
  path: string;
  message: string;
}

export type CatalogDecodeResult =
  | { ok: true; catalog: ComponentCatalog; diagnostics: readonly [] }
  | { ok: false; diagnostics: readonly CatalogProtocolDiagnostic[] };

export function decodeComponentCatalog(source: string): CatalogDecodeResult {
  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "INVALID_CATALOG_JSON",
          severity: "error",
          path: "$",
          message: error instanceof Error ? error.message : "Catalog is not valid JSON.",
        },
      ],
    };
  }

  const parsed = componentCatalogSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "INVALID_CATALOG_SCHEMA" as const,
        severity: "error" as const,
        path: issue.path.length > 0 ? `$.${issue.path.join(".")}` : "$",
        message: issue.message,
      })),
    };
  }

  return { ok: true, catalog: parsed.data, diagnostics: [] };
}

export function serializeComponentCatalog(catalog: ComponentCatalog): string {
  return `${JSON.stringify(componentCatalogSchema.parse(catalog), null, 2)}\n`;
}
