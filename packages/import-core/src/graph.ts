import ts from "typescript";
import type { AdapterDiagnostic, SourceSnapshot } from "@afrodite/framework-core";
import type { UiDocument, UiNode } from "@afrodite/ui-ir";
import type {
  ScreenImportAdapter,
  ScreenImportRequest,
  ScreenImportResult,
  ScreenImportStats,
} from "./index.js";

export type ScreenImportExpansionMode = "all-local" | "explicit";
export type ScreenImportEdgeStatus =
  | "expanded"
  | "boundary"
  | "cycle"
  | "missing"
  | "budget"
  | "failed";

export interface ScreenImportGraphRequest extends ScreenImportRequest {
  readonly maxFiles?: number;
  readonly maxNodes?: number;
  readonly maxGraphDepth?: number;
  readonly expansionMode?: ScreenImportExpansionMode;
  readonly expandComponents?: readonly string[];
  readonly stopComponents?: readonly string[];
}

export interface ScreenImportSourceProvider {
  read(repositoryPath: string): Promise<SourceSnapshot>;
}

export interface ScreenImportGraphFile {
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly exportName: string;
  readonly depth: number;
  readonly nodeCount: number;
  readonly root: boolean;
}

export interface ScreenImportGraphEdge {
  readonly edgeId: string;
  readonly fromRepositoryPath: string;
  readonly fromExportName: string;
  readonly fromNodeId: string;
  readonly localName: string;
  readonly moduleSpecifier: string;
  readonly importedName: string;
  readonly targetRepositoryPath?: string;
  readonly status: ScreenImportEdgeStatus;
  readonly depth: number;
  readonly reason?: string;
}

export interface ScreenImportGraphBudget {
  readonly maxFiles: number;
  readonly maxNodes: number;
  readonly maxGraphDepth: number;
  readonly filesRead: number;
  readonly nodesMaterialized: number;
  readonly expandedComponents: number;
  readonly boundaries: number;
  readonly cycles: number;
  readonly missingImports: number;
  readonly truncated: boolean;
}

export interface ScreenImportGraphResult extends ScreenImportResult {
  readonly files: readonly ScreenImportGraphFile[];
  readonly edges: readonly ScreenImportGraphEdge[];
  readonly graph: ScreenImportGraphBudget;
}

