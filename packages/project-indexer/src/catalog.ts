export type DiagnosticSeverity = "info" | "warning" | "error";

export type IndexDiagnosticCode =
  | "TSCONFIG_NOT_FOUND"
  | "TSCONFIG_READ_FAILED"
  | "TYPESCRIPT_DIAGNOSTIC"
  | "UNRESOLVED_PROPS"
  | "UNSUPPORTED_PROP_TYPE";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface IndexDiagnostic {
  code: IndexDiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  sourcePath?: string;
  location?: SourceLocation;
  componentName?: string;
  propName?: string;
}

export type PropValueKind =
  | "string"
  | "number"
  | "boolean"
  | "literal"
  | "enum"
  | "array"
  | "object"
  | "null"
  | "unknown";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface IndexedProp {
  name: string;
  typeText: string;
  required: boolean;
  serializable: boolean;
  valueKind: PropValueKind;
  description?: string;
  defaultValue?: JsonValue;
}

export interface IndexedComponent {
  id: string;
  name: string;
  exportName: string;
  sourcePath: string;
  location: SourceLocation;
  declarationKind: "function" | "variable";
  props: IndexedProp[];
}

export interface ComponentCatalog {
  schemaVersion: 1;
  projectRoot: string;
  tsconfigPath: string;
  components: IndexedComponent[];
  diagnostics: IndexDiagnostic[];
}

export interface IndexSolidProjectOptions {
  projectRoot: string;
  tsconfigPath?: string;
}

export function serializeComponentCatalog(catalog: ComponentCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
