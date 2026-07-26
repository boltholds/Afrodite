import type { Layout, SourceBinding } from "@afrodite/ui-ir";

export type FrameworkId = string;

export interface FrameworkCapabilities {
  readonly projectDetection: boolean;
  readonly staticIndexing: boolean;
  readonly runtimePreview: boolean;
  readonly sourcePatching: boolean;
  readonly propEditing: boolean;
}

export interface FrameworkDescriptor {
  readonly frameworkId: FrameworkId;
  readonly adapterId: string;
  readonly displayName: string;
  readonly adapterVersion: string;
  readonly sourceExtensions: readonly string[];
  readonly runtimePackages: readonly string[];
  readonly capabilities: FrameworkCapabilities;
}

export interface ProjectManifest {
  readonly projectRoot: string;
  readonly packageManager?: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly files?: readonly string[];
}

export interface FrameworkEvidence {
  readonly kind: "dependency" | "dev-dependency" | "file" | "configuration";
  readonly value: string;
  readonly weight: number;
}

export interface FrameworkDetection {
  readonly frameworkId: FrameworkId;
  readonly adapterId: string;
  readonly confidence: number;
  readonly matched: boolean;
  readonly evidence: readonly FrameworkEvidence[];
}

export interface SourceSnapshot {
  readonly repositoryPath: string;
  readonly content: string;
  readonly version?: string;
}

export interface VersionedSourceSnapshot extends SourceSnapshot {
  readonly version: string;
}

export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

export type AdapterDiagnosticSeverity = "info" | "warning" | "error";

export interface AdapterDiagnostic {
  readonly code: string;
  readonly severity: AdapterDiagnosticSeverity;
  readonly message: string;
  readonly repositoryPath?: string;
  readonly nodeId?: string;
}

export type FrameworkOperation = {
  readonly kind: "update-layout";
  readonly nodeId: string;
  readonly binding: SourceBinding;
  readonly before: Layout;
  readonly after: Layout;
};

export type SourcePatchOperationKind =
  | FrameworkOperation["kind"]
  | "install-stable-marker"
  | "update-style";

export interface VerificationStep {
  readonly kind: "format" | "typecheck" | "test" | "build" | "custom";
  readonly command: string;
  readonly cwd?: string;
  readonly required: boolean;
}

export interface SourcePatchPlan {
  readonly planId: string;
  readonly frameworkId: FrameworkId;
  readonly adapterId: string;
  readonly operation: SourcePatchOperationKind;
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly edits: readonly TextEdit[];
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly verification: readonly VerificationStep[];
  readonly requiresApproval: true;
}

export interface PatchPreview {
  readonly planId: string;
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface CreateSourcePatchPlanInput {
  readonly frameworkId: FrameworkId;
  readonly adapterId: string;
  readonly operation: SourcePatchOperationKind;
  readonly source: SourceSnapshot;
  readonly edits: readonly TextEdit[];
  readonly diagnostics?: readonly AdapterDiagnostic[];
  readonly verification?: readonly VerificationStep[];
}

export interface FrameworkAdapter {
  readonly descriptor: FrameworkDescriptor;
  detect(manifest: ProjectManifest): FrameworkDetection;
  planPatch?(operation: FrameworkOperation, source: SourceSnapshot): SourcePatchPlan;
}

export class FrameworkAdapterRegistry {
  readonly #adapters = new Map<string, FrameworkAdapter>();

