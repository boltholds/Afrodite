import type {
  ComponentCatalog,
  DiagnosticSeverity,
  IndexDiagnostic,
  IndexDiagnosticCode,
  IndexedComponent,
  IndexedProp,
  JsonValue,
  PropValueKind,
  SourceLocation,
} from "@afrodite/protocol";

export type {
  ComponentCatalog,
  DiagnosticSeverity,
  IndexDiagnostic,
  IndexDiagnosticCode,
  IndexedComponent,
  IndexedProp,
  JsonValue,
  PropValueKind,
  SourceLocation,
} from "@afrodite/protocol";

export interface IndexSolidProjectOptions {
  projectRoot: string;
  tsconfigPath?: string;
}

export function serializeComponentCatalog(catalog: ComponentCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