interface LocalImportBinding {
  readonly localName: string;
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

interface GraphState {
  readonly adapter: ScreenImportAdapter;
  readonly request: Required<Pick<
    ScreenImportGraphRequest,
    "maxDepth" | "maxFiles" | "maxNodes" | "maxGraphDepth" | "expansionMode"
  >> & ScreenImportGraphRequest;
  readonly provider: ScreenImportSourceProvider;
  readonly diagnostics: AdapterDiagnostic[];
  readonly files: ScreenImportGraphFile[];
  readonly edges: ScreenImportGraphEdge[];
  readonly sources: Map<string, SourceSnapshot>;
  readonly imports: Map<string, ReadonlyMap<string, LocalImportBinding>>;
  readonly templates: Map<string, ScreenImportResult>;
  readonly expandedKeys: Set<string>;
  nodesMaterialized: number;
  expandedComponents: number;
  boundaries: number;
  cycles: number;
  missingImports: number;
  truncated: boolean;
}

interface ResolvedImport {
  readonly repositoryPath: string;
  readonly source?: SourceSnapshot;
  readonly budgetBlocked: boolean;
}

interface PrunedTree {
  readonly node?: UiNode;
  readonly count: number;
  readonly truncated: boolean;
}

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_FILES = 24;
const DEFAULT_MAX_NODES = 1200;
const DEFAULT_MAX_GRAPH_DEPTH = 8;

export async function importScreenGraph(
  adapter: ScreenImportAdapter,
  request: ScreenImportGraphRequest,
  provider: ScreenImportSourceProvider,
): Promise<ScreenImportGraphResult> {
  const normalizedRequest = normalizeGraphRequest(request);
  const state: GraphState = {
    adapter,
    request: normalizedRequest,
    provider,
    diagnostics: [],
    files: [],
    edges: [],
    sources: new Map(),
    imports: new Map(),
    templates: new Map(),
    expandedKeys: new Set(),
    nodesMaterialized: 0,
    expandedComponents: 0,
    boundaries: 0,
    cycles: 0,
    missingImports: 0,
    truncated: false,
  };

  const rootSource = await readSource(state, normalizedRequest.repositoryPath);
  const rootResult = adapter.importScreen(normalizedRequest, rootSource);
  state.diagnostics.push(...rootResult.diagnostics.map(cloneDiagnostic));

  if (!rootResult.document) {
    return buildGraphResult(rootResult, state, undefined);
  }

  const rootExport = rootResult.exportName ?? normalizedRequest.exportName ?? "default";
  const rootKey = componentKey(rootResult.repositoryPath, rootExport);
  state.templates.set(rootKey, rootResult);

  const prunedRoot = pruneTree(rootResult.document.root, normalizedRequest.maxNodes);
  if (!prunedRoot.node) {
    state.truncated = true;
    state.diagnostics.push({
      code: "IMPORT_NODE_BUDGET_EXHAUSTED",
      severity: "error",
      message: "The configured node budget cannot contain the root screen node.",
      repositoryPath: rootResult.repositoryPath,
    });
    return buildGraphResult(rootResult, state, undefined);
  }

  state.nodesMaterialized = prunedRoot.count;
  if (prunedRoot.truncated) {
    state.truncated = true;
    state.boundaries += 1;
    state.diagnostics.push({
      code: "IMPORT_NODE_BUDGET_REACHED",
      severity: "warning",
      message: `The root screen was truncated to ${normalizedRequest.maxNodes} nodes.`,
      repositoryPath: rootResult.repositoryPath,
    });
  }

  state.files.push({
    repositoryPath: rootResult.repositoryPath,
    sourceVersion: rootResult.sourceVersion,
    exportName: rootExport,
    depth: 0,
    nodeCount: prunedRoot.count,
    root: true,
  });

  const expandedRoot = prunedRoot.truncated
    ? prunedRoot.node
    : await expandTree(
        prunedRoot.node,
        rootResult.repositoryPath,
        rootExport,
        0,
        [rootKey],
        state,
      );

  const document: UiDocument = {
    ...rootResult.document,
    root: expandedRoot,
  };
  const stats = collectStats(expandedRoot);
  const base: ScreenImportResult = {
    ...rootResult,
    document,
    diagnostics: state.diagnostics,
    stats,
  };
  return buildGraphResult(base, state, document);
}

function normalizeGraphRequest(request: ScreenImportGraphRequest): GraphState["request"] {
  return {
    ...request,
    maxDepth: clampInteger(request.maxDepth, DEFAULT_MAX_DEPTH, 1, 128),
    maxFiles: clampInteger(request.maxFiles, DEFAULT_MAX_FILES, 1, 128),
    maxNodes: clampInteger(request.maxNodes, DEFAULT_MAX_NODES, 1, 20_000),
    maxGraphDepth: clampInteger(request.maxGraphDepth, DEFAULT_MAX_GRAPH_DEPTH, 0, 32),
    expansionMode: request.expansionMode ?? "all-local",
    expandComponents: [...(request.expandComponents ?? [])],
    stopComponents: [...(request.stopComponents ?? [])],
  };
}

async function expandTree(
  node: UiNode,
  repositoryPath: string,
  exportName: string,
  graphDepth: number,
  stack: readonly string[],
  state: GraphState,
): Promise<UiNode> {
  const children: UiNode[] = [];
  for (const child of node.children) {
    children.push(await expandTree(child, repositoryPath, exportName, graphDepth, stack, state));
  }

  let next = cloneNodeWithChildren(node, children);
  if (next.kind !== "component") return next;

  const bindings = await localImportsFor(state, repositoryPath);
  const binding = bindings.get(next.component);
  if (!binding) return next;

  const boundaryAliases = [
    next.component,
    `${repositoryPath}#${next.component}`,
    `${binding.moduleSpecifier}#${binding.importedName}`,
  ];
  if (!shouldExpand(boundaryAliases, state.request)) {
    state.boundaries += 1;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "boundary",
      undefined,
      "Expansion stopped by the user-controlled component boundary.",
    ));
    return next;
  }

  if (graphDepth >= state.request.maxGraphDepth) {
    state.boundaries += 1;
    state.truncated = true;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "budget",
      undefined,
      `Graph depth limit ${state.request.maxGraphDepth} was reached.`,
    ));
    return next;
  }

  const resolved = await resolveLocalImport(state, repositoryPath, binding.moduleSpecifier);
  if (resolved.budgetBlocked) {
    state.boundaries += 1;
    state.truncated = true;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "budget",
      resolved.repositoryPath,
      `File budget ${state.request.maxFiles} was reached.`,
    ));
    return next;
  }
  if (!resolved.source) {
    state.missingImports += 1;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "missing",
      resolved.repositoryPath,
      "No supported local JSX source file could be resolved for this import.",
    ));
    state.diagnostics.push({
      code: "LOCAL_COMPONENT_IMPORT_NOT_RESOLVED",
      severity: "warning",
      message: `Could not resolve ${binding.moduleSpecifier} imported as ${binding.localName}.`,
      repositoryPath,
      nodeId: next.id,
    });
    return next;
  }

  const targetPath = resolved.source.repositoryPath;
  const targetKey = componentKey(targetPath, binding.importedName);
  if (stack.includes(targetKey)) {
    state.cycles += 1;
    state.boundaries += 1;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "cycle",
      targetPath,
      `Cycle detected: ${[...stack, targetKey].join(" -> ")}`,
    ));
    state.diagnostics.push({
      code: "LOCAL_COMPONENT_IMPORT_CYCLE",
      severity: "warning",
      message: `Cycle detected while expanding ${targetKey}; the component remains a boundary.`,
      repositoryPath,
      nodeId: next.id,
    });
    return next;
  }

  const imported = await importTemplate(state, resolved.source, binding.importedName);
  if (!imported.document) {
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "failed",
      targetPath,
      "The target module was read but its selected export could not be imported.",
    ));
    return next;
  }

  const remaining = state.request.maxNodes - state.nodesMaterialized;
  if (remaining <= 0) {
    state.boundaries += 1;
    state.truncated = true;
    state.edges.push(createEdge(
      next,
      repositoryPath,
      exportName,
      binding,
      graphDepth + 1,
      "budget",
      targetPath,
      `Node budget ${state.request.maxNodes} was reached.`,
    ));
    return next;
  }

  const instancePrefix = `graph.${sanitizeId(next.id)}.${state.edges.length + 1}`;
  const namespaced = namespaceTree(imported.document.root, instancePrefix);
  const pruned = pruneTree(namespaced, remaining);
  if (!pruned.node) return next;

  state.nodesMaterialized += pruned.count;
  const edge = createEdge(
    next,
    repositoryPath,
    exportName,
    binding,
    graphDepth + 1,
    pruned.truncated ? "budget" : "expanded",
    targetPath,
    pruned.truncated ? `Node budget ${state.request.maxNodes} truncated this component definition.` : undefined,
  );
  state.edges.push(edge);
  state.files.push({
    repositoryPath: imported.repositoryPath,
    sourceVersion: imported.sourceVersion,
    exportName: imported.exportName ?? binding.importedName,
    depth: graphDepth + 1,
    nodeCount: pruned.count,
    root: false,
  });

  if (pruned.truncated) {
    state.boundaries += 1;
    state.truncated = true;
    next = cloneNodeWithChildren(next, [...next.children, pruned.node]);
    return next;
  }

  state.expandedComponents += 1;
  state.expandedKeys.add(targetKey);
  const expandedDefinition = await expandTree(
    pruned.node,
    targetPath,
    imported.exportName ?? binding.importedName,
    graphDepth + 1,
    [...stack, targetKey],
    state,
  );
  next = cloneNodeWithChildren(next, [...next.children, expandedDefinition]);
  return next;
}

