import ts from "typescript";
import {
  createSourcePatchPlan,
  type AdapterDiagnostic,
  type FrameworkOperation,
  type Layout,
  type SourcePatchPlan,
  type SourceSnapshot,
  type TextEdit,
} from "@afrodite/framework-core";
import { solidFrameworkDescriptor } from "./index.js";

const MANAGED_STYLE_KEYS = new Set([
  "display",
  "flex-direction",
  "gap",
  "padding",
  "width",
  "height",
]);

type TargetOpeningElement = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

export function planSolidLayoutPatch(
  operation: FrameworkOperation,
  source: SourceSnapshot,
): SourcePatchPlan {
  const diagnostics: AdapterDiagnostic[] = [];
  const edits: TextEdit[] = [];

  if (operation.kind !== "update-layout") {
    diagnostics.push({
      code: "OPERATION_NOT_SUPPORTED",
      severity: "error",
      message: `SolidJS adapter cannot plan operation ${(operation as FrameworkOperation).kind}.`,
      repositoryPath: source.repositoryPath,
      nodeId: operation.nodeId,
    });
  }

  if (operation.binding.frameworkId && operation.binding.frameworkId !== "solid") {
    diagnostics.push({
      code: "FRAMEWORK_BINDING_MISMATCH",
      severity: "error",
      message: `Binding belongs to ${operation.binding.frameworkId}, not SolidJS.`,
      repositoryPath: source.repositoryPath,
      nodeId: operation.nodeId,
    });
  }

  if (
    operation.binding.adapterId
    && operation.binding.adapterId !== solidFrameworkDescriptor.adapterId
  ) {
    diagnostics.push({
      code: "ADAPTER_BINDING_MISMATCH",
      severity: "error",
      message: `Binding belongs to ${operation.binding.adapterId}, not ${solidFrameworkDescriptor.adapterId}.`,
      repositoryPath: source.repositoryPath,
      nodeId: operation.nodeId,
    });
  }

  if (operation.binding.repositoryPath !== source.repositoryPath) {
    diagnostics.push({
      code: "SOURCE_BINDING_PATH_MISMATCH",
      severity: "error",
      message: `Binding targets ${operation.binding.repositoryPath}, but the snapshot is ${source.repositoryPath}.`,
      repositoryPath: source.repositoryPath,
      nodeId: operation.nodeId,
    });
  }

  const marker = operation.binding.stableMarker;
  if (!marker) {
    diagnostics.push({
      code: "STABLE_MARKER_REQUIRED",
      severity: "error",
      message: "SolidJS source patching requires a stable data-afrodite-id marker.",
      repositoryPath: source.repositoryPath,
      nodeId: operation.nodeId,
    });
  }

  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && marker) {
    const sourceFile = ts.createSourceFile(
      source.repositoryPath,
      source.content,
      ts.ScriptTarget.Latest,
      true,
      source.repositoryPath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
    );
    const targets = findMarkedElements(sourceFile, marker);

    if (targets.length === 0) {
      diagnostics.push({
        code: "STABLE_MARKER_NOT_FOUND",
        severity: "error",
        message: `No JSX element has data-afrodite-id=${JSON.stringify(marker)}.`,
        repositoryPath: source.repositoryPath,
        nodeId: operation.nodeId,
      });
    } else if (targets.length > 1) {
      diagnostics.push({
        code: "AMBIGUOUS_STABLE_MARKER",
        severity: "error",
        message: `Multiple JSX elements use data-afrodite-id=${JSON.stringify(marker)}.`,
        repositoryPath: source.repositoryPath,
        nodeId: operation.nodeId,
      });
    } else {
      const edit = createStyleEdit(targets[0]!, sourceFile, operation.after, diagnostics, operation.nodeId);
      if (edit) edits.push(edit);
    }
  }

  return createSourcePatchPlan({
    frameworkId: solidFrameworkDescriptor.frameworkId,
    adapterId: solidFrameworkDescriptor.adapterId,
    operation: operation.kind,
    source,
    edits,
    diagnostics,
    verification: [
      {
        kind: "format",
        command: `pnpm exec prettier --check ${quoteShellArgument(source.repositoryPath)}`,
        required: false,
      },
      {
        kind: "typecheck",
        command: "pnpm exec tsc --noEmit --pretty false",
        required: true,
      },
    ],
  });
}

