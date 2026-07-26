import ts from "typescript";
import {
  createSourcePatchPlan,
  type AdapterDiagnostic,
  type SourcePatchPlan,
  type SourceSnapshot,
  type TextEdit,
  type VerificationStep,
} from "@afrodite/framework-core";
import type {
  Layout,
  SourceBinding,
  StyleOwnership,
  StyleProperty,
} from "@afrodite/ui-ir";

export interface StylePatchOperation {
  readonly kind: "update-style";
  readonly nodeId: string;
  readonly binding: SourceBinding;
  readonly ownership: StyleOwnership;
  readonly before: Layout;
  readonly after: Layout;
}

export interface StyleStrategy {
  readonly id: string;
  readonly strategy: StyleOwnership["strategy"];
  supports(operation: StylePatchOperation): boolean;
  plan(operation: StylePatchOperation, source: SourceSnapshot): SourcePatchPlan;
}

export interface JsxStyleStrategyOptions {
  readonly frameworkId: string;
  readonly frameworkAdapterId: string;
  readonly keyMode: "react" | "css";
  readonly rejectUseServer?: boolean;
}

export class StyleStrategyRegistry {
  readonly #strategies = new Map<string, StyleStrategy>();

  register(strategy: StyleStrategy): void {
    if (this.#strategies.has(strategy.id)) {
      throw new Error(`Style strategy ${strategy.id} is already registered`);
    }
    this.#strategies.set(strategy.id, strategy);
  }

  get(id: string): StyleStrategy | undefined {
    return this.#strategies.get(id);
  }

