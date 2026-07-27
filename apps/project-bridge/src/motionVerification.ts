import type { PatchPreview, SourcePatchPlan } from "@afrodite/framework-core";
import type { MotionPatchOperation } from "@afrodite/motion-core";
import {
  createMotionCssFingerprint,
  motionVerificationManifestSchema,
  type MotionVerificationActivation,
  type MotionVerificationManifest,
  type MotionVerificationScenario,
} from "@afrodite/protocol/motion-verification";
import type { AnimationClip } from "@afrodite/ui-ir";

export function createMotionVerificationManifest(input: {
  readonly operation: MotionPatchOperation;
  readonly plan: SourcePatchPlan;
  readonly preview: PatchPreview;
  readonly challenge: string;
}): MotionVerificationManifest {
  const managedIds = [...input.operation.ownership.managedClipIds];
  if (managedIds.length > 8) {
    throw new Error("Runtime motion verification supports at most eight managed clips per plan.");
  }
  const managed = input.operation.after
    .filter((clip) => managedIds.includes(clip.id))
    .map(cloneClip);
  const cssRegion = extractGeneratedMotionRegion(input.preview.after, input.operation.nodeId) ?? "";
  return motionVerificationManifestSchema.parse({
    version: 1,
    planId: input.plan.planId,
    sourceVersion: input.plan.sourceVersion,
    nodeId: input.operation.nodeId,
    className: input.operation.ownership.className,
    managedClipIds: managedIds,
    clips: managed,
    cssRegion,
    cssFingerprint: createMotionCssFingerprint(cssRegion),
    challenge: input.challenge,
    scenarios: createScenarios(input.operation.ownership.className, managed),
  });
}

export function extractGeneratedMotionRegion(
  stylesheet: string,
  nodeId: string,
): string | undefined {
  const startMarker = `/* afrodite-motion:${nodeId}:start */`;
  const endMarker = `/* afrodite-motion:${nodeId}:end */`;
  const start = stylesheet.indexOf(startMarker);
  if (start < 0) return undefined;
  const endStart = stylesheet.indexOf(endMarker, start + startMarker.length);
  if (endStart < 0) return undefined;
  const end = endStart + endMarker.length;
  if (stylesheet.indexOf(startMarker, start + startMarker.length) >= 0
    || stylesheet.indexOf(endMarker, end) >= 0) {
    throw new Error(`Generated motion region for ${nodeId} is ambiguous.`);
  }
  return stylesheet.slice(start, end);
}

function createScenarios(
  className: string,
  clips: readonly AnimationClip[],
): MotionVerificationScenario[] {
  const enabled = clips
    .filter((clip) => clip.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (enabled.length === 0) {
    return [{
      scenarioId: "baseline",
      selector: `.${className}`,
      activation: { hover: false, focus: false },
      activeClipIds: [],
      sampleTimesMs: [0],
    }];
  }

  const groups = new Map<string, {
    readonly scenarioId: string;
    readonly selector: string;
    readonly activation: MotionVerificationActivation;
    readonly clips: AnimationClip[];
  }>();
  for (const clip of enabled) {
    const descriptor = scenarioDescriptor(className, clip);
    const current = groups.get(descriptor.scenarioId);
    if (current) current.clips.push(clip);
    else groups.set(descriptor.scenarioId, { ...descriptor, clips: [clip] });
  }

  return [...groups.values()]
    .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
    .map((group) => ({
      scenarioId: group.scenarioId,
      selector: group.selector,
      activation: group.activation,
      activeClipIds: group.clips
        .slice()
        .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
        .map((clip) => clip.id),
      sampleTimesMs: sampleTimes(group.clips),
    }));
}

function scenarioDescriptor(
  className: string,
  clip: AnimationClip,
): {
  readonly scenarioId: string;
  readonly selector: string;
  readonly activation: MotionVerificationActivation;
} {
  const base = `.${className}`;
  switch (clip.trigger.type) {
    case "mount":
      return {
        scenarioId: "mount",
        selector: base,
        activation: { hover: false, focus: false },
      };
    case "hover":
      return {
        scenarioId: "hover",
        selector: `${base}:hover`,
        activation: { hover: true, focus: false },
      };
    case "focus":
      return {
        scenarioId: "focus",
        selector: `${base}:focus`,
        activation: { hover: false, focus: true },
      };
    case "state": {
      const suffix = slug(clip.trigger.state);
      return {
        scenarioId: `state-${suffix}`,
        selector: `${base}[data-state=${JSON.stringify(clip.trigger.state)}]`,
        activation: { hover: false, focus: false, state: clip.trigger.state },
      };
    }
    case "click":
    case "manual":
      throw new Error(`Unsupported runtime verification trigger ${clip.trigger.type}.`);
  }
}

function sampleTimes(clips: readonly AnimationClip[]): number[] {
  const values = new Set<number>([0]);
  for (const clip of clips) {
    const { delayMs, durationMs, iterations } = clip.timeline;
    values.add(delayMs);
    values.add(delayMs + durationMs / 2);
    values.add(delayMs + durationMs * iterations);
  }
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length <= 12) return sorted;
  const last = sorted.at(-1)!;
  const bounded = sorted.slice(0, 11);
  if (!bounded.includes(last)) bounded.push(last);
  return bounded;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "state";
}

function cloneClip(clip: AnimationClip): AnimationClip {
  return JSON.parse(JSON.stringify(clip)) as AnimationClip;
}