function findMarkedElements(sourceFile: ts.SourceFile, marker: string): TargetOpeningElement[] {
  const matches: TargetOpeningElement[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && hasMarker(node, marker)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return matches;
}

function hasMarker(node: TargetOpeningElement, marker: string): boolean {
  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === "data-afrodite-id",
  );
  if (!attribute?.initializer) return false;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text === marker;
  if (
    ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression
    && ts.isStringLiteral(attribute.initializer.expression)
  ) {
    return attribute.initializer.expression.text === marker;
  }
  return false;
}

function createStyleEdit(
  target: TargetOpeningElement,
  sourceFile: ts.SourceFile,
  layout: Layout,
  diagnostics: AdapterDiagnostic[],
  nodeId: string,
): TextEdit | undefined {
  const styleAttribute = target.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "style",
  );
  const managedEntries = createManagedStyleEntries(layout);

  if (!styleAttribute) {
    const insertionPoint = ts.isJsxSelfClosingElement(target)
      ? target.getEnd() - 2
      : target.getEnd() - 1;
    return {
      start: insertionPoint,
      end: insertionPoint,
      replacement: ` style={${formatStyleObject(managedEntries)}}`,
    };
  }

  const initializer = styleAttribute.initializer;
  if (
    !initializer
    || !ts.isJsxExpression(initializer)
    || !initializer.expression
    || !ts.isObjectLiteralExpression(initializer.expression)
  ) {
    diagnostics.push({
      code: "DYNAMIC_STYLE_NOT_PATCHABLE",
      severity: "error",
      message: "The style attribute is not a static object literal, so Afrodite will not rewrite it.",
      repositoryPath: sourceFile.fileName,
      nodeId,
    });
    return undefined;
  }

  const objectLiteral = initializer.expression;
  const preserved: string[] = [];
  for (const property of objectLiteral.properties) {
    const key = propertyName(property);
    if (key && MANAGED_STYLE_KEYS.has(key)) continue;
    preserved.push(property.getText(sourceFile));
  }

  const replacement = formatStyleObject([...preserved, ...managedEntries]);
  if (replacement === objectLiteral.getText(sourceFile)) {
    diagnostics.push({
      code: "NO_LAYOUT_CHANGE",
      severity: "warning",
      message: "The requested layout already matches the source style object.",
      repositoryPath: sourceFile.fileName,
      nodeId,
    });
    return undefined;
  }

  return {
    start: objectLiteral.getStart(sourceFile),
    end: objectLiteral.getEnd(),
    replacement,
  };
}

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
    return undefined;
  }
  const name = property.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function createManagedStyleEntries(layout: Layout): string[] {
  const entries = [
    styleEntry("display", layout.display),
    layout.display === "flex" ? styleEntry("flex-direction", layout.direction) : undefined,
    layout.gap === undefined ? undefined : styleEntry("gap", `${layout.gap}px`),
    layout.padding === undefined ? undefined : styleEntry("padding", `${layout.padding}px`),
    styleEntry("width", sizingToCss(layout.sizing.width)),
    styleEntry("height", sizingToCss(layout.sizing.height)),
  ];
  return entries.filter((entry): entry is string => entry !== undefined);
}

function sizingToCss(value: Layout["sizing"]["width"]): string {
  if (typeof value === "number") return `${value}px`;
  return value === "fill" ? "100%" : "fit-content";
}

function styleEntry(name: string, value: string): string {
  const key = /^[$A-Z_a-z][$\w]*$/.test(name) ? name : JSON.stringify(name);
  return `${key}: ${JSON.stringify(value)}`;
}

function formatStyleObject(entries: readonly string[]): string {
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

function quoteShellArgument(value: string): string {
  return JSON.stringify(value);
}