  list(): readonly StyleStrategy[] {
    return [...this.#strategies.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  resolve(operation: StylePatchOperation): StyleStrategy | undefined {
    return this.list().find((strategy) => strategy.supports(operation));
  }
}

export function resolveStyleSourcePath(operation: StylePatchOperation): string {
  switch (operation.ownership.strategy) {
    case "inline":
    case "utility":
      return operation.binding.repositoryPath;
    case "css-module":
      return operation.ownership.stylesheetPath;
    case "design-token":
      return operation.ownership.tokenFilePath;
  }
}

export function createJsxInlineStyleStrategy(options: JsxStyleStrategyOptions): StyleStrategy {
  const id = `afrodite.style.inline.${options.frameworkId}`;
  return {
    id,
    strategy: "inline",
    supports: (operation) => operation.ownership.strategy === "inline"
      && operation.binding.frameworkId === options.frameworkId,
    plan: (operation, source) => planJsxInlineStyle(operation, source, options, id),
  };
}

export function createTailwindUtilityStrategy(options: Omit<JsxStyleStrategyOptions, "keyMode">): StyleStrategy {
  const id = `afrodite.style.utility.tailwind.${options.frameworkId}`;
  return {
    id,
    strategy: "utility",
    supports: (operation) => operation.ownership.strategy === "utility"
      && operation.binding.frameworkId === options.frameworkId,
    plan: (operation, source) => planTailwindUtilityStyle(operation, source, options, id),
  };
}

export function createCssModuleStyleStrategy(): StyleStrategy {
  const id = "afrodite.style.css-module";
  return {
    id,
    strategy: "css-module",
    supports: (operation) => operation.ownership.strategy === "css-module",
    plan: (operation, source) => planCssModuleStyle(operation, source, id),
  };
}

export function createDesignTokenStyleStrategy(): StyleStrategy {
  const id = "afrodite.style.design-token";
  return {
    id,
    strategy: "design-token",
    supports: (operation) => operation.ownership.strategy === "design-token",
    plan: (operation, source) => planDesignTokenStyle(operation, source, id),
  };
}

export function createDefaultStyleStrategyRegistry(): StyleStrategyRegistry {
  const registry = new StyleStrategyRegistry();
  registry.register(createJsxInlineStyleStrategy({
    frameworkId: "react",
    frameworkAdapterId: "afrodite.adapter.react",
    keyMode: "react",
    rejectUseServer: true,
  }));
  registry.register(createJsxInlineStyleStrategy({
    frameworkId: "solid",
    frameworkAdapterId: "afrodite.adapter.solid",
    keyMode: "css",
  }));
  registry.register(createTailwindUtilityStrategy({
    frameworkId: "react",
    frameworkAdapterId: "afrodite.adapter.react",
    rejectUseServer: true,
  }));
  registry.register(createTailwindUtilityStrategy({
    frameworkId: "solid",
    frameworkAdapterId: "afrodite.adapter.solid",
  }));
  registry.register(createCssModuleStyleStrategy());
  registry.register(createDesignTokenStyleStrategy());
  return registry;
}

export function layoutStyleValue(property: StyleProperty, layout: Layout): string {
  switch (property) {
    case "display":
      return layout.display;
    case "direction":
      return layout.direction;
    case "gap":
      return `${layout.gap ?? 0}px`;
    case "padding":
      return `${layout.padding ?? 0}px`;
    case "width":
      return sizingValue(layout.sizing.width);
    case "height":
      return sizingValue(layout.sizing.height);
  }
}

function planJsxInlineStyle(
  operation: StylePatchOperation,
  source: SourceSnapshot,
  options: JsxStyleStrategyOptions,
  strategyId: string,
): SourcePatchPlan {
  const diagnostics = validateJsxOperation(operation, source, options);
  const edits: TextEdit[] = [];
  const target = diagnostics.some(isError)
    ? undefined
    : findUniqueMarkedElement(source, operation.binding.stableMarker!, options.rejectUseServer ?? false, diagnostics, operation.nodeId);

  if (target) {
    const edit = createInlineStyleEdit(target, source, operation, options.keyMode, diagnostics);
    if (edit) edits.push(edit);
  }

  return createSourcePatchPlan({
    frameworkId: options.frameworkId,
    adapterId: strategyId,
    operation: "update-style",
    source,
    edits,
    diagnostics,
    verification: jsxVerification(source.repositoryPath),
  });
}

function planTailwindUtilityStyle(
  operation: StylePatchOperation,
  source: SourceSnapshot,
  options: Omit<JsxStyleStrategyOptions, "keyMode">,
  strategyId: string,
): SourcePatchPlan {
  const diagnostics = validateJsxOperation(operation, source, options);
  const edits: TextEdit[] = [];
  const target = diagnostics.some(isError)
    ? undefined
    : findUniqueMarkedElement(source, operation.binding.stableMarker!, options.rejectUseServer ?? false, diagnostics, operation.nodeId);

  if (target && operation.ownership.strategy === "utility") {
    const edit = createUtilityClassEdit(target, source, operation, options.frameworkId, diagnostics);
    if (edit) edits.push(edit);
  }

  return createSourcePatchPlan({
    frameworkId: options.frameworkId,
    adapterId: strategyId,
    operation: "update-style",
    source,
    edits,
    diagnostics,
    verification: jsxVerification(source.repositoryPath),
  });
}

function planCssModuleStyle(
  operation: StylePatchOperation,
  source: SourceSnapshot,
  strategyId: string,
): SourcePatchPlan {
  const diagnostics: AdapterDiagnostic[] = [];
  const edits: TextEdit[] = [];
  if (operation.ownership.strategy !== "css-module") {
    diagnostics.push(operationMismatch(operation, source, "css-module"));
  } else {
    validateTargetPath(operation.ownership.stylesheetPath, source, operation.nodeId, diagnostics);
    const matches = findCssClassBodies(source.content, operation.ownership.className);
    if (matches.length === 0) {
      diagnostics.push(diagnostic("CSS_MODULE_CLASS_NOT_FOUND", "error", `Class .${operation.ownership.className} was not found.`, source, operation.nodeId));
    } else if (matches.length > 1) {
      diagnostics.push(diagnostic("CSS_MODULE_CLASS_AMBIGUOUS", "error", `Class .${operation.ownership.className} is declared more than once.`, source, operation.nodeId));
    } else {
      const match = matches[0]!;
      const replacement = rewriteCssBody(match.body, operation.ownership.managedProperties, operation.after, diagnostics, source, operation.nodeId);
      if (replacement !== undefined && replacement !== match.body) {
        edits.push({ start: match.bodyStart, end: match.bodyEnd, replacement });
      }
    }
  }

  return createSourcePatchPlan({
    frameworkId: operation.binding.frameworkId ?? "unknown",
    adapterId: strategyId,
    operation: "update-style",
    source,
    edits,
    diagnostics,
    verification: stylesheetVerification(source.repositoryPath),
  });
}

function planDesignTokenStyle(
  operation: StylePatchOperation,
  source: SourceSnapshot,
  strategyId: string,
): SourcePatchPlan {
  const diagnostics: AdapterDiagnostic[] = [];
  const edits: TextEdit[] = [];
  if (operation.ownership.strategy !== "design-token") {
    diagnostics.push(operationMismatch(operation, source, "design-token"));
  } else {
    validateTargetPath(operation.ownership.tokenFilePath, source, operation.nodeId, diagnostics);
    const desired = new Map<string, string>();
    for (const property of operation.ownership.managedProperties) {
      const token = operation.ownership.tokens[property];
      if (!token) continue;
      if (!token.startsWith("--")) {
        diagnostics.push(diagnostic("DESIGN_TOKEN_NAME_INVALID", "error", `${token} is not a CSS custom property.`, source, operation.nodeId));
        continue;
      }
      const value = layoutStyleValue(property, operation.after);
      const previous = desired.get(token);
      if (previous !== undefined && previous !== value) {
        diagnostics.push(diagnostic("DESIGN_TOKEN_OWNERSHIP_CONFLICT", "error", `${token} is mapped to incompatible layout values.`, source, operation.nodeId));
      } else {
        desired.set(token, value);
      }
    }

    if (!diagnostics.some(isError)) {
      for (const [token, value] of desired) {
        const matches = findCssCustomPropertyValues(source.content, token);
        if (matches.length === 0) {
          diagnostics.push(diagnostic("DESIGN_TOKEN_NOT_FOUND", "error", `Token ${token} was not found. Afrodite will not guess a declaration scope.`, source, operation.nodeId));
        } else if (matches.length > 1) {
          diagnostics.push(diagnostic("DESIGN_TOKEN_AMBIGUOUS", "error", `Token ${token} is declared more than once.`, source, operation.nodeId));
        } else if (matches[0]!.value !== value) {
          edits.push({ start: matches[0]!.valueStart, end: matches[0]!.valueEnd, replacement: value });
        }
      }
    }
  }

  return createSourcePatchPlan({
    frameworkId: operation.binding.frameworkId ?? "unknown",
    adapterId: strategyId,
    operation: "update-style",
    source,
    edits,
    diagnostics,
    verification: stylesheetVerification(source.repositoryPath),
  });
}

function validateJsxOperation(
  operation: StylePatchOperation,
  source: SourceSnapshot,
  options: Pick<JsxStyleStrategyOptions, "frameworkId" | "frameworkAdapterId">,
): AdapterDiagnostic[] {
  const diagnostics: AdapterDiagnostic[] = [];
  if (operation.binding.frameworkId !== options.frameworkId) {
    diagnostics.push(diagnostic("STYLE_FRAMEWORK_MISMATCH", "error", `Style strategy expects ${options.frameworkId}.`, source, operation.nodeId));
  }
  if (operation.binding.adapterId && operation.binding.adapterId !== options.frameworkAdapterId) {
    diagnostics.push(diagnostic("STYLE_ADAPTER_MISMATCH", "error", `Binding belongs to ${operation.binding.adapterId}.`, source, operation.nodeId));
  }
  validateTargetPath(operation.binding.repositoryPath, source, operation.nodeId, diagnostics);
  if (!operation.binding.stableMarker) {
    diagnostics.push(diagnostic("STYLE_STABLE_MARKER_REQUIRED", "error", "JSX style ownership requires a stable marker.", source, operation.nodeId));
  }
  return diagnostics;
}

function validateTargetPath(
  expected: string,
  source: SourceSnapshot,
  nodeId: string,
  diagnostics: AdapterDiagnostic[],
): void {
  if (expected !== source.repositoryPath) {
    diagnostics.push(diagnostic("STYLE_SOURCE_PATH_MISMATCH", "error", `Ownership targets ${expected}, but the snapshot is ${source.repositoryPath}.`, source, nodeId));
  }
}

type JsxTarget = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function findUniqueMarkedElement(
  source: SourceSnapshot,
  marker: string,
  rejectUseServer: boolean,
  diagnostics: AdapterDiagnostic[],
  nodeId: string,
): { sourceFile: ts.SourceFile; node: JsxTarget } | undefined {
  const sourceFile = ts.createSourceFile(
    source.repositoryPath,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    source.repositoryPath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  if (rejectUseServer && hasDirective(sourceFile, "use server")) {
    diagnostics.push(diagnostic("SERVER_MODULE_NOT_STYLE_PATCHABLE", "error", "Modules marked with use server cannot receive client style patches.", source, nodeId));
    return undefined;
  }

  const matches: JsxTarget[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && staticMarker(node, sourceFile) === marker) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (matches.length === 0) {
    diagnostics.push(diagnostic("STYLE_MARKER_NOT_FOUND", "error", `No JSX element owns ${marker}.`, source, nodeId));
    return undefined;
  }
  if (matches.length > 1) {
    diagnostics.push(diagnostic("STYLE_MARKER_AMBIGUOUS", "error", `Marker ${marker} is used by multiple JSX elements.`, source, nodeId));
    return undefined;
  }
  return { sourceFile, node: matches[0]! };
}

function createInlineStyleEdit(
  target: { sourceFile: ts.SourceFile; node: JsxTarget },
  source: SourceSnapshot,
  operation: StylePatchOperation,
  keyMode: "react" | "css",
  diagnostics: AdapterDiagnostic[],
): TextEdit | undefined {
  if (operation.ownership.strategy !== "inline") return undefined;
  const attributes = target.node.attributes.properties.filter(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(target.sourceFile) === "style",
  );
  if (attributes.length > 1) {
    diagnostics.push(diagnostic("STYLE_ATTRIBUTE_AMBIGUOUS", "error", "The marked element declares style more than once.", source, operation.nodeId));
    return undefined;
  }

  const managedKeys = new Map(operation.ownership.managedProperties.map((property) => [inlineKey(property, keyMode), property]));
  const desired = operation.ownership.managedProperties.map((property) => [inlineKey(property, keyMode), layoutStyleValue(property, operation.after)] as const);
  const attribute = attributes[0];
  if (!attribute) {
    const insertion = ts.isJsxSelfClosingElement(target.node) ? target.node.getEnd() - 2 : target.node.getEnd() - 1;
    return { start: insertion, end: insertion, replacement: ` style={${formatStyleObject(desired, keyMode)}}` };
  }

  const initializer = attribute.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression || !ts.isObjectLiteralExpression(initializer.expression)) {
    diagnostics.push(diagnostic("DYNAMIC_STYLE_NOT_PATCHABLE", "error", "The style attribute is not a static object literal.", source, operation.nodeId));
    return undefined;
  }

  const preserved: string[] = [];
  const seen = new Set<string>();
  for (const property of initializer.expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      diagnostics.push(diagnostic("STYLE_SPREAD_NOT_PATCHABLE", "error", "A style spread may own managed properties.", source, operation.nodeId));
      return undefined;
    }
    if (!ts.isPropertyAssignment(property)) {
      diagnostics.push(diagnostic("STYLE_PROPERTY_NOT_PATCHABLE", "error", "Only static style property assignments are supported.", source, operation.nodeId));
      return undefined;
    }
    const key = staticPropertyName(property.name, target.sourceFile);
    if (!key) {
      diagnostics.push(diagnostic("COMPUTED_STYLE_PROPERTY_NOT_PATCHABLE", "error", "Computed style keys are not supported.", source, operation.nodeId));
      return undefined;
    }
    if (managedKeys.has(key)) {
      if (seen.has(key)) {
        diagnostics.push(diagnostic("OWNED_STYLE_PROPERTY_AMBIGUOUS", "error", `Owned property ${key} appears more than once.`, source, operation.nodeId));
        return undefined;
      }
      seen.add(key);
      if (!isStaticStyleValue(property.initializer)) {
        diagnostics.push(diagnostic("DYNAMIC_OWNED_STYLE_NOT_PATCHABLE", "error", `Owned property ${key} is dynamic and requires manual takeover.`, source, operation.nodeId));
        return undefined;
      }
      continue;
    }
    preserved.push(property.getText(target.sourceFile));
  }

