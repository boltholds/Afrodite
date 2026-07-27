import {
  parseUiDocument,
  styleOwnershipSchema,
  uiVariantsSchema,
  type Layout,
  type LayoutOverride,
  type SourceBinding,
  type StyleOwnership,
  type StyleProperty,
  type UiDocument,
  type UiNode,
  type UiVariants,
} from "@afrodite/ui-ir";

export type SemanticOperationCommand =
  | {
      readonly type: "convert_to_grid";
      readonly nodeId: string;
      readonly gap?: number;
    }
  | {
      readonly type: "create_responsive_variant";
      readonly nodeId: string;
      readonly variantId: string;
      readonly name?: string;
      readonly minWidth: number;
      readonly maxWidth?: number;
      readonly layout: LayoutOverride;
    }
  | {
      readonly type: "replace_spacing_with_token";
      readonly nodeId: string;
      readonly property: "gap" | "padding";
      readonly tokenName: string;
      readonly tokenFilePath: string;
    }
  | {
      readonly type: "explain_unpatchable_region";
      readonly nodeId: string;
    };

export type SemanticPlanStatus = "ready" | "blocked" | "informational";
export type SemanticApplicationMode = "document-and-source" | "document-only" | "informational";

export interface SemanticDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly nodeId?: string;
  readonly requirement?: string;
}

export interface SemanticCapabilityVerdict {
  readonly documentMutation: boolean;
  readonly sourcePlanning: boolean;
  readonly sourceRepresentation?: StyleOwnership["strategy"];
  readonly requirements: readonly string[];
}

export type SemanticSourceIntent =
  | {
      readonly type: "style";
      readonly operation: {
        readonly kind: "update-style";
        readonly nodeId: string;
        readonly binding: SourceBinding;
        readonly ownership: StyleOwnership;
        readonly before: Layout;
        readonly after: Layout;
      };
    }
  | {
      readonly type: "variant";
      readonly operation: {
        readonly kind: "update-variants";
        readonly nodeId: string;
        readonly binding: SourceBinding;
        readonly ownership: StyleOwnership;
        readonly before: UiVariants;
        readonly after: UiVariants;
      };
    };

export interface SemanticOperationPlan {
  readonly planId: string;
  readonly command: SemanticOperationCommand;
  readonly documentVersion: string;
  readonly status: SemanticPlanStatus;
  readonly applicationMode: SemanticApplicationMode;
  readonly capabilities: SemanticCapabilityVerdict;
  readonly diagnostics: readonly SemanticDiagnostic[];
  readonly sourceIntents: readonly SemanticSourceIntent[];
  readonly documentAfter?: UiDocument;
  readonly explanation?: {
    readonly summary: string;
    readonly facts: readonly string[];
    readonly nextActions: readonly string[];
  };
}

export function planSemanticOperation(
  documentInput: UiDocument,
  command: SemanticOperationCommand,
): SemanticOperationPlan {
  const document = parseUiDocument(documentInput);
  const documentVersion = createSemanticDocumentVersion(document);
  const node = findNode(document.root, command.nodeId);

  if (!node) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_TARGET_NOT_FOUND",
      "error",
      `Node ${command.nodeId} was not found in the current UI document.`,
      command.nodeId,
    )]);
  }

  if (command.type === "explain_unpatchable_region") {
    return explainPlan(documentVersion, command, node);
  }

  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_TARGET_READ_ONLY",
      "error",
      node.sourceRegion?.reason ?? "The selected node is controlled by an unsupported source region.",
      node.id,
      "Choose an editable or requires-binding node, or request explain_unpatchable_region.",
    )]);
  }

  switch (command.type) {
    case "convert_to_grid":
      return planConvertToGrid(documentVersion, document, node, command);
    case "create_responsive_variant":
      return planResponsiveVariant(documentVersion, document, node, command);
    case "replace_spacing_with_token":
      return planSpacingToken(documentVersion, document, node, command);
  }
}

