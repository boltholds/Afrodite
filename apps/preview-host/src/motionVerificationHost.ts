import { resolveMotionComposition } from "@afrodite/canvas-engine/motion";
import {
  createMotionCssFingerprint,
  decodeMotionVerificationMessage,
  motionVerificationResultSchema,
  type MotionVerificationDifference,
  type MotionVerificationManifest,
  type MotionVerificationMatrix,
  type MotionVerificationResult,
  type MotionVerificationSample,
  type MotionVerificationStyle,
} from "@afrodite/protocol/motion-verification";

let queue = Promise.resolve();

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = decodeMotionVerificationMessage(event.data);
  if (!message || message.type !== "verify-motion") return;
  queue = queue.then(async () => {
    const result = await verifyMotion(message.requestId, message.manifest);
    window.parent.postMessage(result, "*");
  });
});

export async function verifyMotion(
  requestId: string,
  manifest: MotionVerificationManifest,
): Promise<MotionVerificationResult> {
  const diagnostics: MotionVerificationResult["diagnostics"][number][] = [];
  const samples: MotionVerificationSample[] = [];
  const evidenceId = `motion-evidence.${requestId}`;

  try {
    validateCss(manifest);
    if (typeof Element.prototype.getAnimations !== "function") {
      diagnostics.push({
        code: "RUNTIME_API_UNAVAILABLE",
        severity: "error",
        message: "This browser does not expose Element.getAnimations(), so deterministic CSS animation sampling is unavailable.",
      });
      return result(false);
    }

    const mount = createFixture(manifest);
    try {
      for (const scenario of manifest.scenarios) {
        await activateScenario(mount.fixture, scenario.activation);
        const animations = mount.fixture.getAnimations();
        animations.forEach((animation) => animation.pause());

        for (const sampleTimeMs of scenario.sampleTimesMs) {
          try {
            animations.forEach((animation) => {
              animation.currentTime = sampleTimeMs;
              animation.pause();
            });
            await nextFrame();
            const expectedResolved = resolveMotionComposition(
              manifest.clips,
              sampleTimeMs,
              new Set(scenario.activeClipIds),
            );
            const expected = computedSnapshot(mount.expectedProbe, expectedResolved);
            const actual = readComputedStyle(mount.fixture);
            const differences = compareStyles(
              expected,
              actual,
              scenario.activeClipIds.length,
              animations.length,
            );
            samples.push({
              scenarioId: scenario.scenarioId,
              sampleTimeMs,
              expectedAnimationCount: scenario.activeClipIds.length,
              actualAnimationCount: animations.length,
              expected,
              actual,
              matched: differences.length === 0,
              differences,
            });
          } catch (error) {
            diagnostics.push({
              code: "SAMPLE_FAILED",
              severity: "error",
              message: error instanceof Error ? error.message : "Motion sample failed.",
              scenarioId: scenario.scenarioId,
              sampleTimeMs,
            });
          }
        }
      }
    } finally {
      mount.host.remove();
    }

    for (const scenario of manifest.scenarios) {
      if (samples.some((sample) => sample.scenarioId === scenario.scenarioId && !sample.matched)) {
        diagnostics.push({
          code: "STYLE_MISMATCH",
          severity: "error",
          message: `Computed motion styles differ from the semantic compositor in scenario ${scenario.scenarioId}.`,
          scenarioId: scenario.scenarioId,
        });
      }
    }
    return result(
      diagnostics.every((diagnostic) => diagnostic.severity !== "error")
        && samples.length === manifest.scenarios.reduce((total, scenario) => total + scenario.sampleTimesMs.length, 0)
        && samples.every((sample) => sample.matched),
    );
  } catch (error) {
    diagnostics.push({
      code: error instanceof CssFingerprintError ? "CSS_FINGERPRINT_MISMATCH" : "INVALID_MANIFEST",
      severity: "error",
      message: error instanceof Error ? error.message : "Motion verification manifest is invalid.",
    });
    return result(false);
  }

  function result(ok: boolean): MotionVerificationResult {
    return motionVerificationResultSchema.parse({
      channel: "afrodite.motion-verification.v1",
      type: "motion-verification-result",
      requestId,
      evidenceId,
      planId: manifest.planId,
      sourceVersion: manifest.sourceVersion,
      cssFingerprint: manifest.cssFingerprint,
      challenge: manifest.challenge,
      hostVersion: 1,
      ok,
      samples,
      diagnostics,
    });
  }
}