  const entries = [...preserved, ...desired.map(([key, value]) => `${formatObjectKey(key, keyMode)}: ${JSON.stringify(value)}`)];
  const replacement = `{ ${entries.join(", ")} }`;
  return {
    start: initializer.expression.getStart(target.sourceFile),
    end: initializer.expression.getEnd(),
    replacement,
  };
}

function createUtilityClassEdit(
  target: { sourceFile: ts.SourceFile; node: JsxTarget },
  source: SourceSnapshot,
  operation: StylePatchOperation,
  frameworkId: string,
  diagnostics: AdapterDiagnostic[],
): TextEdit | undefined {
  if (operation.ownership.strategy !== "utility") return undefined;
  const all = target.node.attributes.properties.filter(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property)
      && ["class", "className"].includes(property.name.getText(target.sourceFile)),
  );
  if (all.length > 1) {
    diagnostics.push(diagnostic("UTILITY_CLASS_ATTRIBUTE_AMBIGUOUS", "error", "The marked element has more than one class attribute.", source, operation.nodeId));
    return undefined;
  }

  const attributeName = operation.ownership.attribute ?? (frameworkId === "react" ? "className" : "class");
  const desired = operation.ownership.managedProperties.map((property) => utilityClass(property, operation.after));
  const attribute = all[0];
  if (!attribute) {
    const insertion = ts.isJsxSelfClosingElement(target.node) ? target.node.getEnd() - 2 : target.node.getEnd() - 1;
    return { start: insertion, end: insertion, replacement: ` ${attributeName}=${JSON.stringify(desired.join(" "))}` };
  }

  const current = staticJsxString(attribute);
  if (current === undefined) {
    diagnostics.push(diagnostic("DYNAMIC_UTILITY_CLASS_NOT_PATCHABLE", "error", "Utility classes are dynamic, so ownership cannot be proven.", source, operation.nodeId));
    return undefined;
  }
  const managed = new Set(operation.ownership.managedProperties);
  const preserved = current.split(/\s+/).filter(Boolean).filter((className) =>
    ![...managed].some((property) => utilityClassOwns(property, className))
  );
  const next = [...preserved, ...desired].join(" ");
  const initializer = attribute.initializer;
  if (!initializer) {
    return { start: attribute.getEnd(), end: attribute.getEnd(), replacement: `=${JSON.stringify(next)}` };
  }
  return { start: initializer.getStart(target.sourceFile), end: initializer.getEnd(), replacement: JSON.stringify(next) };
}

