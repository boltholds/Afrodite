import type {
  SemanticOperationCommand,
  SemanticPlanView,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import {
  parseUiDocument,
  type Layout,
  type SourceBinding,
  type UiDocument,
  type UiNode,
  type UiVariants,
} from "@afrodite/ui-ir";

export const AGENT_GATEWAY_TOOL_NAMES = [
  "list_semantic_operations",
  "inspect_policy",
  "inspect_ui_document",
  "plan_semantic_operation",
  "request_human_approval",
  "get_approval_request",
] as const;

export type AgentGatewayToolName = typeof AGENT_GATEWAY_TOOL_NAMES[number];

export interface AgentGatewayPolicy {
  readonly policyId: string;
  readonly allowedTools: readonly AgentGatewayToolName[];
  readonly maxInspectionDepth: number;
  readonly maxInspectionNodes: number;
  readonly maxSourcePlans: number;
  readonly maxDiffCharacters: number;
  readonly approvalRequestTtlMs: number;
}

export const DEFAULT_AGENT_GATEWAY_POLICY: AgentGatewayPolicy = Object.freeze({
  policyId: "afrodite.agent.read-plan-request.v1",
  allowedTools: AGENT_GATEWAY_TOOL_NAMES,
  maxInspectionDepth: 8,
  maxInspectionNodes: 250,
  maxSourcePlans: 8,
  maxDiffCharacters: 80_000,
  approvalRequestTtlMs: 15 * 60_000,
});

export interface SemanticOperationDescriptor {
  readonly type: SemanticOperationCommand["type"];
  readonly mutatesDocument: boolean;
  readonly mayPlanSource: boolean;
  readonly summary: string;
  readonly safetyBoundary: string;
}

export const SEMANTIC_OPERATION_CATALOG: readonly SemanticOperationDescriptor[] = Object.freeze([
  {
    type: "convert_to_grid",
    mutatesDocument: true,
    mayPlanSource: true,
    summary: "Convert one explicitly targeted node to semantic grid layout.",
    safetyBoundary: "Requires an existing node ID; source planning additionally requires a stable binding and explicit ownership.",
  },
  {
    type: "create_responsive_variant",
    mutatesDocument: true,
    mayPlanSource: true,
    summary: "Add one responsive layout override with an explicit pixel range.",
    safetyBoundary: "Never replaces an existing variant ID and never creates runtime state or conditions.",
  },
  {
    type: "replace_spacing_with_token",
    mutatesDocument: true,
    mayPlanSource: true,
    summary: "Remap an already-owned gap or padding property to an existing design-token scope.",
    safetyBoundary: "Cannot take ownership of handwritten CSS or create a token migration implicitly.",
  },
  {
    type: "explain_unpatchable_region",
    mutatesDocument: false,
    mayPlanSource: false,
    summary: "Explain why one source-backed region is read-only or not patchable.",
    safetyBoundary: "Informational only; no document mutation and no source plan.",
  },
]);

export interface AgentDocumentProvider {
  readDocument(): Promise<UiDocument>;
}

export interface AgentSemanticPlanner {
  planSemanticOperation(
    document: UiDocument,
    command: SemanticOperationCommand,
  ): Promise<SemanticPlanView>;
}

export interface AgentGatewayDependencies {
  readonly documentProvider: AgentDocumentProvider;
  readonly semanticPlanner: AgentSemanticPlanner;
  readonly policy?: AgentGatewayPolicy;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

export interface AgentGatewayCallContext {
  readonly actor: string;
  readonly sessionId?: string;
}

export interface AgentPolicyView {
  readonly policyId: string;
  readonly allowedTools: readonly AgentGatewayToolName[];
  readonly deniedCapabilities: readonly string[];
  readonly limits: {
    readonly maxInspectionDepth: number;
    readonly maxInspectionNodes: number;
    readonly maxSourcePlans: number;
    readonly maxDiffCharacters: number;
    readonly approvalRequestTtlMs: number;
  };
}

export interface AgentDocumentInspectionRequest {
  readonly nodeId?: string;
  readonly maxDepth?: number;
}

export interface AgentSourceBindingView {
  readonly frameworkId?: string;
  readonly adapterId?: string;
  readonly repositoryPath: string;
  readonly exportName?: string;
  readonly stableMarker?: string;
  readonly styleStrategy?: SourceBinding["styleOwnership"] extends infer T
    ? T extends { strategy: infer S }
      ? S
      : never
    : never;
  readonly managedProperties?: readonly string[];
}

export interface AgentSourceRegionView {
  readonly mode: "editable" | "requires-binding" | "read-only";
  readonly regionKind: string;
  readonly repositoryPath: string;
  readonly exportName?: string;
  readonly line: number;
  readonly column: number;
  readonly reason?: string;
}

export interface AgentNodeView {
  readonly id: string;
  readonly name: string;
  readonly kind: UiNode["kind"];
  readonly element?: string;
  readonly component?: string;
  readonly layout: Layout;
  readonly variants?: UiVariants;
  readonly propKeys: readonly string[];
  readonly binding?: AgentSourceBindingView;
  readonly sourceRegion?: AgentSourceRegionView;
  readonly children: readonly AgentNodeView[];
  readonly omittedChildren: number;
}

export interface AgentDocumentInspection {
  readonly documentId: string;
  readonly documentVersion: string;
  readonly root: AgentNodeView;
  readonly returnedNodes: number;
  readonly truncated: boolean;
  readonly redactions: readonly string[];
}

export interface AgentPlannedOperation {
  readonly command: SemanticOperationCommand;
  readonly plan: SemanticPlanView;
  readonly approvalEligible: boolean;
  readonly policyId: string;
}

export interface AgentApprovalRequest {
  readonly requestId: string;
  readonly status: "pending" | "expired";
  readonly actor: string;
  readonly sessionId?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly semanticPlanId: string;
  readonly documentVersion: string;
  readonly command: SemanticOperationCommand;
  readonly rationale?: string;
  readonly sourcePlans: readonly {
    readonly planId: string;
    readonly repositoryPath: string;
    readonly sourceVersion: string;
    readonly changed: boolean;
  }[];
  readonly humanAction: string;
}

export interface AgentGatewayAuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly sessionId?: string;
  readonly tool: AgentGatewayToolName;
  readonly outcome: "succeeded" | "denied" | "failed";
  readonly detail: string;
}

export class AgentGatewayPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentGatewayPolicyError";
    this.code = code;
  }
}

