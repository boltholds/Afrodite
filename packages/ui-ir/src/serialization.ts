import { uiDocumentSchema, type UiDocument, type UiNode } from "./schema.js";

export type UiDiagnosticCode =
  | "invalid-json"
  | "schema-invalid"
  | "duplicate-node-id";

export interface UiDiagnostic {
  severity: "error";
  code: UiDiagnosticCode;
  message: string;
  path: string;
}

export type DecodeUiDocumentResult =
  | {
      ok: true;
      document: UiDocument;
      diagnostics: readonly [];
    }
  | {
      ok: false;
      diagnostics: readonly UiDiagnostic[];
    };

export function validateUiDocument(document: UiDocument): readonly UiDiagnostic[] {
  const seen = new Set<string>();
  const diagnostics: UiDiagnostic[] = [];

  visitNode(document.root, "root", (node, path) => {
    if (seen.has(node.id)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-node-id",
        message: `Node ID ${node.id} is used more than once`,
        path,
      });
      return;
    }

    seen.add(node.id);
  });

  return diagnostics;
}

export function decodeUiDocument(source: string): DecodeUiDocumentResult {
  let input: unknown;

  try {
    input = JSON.parse(source);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "invalid-json",
          message: error instanceof Error ? error.message : "Document is not valid JSON",
          path: "$",
        },
      ],
    };
  }

  const parsed = uiDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        code: "schema-invalid" as const,
        message: issue.message,
        path: issue.path.length > 0 ? issue.path.join(".") : "$",
      })),
    };
  }

  const diagnostics = validateUiDocument(parsed.data);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return { ok: true, document: parsed.data, diagnostics: [] };
}

export function serializeUiDocument(document: UiDocument, space = 2): string {
  const parsed = uiDocumentSchema.parse(document);
  const diagnostics = validateUiDocument(parsed);

  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }

  return JSON.stringify(parsed, null, space);
}

function visitNode(
  node: UiNode,
  path: string,
  visitor: (node: UiNode, path: string) => void,
): void {
  visitor(node, path);
  node.children.forEach((child, index) => {
    visitNode(child, `${path}.children.${index}`, visitor);
  });
}