function rewriteCssBody(
  body: string,
  properties: readonly StyleProperty[],
  layout: Layout,
  diagnostics: AdapterDiagnostic[],
  source: SourceSnapshot,
  nodeId: string,
): string | undefined {
  if (/[{}]/.test(body)) {
    diagnostics.push(diagnostic("COMPLEX_CSS_RULE_NOT_PATCHABLE", "error", "Nested CSS rules are outside the current ownership boundary.", source, nodeId));
    return undefined;
  }
  const owned = new Map(properties.map((property) => [cssProperty(property), layoutStyleValue(property, layout)]));
  const preserved: string[] = [];
  const seen = new Set<string>();
  for (const raw of body.split(";")) {
    const declaration = raw.trim();
    if (!declaration) continue;
    const separator = declaration.indexOf(":");
    if (separator < 1) {
      diagnostics.push(diagnostic("CSS_DECLARATION_NOT_PATCHABLE", "error", `Cannot parse CSS declaration ${declaration}.`, source, nodeId));
      return undefined;
    }
    const name = declaration.slice(0, separator).trim();
    if (owned.has(name)) {
      if (seen.has(name)) {
        diagnostics.push(diagnostic("OWNED_CSS_PROPERTY_AMBIGUOUS", "error", `Owned property ${name} appears more than once.`, source, nodeId));
        return undefined;
      }
      seen.add(name);
      continue;
    }
    preserved.push(declaration);
  }
  const declarations = [...preserved, ...[...owned].map(([name, value]) => `${name}: ${value}`)];
  const indentation = body.match(/\n([ \t]+)\S/)?.[1] ?? "  ";
  return `\n${declarations.map((declaration) => `${indentation}${declaration};`).join("\n")}\n`;
}

