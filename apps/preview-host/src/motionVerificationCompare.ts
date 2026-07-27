import type {
  MotionVerificationDifference,
  MotionVerificationMatrix,
  MotionVerificationStyle,
} from "@afrodite/protocol/motion-verification";

export function compareMotionVerificationStyles(
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

export function parseMotionMatrix(value: string): MotionVerificationMatrix {
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