async function importTemplate(
  state: GraphState,
  source: SourceSnapshot,
  exportName: string,
): Promise<ScreenImportResult> {
  const key = componentKey(source.repositoryPath, exportName);
  const cached = state.templates.get(key);
  if (cached) return cached;

  const result = state.adapter.importScreen(
    {
      repositoryPath: source.repositoryPath,
      exportName,
      maxDepth: state.request.maxDepth,
      documentId: `import.${sanitizeId(source.repositoryPath)}.${sanitizeId(exportName)}`,
      documentName: `${exportName} imported component`,
    },
    source,
  );
  state.templates.set(key, result);
  state.diagnostics.push(...result.diagnostics.map(cloneDiagnostic));
  return result;
}

async function localImportsFor(
  state: GraphState,
  repositoryPath: string,
): Promise<ReadonlyMap<string, LocalImportBinding>> {
  const cached = state.imports.get(repositoryPath);
  if (cached) return cached;
  const source = await readSource(state, repositoryPath);
  const parsed = parseLocalImports(source);
  state.imports.set(repositoryPath, parsed);
  return parsed;
}

function parseLocalImports(source: SourceSnapshot): ReadonlyMap<string, LocalImportBinding> {
  const sourceFile = ts.createSourceFile(
    source.repositoryPath,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    source.repositoryPath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  const bindings = new Map<string, LocalImportBinding>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleSpecifier = statement.moduleSpecifier.text;
    if (!moduleSpecifier.startsWith(".")) continue;
    const clause = statement.importClause;
    if (clause.isTypeOnly) continue;

    if (clause.name) {
      bindings.set(clause.name.text, {
        localName: clause.name.text,
        importedName: "default",
        moduleSpecifier,
      });
    }

    const named = clause.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      if (element.isTypeOnly) continue;
      bindings.set(element.name.text, {
        localName: element.name.text,
        importedName: element.propertyName?.text ?? element.name.text,
        moduleSpecifier,
      });
    }
  }
  return bindings;
}