function findCssClassBodies(source: string, className: string): Array<{ bodyStart: number; bodyEnd: number; body: string }> {
  const results: Array<{ bodyStart: number; bodyEnd: number; body: string }> = [];
  const pattern = new RegExp(`\\.${escapeRegExp(className)}\\s*\\{`, "g");
  for (const match of source.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    const close = findMatchingBrace(source, open);
    if (close >= 0) results.push({ bodyStart: open + 1, bodyEnd: close, body: source.slice(open + 1, close) });
  }
  return results;
}

function findCssCustomPropertyValues(source: string, token: string): Array<{ valueStart: number; valueEnd: number; value: string }> {
  const results: Array<{ valueStart: number; valueEnd: number; value: string }> = [];
  const pattern = new RegExp(`(^|[;{\\n]\\s*)${escapeRegExp(token)}\\s*:\\s*([^;]+);`, "gm");
  for (const match of source.matchAll(pattern)) {
    const full = match[0];
    const value = match[2]!.trim();
    const relative = full.lastIndexOf(match[2]!);
    const start = (match.index ?? 0) + relative + match[2]!.indexOf(value);
    results.push({ valueStart: start, valueEnd: start + value.length, value });
  }
  return results;
}

function inlineKey(property: StyleProperty, mode: "react" | "css"): string {
  if (property === "direction") return mode === "react" ? "flexDirection" : "flex-direction";
  return property;
}