interface FixtureMount {
  readonly host: HTMLElement;
  readonly fixture: HTMLDivElement;
  readonly expectedProbe: HTMLDivElement;
}

function createFixture(manifest: MotionVerificationManifest): FixtureMount {
  const host = document.createElement("section");
  host.dataset.afroditeMotionVerification = manifest.planId;
  host.style.position = "fixed";
  host.style.inset = "auto 16px 16px auto";
  host.style.width = "240px";
  host.style.height = "160px";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483647";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = verificationCss(manifest.cssRegion);
  const fixture = document.createElement("div");
  fixture.className = manifest.className;
  fixture.tabIndex = 0;
  fixture.textContent = "Afrodite motion fixture";
  applyBaseline(fixture);
  const expectedProbe = document.createElement("div");
  expectedProbe.setAttribute("aria-hidden", "true");
  applyBaseline(expectedProbe);
  expectedProbe.style.position = "absolute";
  expectedProbe.style.visibility = "hidden";
  shadow.append(style, fixture, expectedProbe);
  document.body.append(host);
  return { host, fixture, expectedProbe };
}

async function activateScenario(
  fixture: HTMLDivElement,
  activation: MotionVerificationManifest["scenarios"][number]["activation"],
): Promise<void> {
  fixture.removeAttribute("data-afrodite-verify-hover");
  fixture.removeAttribute("data-afrodite-verify-focus");
  fixture.removeAttribute("data-state");
  fixture.blur();
  if (activation.hover) fixture.setAttribute("data-afrodite-verify-hover", "true");
  if (activation.focus) {
    fixture.setAttribute("data-afrodite-verify-focus", "true");
    fixture.focus({ preventScroll: true });
  }
  if (activation.state) fixture.setAttribute("data-state", activation.state);
  await nextFrame();
  await nextFrame();
}

function validateCss(manifest: MotionVerificationManifest): void {
  if (createMotionCssFingerprint(manifest.cssRegion) !== manifest.cssFingerprint) {
    throw new CssFingerprintError("The exact CSS region does not match the plan fingerprint.");
  }
  if (manifest.cssRegion.length > 100_000) throw new Error("Motion verification CSS exceeds the sandbox limit.");
  if (/(@import\b|url\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|data-afrodite-verify)/i.test(manifest.cssRegion)) {
    throw new Error("Motion verification CSS contains a forbidden external-resource or verification-control construct.");
  }
  const startMarker = `/* afrodite-motion:${manifest.nodeId}:start */`;
  const endMarker = `/* afrodite-motion:${manifest.nodeId}:end */`;
  if (manifest.cssRegion && (!manifest.cssRegion.startsWith(startMarker) || !manifest.cssRegion.endsWith(endMarker))) {
    throw new Error("Motion verification CSS is not the exact generated ownership region for this node.");
  }
}

function verificationCss(cssRegion: string): string {
  return cssRegion
    .replaceAll(":hover", "[data-afrodite-verify-hover=\"true\"]")
    .replaceAll(":focus", "[data-afrodite-verify-focus=\"true\"]");
}

function applyBaseline(element: HTMLDivElement): void {
  element.style.width = "160px";
  element.style.height = "96px";
  element.style.display = "grid";
  element.style.placeItems = "center";
  element.style.opacity = "1";
  element.style.transform = "none";
  element.style.borderRadius = "0px";
  element.style.backgroundColor = "transparent";
  element.style.color = "white";
}