async function resolveLocalImport(
  state: GraphState,
  fromRepositoryPath: string,
  moduleSpecifier: string,
): Promise<ResolvedImport> {
  const candidates = localImportCandidates(
    fromRepositoryPath,
    moduleSpecifier,
    state.adapter.descriptor.sourceExtensions,
  );

  for (const candidate of candidates) {
    const cached = state.sources.get(candidate);
    if (cached) return { repositoryPath: candidate, source: cached, budgetBlocked: false };
  }

  if (state.sources.size >= state.request.maxFiles) {
    return {
      repositoryPath: candidates[0] ?? moduleSpecifier,
      budgetBlocked: true,
    };
  }

  for (const candidate of candidates) {
    try {
      const source = await readSource(state, candidate);
      return { repositoryPath: candidate, source, budgetBlocked: false };
    } catch {
      // Candidate probing is intentionally bounded to the advertised JSX extensions.
    }
  }
  return {
    repositoryPath: candidates[0] ?? moduleSpecifier,
    budgetBlocked: false,
  };
}

async function readSource(state: GraphState, repositoryPath: string): Promise<SourceSnapshot> {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const cached = state.sources.get(normalized);
  if (cached) return cached;
  const source = await state.provider.read(normalized);
  const normalizedSource: SourceSnapshot = {
    repositoryPath: normalizeRepositoryPath(source.repositoryPath),
    content: source.content,
    ...(source.version ? { version: source.version } : {}),
  };
  state.sources.set(normalizedSource.repositoryPath, normalizedSource);
  return normalizedSource;
}

function localImportCandidates(
  fromRepositoryPath: string,
  moduleSpecifier: string,
  sourceExtensions: readonly string[],
): string[] {
  const base = normalizeRepositoryPath(`${repositoryDirectory(fromRepositoryPath)}/${moduleSpecifier}`);
  const hasKnownExtension = sourceExtensions.some((extension) => base.endsWith(extension));
  const candidates = hasKnownExtension
    ? [base]
    : [
        ...sourceExtensions.map((extension) => `${base}${extension}`),
        ...sourceExtensions.map((extension) => `${base}/index${extension}`),
      ];
  return [...new Set(candidates.map(normalizeRepositoryPath))];
}

function shouldExpand(
  aliases: readonly string[],
  request: GraphState["request"],
): boolean {
  const stop = new Set(request.stopComponents ?? []);
  if (aliases.some((alias) => stop.has(alias))) return false;
  if (request.expansionMode === "all-local") return true;
  const include = new Set(request.expandComponents ?? []);
  return aliases.some((alias) => include.has(alias));
}

