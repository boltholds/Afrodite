import ts from "typescript";
import {
  createSourcePatchPlan,
  createSourceVersion,
  type AdapterDiagnostic,
  type FrameworkDescriptor,
  type SourcePatchPlan,
  type SourceSnapshot,
  type VerificationStep,
} from "@afrodite/framework-core";
import type { SourceBinding } from "@afrodite/ui-ir";

export type BindingMarkerState = "missing" | "static" | "dynamic" | "duplicate";

export interface BindingDiscoveryRequest {
  readonly repositoryPath: string;
  readonly exportName?: string;
  readonly componentId?: string;
}

export interface BindingCandidate {
  readonly candidateId: string;
  readonly repositoryPath: string;
  readonly elementName: string;
  readonly line: number;
  readonly column: number;
  readonly start: number;
  readonly end: number;
  readonly snippet: string;
  readonly markerState: BindingMarkerState;
  readonly existingMarker?: string;
  readonly patchable: boolean;
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface BindingDiscoveryResult {
  readonly frameworkId: string;
  readonly adapterId: string;
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly candidates: readonly BindingCandidate[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface StableMarkerPatchRequest {
  readonly nodeId: string;
  readonly repositoryPath: string;
  readonly candidateId: string;
  readonly stableMarker: string;
  readonly expectedSourceVersion: string;
  readonly exportName?: string;
  readonly componentId?: string;
}

export interface StableMarkerPatchResult {
  readonly plan: SourcePatchPlan;
  readonly proposedBinding: SourceBinding;
  readonly sourceWriteRequired: boolean;
}

export interface SourceBindingAdapter {
  readonly descriptor: FrameworkDescriptor;
  discoverCandidates(
    request: BindingDiscoveryRequest,
    source: SourceSnapshot,
  ): BindingDiscoveryResult;
  planStableMarker(
    request: StableMarkerPatchRequest,
    source: SourceSnapshot,
  ): StableMarkerPatchResult;
}

export interface CreateJsxBindingAdapterOptions {
  readonly descriptor: FrameworkDescriptor;
  readonly verification: readonly VerificationStep[];
  readonly rejectUseServer?: boolean;
  readonly markerAttribute?: string;
}

export class SourceBindingAdapterRegistry {
  readonly #adapters = new Map<string, SourceBindingAdapter>();

  register(adapter: SourceBindingAdapter): void {
    const id = adapter.descriptor.adapterId;
    if (this.#adapters.has(id)) {
      throw new Error(`Source binding adapter ${id} is already registered`);
    }
    this.#adapters.set(id, adapter);
  }

  get(adapterId: string): SourceBindingAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  list(): readonly SourceBindingAdapter[] {
    return [...this.#adapters.values()].sort((left, right) =>
      left.descriptor.adapterId.localeCompare(right.descriptor.adapterId),
    );
  }
}

export function createJsxSourceBindingAdapter(
  options: CreateJsxBindingAdapterOptions,
): SourceBindingAdapter {
  const markerAttribute = options.markerAttribute ?? "data-afrodite-id";

  return {
    descriptor: options.descriptor,
    discoverCandidates: (request, source) => discoverJsxBindingCandidates(
      options.descriptor,
      request,
      source,
      markerAttribute,
      options.rejectUseServer ?? false,
    ),
    planStableMarker: (request, source) => planJsxStableMarker(
      options.descriptor,
      request,
      source,
      options.verification,
      markerAttribute,
      options.rejectUseServer ?? false,
    ),
  };
}

export function discoverJsxBindingCandidates(
  descriptor: FrameworkDescriptor,
  request: BindingDiscoveryRequest,
  source: SourceSnapshot,
  markerAttribute = "data-afrodite-id",
  rejectUseServer = false,
): BindingDiscoveryResult {
  const diagnostics: AdapterDiagnostic[] = [];
  const sourceVersion = source.version ?? createSourceVersion(source.content);

  if (request.repositoryPath !== source.repositoryPath) {
    diagnostics.push({
      code: "BINDING_SOURCE_PATH_MISMATCH",
      severity: "error",
      message: `Binding discovery requested ${request.repositoryPath}, but received ${source.repositoryPath}.`,
      repositoryPath: source.repositoryPath,
    });
  }

  if (!descriptor.sourceExtensions.some((extension) => source.repositoryPath.endsWith(extension))) {
    diagnostics.push({
      code: "BINDING_SOURCE_EXTENSION_UNSUPPORTED",
      severity: "error",
      message: `${descriptor.displayName} does not advertise ${extensionOf(source.repositoryPath)} as a source extension.`,
      repositoryPath: source.repositoryPath,
    });
  }

  const sourceFile = createSourceFile(source);
  if (rejectUseServer && hasDirective(sourceFile, "use server")) {
    diagnostics.push({
      code: "SERVER_MODULE_NOT_BINDABLE",
      severity: "error",
      message: "Modules marked with use server cannot receive browser UI stable markers.",
      repositoryPath: source.repositoryPath,
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      frameworkId: descriptor.frameworkId,
      adapterId: descriptor.adapterId,
      repositoryPath: source.repositoryPath,
      sourceVersion,
      candidates: [],
      diagnostics,
    };
  }

  const candidates: BindingCandidate[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      candidates.push(createCandidate(node, sourceFile, source.repositoryPath, markerAttribute));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {
    frameworkId: descriptor.frameworkId,
    adapterId: descriptor.adapterId,
    repositoryPath: source.repositoryPath,
    sourceVersion,
    candidates,
    diagnostics,
  };
}

export function planJsxStableMarker(
  descriptor: FrameworkDescriptor,
  request: StableMarkerPatchRequest,
  source: SourceSnapshot,
  verification: readonly VerificationStep[],
  markerAttribute = "data-afrodite-id",
  rejectUseServer = false,
): StableMarkerPatchResult {
  const diagnostics: AdapterDiagnostic[] = [];
  const sourceVersion = source.version ?? createSourceVersion(source.content);

  if (request.repositoryPath !== source.repositoryPath) {
    diagnostics.push({
      code: "BINDING_SOURCE_PATH_MISMATCH",
      severity: "error",
      message: `Binding targets ${request.repositoryPath}, but the current snapshot is ${source.repositoryPath}.`,
      repositoryPath: source.repositoryPath,
      nodeId: request.nodeId,
    });
  }

  if (request.expectedSourceVersion !== sourceVersion) {
    diagnostics.push({
      code: "BINDING_SOURCE_VERSION_MISMATCH",
      severity: "error",
      message: "The source changed after candidate discovery. Discover candidates again.",
      repositoryPath: source.repositoryPath,
      nodeId: request.nodeId,
    });
  }

  if (!isValidStableMarker(request.stableMarker)) {
    diagnostics.push({
      code: "INVALID_STABLE_MARKER",
      severity: "error",
      message: "Stable markers must be 1-200 characters using letters, digits, dots, underscores, colons, slashes, hashes, and hyphens.",
      repositoryPath: source.repositoryPath,
      nodeId: request.nodeId,
    });
  }

  const discovery = discoverJsxBindingCandidates(
    descriptor,
    { repositoryPath: request.repositoryPath },
    source,
    markerAttribute,
    rejectUseServer,
  );
  diagnostics.push(...discovery.diagnostics);
  const candidate = discovery.candidates.find((item) => item.candidateId === request.candidateId);

  if (!candidate) {
    diagnostics.push({
      code: "BINDING_CANDIDATE_NOT_FOUND",
      severity: "error",
      message: "The selected JSX candidate no longer exists at the reviewed source offsets.",
      repositoryPath: source.repositoryPath,
      nodeId: request.nodeId,
    });
  }

  const duplicateMarker = discovery.candidates.find(
    (item) => item.candidateId !== request.candidateId && item.existingMarker === request.stableMarker,
  );
  if (duplicateMarker) {
    diagnostics.push({
      code: "STABLE_MARKER_ALREADY_USED",
      severity: "error",
      message: `The marker ${request.stableMarker} is already used at line ${duplicateMarker.line}.`,
      repositoryPath: source.repositoryPath,
      nodeId: request.nodeId,
    });
  }

  const edits: { start: number; end: number; replacement: string }[] = [];
  let sourceWriteRequired = false;

  if (candidate) {
    diagnostics.push(...candidate.diagnostics.map((diagnostic) => ({ ...diagnostic, nodeId: request.nodeId })));

    if (!candidate.patchable) {
      diagnostics.push({
        code: "BINDING_CANDIDATE_NOT_PATCHABLE",
        severity: "error",
        message: "The selected JSX element has ambiguous or dynamic stable-marker ownership.",
        repositoryPath: source.repositoryPath,
        nodeId: request.nodeId,
      });
    } else if (candidate.existingMarker) {
      if (candidate.existingMarker !== request.stableMarker) {
        diagnostics.push({
          code: "DIFFERENT_STABLE_MARKER_PRESENT",
          severity: "error",
          message: `The selected element already owns marker ${candidate.existingMarker}; Afrodite will not replace it automatically.`,
          repositoryPath: source.repositoryPath,
          nodeId: request.nodeId,
        });
      } else {
        diagnostics.push({
          code: "STABLE_MARKER_ALREADY_INSTALLED",
          severity: "info",
          message: "The selected element already contains the requested stable marker.",
          repositoryPath: source.repositoryPath,
          nodeId: request.nodeId,
        });
      }
    } else if (!diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      edits.push({
        start: markerInsertionOffset(candidate, source.content),
        end: markerInsertionOffset(candidate, source.content),
        replacement: ` ${markerAttribute}="${request.stableMarker}"`,
      });
      sourceWriteRequired = true;
    }
  }

  const proposedBinding: SourceBinding = {
    frameworkId: descriptor.frameworkId,
    adapterId: descriptor.adapterId,
    repositoryPath: request.repositoryPath,
    stableMarker: request.stableMarker,
    ...(request.exportName ? { exportName: request.exportName } : {}),
    ...(request.componentId ? { componentId: request.componentId } : {}),
  };

  return {
    plan: createSourcePatchPlan({
      frameworkId: descriptor.frameworkId,
      adapterId: descriptor.adapterId,
      operation: "install-stable-marker",
      source,
      edits,
      diagnostics,
      verification,
    }),
    proposedBinding,
    sourceWriteRequired,
  };
}

function createCandidate(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  repositoryPath: string,
  markerAttribute: string,
): BindingCandidate {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const location = sourceFile.getLineAndCharacterOfPosition(start);
  const markerAttributes = node.attributes.properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === markerAttribute,
  );
  const diagnostics: AdapterDiagnostic[] = [];
  let markerState: BindingMarkerState = "missing";
  let existingMarker: string | undefined;

  if (markerAttributes.length > 1) {
    markerState = "duplicate";
    diagnostics.push({
      code: "DUPLICATE_STABLE_MARKER_ATTRIBUTE",
      severity: "error",
      message: `The JSX element declares ${markerAttribute} more than once.`,
      repositoryPath,
    });
  } else if (markerAttributes.length === 1) {
    const value = staticJsxAttributeValue(markerAttributes[0]!);
    if (value === undefined) {
      markerState = "dynamic";
      diagnostics.push({
        code: "DYNAMIC_STABLE_MARKER_ATTRIBUTE",
        severity: "error",
        message: `${markerAttribute} is dynamic and cannot be claimed safely.`,
        repositoryPath,
      });
    } else {
      markerState = "static";
      existingMarker = value;
    }
  }

  const candidate: BindingCandidate = {
    candidateId: `${repositoryPath}:jsx:${start}:${end}`,
    repositoryPath,
    elementName: node.tagName.getText(sourceFile),
    line: location.line + 1,
    column: location.character + 1,
    start,
    end,
    snippet: sourceFile.text.slice(start, end).replace(/\s+/g, " ").slice(0, 220),
    markerState,
    patchable: markerState === "missing" || markerState === "static",
    diagnostics,
  };

  return existingMarker === undefined ? candidate : { ...candidate, existingMarker };
}

function staticJsxAttributeValue(attribute: ts.JsxAttribute): string | undefined {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return undefined;
}

function createSourceFile(source: SourceSnapshot): ts.SourceFile {
  const lower = source.repositoryPath.toLowerCase();
  const kind = lower.endsWith(".jsx")
    ? ts.ScriptKind.JSX
    : lower.endsWith(".js")
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TSX;
  return ts.createSourceFile(
    source.repositoryPath,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  return sourceFile.statements.some((statement) =>
    ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression)
    && statement.expression.text === directive
  );
}

function markerInsertionOffset(candidate: BindingCandidate, content: string): number {
  const suffix = content.slice(Math.max(candidate.start, candidate.end - 3), candidate.end);
  return suffix.endsWith("/>") ? candidate.end - 2 : candidate.end - 1;
}

function isValidStableMarker(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$/.test(value);
}

function extensionOf(repositoryPath: string): string {
  const match = repositoryPath.match(/(\.[A-Za-z0-9]+)$/);
  return match?.[1] ?? "an extensionless file";
}