function computedSnapshot(
  probe: HTMLDivElement,
  resolved: ReturnType<typeof resolveMotionComposition>,
): MotionVerificationStyle {
  probe.style.opacity = String(resolved.opacity ?? 1);
  probe.style.transform = `translate(${resolved.translateX ?? 0}px, ${resolved.translateY ?? 0}px) scale(${resolved.scale ?? 1}) rotate(${resolved.rotate ?? 0}deg)`;
  probe.style.borderRadius = `${resolved.borderRadius ?? 0}px`;
  probe.style.backgroundColor = resolved.backgroundColor ?? "transparent";
  return readComputedStyle(probe);
}

function readComputedStyle(element: Element): MotionVerificationStyle {
  const computed = getComputedStyle(element);
  return {
    opacity: finite(Number(computed.opacity), 1),
    transform: parseMatrix(computed.transform),
    borderRadius: Math.max(0, finite(Number.parseFloat(computed.borderTopLeftRadius), 0)),
    backgroundColor: computed.backgroundColor,
  };
}

export function compareStyles(
  expected: MotionVerificationStyle,
  actual: MotionVerificationStyle,
  expectedAnimationCount: number,
  actualAnimationCount: number,
): MotionVerificationDifference[] {
  const differences: MotionVerificationDifference[] = [];
  const opacityDelta = Math.abs(expected.opacity - actual.opacity);
  if (opacityDelta > 0.02) differences.push({
    property: "opacity",
    expected: String(expected.opacity),
    actual: String(actual.opacity),
    delta: opacityDelta,
    tolerance: 0.02,
  });

  const linearDelta = Math.max(
    Math.abs(expected.transform.a - actual.transform.a),
    Math.abs(expected.transform.b - actual.transform.b),
    Math.abs(expected.transform.c - actual.transform.c),
    Math.abs(expected.transform.d - actual.transform.d),
  );
  const translationDelta = Math.max(
    Math.abs(expected.transform.e - actual.transform.e),
    Math.abs(expected.transform.f - actual.transform.f),
  );
  if (linearDelta > 0.02 || translationDelta > 0.5) differences.push({
    property: "transform",
    expected: matrixText(expected.transform),
    actual: matrixText(actual.transform),
    delta: Math.max(linearDelta, translationDelta),
    tolerance: linearDelta > 0.02 ? 0.02 : 0.5,
  });

  const radiusDelta = Math.abs(expected.borderRadius - actual.borderRadius);
  if (radiusDelta > 0.5) differences.push({
    property: "borderRadius",
    expected: String(expected.borderRadius),
    actual: String(actual.borderRadius),
    delta: radiusDelta,
    tolerance: 0.5,
  });

  if (expected.backgroundColor !== actual.backgroundColor) differences.push({
    property: "backgroundColor",
    expected: expected.backgroundColor,
    actual: actual.backgroundColor,
  });

  if (expectedAnimationCount !== actualAnimationCount) differences.push({
    property: "animationCount",
    expected: String(expectedAnimationCount),
    actual: String(actualAnimationCount),
  });
  return differences;
}

export function parseMatrix(value: string): MotionVerificationMatrix {
  if (!value || value === "none") return identityMatrix();
  const matrix = value.match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const values = matrix[1]!.split(",").map((entry) => Number(entry.trim()));
    if (values.length === 6 && values.every(Number.isFinite)) {
      return { a: values[0]!, b: values[1]!, c: values[2]!, d: values[3]!, e: values[4]!, f: values[5]! };
    }
  }
  const matrix3d = value.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3d) {
    const values = matrix3d[1]!.split(",").map((entry) => Number(entry.trim()));
    if (values.length === 16 && values.every(Number.isFinite)) {
      return { a: values[0]!, b: values[1]!, c: values[4]!, d: values[5]!, e: values[12]!, f: values[13]! };
    }
  }
  throw new Error(`Unsupported computed transform matrix: ${value}`);
}

function identityMatrix(): MotionVerificationMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function matrixText(matrix: MotionVerificationMatrix): string {
  return `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

class CssFingerprintError extends Error {}
