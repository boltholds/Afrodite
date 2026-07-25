import type { PatchPreview } from "@afrodite/framework-core";

export interface UnifiedDiffOptions {
  readonly contextLines?: number;
  readonly beforeLabel?: string;
  readonly afterLabel?: string;
}

export function createUnifiedDiff(
  preview: Pick<PatchPreview, "repositoryPath" | "before" | "after">,
  options: UnifiedDiffOptions = {},
): string {
  const beforeLines = preview.before.split("\n");
  const afterLines = preview.after.split("\n");
  const context = Math.max(0, options.contextLines ?? 3);
  const prefix = commonPrefixLength(beforeLines, afterLines);
  const suffix = commonSuffixLength(beforeLines, afterLines, prefix);

  const beforeChangeEnd = beforeLines.length - suffix;
  const afterChangeEnd = afterLines.length - suffix;
  const hunkStart = Math.max(0, prefix - context);
  const beforeHunkEnd = Math.min(beforeLines.length, beforeChangeEnd + context);
  const afterHunkEnd = Math.min(afterLines.length, afterChangeEnd + context);
  const beforeLabel = options.beforeLabel ?? `a/${preview.repositoryPath}`;
  const afterLabel = options.afterLabel ?? `b/${preview.repositoryPath}`;

  const output = [`--- ${beforeLabel}`, `+++ ${afterLabel}`];
  if (preview.before === preview.after) return `${output.join("\n")}\n`;

  output.push(
    `@@ -${hunkStart + 1},${beforeHunkEnd - hunkStart} +${hunkStart + 1},${afterHunkEnd - hunkStart} @@`,
  );

  for (let index = hunkStart; index < prefix; index += 1) {
    output.push(` ${beforeLines[index] ?? ""}`);
  }
  for (let index = prefix; index < beforeChangeEnd; index += 1) {
    output.push(`-${beforeLines[index] ?? ""}`);
  }
  for (let index = prefix; index < afterChangeEnd; index += 1) {
    output.push(`+${afterLines[index] ?? ""}`);
  }

  const suffixContext = Math.min(
    context,
    beforeLines.length - beforeChangeEnd,
    afterLines.length - afterChangeEnd,
  );
  for (let offset = 0; offset < suffixContext; offset += 1) {
    output.push(` ${beforeLines[beforeChangeEnd + offset] ?? ""}`);
  }

  return `${output.join("\n")}\n`;
}

function commonPrefixLength(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(
  left: readonly string[],
  right: readonly string[],
  prefixLength: number,
): number {
  const available = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (
    length < available
    && left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}