  register(adapter: FrameworkAdapter): void {
    const id = adapter.descriptor.adapterId;
    if (this.#adapters.has(id)) throw new Error(`Framework adapter ${id} is already registered`);
    this.#adapters.set(id, adapter);
  }

  get(adapterId: string): FrameworkAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  list(): readonly FrameworkAdapter[] {
    return [...this.#adapters.values()].sort((left, right) =>
      left.descriptor.adapterId.localeCompare(right.descriptor.adapterId),
    );
  }

  detect(manifest: ProjectManifest): readonly FrameworkDetection[] {
    return this.list()
      .map((adapter) => adapter.detect(manifest))
      .filter((result) => result.matched)
      .sort((left, right) => right.confidence - left.confidence);
  }

  resolveForBinding(binding: SourceBinding): FrameworkAdapter | undefined {
    if (binding.adapterId) return this.get(binding.adapterId);
    if (!binding.frameworkId) return undefined;
    return this.list().find((adapter) => adapter.descriptor.frameworkId === binding.frameworkId);
  }
}

export function createDependencyDetection(
  descriptor: FrameworkDescriptor,
  manifest: ProjectManifest,
): FrameworkDetection {
  const evidence: FrameworkEvidence[] = [];
  for (const packageName of descriptor.runtimePackages) {
    if (manifest.dependencies[packageName]) {
      evidence.push({ kind: "dependency", value: packageName, weight: 1 });
    } else if (manifest.devDependencies[packageName]) {
      evidence.push({ kind: "dev-dependency", value: packageName, weight: 0.7 });
    }
  }
  const total = Math.max(1, descriptor.runtimePackages.length);
  const confidence = Math.min(1, evidence.reduce((sum, item) => sum + item.weight, 0) / total);
  return {
    frameworkId: descriptor.frameworkId,
    adapterId: descriptor.adapterId,
    confidence,
    matched: evidence.length > 0,
    evidence,
  };
}

export function createSourceVersion(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}:${content.length}`;
}

export function createSourcePatchPlan(input: CreateSourcePatchPlanInput): SourcePatchPlan {
  const sourceVersion = input.source.version ?? createSourceVersion(input.source.content);
  const edits = [...input.edits].sort((left, right) => left.start - right.start || left.end - right.end);
  const identity = [
    input.frameworkId,
    input.adapterId,
    input.operation,
    input.source.repositoryPath,
    sourceVersion,
    ...edits.map((edit) => `${edit.start}:${edit.end}:${createSourceVersion(edit.replacement)}`),
  ].join("|");
  return {
    planId: `patch:${createSourceVersion(identity).replace(/[:]/g, "-")}`,
    frameworkId: input.frameworkId,
    adapterId: input.adapterId,
    operation: input.operation,
    repositoryPath: input.source.repositoryPath,
    sourceVersion,
    edits,
    diagnostics: [...(input.diagnostics ?? [])],
    verification: [...(input.verification ?? [])],
    requiresApproval: true,
  };
}

export function validatePatchPlan(
  plan: SourcePatchPlan,
  source: SourceSnapshot,
): readonly AdapterDiagnostic[] {
  const diagnostics: AdapterDiagnostic[] = [];
  const sourceVersion = source.version ?? createSourceVersion(source.content);
  if (source.repositoryPath !== plan.repositoryPath) {
    diagnostics.push({
      code: "SOURCE_PATH_MISMATCH",
      severity: "error",
      message: `Patch targets ${plan.repositoryPath}, but the source snapshot is ${source.repositoryPath}.`,
      repositoryPath: source.repositoryPath,
    });
  }
  if (sourceVersion !== plan.sourceVersion) {
    diagnostics.push({
      code: "SOURCE_VERSION_MISMATCH",
      severity: "error",
      message: "The source changed after this patch was planned. Re-plan against the current file.",
      repositoryPath: source.repositoryPath,
    });
  }
  let previousEnd = -1;
  for (const edit of plan.edits) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end)) {
      diagnostics.push({
        code: "INVALID_EDIT_RANGE",
        severity: "error",
        message: "Text edit offsets must be integers.",
        repositoryPath: plan.repositoryPath,
      });
      continue;
    }
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.content.length) {
      diagnostics.push({
        code: "EDIT_OUT_OF_BOUNDS",
        severity: "error",
        message: `Text edit [${edit.start}, ${edit.end}) is outside the source bounds.`,
        repositoryPath: plan.repositoryPath,
      });
    }
    if (edit.start < previousEnd) {
      diagnostics.push({
        code: "OVERLAPPING_EDITS",
        severity: "error",
        message: "Patch edits overlap and cannot be applied deterministically.",
        repositoryPath: plan.repositoryPath,
      });
    }
    previousEnd = Math.max(previousEnd, edit.end);
  }
  return diagnostics;
}

export function applyTextEdits(content: string, edits: readonly TextEdit[]): string {
  let next = content;
  const descending = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  for (const edit of descending) {
    next = `${next.slice(0, edit.start)}${edit.replacement}${next.slice(edit.end)}`;
  }
  return next;
}

export function createPatchPreview(plan: SourcePatchPlan, source: SourceSnapshot): PatchPreview {
  const diagnostics = [...plan.diagnostics, ...validatePatchPlan(plan, source)];
  const blocked = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const after = blocked ? source.content : applyTextEdits(source.content, plan.edits);
  return {
    planId: plan.planId,
    repositoryPath: plan.repositoryPath,
    sourceVersion: source.version ?? createSourceVersion(source.content),
    before: source.content,
    after,
    changed: after !== source.content,
    diagnostics,
  };
}