function createEdge(
  node: UiNode & { kind: "component" },
  fromRepositoryPath: string,
  fromExportName: string,
  binding: LocalImportBinding,
  depth: number,
  status: ScreenImportEdgeStatus,
  targetRepositoryPath?: string,
  reason?: string,
): ScreenImportGraphEdge {
  return {
    edgeId: `edge.${sanitizeId(fromRepositoryPath)}.${sanitizeId(node.id)}.${sanitizeId(binding.localName)}`,
    fromRepositoryPath,
    fromExportName,
    fromNodeId: node.id,
    localName: binding.localName,
    moduleSpecifier: binding.moduleSpecifier,
    importedName: binding.importedName,
    ...(targetRepositoryPath ? { targetRepositoryPath } : {}),
    status,
    depth,
    ...(reason ? { reason } : {}),
  };
}

function namespaceTree(node: UiNode, prefix: string): UiNode {
  return cloneNodeWithChildren(
    { ...node, id: `${prefix}.${node.id}` } as UiNode,
    node.children.map((child) => namespaceTree(child, prefix)),
  );
}

function cloneNodeWithChildren(node: UiNode, children: UiNode[]): UiNode {
  const base = {
    ...node,
    layout: { ...node.layout, sizing: { ...node.layout.sizing } },
    props: JSON.parse(JSON.stringify(node.props)) as Record<string, unknown>,
    ...(node.sourceBinding
      ? { sourceBinding: JSON.parse(JSON.stringify(node.sourceBinding)) }
      : {}),
    ...(node.sourceRegion ? { sourceRegion: { ...node.sourceRegion } } : {}),
    children,
  };
  return base as UiNode;
}

function pruneTree(node: UiNode, budget: number): PrunedTree {
  if (budget <= 0) return { count: 0, truncated: true };
  let remaining = budget - 1;
  let count = 1;
  let truncated = false;
  const children: UiNode[] = [];

  for (const child of node.children) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const pruned = pruneTree(child, remaining);
    if (pruned.node) children.push(pruned.node);
    remaining -= pruned.count;
    count += pruned.count;
    truncated ||= pruned.truncated;
  }

  return {
    node: cloneNodeWithChildren(node, children),
    count,
    truncated,
  };
}

function collectStats(root: UiNode): ScreenImportStats {
  const stats = {
    totalNodes: 0,
    editableNodes: 0,
    requiresBindingNodes: 0,
    readOnlyRegions: 0,
  };
  const visit = (node: UiNode): void => {
    stats.totalNodes += 1;
    const mode = node.sourceRegion?.mode;
    if (mode === "editable") stats.editableNodes += 1;
    else if (mode === "requires-binding") stats.requiresBindingNodes += 1;
    else if (mode === "read-only" || node.kind === "source-region") stats.readOnlyRegions += 1;
    node.children.forEach(visit);
  };
  visit(root);
  return stats;
}

function buildGraphResult(
  base: ScreenImportResult,
  state: GraphState,
  document: UiDocument | undefined,
): ScreenImportGraphResult {
  const graph: ScreenImportGraphBudget = {
    maxFiles: state.request.maxFiles,
    maxNodes: state.request.maxNodes,
    maxGraphDepth: state.request.maxGraphDepth,
    filesRead: state.sources.size,
    nodesMaterialized: state.nodesMaterialized,
    expandedComponents: state.expandedComponents,
    boundaries: state.boundaries,
    cycles: state.cycles,
    missingImports: state.missingImports,
    truncated: state.truncated,
  };
  return {
    ...base,
    ...(document ? { document } : {}),
    diagnostics: state.diagnostics,
    files: state.files.map((file) => ({ ...file })),
    edges: state.edges.map((edge) => ({ ...edge })),
    graph,
  };
}

function componentKey(repositoryPath: string, exportName: string): string {
  return `${normalizeRepositoryPath(repositoryPath)}#${exportName}`;
}

function normalizeRepositoryPath(value: string): string {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function repositoryDirectory(repositoryPath: string): string {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, ".").replace(/^\.+|\.+$/g, "") || "node";
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function cloneDiagnostic(diagnostic: AdapterDiagnostic): AdapterDiagnostic {
  return { ...diagnostic };
}