export function applySemanticDocumentPlan(
  currentInput: UiDocument,
  plan: SemanticOperationPlan,
): UiDocument {
  const current = parseUiDocument(currentInput);
  const version = createSemanticDocumentVersion(current);
  if (version !== plan.documentVersion) {
    throw new Error("The semantic operation plan is stale for the current UI document.");
  }
  if (plan.status !== "ready" || !plan.documentAfter) {
    throw new Error("The semantic operation plan does not contain an applicable document mutation.");
  }
  return parseUiDocument(cloneJson(plan.documentAfter));
}

export function createSemanticDocumentVersion(document: UiDocument): string {
  return `ui-fnv1a32:${fnv1a32(stableStringify(document))}`;
}

function planConvertToGrid(
  documentVersion: string,
  document: UiDocument,
  node: UiNode,
  command: Extract<SemanticOperationCommand, { type: "convert_to_grid" }>,
): SemanticOperationPlan {
  const diagnostics: SemanticDiagnostic[] = [];
  if (command.gap !== undefined && (!Number.isFinite(command.gap) || command.gap < 0)) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_GRID_GAP_INVALID",
      "error",
      "Grid gap must be a finite non-negative number.",
      node.id,
    )]);
  }

  const afterLayout: Layout = {
    ...cloneLayout(node.layout),
    display: "grid",
    ...(command.gap === undefined ? {} : { gap: command.gap }),
  };
  if (stableStringify(afterLayout) === stableStringify(node.layout)) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_NO_CHANGE",
      "error",
      "The selected node already has the requested grid layout.",
      node.id,
    )]);
  }

  const documentAfter = replaceNode(document, node.id, (current) => ({
    ...current,
    layout: afterLayout,
  }));
  const required = new Set<StyleProperty>(["display"]);
  if (command.gap !== undefined) required.add("gap");
  const sourceIntents = createStyleIntent(node, node.layout, afterLayout, [...required], diagnostics);
  return readyPlan(documentVersion, command, documentAfter, sourceIntents, diagnostics, node);
}

function planResponsiveVariant(
  documentVersion: string,
  document: UiDocument,
  node: UiNode,
  command: Extract<SemanticOperationCommand, { type: "create_responsive_variant" }>,
): SemanticOperationPlan {
  const before = cloneVariants(node.variants);
  if ([...before.responsive, ...before.states].some((variant) => variant.id === command.variantId)) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_VARIANT_ID_EXISTS",
      "error",
      `Variant ${command.variantId} already exists on node ${node.id}.`,
      node.id,
      "Use a new stable variant ID. Replacement is deliberately not implicit.",
    )]);
  }

  const candidate = {
    ...before,
    responsive: [
      ...before.responsive,
      {
        id: command.variantId,
        ...(command.name ? { name: command.name } : {}),
        minWidth: command.minWidth,
        ...(command.maxWidth === undefined ? {} : { maxWidth: command.maxWidth }),
        layout: cloneJson(command.layout),
      },
    ],
  };
  const parsed = uiVariantsSchema.safeParse(candidate);
  if (!parsed.success) {
    return blockedPlan(documentVersion, command, parsed.error.issues.map((issue) => diagnostic(
      "SEMANTIC_VARIANT_INVALID",
      "error",
      `${issue.path.join(".") || "variant"}: ${issue.message}`,
      node.id,
    )));
  }

  const after = cloneVariants(parsed.data);
  const documentAfter = replaceNode(document, node.id, (current) => ({ ...current, variants: after }));
  const diagnostics: SemanticDiagnostic[] = [];
  const required = layoutOverrideProperties(command.layout);
  const sourceIntents = createVariantIntent(node, before, after, required, diagnostics);
  return readyPlan(documentVersion, command, documentAfter, sourceIntents, diagnostics, node);
}

