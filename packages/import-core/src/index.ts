import ts from "typescript";
import {
  createSourceVersion,
  type AdapterDiagnostic,
  type FrameworkDescriptor,
  type SourceSnapshot,
} from "@afrodite/framework-core";
import type {
  Layout,
  SourceBinding,
  SourceRegion,
  SourceRegionKind,
  SourceRegionMode,
  UiDocument,
  UiNode,
} from "@afrodite/ui-ir";

export interface ScreenImportRequest {
  readonly repositoryPath: string;
  readonly exportName?: string;
  readonly documentId?: string;
  readonly documentName?: string;
  readonly maxDepth?: number;
}

export interface ScreenImportStats {
  readonly totalNodes: number;
  readonly editableNodes: number;
  readonly requiresBindingNodes: number;
  readonly readOnlyRegions: number;
}

export interface ScreenImportResult {
  readonly frameworkId: string;
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly exportName?: string;
  readonly document?: UiDocument;
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly stats: ScreenImportStats;
}

export interface ScreenImportAdapter {
  readonly descriptor: FrameworkDescriptor;
  importScreen(request: ScreenImportRequest, source: SourceSnapshot): ScreenImportResult;
}

export interface CreateJsxScreenImportAdapterOptions {
  readonly descriptor: FrameworkDescriptor;
  readonly rejectUseServer?: boolean;
  readonly markerAttribute?: string;
}

interface ExportedComponent {
  readonly exportName: string;
  readonly declaration: ts.FunctionDeclaration | ts.VariableDeclaration;
  readonly functionLike: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
}

interface ImportContext {
  readonly descriptor: FrameworkDescriptor;
  readonly source: SourceSnapshot;
  readonly sourceFile: ts.SourceFile;
  readonly sourceVersion: string;
  readonly exportName: string;
  readonly markerAttribute: string;
  readonly maxDepth: number;
  readonly moduleReadOnlyReason?: string;
  readonly diagnostics: AdapterDiagnostic[];
}

interface MarkerInfo {
  readonly mode: SourceRegionMode;
  readonly marker?: string;
  readonly reason?: string;
}

const DEFAULT_LAYOUT: Layout = {
  display: "block",
  direction: "column",
  sizing: { width: "hug", height: "hug" },
};

export class ScreenImportAdapterRegistry {
  readonly #adapters = new Map<string, ScreenImportAdapter>();

  register(adapter: ScreenImportAdapter): void {
    const id = adapter.descriptor.adapterId;
    if (this.#adapters.has(id)) {
      throw new Error(`Screen import adapter ${id} is already registered`);
    }
    this.#adapters.set(id, adapter);
  }

  get(adapterId: string): ScreenImportAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  list(): readonly ScreenImportAdapter[] {
    return [...this.#adapters.values()].sort((left, right) =>
      left.descriptor.adapterId.localeCompare(right.descriptor.adapterId),
    );
  }
}

export function createJsxScreenImportAdapter(
  options: CreateJsxScreenImportAdapterOptions,
): ScreenImportAdapter {
  return {
    descriptor: options.descriptor,
    importScreen: (request, source) => importJsxScreen(
      options.descriptor,
      request,
      source,
      options.markerAttribute ?? "data-afrodite-id",
      options.rejectUseServer ?? false,
    ),
  };
}