export class PolicyControlledAgentGateway {
  readonly #documentProvider: AgentDocumentProvider;
  readonly #semanticPlanner: AgentSemanticPlanner;
  readonly #policy: AgentGatewayPolicy;
  readonly #now: () => number;
  readonly #idFactory: () => string;
  readonly #plans = new Map<string, AgentPlannedOperation>();
  readonly #approvals = new Map<string, AgentApprovalRequest>();
  readonly #audit: AgentGatewayAuditEvent[] = [];

  constructor(dependencies: AgentGatewayDependencies) {
    this.#documentProvider = dependencies.documentProvider;
    this.#semanticPlanner = dependencies.semanticPlanner;
    this.#policy = normalizePolicy(dependencies.policy ?? DEFAULT_AGENT_GATEWAY_POLICY);
    this.#now = dependencies.now ?? Date.now;
    this.#idFactory = dependencies.idFactory ?? randomId;
  }

  listSemanticOperations(context: AgentGatewayCallContext): readonly SemanticOperationDescriptor[] {
    this.#authorize("list_semantic_operations", context);
    this.#record("list_semantic_operations", context, "succeeded", "Returned the constrained semantic-operation catalog.");
    return SEMANTIC_OPERATION_CATALOG.map((entry) => ({ ...entry }));
  }