function planSpacingToken(
  documentVersion: string,
  document: UiDocument,
  node: UiNode,
  command: Extract<SemanticOperationCommand, { type: "replace_spacing_with_token" }>,
): SemanticOperationPlan {
  if (!/^--[A-Za-z0-9_-]+$/.test(command.tokenName)) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_TOKEN_NAME_INVALID",
      "error",
      "A spacing token must be an explicit CSS custom property such as --space-card.",
      node.id,
    )]);
  }
  if (!command.tokenFilePath.trim()) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_TOKEN_PATH_REQUIRED",
      "error",
      "The existing token stylesheet path is required.",
      node.id,
    )]);
  }
  if (!node.sourceBinding) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_SOURCE_BINDING_REQUIRED",
      "error",
      "Token replacement requires an explicit source binding.",
      node.id,
    )]);
  }
  const current = node.sourceBinding.styleOwnership;
  if (!current || current.strategy !== "design-token") {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_TOKEN_TAKEOVER_REQUIRED",
      "error",
      "The first slice only remaps spacing that is already governed by design-token ownership.",
      node.id,
      "Declare design-token ownership explicitly before asking automation to change its token binding.",
    )]);
  }

  const nextOwnership = styleOwnershipSchema.parse({
    strategy: "design-token",
    tokenFilePath: command.tokenFilePath,
    managedProperties: unique([...current.managedProperties, command.property]),
    tokens: { ...current.tokens, [command.property]: command.tokenName },
  });
  if (stableStringify(current) === stableStringify(nextOwnership)) {
    return blockedPlan(documentVersion, command, [diagnostic(
      "SEMANTIC_NO_CHANGE",
      "error",
      `${command.property} is already bound to ${command.tokenName}.`,
      node.id,
    )]);
  }

  const nextBinding: SourceBinding = { ...node.sourceBinding, styleOwnership: nextOwnership };
  const documentAfter = replaceNode(document, node.id, (candidate) => ({
    ...candidate,
    sourceBinding: nextBinding,
  }));
  const sourceIntents: SemanticSourceIntent[] = [{
    type: "style",
    operation: {
      kind: "update-style",
      nodeId: node.id,
      binding: cloneJson(nextBinding),
      ownership: cloneJson(nextOwnership),
      before: cloneLayout(node.layout),
      after: cloneLayout(node.layout),
    },
  }];
  return readyPlan(documentVersion, command, documentAfter, sourceIntents, [], node);
}

function explainPlan(
  documentVersion: string,
  command: Extract<SemanticOperationCommand, { type: "explain_unpatchable_region" }>,
  node: UiNode,
): SemanticOperationPlan {
  const facts: string[] = [];
  const nextActions: string[] = [];
  let summary = "The selected node is structurally editable, but some source synchronization capabilities may still be unavailable.";

  if (node.sourceRegion) {
    facts.push(`Source mode: ${node.sourceRegion.mode}.`);
    facts.push(`Source kind: ${node.sourceRegion.regionKind}.`);
    facts.push(`Source: ${node.sourceRegion.repositoryPath}:${node.sourceRegion.line}:${node.sourceRegion.column}.`);
    if (node.sourceRegion.reason) facts.push(node.sourceRegion.reason);
  }
  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    summary = node.sourceRegion?.reason ?? "This node represents source behavior that Afrodite cannot safely rewrite.";
    nextActions.push("Keep the region source-controlled or refactor it manually into a statically bindable component boundary.");
  }
  if (!node.sourceBinding) {
    facts.push("No SourceBinding is attached to this UI IR node.");
    nextActions.push("Use the Binding Manager to select an exact source element and install a stable marker.");
  } else {
    facts.push(`Binding target: ${node.sourceBinding.repositoryPath}.`);
    if (!node.sourceBinding.stableMarker) {
      facts.push("The binding has no stable marker.");
      nextActions.push("Install a unique data-afrodite-id marker through a reviewed binding patch.");
    }
    if (!node.sourceBinding.styleOwnership) {
      facts.push("No explicit style ownership is declared.");
      nextActions.push("Declare which style representation and properties Afrodite may control.");
    } else {
      facts.push(`Style strategy: ${node.sourceBinding.styleOwnership.strategy}.`);
      facts.push(`Managed properties: ${node.sourceBinding.styleOwnership.managedProperties.join(", ")}.`);
    }
  }
  if (nextActions.length === 0) {
    nextActions.push("Request a concrete semantic mutation so its adapter-specific capability checks can run.");
  }

  const diagnostics = [diagnostic(
    "SEMANTIC_EXPLANATION",
    "info",
    summary,
    node.id,
  )];
  const plan: SemanticOperationPlan = {
    planId: createPlanId(documentVersion, command, undefined),
    command: cloneJson(command),
    documentVersion,
    status: "informational",
    applicationMode: "informational",
    capabilities: {
      documentMutation: false,
      sourcePlanning: false,
      ...(node.sourceBinding?.styleOwnership
        ? { sourceRepresentation: node.sourceBinding.styleOwnership.strategy }
        : {}),
      requirements: nextActions,
    },
    diagnostics,
    sourceIntents: [],
    explanation: { summary, facts, nextActions },
  };
  return plan;
}