function cssProperty(property: StyleProperty): string {
  return property === "direction" ? "flex-direction" : property;
}

function utilityClass(property: StyleProperty, layout: Layout): string {
  switch (property) {
    case "display": return layout.display;
    case "direction": return layout.direction === "row" ? "flex-row" : "flex-col";
    case "gap": return `gap-[${layout.gap ?? 0}px]`;
    case "padding": return `p-[${layout.padding ?? 0}px]`;
    case "width": return utilitySizing("w", layout.sizing.width);
    case "height": return utilitySizing("h", layout.sizing.height);
  }
}

function utilityClassOwns(property: StyleProperty, className: string): boolean {
  switch (property) {
    case "display": return ["block", "flex", "grid"].includes(className);
    case "direction": return ["flex-row", "flex-col"].includes(className);
    case "gap": return /^gap-(?:\[.*\]|\d+)$/.test(className);
    case "padding": return /^p-(?:\[.*\]|\d+)$/.test(className);
    case "width": return /^(?:w-full|w-fit|w-\[.*\])$/.test(className);
    case "height": return /^(?:h-full|h-fit|h-\[.*\])$/.test(className);
  }
}

function utilitySizing(prefix: "w" | "h", value: Layout["sizing"]["width"]): string {
  if (value === "fill") return `${prefix}-full`;
  if (value === "hug") return `${prefix}-fit`;
  return `${prefix}-[${value}px]`;
}

function sizingValue(value: Layout["sizing"]["width"]): string {
  if (value === "fill") return "100%";
  if (value === "hug") return "fit-content";
  return `${value}px`;
}

function staticMarker(node: JsxTarget, sourceFile: ts.SourceFile): string | undefined {
  const attributes = node.attributes.properties.filter(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property)
      && property.name.getText(sourceFile) === "data-afrodite-id",
  );
  if (attributes.length !== 1) return undefined;
  return staticJsxString(attributes[0]!);
}

function staticJsxString(attribute: ts.JsxAttribute): string | undefined {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return undefined;
}

function staticPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && (ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression))) {
    return name.expression.text;
  }
  return undefined;
}

function isStaticStyleValue(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword;
}

function formatStyleObject(entries: readonly (readonly [string, string])[], mode: "react" | "css"): string {
  return `{ ${entries.map(([key, value]) => `${formatObjectKey(key, mode)}: ${JSON.stringify(value)}`).join(", ")} }`;
}

function formatObjectKey(key: string, mode: "react" | "css"): string {
  return mode === "react" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  return sourceFile.statements.some((statement) => ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression) && statement.expression.text === directive);
}

function findMatchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function jsxVerification(repositoryPath: string): VerificationStep[] {
  return [
    { kind: "format", command: `pnpm exec prettier --check ${quoteShellArgument(repositoryPath)}`, required: false },
    { kind: "typecheck", command: "pnpm exec tsc --noEmit --pretty false", required: true },
  ];
}

function stylesheetVerification(repositoryPath: string): VerificationStep[] {
  return [
    { kind: "format", command: `pnpm exec prettier --check ${quoteShellArgument(repositoryPath)}`, required: false },
    { kind: "build", command: "pnpm run build", required: true },
  ];
}

function operationMismatch(operation: StylePatchOperation, source: SourceSnapshot, expected: string): AdapterDiagnostic {
  return diagnostic("STYLE_STRATEGY_MISMATCH", "error", `Expected ${expected} ownership, received ${operation.ownership.strategy}.`, source, operation.nodeId);
}

function diagnostic(
  code: string,
  severity: AdapterDiagnostic["severity"],
  message: string,
  source: SourceSnapshot,
  nodeId: string,
): AdapterDiagnostic {
  return { code, severity, message, repositoryPath: source.repositoryPath, nodeId };
}

function isError(diagnostic: AdapterDiagnostic): boolean {
  return diagnostic.severity === "error";
}

function quoteShellArgument(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
