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
  InteractionState,
  Layout,
  LayoutOverride,
  SourceBinding,
  StyleOwnership,
  StyleProperty,
  UiVariants,
} from "@afrodite/ui-ir";

export interface VariantPatchOperation {
  readonly kind: "update-variants";
  readonly nodeId: string;
  readonly binding: SourceBinding;
  readonly ownership: StyleOwnership;
  readonly before: UiVariants;
  readonly after: UiVariants;
}

export interface VariantStrategy {
  readonly id: string;
  readonly strategy: StyleOwnership["strategy"];
  supports(operation: VariantPatchOperation): boolean;
  plan(operation: VariantPatchOperation, source: SourceSnapshot): SourcePatchPlan;
}

export class VariantStrategyRegistry {
  readonly #strategies = new Map<string, VariantStrategy>();

  register(strategy: VariantStrategy): void {
    if (this.#strategies.has(strategy.id)) {
      throw new Error(`Variant strategy ${strategy.id} is already registered`);
    }
    this.#strategies.set(strategy.id, strategy);
  }

  list(): readonly VariantStrategy[] {
    return [...this.#strategies.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  resolve(operation: VariantPatchOperation): VariantStrategy | undefined {
    return this.list().find((strategy) => strategy.supports(operation));
  }
}

export function createDefaultVariantStrategyRegistry(): VariantStrategyRegistry {
  const registry = new VariantStrategyRegistry();
  registry.register(createTailwindVariantStrategy("react", "afrodite.adapter.react", true));
  registry.register(createTailwindVariantStrategy("solid", "afrodite.adapter.solid", false));
  registry.register(createCssModuleVariantStrategy());
  registry.register(createUnsupportedVariantStrategy("inline"));
  registry.register(createUnsupportedVariantStrategy("design-token"));
  return registry;
}

export function resolveVariantSourcePath(operation: VariantPatchOperation): string {
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

export function resolveEffectiveLayout(
  base: Layout,
  variants: UiVariants | undefined,
  context: {
    readonly viewportWidth?: number;
    readonly activeStates?: readonly InteractionState[];
  } = {},
): Layout {
  let current = cloneLayout(base);
  if (!variants) return current;

  if (context.viewportWidth !== undefined) {
    const responsive = [...variants.responsive]
      .filter((variant) => context.viewportWidth! >= variant.minWidth
        && (variant.maxWidth === undefined || context.viewportWidth! <= variant.maxWidth))
      .sort((left, right) => left.minWidth - right.minWidth || left.id.localeCompare(right.id));
    for (const variant of responsive) current = applyOverride(current, variant.layout);
  }

  const active = new Set(context.activeStates ?? []);
  const priority: readonly InteractionState[] = ["hover", "focus", "disabled", "loading", "error"];
  for (const state of priority) {
    if (!active.has(state)) continue;
    const variant = variants.states.find((candidate) => candidate.state === state);
    if (variant) current = applyOverride(current, variant.layout);
  }
  return current;
}

function createTailwindVariantStrategy(
  frameworkId: string,
  frameworkAdapterId: string,
  rejectUseServer: boolean,
): VariantStrategy {
  const id = `afrodite.variants.utility.tailwind.${frameworkId}`;
  return {
    id,
    strategy: "utility",
    supports: (operation) => operation.ownership.strategy === "utility"
      && operation.binding.frameworkId === frameworkId,
    plan: (operation, source) => {
      const diagnostics = validateJsxVariantOperation(
        operation,
        source,
        frameworkId,
        frameworkAdapterId,
      );
      const edits: TextEdit[] = [];
      const target = diagnostics.some(isError)
        ? undefined
        : findUniqueMarkedElement(
            source,
            operation.binding.stableMarker!,
            rejectUseServer,
            diagnostics,
            operation.nodeId,
          );
      if (target && operation.ownership.strategy === "utility") {
        const edit = createTailwindVariantEdit(target, source, operation, frameworkId, diagnostics);
        if (edit) edits.push(edit);
      }
      return createSourcePatchPlan({
        frameworkId,
        adapterId: id,
        operation: "update-style",
        source,
        edits,
        diagnostics,
        verification: jsxVerification(source.repositoryPath),
      });
    },
  };
}

function createCssModuleVariantStrategy(): VariantStrategy {
  const id = "afrodite.variants.css-module";
  return {
    id,
    strategy: "css-module",
    supports: (operation) => operation.ownership.strategy === "css-module",
    plan: (operation, source) => {
      const diagnostics: AdapterDiagnostic[] = [];
      const edits: TextEdit[] = [];
      if (operation.ownership.strategy !== "css-module") {
        diagnostics.push(diagnostic(
          "VARIANT_STRATEGY_MISMATCH",
          "error",
          "CSS Module variant planner received another ownership strategy.",
          source,
          operation.nodeId,
        ));
      } else {
        validateTargetPath(operation.ownership.stylesheetPath, source, operation.nodeId, diagnostics);
        const generated = createCssVariantRegion(operation, source, diagnostics);
        if (!diagnostics.some(isError)) {
          const markers = findGeneratedRegion(
            source.content,
            operation.ownership.className,
            diagnostics,
            source,
            operation.nodeId,
          );
          if (markers) {
            if (generated) {
              edits.push({ start: markers.start, end: markers.end, replacement: generated });
            } else {
              edits.push({ start: markers.start, end: markers.end, replacement: "" });
            }
          } else if (generated) {
            const separator = source.content.endsWith("\n") || source.content.length === 0 ? "" : "\n";
            edits.push({
              start: source.content.length,
              end: source.content.length,
              replacement: `${separator}${generated}\n`,
            });
          }
        }
      }
      return createSourcePatchPlan({
        frameworkId: operation.binding.frameworkId ?? "unknown",
        adapterId: id,
        operation: "update-style",
        source,
        edits,
        diagnostics,
        verification: stylesheetVerification(source.repositoryPath),
      });
    },
  };
}

function createUnsupportedVariantStrategy(strategy: "inline" | "design-token"): VariantStrategy {
  const id = `afrodite.variants.unsupported.${strategy}`;
  return {
    id,
    strategy,
    supports: (operation) => operation.ownership.strategy === strategy,
    plan: (operation, source) => createSourcePatchPlan({
      frameworkId: operation.binding.frameworkId ?? "unknown",
      adapterId: id,
      operation: "update-style",
      source,
      edits: [],
      diagnostics: [diagnostic(
        strategy === "inline" ? "INLINE_VARIANTS_NOT_PATCHABLE" : "DESIGN_TOKEN_VARIANTS_NOT_PATCHABLE",
        "error",
        strategy === "inline"
          ? "Static inline style objects cannot represent responsive queries or pseudo states without adding runtime behavior."
          : "Design-token variants require an explicit selector or media-query scope, which this token binding does not provide.",
        source,
        operation.nodeId,
      )],
      verification: [],
    }),
  };
}

function validateJsxVariantOperation(
  operation: VariantPatchOperation,
  source: SourceSnapshot,
  frameworkId: string,
  frameworkAdapterId: string,
): AdapterDiagnostic[] {
  const diagnostics: AdapterDiagnostic[] = [];
  if (operation.binding.frameworkId !== frameworkId) {
    diagnostics.push(diagnostic(
      "VARIANT_FRAMEWORK_MISMATCH",
      "error",
      `Variant strategy expects ${frameworkId}.`,
      source,
      operation.nodeId,
    ));
  }
  if (operation.binding.adapterId && operation.binding.adapterId !== frameworkAdapterId) {
    diagnostics.push(diagnostic(
      "VARIANT_ADAPTER_MISMATCH",
      "error",
      `Binding belongs to ${operation.binding.adapterId}.`,
      source,
      operation.nodeId,
    ));
  }
  validateTargetPath(operation.binding.repositoryPath, source, operation.nodeId, diagnostics);
  if (!operation.binding.stableMarker) {
    diagnostics.push(diagnostic(
      "VARIANT_STABLE_MARKER_REQUIRED",
      "error",
      "Utility variants require a stable JSX marker.",
      source,
      operation.nodeId,
    ));
  }
  validateVariantOwnership(operation, source, diagnostics);
  return diagnostics;
}

function validateVariantOwnership(
  operation: VariantPatchOperation,
  source: SourceSnapshot,
  diagnostics: AdapterDiagnostic[],
): void {
  const managed = new Set(operation.ownership.managedProperties);
  for (const variant of [...operation.after.responsive, ...operation.after.states]) {
    for (const property of overrideProperties(variant.layout)) {
      if (!managed.has(property)) {
        diagnostics.push(diagnostic(
          "VARIANT_PROPERTY_NOT_OWNED",
          "error",
          `Variant ${variant.id} changes ${property}, but Afrodite does not own that property.`,
          source,
          operation.nodeId,
        ));
      }
    }
  }
}

type JsxTarget = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function findUniqueMarkedElement(
  source: SourceSnapshot,
  marker: string,
  rejectUseServer: boolean,
  diagnostics: AdapterDiagnostic[],
  nodeId: string,
): { readonly sourceFile: ts.SourceFile; readonly node: JsxTarget } | undefined {
  const sourceFile = ts.createSourceFile(
    source.repositoryPath,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    source.repositoryPath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  if (rejectUseServer && hasDirective(sourceFile, "use server")) {
    diagnostics.push(diagnostic(
      "SERVER_MODULE_NOT_VARIANT_PATCHABLE",
      "error",
      "Modules marked with use server cannot receive client variant classes.",
      source,
      nodeId,
    ));
    return undefined;
  }

  const matches: JsxTarget[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && staticMarker(node, sourceFile) === marker) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (matches.length === 0) {
    diagnostics.push(diagnostic("VARIANT_MARKER_NOT_FOUND", "error", `No JSX element owns ${marker}.`, source, nodeId));
    return undefined;
  }
  if (matches.length > 1) {
    diagnostics.push(diagnostic("VARIANT_MARKER_AMBIGUOUS", "error", `Marker ${marker} is used more than once.`, source, nodeId));
    return undefined;
  }
  return { sourceFile, node: matches[0]! };
}

function createTailwindVariantEdit(
  target: { readonly sourceFile: ts.SourceFile; readonly node: JsxTarget },
  source: SourceSnapshot,
  operation: VariantPatchOperation,
  frameworkId: string,
  diagnostics: AdapterDiagnostic[],
): TextEdit | undefined {
  if (operation.ownership.strategy !== "utility") return undefined;
  validateVariantOwnership(operation, source, diagnostics);
  if (diagnostics.some(isError)) return undefined;

  const attributes = target.node.attributes.properties.filter(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property)
      && ["class", "className"].includes(property.name.getText(target.sourceFile)),
  );
  if (attributes.length > 1) {
    diagnostics.push(diagnostic(
      "VARIANT_CLASS_ATTRIBUTE_AMBIGUOUS",
      "error",
      "The marked element declares more than one class attribute.",
      source,
      operation.nodeId,
    ));
    return undefined;
  }

  const attributeName = operation.ownership.attribute ?? (frameworkId === "react" ? "className" : "class");
  const desired = tailwindVariantClasses(operation.after, operation.ownership.managedProperties);
  const knownPrefixes = new Set([
    ...variantPrefixes(operation.before),
    ...variantPrefixes(operation.after),
  ]);
  const attribute = attributes[0];
  if (!attribute) {
    if (desired.length === 0) return undefined;
    const insertion = ts.isJsxSelfClosingElement(target.node)
      ? target.node.getEnd() - 2
      : target.node.getEnd() - 1;
    return {
      start: insertion,
      end: insertion,
      replacement: ` ${attributeName}=${JSON.stringify(desired.join(" "))}`,
    };
  }

  const current = staticJsxString(attribute);
  if (current === undefined) {
    diagnostics.push(diagnostic(
      "DYNAMIC_VARIANT_CLASS_NOT_PATCHABLE",
      "error",
      "Variant utility classes are dynamic, so ownership cannot be proven.",
      source,
      operation.nodeId,
    ));
    return undefined;
  }

  const preserved = current.split(/\s+/).filter(Boolean).filter((className) =>
    !isOwnedVariantClass(className, knownPrefixes, operation.ownership.managedProperties)
  );
  const next = [...preserved, ...desired].join(" ");
  const initializer = attribute.initializer;
  if (!initializer) {
    return { start: attribute.getEnd(), end: attribute.getEnd(), replacement: `=${JSON.stringify(next)}` };
  }
  return {
    start: initializer.getStart(target.sourceFile),
    end: initializer.getEnd(),
    replacement: JSON.stringify(next),
  };
}

function tailwindVariantClasses(
  variants: UiVariants,
  managedProperties: readonly StyleProperty[],
): string[] {
  const managed = new Set(managedProperties);
  const classes: string[] = [];
  for (const variant of variants.responsive) {
    const prefix = responsivePrefix(variant.minWidth, variant.maxWidth);
    for (const [property, value] of overrideEntries(variant.layout)) {
      if (managed.has(property)) classes.push(`${prefix}${utilityClass(property, value)}`);
    }
  }
  for (const variant of variants.states) {
    const prefix = statePrefix(variant.state);
    for (const [property, value] of overrideEntries(variant.layout)) {
      if (managed.has(property)) classes.push(`${prefix}${utilityClass(property, value)}`);
    }
  }
  return classes;
}

function variantPrefixes(variants: UiVariants): string[] {
  return [
    ...variants.responsive.map((variant) => responsivePrefix(variant.minWidth, variant.maxWidth)),
    ...variants.states.map((variant) => statePrefix(variant.state)),
  ];
}

function responsivePrefix(minWidth: number, maxWidth?: number): string {
  return maxWidth === undefined
    ? `min-[${minWidth}px]:`
    : `min-[${minWidth}px]:max-[${maxWidth}px]:`;
}

function statePrefix(state: InteractionState): string {
  switch (state) {
    case "hover": return "hover:";
    case "focus": return "focus:";
    case "disabled": return "disabled:";
    case "loading": return "data-[state=loading]:";
    case "error": return "data-[state=error]:";
  }
}

function isOwnedVariantClass(
  className: string,
  prefixes: ReadonlySet<string>,
  managedProperties: readonly StyleProperty[],
): boolean {
  for (const prefix of prefixes) {
    if (!className.startsWith(prefix)) continue;
    const utility = className.slice(prefix.length);
    if (managedProperties.some((property) => utilityClassOwns(property, utility))) return true;
  }
  return false;
}

function createCssVariantRegion(
  operation: VariantPatchOperation,
  source: SourceSnapshot,
  diagnostics: AdapterDiagnostic[],
): string {
  if (operation.ownership.strategy !== "css-module") return "";
  validateVariantOwnership(operation, source, diagnostics);
  if (diagnostics.some(isError)) return "";

  const blocks: string[] = [];
  for (const variant of operation.after.responsive) {
    const declarations = cssDeclarations(variant.layout, operation.ownership.managedProperties);
    if (declarations.length === 0) continue;
    const conditions = [`(min-width: ${variant.minWidth}px)`];
    if (variant.maxWidth !== undefined) conditions.push(`(max-width: ${variant.maxWidth}px)`);
    blocks.push(`@media ${conditions.join(" and ")} {\n  .${operation.ownership.className} {\n${declarations.map((line) => `    ${line}`).join("\n")}\n  }\n}`);
  }
  for (const variant of operation.after.states) {
    const declarations = cssDeclarations(variant.layout, operation.ownership.managedProperties);
    if (declarations.length === 0) continue;
    blocks.push(`.${operation.ownership.className}${stateSelector(variant.state)} {\n${declarations.map((line) => `  ${line}`).join("\n")}\n}`);
  }
  if (blocks.length === 0) return "";
  const start = `/* afrodite-variants:${operation.ownership.className}:start */`;
  const end = `/* afrodite-variants:${operation.ownership.className}:end */`;
  return `${start}\n${blocks.join("\n\n")}\n${end}`;
}

function findGeneratedRegion(
  content: string,
  className: string,
  diagnostics: AdapterDiagnostic[],
  source: SourceSnapshot,
  nodeId: string,
): { readonly start: number; readonly end: number } | undefined {
  const startMarker = `/* afrodite-variants:${className}:start */`;
  const endMarker = `/* afrodite-variants:${className}:end */`;
  const start = content.indexOf(startMarker);
  const endStart = content.indexOf(endMarker);
  if (start < 0 && endStart < 0) return undefined;
  if (start < 0 || endStart < start) {
    diagnostics.push(diagnostic(
      "VARIANT_REGION_CORRUPT",
      "error",
      `Generated variant region for .${className} has incomplete markers.`,
      source,
      nodeId,
    ));
    return undefined;
  }
  if (content.indexOf(startMarker, start + startMarker.length) >= 0
    || content.indexOf(endMarker, endStart + endMarker.length) >= 0) {
    diagnostics.push(diagnostic(
      "VARIANT_REGION_AMBIGUOUS",
      "error",
      `Generated variant region for .${className} appears more than once.`,
      source,
      nodeId,
    ));
    return undefined;
  }
  return { start, end: endStart + endMarker.length };
}

function cssDeclarations(
  override: LayoutOverride,
  managedProperties: readonly StyleProperty[],
): string[] {
  const managed = new Set(managedProperties);
  return overrideEntries(override)
    .filter(([property]) => managed.has(property))
    .map(([property, value]) => `${cssProperty(property)}: ${value};`);
}

function stateSelector(state: InteractionState): string {
  switch (state) {
    case "hover": return ":hover";
    case "focus": return ":focus";
    case "disabled": return ":disabled";
    case "loading": return "[data-state=\"loading\"]";
    case "error": return "[data-state=\"error\"]";
  }
}

function overrideProperties(override: LayoutOverride): StyleProperty[] {
  return overrideEntries(override).map(([property]) => property);
}

function overrideEntries(override: LayoutOverride): Array<readonly [StyleProperty, string]> {
  const entries: Array<readonly [StyleProperty, string]> = [];
  if (override.display !== undefined) entries.push(["display", override.display]);
  if (override.direction !== undefined) entries.push(["direction", override.direction]);
  if (override.gap !== undefined) entries.push(["gap", `${override.gap}px`]);
  if (override.padding !== undefined) entries.push(["padding", `${override.padding}px`]);
  if (override.sizing?.width !== undefined) entries.push(["width", sizingValue(override.sizing.width)]);
  if (override.sizing?.height !== undefined) entries.push(["height", sizingValue(override.sizing.height)]);
  return entries;
}

function utilityClass(property: StyleProperty, value: string): string {
  switch (property) {
    case "display": return value;
    case "direction": return value === "row" ? "flex-row" : "flex-col";
    case "gap": return `gap-[${value}]`;
    case "padding": return `p-[${value}]`;
    case "width": return value === "100%" ? "w-full" : value === "fit-content" ? "w-fit" : `w-[${value}]`;
    case "height": return value === "100%" ? "h-full" : value === "fit-content" ? "h-fit" : `h-[${value}]`;
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

function cssProperty(property: StyleProperty): string {
  return property === "direction" ? "flex-direction" : property;
}

function sizingValue(value: Layout["sizing"]["width"]): string {
  if (value === "fill") return "100%";
  if (value === "hug") return "fit-content";
  return `${value}px`;
}

function applyOverride(layout: Layout, override: LayoutOverride): Layout {
  return {
    ...layout,
    ...(override.display === undefined ? {} : { display: override.display }),
    ...(override.direction === undefined ? {} : { direction: override.direction }),
    ...(override.gap === undefined ? {} : { gap: override.gap }),
    ...(override.padding === undefined ? {} : { padding: override.padding }),
    sizing: {
      ...layout.sizing,
      ...(override.sizing?.width === undefined ? {} : { width: override.sizing.width }),
      ...(override.sizing?.height === undefined ? {} : { height: override.sizing.height }),
    },
  };
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function validateTargetPath(
  expected: string,
  source: SourceSnapshot,
  nodeId: string,
  diagnostics: AdapterDiagnostic[],
): void {
  if (expected !== source.repositoryPath) {
    diagnostics.push(diagnostic(
      "VARIANT_SOURCE_PATH_MISMATCH",
      "error",
      `Variant ownership targets ${expected}, but the snapshot is ${source.repositoryPath}.`,
      source,
      nodeId,
    ));
  }
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

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  return sourceFile.statements.some((statement) => ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression)
    && statement.expression.text === directive);
}

function jsxVerification(repositoryPath: string): VerificationStep[] {
  return [
    {
      kind: "format",
      command: `pnpm exec prettier --check ${JSON.stringify(repositoryPath)}`,
      required: false,
    },
    {
      kind: "typecheck",
      command: "pnpm exec tsc --noEmit --pretty false",
      required: true,
    },
  ];
}

function stylesheetVerification(repositoryPath: string): VerificationStep[] {
  return [
    {
      kind: "format",
      command: `pnpm exec prettier --check ${JSON.stringify(repositoryPath)}`,
      required: false,
    },
    {
      kind: "build",
      command: "pnpm build",
      required: true,
    },
  ];
}

function diagnostic(
  code: string,
  severity: AdapterDiagnostic["severity"],
  message: string,
  source: SourceSnapshot,
  nodeId: string,
): AdapterDiagnostic {
  return {
    code,
    severity,
    message,
    repositoryPath: source.repositoryPath,
    nodeId,
  };
}

function isError(diagnostic: AdapterDiagnostic): boolean {
  return diagnostic.severity === "error";
}