export function importJsxScreen(
  descriptor: FrameworkDescriptor,
  request: ScreenImportRequest,
  source: SourceSnapshot,
  markerAttribute = "data-afrodite-id",
  rejectUseServer = false,
): ScreenImportResult {
  const diagnostics: AdapterDiagnostic[] = [];
  const sourceVersion = source.version ?? createSourceVersion(source.content);
  const emptyStats: ScreenImportStats = {
    totalNodes: 0,
    editableNodes: 0,
    requiresBindingNodes: 0,
    readOnlyRegions: 0,
  };

  if (request.repositoryPath !== source.repositoryPath) {
    diagnostics.push({
      code: "IMPORT_SOURCE_PATH_MISMATCH",
      severity: "error",
      message: `Screen import requested ${request.repositoryPath}, but received ${source.repositoryPath}.`,
      repositoryPath: source.repositoryPath,
    });
  }

  if (!descriptor.sourceExtensions.some((extension) => source.repositoryPath.endsWith(extension))) {
    diagnostics.push({
      code: "IMPORT_SOURCE_EXTENSION_UNSUPPORTED",
      severity: "error",
      message: `${descriptor.displayName} cannot import ${source.repositoryPath} as a JSX screen.`,
      repositoryPath: source.repositoryPath,
    });
  }

  const sourceFile = createSourceFile(source);
  const candidates = findExportedComponents(sourceFile);
  const selected = selectExport(candidates, request.exportName, source.repositoryPath, diagnostics);

  if (!selected || diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      frameworkId: descriptor.frameworkId,
      adapterId: descriptor.adapterId,
      repositoryPath: source.repositoryPath,
      sourceVersion,
      ...(request.exportName ? { exportName: request.exportName } : {}),
      diagnostics,
      stats: emptyStats,
    };
  }

  const moduleReadOnlyReason = rejectUseServer && hasDirective(sourceFile, "use server")
    ? "The module is marked with use server and is imported as read-only."
    : undefined;

  if (moduleReadOnlyReason) {
    diagnostics.push({
      code: "SERVER_MODULE_IMPORTED_READ_ONLY",
      severity: "warning",
      message: moduleReadOnlyReason,
      repositoryPath: source.repositoryPath,
    });
  }

  const context: ImportContext = {
    descriptor,
    source,
    sourceFile,
    sourceVersion,
    exportName: selected.exportName,
    markerAttribute,
    maxDepth: Math.min(Math.max(request.maxDepth ?? 32, 1), 128),
    ...(moduleReadOnlyReason ? { moduleReadOnlyReason } : {}),
    diagnostics,
  };

  const returns = findReturnExpressions(selected.functionLike);
  let root: UiNode | undefined;

  if (returns.length === 1) {
    root = importExpression(returns[0]!, context, 0);
  } else if (returns.length > 1) {
    const body = selected.functionLike.body ?? selected.declaration;
    root = createReadOnlyRegionNode(
      body,
      "conditional",
      "Multiple return paths are preserved as a read-only control-flow region.",
      returns.map((expression) => importExpression(expression, context, 1)),
      context,
      `${selected.exportName} return paths`,
    );
    diagnostics.push({
      code: "MULTIPLE_RETURN_PATHS_READ_ONLY",
      severity: "warning",
      message: `${selected.exportName} contains multiple return paths; the control-flow wrapper is read-only.`,
      repositoryPath: source.repositoryPath,
      nodeId: root.id,
    });
  } else {
    diagnostics.push({
      code: "SCREEN_RETURN_NOT_FOUND",
      severity: "error",
      message: `Export ${selected.exportName} does not contain a renderable return expression.`,
      repositoryPath: source.repositoryPath,
    });
  }

  if (!root) {
    return {
      frameworkId: descriptor.frameworkId,
      adapterId: descriptor.adapterId,
      repositoryPath: source.repositoryPath,
      sourceVersion,
      exportName: selected.exportName,
      diagnostics,
      stats: emptyStats,
    };
  }

  const document: UiDocument = {
    schemaVersion: 1,
    id: request.documentId ?? `import.${sanitizeId(source.repositoryPath)}.${sanitizeId(selected.exportName)}`,
    name: request.documentName ?? `${selected.exportName} imported screen`,
    root,
  };

  return {
    frameworkId: descriptor.frameworkId,
    adapterId: descriptor.adapterId,
    repositoryPath: source.repositoryPath,
    sourceVersion,
    exportName: selected.exportName,
    document,
    diagnostics,
    stats: collectStats(root),
  };
}

function findExportedComponents(sourceFile: ts.SourceFile): ExportedComponent[] {
  const candidates: ExportedComponent[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      candidates.push({
        exportName: hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? "default" : statement.name.text,
        declaration: statement,
        functionLike: statement,
      });
      continue;
    }

    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer)) continue;
      candidates.push({
        exportName: declaration.name.text,
        declaration,
        functionLike: declaration.initializer,
      });
    }
  }

  return candidates.sort((left, right) => left.exportName.localeCompare(right.exportName));
}