  inspectPolicy(context: AgentGatewayCallContext): AgentPolicyView {
    this.#authorize("inspect_policy", context);
    this.#record("inspect_policy", context, "succeeded", "Returned the active gateway policy without secrets.");
    return {
      policyId: this.#policy.policyId,
      allowedTools: [...this.#policy.allowedTools],
      deniedCapabilities: [
        "filesystem access",
        "shell or process execution",
        "source-file reads outside project bridge plans",
        "patch application",
        "transaction application",
        "approval decisions",
        "binding or ownership invention",
      ],
      limits: {
        maxInspectionDepth: this.#policy.maxInspectionDepth,
        maxInspectionNodes: this.#policy.maxInspectionNodes,
        maxSourcePlans: this.#policy.maxSourcePlans,
        maxDiffCharacters: this.#policy.maxDiffCharacters,
        approvalRequestTtlMs: this.#policy.approvalRequestTtlMs,
      },
    };
  }

  async inspectDocument(
    request: AgentDocumentInspectionRequest,
    context: AgentGatewayCallContext,
  ): Promise<AgentDocumentInspection> {
    this.#authorize("inspect_ui_document", context);
    const document = parseUiDocument(await this.#documentProvider.readDocument());
    const selected = request.nodeId ? findNode(document.root, request.nodeId) : document.root;
    if (!selected) {
      this.#record("inspect_ui_document", context, "failed", `Node ${request.nodeId} was not found.`);
      throw new AgentGatewayPolicyError("AGENT_NODE_NOT_FOUND", `Node ${request.nodeId} was not found.`);
    }

    const maxDepth = Math.min(
      Math.max(request.maxDepth ?? this.#policy.maxInspectionDepth, 0),
      this.#policy.maxInspectionDepth,
    );
    const budget = { remaining: this.#policy.maxInspectionNodes, returned: 0, truncated: false };
    const root = inspectNode(selected, 0, maxDepth, budget);
    this.#record(
      "inspect_ui_document",
      context,
      "succeeded",
      `Returned ${budget.returned} sanitized nodes${budget.truncated ? " with truncation" : ""}.`,
    );
    return {
      documentId: document.id,
      documentVersion: createSemanticDocumentVersion(document),
      root,
      returnedNodes: budget.returned,
      truncated: budget.truncated,
      redactions: [
        "prop values are omitted; only prop keys are returned",
        "source excerpts and source contents are omitted",
        "bridge credentials and filesystem roots are never exposed",
      ],
    };
  }

  async planSemanticOperation(
    command: SemanticOperationCommand,
    context: AgentGatewayCallContext,
  ): Promise<AgentPlannedOperation> {
    this.#authorize("plan_semantic_operation", context);
    const document = parseUiDocument(await this.#documentProvider.readDocument());
    let plan: SemanticPlanView;
    try {
      plan = await this.#semanticPlanner.planSemanticOperation(document, command);
    } catch (error) {
      this.#record(
        "plan_semantic_operation",
        context,
        "failed",
        error instanceof Error ? error.message : "Semantic planning failed.",
      );
      throw error;
    }

    if (plan.sourcePlans.length > this.#policy.maxSourcePlans) {
      this.#record("plan_semantic_operation", context, "denied", "The plan exceeds the source-plan policy limit.");
      throw new AgentGatewayPolicyError(
        "AGENT_SOURCE_PLAN_LIMIT_EXCEEDED",
        `The dry run created ${plan.sourcePlans.length} source plans; policy allows ${this.#policy.maxSourcePlans}.`,
      );
    }
    const diffCharacters = plan.sourcePlans.reduce((total, source) => total + source.diff.length, 0);
    if (diffCharacters > this.#policy.maxDiffCharacters) {
      this.#record("plan_semantic_operation", context, "denied", "The plan exceeds the diff-size policy limit.");
      throw new AgentGatewayPolicyError(
        "AGENT_DIFF_LIMIT_EXCEEDED",
        `The dry-run diff contains ${diffCharacters} characters; policy allows ${this.#policy.maxDiffCharacters}.`,
      );
    }

    const result: AgentPlannedOperation = {
      command: cloneJson(command),
      plan: cloneJson(plan),
      approvalEligible: plan.status === "ready" && (
        plan.documentAfter !== undefined || plan.sourcePlans.some((source) => source.changed)
      ),
      policyId: this.#policy.policyId,
    };
    this.#plans.set(plan.planId, result);
    this.#record(
      "plan_semantic_operation",
      context,
      "succeeded",
      `Stored dry-run semantic plan ${plan.planId}; no mutation or write was performed.`,
    );
    return cloneJson(result);
  }

  requestHumanApproval(
    semanticPlanId: string,
    rationale: string | undefined,
    context: AgentGatewayCallContext,
  ): AgentApprovalRequest {
    this.#authorize("request_human_approval", context);
    this.#expireApprovals();
    const planned = this.#plans.get(semanticPlanId);
    if (!planned) {
      this.#record("request_human_approval", context, "failed", `Semantic plan ${semanticPlanId} is not in this session.`);
      throw new AgentGatewayPolicyError(
        "AGENT_PLAN_NOT_FOUND",
        "The semantic plan is missing or belongs to another gateway process. Run a new dry run first.",
      );
    }
    if (!planned.approvalEligible) {
      this.#record("request_human_approval", context, "denied", "The semantic plan has no applicable reviewed effect.");
      throw new AgentGatewayPolicyError(
        "AGENT_PLAN_NOT_APPROVAL_ELIGIBLE",
        "Blocked, informational, and no-op plans cannot create an approval request.",
      );
    }

    const createdAtMs = this.#now();
    const request: AgentApprovalRequest = {
      requestId: `approval_${this.#idFactory()}`,
      status: "pending",
      actor: context.actor,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.#policy.approvalRequestTtlMs).toISOString(),
      semanticPlanId,
      documentVersion: planned.plan.documentVersion,
      command: cloneJson(planned.command),
      ...(rationale?.trim() ? { rationale: rationale.trim() } : {}),
      sourcePlans: planned.plan.sourcePlans.map((source) => ({
        planId: source.planId,
        repositoryPath: source.repositoryPath,
        sourceVersion: source.sourceVersion,
        changed: source.changed,
      })),
      humanAction: "Review the semantic document mutation and every exact source diff in Afrodite Studio. The agent gateway cannot approve or apply them.",
    };
    this.#approvals.set(request.requestId, request);
    this.#record("request_human_approval", context, "succeeded", `Created pending request ${request.requestId}.`);
    return cloneJson(request);
  }

  getApprovalRequest(
    requestId: string,
    context: AgentGatewayCallContext,
  ): AgentApprovalRequest {
    this.#authorize("get_approval_request", context);
    this.#expireApprovals();
    const request = this.#approvals.get(requestId);
    if (!request) {
      this.#record("get_approval_request", context, "failed", `Approval request ${requestId} was not found.`);
      throw new AgentGatewayPolicyError("AGENT_APPROVAL_NOT_FOUND", `Approval request ${requestId} was not found.`);
    }
    this.#record("get_approval_request", context, "succeeded", `Returned status ${request.status} for ${requestId}.`);
    return cloneJson(request);
  }

  listAuditEvents(): readonly AgentGatewayAuditEvent[] {
    return this.#audit.map((event) => ({ ...event }));
  }

  #authorize(tool: AgentGatewayToolName, context: AgentGatewayCallContext): void {
    if (this.#policy.allowedTools.includes(tool)) return;
    this.#record(tool, context, "denied", `Tool ${tool} is disabled by policy ${this.#policy.policyId}.`);
    throw new AgentGatewayPolicyError(
      "AGENT_TOOL_DENIED",
      `Tool ${tool} is disabled by policy ${this.#policy.policyId}.`,
    );
  }

  #record(
    tool: AgentGatewayToolName,
    context: AgentGatewayCallContext,
    outcome: AgentGatewayAuditEvent["outcome"],
    detail: string,
  ): void {
    this.#audit.push({
      eventId: `audit_${this.#idFactory()}`,
      occurredAt: new Date(this.#now()).toISOString(),
      actor: context.actor,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      tool,
      outcome,
      detail,
    });
    if (this.#audit.length > 1_000) this.#audit.splice(0, this.#audit.length - 1_000);
  }

  #expireApprovals(): void {
    const now = this.#now();
    for (const [id, request] of this.#approvals) {
      if (request.status === "pending" && Date.parse(request.expiresAt) <= now) {
        this.#approvals.set(id, { ...request, status: "expired" });
      }
    }
  }
}