function createStyleIntent(
  node: UiNode,
  before: Layout,
  after: Layout,
  requiredProperties: readonly StyleProperty[],
  diagnostics: SemanticDiagnostic[],
): SemanticSourceIntent[] {
  const binding = node.sourceBinding;
  const ownership = binding?.styleOwnership;
  if (!binding || !binding.stableMarker || !ownership) {
    diagnostics.push(diagnostic(
      "SEMANTIC_DOCUMENT_ONLY",
      "warning",
      "The UI IR change is valid, but source planning requires a stable binding and explicit style ownership.",
      node.id,
      "Bind the node and declare style ownership before applying this operation to production source.",
    ));
    return [];
  }
  const missing = requiredProperties.filter((property) => !ownership.managedProperties.includes(property));
  if (missing.length > 0) {
    diagnostics.push(diagnostic(
      "SEMANTIC_OWNERSHIP_INCOMPLETE",
      "warning",
      `Source planning is disabled because Afrodite does not own: ${missing.join(", ")}.`,
      node.id,
      "Expand ownership explicitly rather than allowing automation to claim properties implicitly.",
    ));
    return [];
  }
  return [{
    type: "style",
    operation: {
      kind: "update-style",
      nodeId: node.id,
      binding: cloneJson(binding),
      ownership: cloneJson(ownership),
      before: cloneLayout(before),
      after: cloneLayout(after),
    },
  }];
}

function createVariantIntent(
  node: UiNode,
  before: UiVariants,
  after: UiVariants,
  requiredProperties: readonly StyleProperty[],
  diagnostics: SemanticDiagnostic[],
): SemanticSourceIntent[] {
  const binding = node.sourceBinding;
  const ownership = binding?.styleOwnership;
  if (!binding || !binding.stableMarker || !ownership) {
    diagnostics.push(diagnostic(
      "SEMANTIC_DOCUMENT_ONLY",
      "warning",
      "The responsive intent can be stored in UI IR, but source materialization requires binding and ownership.",
      node.id,
    ));
    return [];
  }
  if (!["utility", "css-module"].includes(ownership.strategy)) {
    diagnostics.push(diagnostic(
      "SEMANTIC_VARIANT_STRATEGY_READ_ONLY",
      "warning",
      `${ownership.strategy} does not currently provide a deterministic responsive selector scope.`,
      node.id,
      "Use Tailwind utility or CSS Module ownership for source materialization.",
    ));
    return [];
  }
  const missing = requiredProperties.filter((property) => !ownership.managedProperties.includes(property));
  if (missing.length > 0) {
    diagnostics.push(diagnostic(
      "SEMANTIC_OWNERSHIP_INCOMPLETE",
      "warning",
      `Variant source planning is disabled because Afrodite does not own: ${missing.join(", ")}.`,
      node.id,
    ));
    return [];
  }
  return [{
    type: "variant",
    operation: {
      kind: "update-variants",
      nodeId: node.id,
      binding: cloneJson(binding),
      ownership: cloneJson(ownership),
      before: cloneVariants(before),
      after: cloneVariants(after),
    },
  }];
}