function selectExport(
  candidates: readonly ExportedComponent[],
  requested: string | undefined,
  repositoryPath: string,
  diagnostics: AdapterDiagnostic[],
): ExportedComponent | undefined {
  if (requested) {
    const selected = candidates.find((candidate) => candidate.exportName === requested);
    if (!selected) {
      diagnostics.push({
        code: "SCREEN_EXPORT_NOT_FOUND",
        severity: "error",
        message: `No statically exported JSX component named ${requested} was found.`,
        repositoryPath,
      });
    }
    return selected;
  }

  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    diagnostics.push({
      code: "SCREEN_EXPORT_NOT_FOUND",
      severity: "error",
      message: "No statically exported function or arrow component was found.",
      repositoryPath,
    });
    return undefined;
  }

  diagnostics.push({
    code: "SCREEN_EXPORT_AMBIGUOUS",
    severity: "error",
    message: `Choose an export explicitly: ${candidates.map((candidate) => candidate.exportName).join(", ")}.`,
    repositoryPath,
  });
  return undefined;
}

function findReturnExpressions(
  functionLike: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): ts.Expression[] {
  if (ts.isArrowFunction(functionLike) && !ts.isBlock(functionLike.body)) {
    return [unwrapExpression(functionLike.body)];
  }

  const body = functionLike.body;
  if (!body || !ts.isBlock(body)) return [];
  const returns: ts.Expression[] = [];

  const visit = (node: ts.Node): void => {
    if (node !== body && isFunctionLikeNode(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(unwrapExpression(node.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return returns;
}

function importExpression(expression: ts.Expression, context: ImportContext, depth: number): UiNode {
  const unwrapped = unwrapExpression(expression);
  if (depth > context.maxDepth) {
    return createReadOnlyRegionNode(
      unwrapped,
      "unsupported",
      `Import depth exceeded the configured limit of ${context.maxDepth}.`,
      [],
      context,
      "Depth-limited source region",
    );
  }

  if (ts.isJsxElement(unwrapped)) return importJsxElement(unwrapped, context, depth);
  if (ts.isJsxSelfClosingElement(unwrapped)) return importJsxSelfClosing(unwrapped, context, depth);
  if (ts.isJsxFragment(unwrapped)) {
    return createReadOnlyRegionNode(
      unwrapped,
      "fragment",
      "JSX fragments preserve grouping but do not yet own an editable source identity.",
      importJsxChildren(unwrapped.children, context, depth + 1),
      context,
      "Fragment",
    );
  }

  if (ts.isConditionalExpression(unwrapped)) {
    return createReadOnlyRegionNode(
      unwrapped,
      "conditional",
      "Conditional rendering remains source-controlled.",
      [
        importExpression(unwrapped.whenTrue, context, depth + 1),
        importExpression(unwrapped.whenFalse, context, depth + 1),
      ],
      context,
      "Conditional rendering",
    );
  }

  if (ts.isBinaryExpression(unwrapped) && isConditionalBinary(unwrapped.operatorToken.kind)) {
    const children = isRenderableExpression(unwrapped.right)
      ? [importExpression(unwrapped.right, context, depth + 1)]
      : [];
    return createReadOnlyRegionNode(
      unwrapped,
      "conditional",
      "Logical conditional rendering remains source-controlled.",
      children,
      context,
      "Logical rendering",
    );
  }

  if (ts.isCallExpression(unwrapped)) {
    const iterationChild = mapCallbackRender(unwrapped);
    if (iterationChild) {
      return createReadOnlyRegionNode(
        unwrapped,
        "iteration",
        "Collection iteration remains source-controlled; its render template is shown below.",
        [importExpression(iterationChild, context, depth + 1)],
        context,
        "Iteration",
      );
    }
    return createReadOnlyRegionNode(
      unwrapped,
      "call",
      "Function calls and runtime component factories are preserved as read-only source regions.",
      [],
      context,
      "Runtime call",
    );
  }

  if (ts.isArrayLiteralExpression(unwrapped)) {
    const children = unwrapped.elements
      .filter((item): item is ts.Expression => ts.isExpression(item))
      .map((item) => importExpression(item, context, depth + 1));
    return createReadOnlyRegionNode(
      unwrapped,
      "expression",
      "Array-produced children remain source-controlled.",
      children,
      context,
      "Array children",
    );
  }

  if (isStaticTextExpression(unwrapped)) {
    return createReadOnlyRegionNode(
      unwrapped,
      "text",
      "Text primitives are preserved from source and are not editable in this slice.",
      [],
      context,
      staticTextValue(unwrapped),
    );
  }

  return createReadOnlyRegionNode(
    unwrapped,
    "expression",
    "The expression cannot be reduced safely without executing project code.",
    [],
    context,
    "Source expression",
  );
}

function importJsxElement(node: ts.JsxElement, context: ImportContext, depth: number): UiNode {
  const opening = node.openingElement;
  return createJsxNode(
    node,
    opening.tagName.getText(context.sourceFile),
    opening.attributes,
    importJsxChildren(node.children, context, depth + 1),
    context,
  );
}

function importJsxSelfClosing(
  node: ts.JsxSelfClosingElement,
  context: ImportContext,
  _depth: number,
): UiNode {
  return createJsxNode(
    node,
    node.tagName.getText(context.sourceFile),
    node.attributes,
    [],
    context,
  );
}

function createJsxNode(
  fullNode: ts.JsxElement | ts.JsxSelfClosingElement,
  tagName: string,
  attributes: ts.JsxAttributes,
  children: UiNode[],
  context: ImportContext,
): UiNode {
  const marker = inspectMarker(attributes, context);
  const mode = context.moduleReadOnlyReason ? "read-only" : marker.mode;
  const reason = context.moduleReadOnlyReason ?? marker.reason;
  const sourceRegion = createSourceRegion(
    fullNode,
    /^[A-Z]/.test(tagName) ? "component" : "element",
    mode,
    context,
    reason,
  );
  const props = readStaticProps(attributes, context, sourceRegion);
  const layout = inferLayout(attributes, context, sourceRegion);
  const sourceBinding: SourceBinding = {
    frameworkId: context.descriptor.frameworkId,
    adapterId: context.descriptor.adapterId,
    componentId: `${context.source.repositoryPath}#${context.exportName}`,
    repositoryPath: context.source.repositoryPath,
    exportName: context.exportName,
    ...(marker.marker ? { stableMarker: marker.marker } : {}),
  };
  const base = {
    id: createNodeId(context, fullNode, tagName),
    name: tagName,
    layout,
    props,
    sourceBinding,
    sourceRegion,
    children,
  };

  return /^[A-Z]/.test(tagName)
    ? { ...base, kind: "component", component: tagName }
    : { ...base, kind: "element", element: tagName };
}

function importJsxChildren(
  children: readonly ts.JsxChild[],
  context: ImportContext,
  depth: number,
): UiNode[] {
  const result: UiNode[] = [];

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      result.push(createReadOnlyRegionNode(
        child,
        "text",
        "Text primitives are preserved from source and are not editable in this slice.",
        [],
        context,
        text,
      ));
    } else if (ts.isJsxExpression(child)) {
      if (child.expression) result.push(importExpression(child.expression, context, depth));
    } else if (ts.isJsxElement(child)) {
      result.push(importJsxElement(child, context, depth));
    } else if (ts.isJsxSelfClosingElement(child)) {
      result.push(importJsxSelfClosing(child, context, depth));
    } else if (ts.isJsxFragment(child)) {
      result.push(importExpression(child, context, depth));
    }
  }

  return result;
}

function createReadOnlyRegionNode(
  node: ts.Node,
  regionKind: SourceRegionKind,
  reason: string,
  children: UiNode[],
  context: ImportContext,
  name: string,
): UiNode {
  return {
    id: createNodeId(context, node, regionKind),
    kind: "source-region",
    regionKind,
    name: name.slice(0, 120) || "Source region",
    layout: cloneLayout(DEFAULT_LAYOUT),
    props: {},
    sourceRegion: createSourceRegion(node, regionKind, "read-only", context, reason),
    children,
  };
}

function createSourceRegion(
  node: ts.Node,
  regionKind: SourceRegionKind,
  mode: SourceRegionMode,
  context: ImportContext,
  reason?: string,
): SourceRegion {
  const start = node.getStart(context.sourceFile);
  const end = node.getEnd();
  const location = context.sourceFile.getLineAndCharacterOfPosition(start);
  return {
    frameworkId: context.descriptor.frameworkId,
    adapterId: context.descriptor.adapterId,
    repositoryPath: context.source.repositoryPath,
    sourceVersion: context.sourceVersion,
    exportName: context.exportName,
    start,
    end,
    line: location.line + 1,
    column: location.character + 1,
    mode,
    regionKind,
    excerpt: context.source.content.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500),
    ...(reason ? { reason } : {}),
  };
}

function inspectMarker(attributes: ts.JsxAttributes, context: ImportContext): MarkerInfo {
  const matches = attributes.properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property)
      && property.name.getText(context.sourceFile) === context.markerAttribute,
  );

  if (matches.length > 1) {
    return {
      mode: "read-only",
      reason: `The JSX element declares ${context.markerAttribute} more than once.`,
    };
  }
  if (matches.length === 0) return { mode: "requires-binding" };

  const marker = staticAttributeValue(matches[0]!);
  if (typeof marker !== "string" || marker.length === 0) {
    return {
      mode: "read-only",
      reason: `${context.markerAttribute} is dynamic or empty and cannot provide stable identity.`,
    };
  }
  return { mode: "editable", marker };
}