function normalizePolicy(policy: AgentGatewayPolicy): AgentGatewayPolicy {
  const allowed = policy.allowedTools.filter((tool, index, values) => values.indexOf(tool) === index);
  return Object.freeze({
    policyId: policy.policyId,
    allowedTools: allowed,
    maxInspectionDepth: positiveInteger(policy.maxInspectionDepth, "maxInspectionDepth"),
    maxInspectionNodes: positiveInteger(policy.maxInspectionNodes, "maxInspectionNodes"),
    maxSourcePlans: positiveInteger(policy.maxSourcePlans, "maxSourcePlans"),
    maxDiffCharacters: positiveInteger(policy.maxDiffCharacters, "maxDiffCharacters"),
    approvalRequestTtlMs: positiveInteger(policy.approvalRequestTtlMs, "approvalRequestTtlMs"),
  });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function inspectNode(
  node: UiNode,
  depth: number,
  maxDepth: number,
  budget: { remaining: number; returned: number; truncated: boolean },
): AgentNodeView {
  budget.remaining -= 1;
  budget.returned += 1;
  const canDescend = depth < maxDepth && budget.remaining > 0;
  const children: AgentNodeView[] = [];
  if (canDescend) {
    for (const child of node.children) {
      if (budget.remaining <= 0) {
        budget.truncated = true;
        break;
      }
      children.push(inspectNode(child, depth + 1, maxDepth, budget));
    }
  } else if (node.children.length > 0) {
    budget.truncated = true;
  }

  const omittedChildren = Math.max(node.children.length - children.length, 0);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    ...(node.kind === "element" ? { element: node.element } : {}),
    ...(node.kind === "component" ? { component: node.component } : {}),
    layout: cloneJson(node.layout),
    ...(node.variants ? { variants: cloneJson(node.variants) } : {}),
    propKeys: Object.keys(node.props).sort(),
    ...(node.sourceBinding ? { binding: bindingView(node.sourceBinding) } : {}),
    ...(node.sourceRegion
      ? {
          sourceRegion: {
            mode: node.sourceRegion.mode,
            regionKind: node.sourceRegion.regionKind,
            repositoryPath: node.sourceRegion.repositoryPath,
            ...(node.sourceRegion.exportName ? { exportName: node.sourceRegion.exportName } : {}),
            line: node.sourceRegion.line,
            column: node.sourceRegion.column,
            ...(node.sourceRegion.reason ? { reason: node.sourceRegion.reason } : {}),
          },
        }
      : {}),
    children,
    omittedChildren,
  };
}

function bindingView(binding: SourceBinding): AgentSourceBindingView {
  const ownership = binding.styleOwnership;
  return {
    ...(binding.frameworkId ? { frameworkId: binding.frameworkId } : {}),
    ...(binding.adapterId ? { adapterId: binding.adapterId } : {}),
    repositoryPath: binding.repositoryPath,
    ...(binding.exportName ? { exportName: binding.exportName } : {}),
    ...(binding.stableMarker ? { stableMarker: binding.stableMarker } : {}),
    ...(ownership
      ? {
          styleStrategy: ownership.strategy,
          managedProperties: [...ownership.managedProperties],
        }
      : {}),
  };
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function randomId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