function readyPlan(
  documentVersion: string,
  command: SemanticOperationCommand,
  documentAfter: UiDocument,
  sourceIntents: readonly SemanticSourceIntent[],
  diagnostics: readonly SemanticDiagnostic[],
  node: UiNode,
): SemanticOperationPlan {
  const mode: SemanticApplicationMode = sourceIntents.length > 0 ? "document-and-source" : "document-only";
  const requirements = diagnostics
    .filter((item) => item.requirement)
    .map((item) => item.requirement!);
  const plan: SemanticOperationPlan = {
    planId: createPlanId(documentVersion, command, documentAfter),
    command: cloneJson(command),
    documentVersion,
    status: "ready",
    applicationMode: mode,
    capabilities: {
      documentMutation: true,
      sourcePlanning: sourceIntents.length > 0,
      ...(node.sourceBinding?.styleOwnership
        ? { sourceRepresentation: node.sourceBinding.styleOwnership.strategy }
        : {}),
      requirements,
    },
    diagnostics: diagnostics.map((item) => ({ ...item })),
    sourceIntents: sourceIntents.map(cloneJson),
    documentAfter: parseUiDocument(cloneJson(documentAfter)),
  };
  return plan;
}

function blockedPlan(
  documentVersion: string,
  command: SemanticOperationCommand,
  diagnostics: readonly SemanticDiagnostic[],
): SemanticOperationPlan {
  return {
    planId: createPlanId(documentVersion, command, undefined),
    command: cloneJson(command),
    documentVersion,
    status: "blocked",
    applicationMode: "informational",
    capabilities: {
      documentMutation: false,
      sourcePlanning: false,
      requirements: diagnostics.filter((item) => item.requirement).map((item) => item.requirement!),
    },
    diagnostics: diagnostics.map((item) => ({ ...item })),
    sourceIntents: [],
  };
}

function layoutOverrideProperties(override: LayoutOverride): StyleProperty[] {
  const properties: StyleProperty[] = [];
  if (override.display !== undefined) properties.push("display");
  if (override.direction !== undefined) properties.push("direction");
  if (override.gap !== undefined) properties.push("gap");
  if (override.padding !== undefined) properties.push("padding");
  if (override.sizing?.width !== undefined) properties.push("width");
  if (override.sizing?.height !== undefined) properties.push("height");
  return properties;
}

function replaceNode(
  document: UiDocument,
  nodeId: string,
  transform: (node: UiNode) => UiNode,
): UiDocument {
  let found = false;
  const visit = (node: UiNode): UiNode => {
    if (node.id === nodeId) {
      found = true;
      return transform(cloneNode(node));
    }
    return { ...cloneNode(node), children: node.children.map(visit) };
  };
  const root = visit(document.root);
  if (!found) throw new Error(`Cannot replace missing node ${nodeId}`);
  return parseUiDocument({ ...cloneJson(document), root });
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function cloneNode(node: UiNode): UiNode {
  return cloneJson(node);
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function cloneVariants(variants?: UiVariants): UiVariants {
  return variants
    ? cloneJson(variants)
    : { responsive: [], states: [] };
}

function diagnostic(
  code: string,
  severity: SemanticDiagnostic["severity"],
  message: string,
  nodeId?: string,
  requirement?: string,
): SemanticDiagnostic {
  return {
    code,
    severity,
    message,
    ...(nodeId ? { nodeId } : {}),
    ...(requirement ? { requirement } : {}),
  };
}

function createPlanId(
  documentVersion: string,
  command: SemanticOperationCommand,
  documentAfter: UiDocument | undefined,
): string {
  return `semantic:${fnv1a32(stableStringify({ documentVersion, command, documentAfter }))}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