function readStaticProps(
  attributes: ts.JsxAttributes,
  context: ImportContext,
  region: SourceRegion,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      context.diagnostics.push({
        code: "SPREAD_PROPS_IMPORTED_READ_ONLY",
        severity: "info",
        message: "A JSX spread is preserved in source and omitted from serializable imported props.",
        repositoryPath: context.source.repositoryPath,
      });
      continue;
    }

    const name = property.name.getText(context.sourceFile);
    if (name === context.markerAttribute || name === "style" || name === "class" || name === "className") continue;
    const value = staticAttributeValue(property);
    if (value !== undefined && isJsonValue(value)) {
      props[name] = value;
    } else {
      context.diagnostics.push({
        code: "DYNAMIC_PROP_IMPORTED_READ_ONLY",
        severity: "info",
        message: `Prop ${name} at line ${region.line} remains source-controlled.`,
        repositoryPath: context.source.repositoryPath,
      });
    }
  }
  return props;
}

function inferLayout(
  attributes: ts.JsxAttributes,
  context: ImportContext,
  region: SourceRegion,
): Layout {
  const layout = cloneLayout(DEFAULT_LAYOUT);
  const classAttribute = findAttribute(attributes, ["className", "class"], context.sourceFile);
  const classValue = classAttribute ? staticAttributeValue(classAttribute) : undefined;
  if (typeof classValue === "string") inferUtilityLayout(classValue, layout);

  const style = findAttribute(attributes, ["style"], context.sourceFile);
  if (!style?.initializer || !ts.isJsxExpression(style.initializer) || !style.initializer.expression) {
    return layout;
  }
  if (!ts.isObjectLiteralExpression(style.initializer.expression)) {
    context.diagnostics.push({
      code: "DYNAMIC_STYLE_IMPORTED_READ_ONLY",
      severity: "info",
      message: `The style expression at line ${region.line} remains source-controlled.`,
      repositoryPath: context.source.repositoryPath,
    });
    return layout;
  }

  for (const property of style.initializer.expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = staticPropertyName(property.name);
    const value = staticExpressionValue(property.initializer);
    if (!key || value === undefined) continue;
    applyLayoutValue(layout, key, value);
  }
  return layout;
}

