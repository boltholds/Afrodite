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

export interface VerificationStep {
  readonly kind: "format" | "typecheck" | "test" | "build" | "custom";
  readonly command: string;
  readonly cwd?: string;
  readonly required: boolean;
}

export interface SourcePatchPlan {
  readonly frameworkId: FrameworkId;
  readonly adapterId: string;
  readonly operation: FrameworkOperation["kind"];
  readonly repositoryPath: string;
  readonly sourceVersion?: string;
  readonly edits: readonly TextEdit[];
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly verification: readonly VerificationStep[];
  readonly requiresApproval: true;
}

export interface FrameworkAdapter {
  readonly descriptor: FrameworkDescriptor;
  detect(manifest: ProjectManifest): FrameworkDetection;
  planPatch?(
    operation: FrameworkOperation,
    source: SourceSnapshot,
  ): SourcePatchPlan;
}

export class FrameworkAdapterRegistry {
  readonly #adapters = new Map<string, FrameworkAdapter>();

  register(adapter: FrameworkAdapter): void {
    const id = adapter.descriptor.adapterId;
    if (this.#adapters.has(id)) {
      throw new Error(`Framework adapter ${id} is already registered`);
    }
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
    return this.list().find(
      (adapter) => adapter.descriptor.frameworkId === binding.frameworkId,
    );
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