function applyLayoutValue(layout: Layout, key: string, value: unknown): void {
  if (key === "display" && (value === "block" || value === "flex" || value === "grid")) {
    layout.display = value;
  } else if ((key === "flexDirection" || key === "flex-direction") && (value === "row" || value === "column")) {
    layout.direction = value;
  } else if (key === "gap") {
    const number = cssLength(value);
    if (number !== undefined) layout.gap = number;
  } else if (key === "padding") {
    const number = cssLength(value);
    if (number !== undefined) layout.padding = number;
  } else if (key === "width") {
    const size = sizingValue(value);
    if (size !== undefined) layout.sizing.width = size;
  } else if (key === "height") {
    const size = sizingValue(value);
    if (size !== undefined) layout.sizing.height = size;
  }
}

function inferUtilityLayout(source: string, layout: Layout): void {
  for (const token of source.split(/\s+/).filter(Boolean)) {
    if (token === "flex") layout.display = "flex";
    else if (token === "grid") layout.display = "grid";
    else if (token === "block") layout.display = "block";
    else if (token === "flex-row") layout.direction = "row";
    else if (token === "flex-col") layout.direction = "column";
    else if (token === "w-full") layout.sizing.width = "fill";
    else if (token === "h-full") layout.sizing.height = "fill";
    else if (token === "w-fit") layout.sizing.width = "hug";
    else if (token === "h-fit") layout.sizing.height = "hug";
    else if (/^gap-(\d+(?:\.\d+)?)$/.test(token)) layout.gap = Number(RegExp.$1) * 4;
    else if (/^p-(\d+(?:\.\d+)?)$/.test(token)) layout.padding = Number(RegExp.$1) * 4;
    else if (/^gap-\[(\d+(?:\.\d+)?)px\]$/.test(token)) layout.gap = Number(RegExp.$1);
    else if (/^p-\[(\d+(?:\.\d+)?)px\]$/.test(token)) layout.padding = Number(RegExp.$1);
  }
}

function findAttribute(
  attributes: ts.JsxAttributes,
  names: readonly string[],
  sourceFile: ts.SourceFile,
): ts.JsxAttribute | undefined {
  return attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && names.includes(property.name.getText(sourceFile)),
  );
}

function staticAttributeValue(attribute: ts.JsxAttribute): unknown {
  const initializer = attribute.initializer;
  if (!initializer) return true;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  return staticExpressionValue(initializer.expression);
}

function staticExpressionValue(expression: ts.Expression): unknown {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(value.operand)) {
    return -Number(value.operand.text);
  }
  if (ts.isArrayLiteralExpression(value)) {
    const items = value.elements.map((item) => ts.isExpression(item) ? staticExpressionValue(item) : undefined);
    return items.every((item) => item !== undefined) ? items : undefined;
  }
  if (ts.isObjectLiteralExpression(value)) {
    const object: Record<string, unknown> = {};
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) return undefined;
      const name = staticPropertyName(property.name);
      const item = staticExpressionValue(property.initializer);
      if (!name || item === undefined) return undefined;
      object[name] = item;
    }
    return object;
  }
  return undefined;
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function mapCallbackRender(call: ts.CallExpression): ts.Expression | undefined {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "map") return undefined;
  const callback = call.arguments[0];
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) return undefined;
  const returns = findReturnExpressions(callback);
  return returns.length === 1 ? returns[0] : undefined;
}

function isRenderableExpression(expression: ts.Expression): boolean {
  const node = unwrapExpression(expression);
  return ts.isJsxElement(node)
    || ts.isJsxSelfClosingElement(node)
    || ts.isJsxFragment(node)
    || ts.isConditionalExpression(node)
    || ts.isCallExpression(node);
}

function isStaticTextExpression(expression: ts.Expression): boolean {
  const node = unwrapExpression(expression);
  return ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isNumericLiteral(node);
}

function staticTextValue(expression: ts.Expression): string {
  const value = staticExpressionValue(expression);
  return value === undefined ? "Text" : String(value);
}

function createNodeId(context: ImportContext, node: ts.Node, suffix: string): string {
  return `import:${sanitizeId(context.descriptor.frameworkId)}:${sanitizeId(context.source.repositoryPath)}:${node.getStart(context.sourceFile)}:${sanitizeId(suffix)}`;
}

function collectStats(root: UiNode): ScreenImportStats {
  let totalNodes = 0;
  let editableNodes = 0;
  let requiresBindingNodes = 0;
  let readOnlyRegions = 0;

  const visit = (node: UiNode): void => {
    totalNodes += 1;
    const mode = node.sourceRegion?.mode;
    if (mode === "editable") editableNodes += 1;
    else if (mode === "requires-binding") requiresBindingNodes += 1;
    else if (mode === "read-only" || node.kind === "source-region") readOnlyRegions += 1;
    node.children.forEach(visit);
  };
  visit(root);
  return { totalNodes, editableNodes, requiresBindingNodes, readOnlyRegions };
}

function createSourceFile(source: SourceSnapshot): ts.SourceFile {
  const scriptKind = source.repositoryPath.endsWith(".jsx")
    ? ts.ScriptKind.JSX
    : source.repositoryPath.endsWith(".js")
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TSX;
  return ts.createSourceFile(
    source.repositoryPath,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function isExported(node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function hasModifier(
  node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> },
  kind: ts.SyntaxKind,
): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  return sourceFile.statements.some((statement) =>
    ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression)
    && statement.expression.text === directive,
  );
}

function isFunctionLikeNode(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isConditionalBinary(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.AmpersandAmpersandToken
    || kind === ts.SyntaxKind.BarBarToken
    || kind === ts.SyntaxKind.QuestionQuestionToken;
}

function cssLength(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function sizingValue(value: unknown): number | "fill" | "hug" | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (value === "100%") return "fill";
  if (value === "fit-content" || value === "max-content" || value === "min-content" || value === "auto") return "hug";
  return cssLength(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, ".").replace(/^\.+|\.+$/g, "") || "node";
}
