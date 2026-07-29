import type { UiNode } from "@afrodite/ui-ir";

export interface GefestRuntimeDescriptor {
  readonly tagName: string;
  readonly classNames: readonly string[];
  readonly path: string;
  readonly id?: string;
  readonly role?: string;
  readonly ariaLabel?: string;
  readonly text?: string;
  readonly marker?: string;
}

export interface GefestRuntimeTarget {
  readonly descriptor: GefestRuntimeDescriptor;
  readonly ancestors: readonly GefestRuntimeDescriptor[];
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
}

export type GefestPreviewMessage =
  | {
      readonly type: "afrodite.preview.ready";
      readonly version: 1;
      readonly marker: string;
      readonly inspectEnabled: boolean;
      readonly viewport: GefestRuntimeTarget["viewport"];
    }
  | {
      readonly type: "afrodite.preview.hover";
      readonly target: GefestRuntimeTarget | null;
    }
  | {
      readonly type: "afrodite.preview.select";
      readonly target: GefestRuntimeTarget;
    };

export function decodeGefestPreviewMessage(input: unknown): GefestPreviewMessage | null {
  if (!isRecord(input) || typeof input.type !== "string") {
    return null;
  }

  if (input.type === "afrodite.preview.ready") {
    const viewport = decodeViewport(input.viewport);
    if (
      input.version !== 1
      || typeof input.marker !== "string"
      || typeof input.inspectEnabled !== "boolean"
      || !viewport
    ) {
      return null;
    }
    return {
      type: input.type,
      version: 1,
      marker: input.marker,
      inspectEnabled: input.inspectEnabled,
      viewport,
    };
  }

  if (input.type === "afrodite.preview.hover") {
    if (input.target === null) {
      return { type: input.type, target: null };
    }
    const target = decodeRuntimeTarget(input.target);
    return target ? { type: input.type, target } : null;
  }

  if (input.type === "afrodite.preview.select") {
    const target = decodeRuntimeTarget(input.target);
    return target ? { type: input.type, target } : null;
  }

  return null;
}

export function findBestRuntimeNode(root: UiNode, target: GefestRuntimeTarget): UiNode {
  const nodes = flattenNodes(root);
  const direct = bestCandidate(nodes, target.descriptor);
  if (direct && direct.score >= 8) {
    return direct.node;
  }

  for (const ancestor of target.ancestors) {
    const candidate = bestCandidate(nodes, ancestor);
    if (candidate && candidate.score >= 12) {
      return candidate.node;
    }
  }

  const marker = target.descriptor.marker
    ?? target.ancestors.find((ancestor) => ancestor.marker)?.marker;
  if (marker) {
    const marked = nodes.find(({ node }) =>
      node.sourceBinding?.stableMarker === marker
      || node.props["data-afrodite-id"] === marker
    );
    if (marked) {
      return marked.node;
    }
  }

  return direct?.node ?? root;
}

function bestCandidate(
  nodes: readonly { readonly node: UiNode; readonly depth: number }[],
  descriptor: GefestRuntimeDescriptor,
): { readonly node: UiNode; readonly score: number; readonly depth: number } | undefined {
  return nodes
    .map(({ node, depth }) => ({ node, depth, score: scoreNode(node, descriptor) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.depth - left.depth)[0];
}

function scoreNode(node: UiNode, descriptor: GefestRuntimeDescriptor): number {
  let score = 0;
  const tagName = descriptor.tagName.toLowerCase();
  const props = node.props;
  const source = normalize(`${node.name} ${node.sourceRegion?.excerpt ?? ""} ${stringProps(props)}`);

  if (
    descriptor.marker
    && (node.sourceBinding?.stableMarker === descriptor.marker || props["data-afrodite-id"] === descriptor.marker)
  ) {
    score += 120;
  }

  if (node.kind === "element" && node.element.toLowerCase() === tagName) {
    score += 8;
  }
  if (node.kind === "component" && normalize(node.component) === normalize(tagName)) {
    score += 3;
  }

  if (descriptor.id && props.id === descriptor.id) {
    score += 24;
  }
  if (descriptor.role && props.role === descriptor.role) {
    score += 16;
  }
  if (
    descriptor.ariaLabel
    && (props["aria-label"] === descriptor.ariaLabel || source.includes(normalize(descriptor.ariaLabel)))
  ) {
    score += 24;
  }

  const nodeClasses = classNamesFromProps(props);
  for (const className of descriptor.classNames) {
    if (nodeClasses.has(className)) {
      score += 9;
    } else if (source.includes(normalize(className))) {
      score += 3;
    }
  }

  if (descriptor.text) {
    const text = normalize(descriptor.text);
    if (text && normalize(node.name) === text) {
      score += 22;
    } else if (text && source.includes(text)) {
      score += 14;
    } else if (text.length >= 4 && normalize(descriptor.path).includes(normalize(node.name))) {
      score += 4;
    }
  }

  if (node.sourceRegion?.mode === "editable") {
    score += 1;
  }
  return score;
}

function classNamesFromProps(props: Readonly<Record<string, unknown>>): Set<string> {
  const value = typeof props.className === "string"
    ? props.className
    : typeof props.class === "string"
      ? props.class
      : "";
  return new Set(value.split(/\s+/).filter(Boolean));
}

function stringProps(props: Readonly<Record<string, unknown>>): string {
  return Object.values(props)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function flattenNodes(node: UiNode, depth = 0): { readonly node: UiNode; readonly depth: number }[] {
  return [
    { node, depth },
    ...node.children.flatMap((child) => flattenNodes(child, depth + 1)),
  ];
}

function decodeRuntimeTarget(input: unknown): GefestRuntimeTarget | null {
  if (!isRecord(input)) {
    return null;
  }
  const descriptor = decodeDescriptor(input.descriptor);
  const rect = decodeRect(input.rect);
  const viewport = decodeViewport(input.viewport);
  if (!descriptor || !rect || !viewport || !Array.isArray(input.ancestors)) {
    return null;
  }
  const ancestors = input.ancestors.map(decodeDescriptor);
  if (ancestors.some((ancestor) => ancestor === null)) {
    return null;
  }
  return {
    descriptor,
    ancestors: ancestors as GefestRuntimeDescriptor[],
    rect,
    viewport,
  };
}

function decodeDescriptor(input: unknown): GefestRuntimeDescriptor | null {
  if (
    !isRecord(input)
    || typeof input.tagName !== "string"
    || typeof input.path !== "string"
    || !Array.isArray(input.classNames)
    || !input.classNames.every((value) => typeof value === "string")
  ) {
    return null;
  }
  const optionalStrings = ["id", "role", "ariaLabel", "text", "marker"] as const;
  if (optionalStrings.some((key) => input[key] !== undefined && typeof input[key] !== "string")) {
    return null;
  }
  return {
    tagName: input.tagName,
    classNames: input.classNames,
    path: input.path,
    ...(typeof input.id === "string" ? { id: input.id } : {}),
    ...(typeof input.role === "string" ? { role: input.role } : {}),
    ...(typeof input.ariaLabel === "string" ? { ariaLabel: input.ariaLabel } : {}),
    ...(typeof input.text === "string" ? { text: input.text } : {}),
    ...(typeof input.marker === "string" ? { marker: input.marker } : {}),
  };
}

function decodeRect(input: unknown): GefestRuntimeTarget["rect"] | null {
  if (!isRecord(input)) {
    return null;
  }
  const values = [input.x, input.y, input.width, input.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }
  if ((input.width as number) < 0 || (input.height as number) < 0) {
    return null;
  }
  return {
    x: input.x as number,
    y: input.y as number,
    width: input.width as number,
    height: input.height as number,
  };
}

function decodeViewport(input: unknown): GefestRuntimeTarget["viewport"] | null {
  if (
    !isRecord(input)
    || typeof input.width !== "number"
    || typeof input.height !== "number"
    || !Number.isFinite(input.width)
    || !Number.isFinite(input.height)
    || input.width <= 0
    || input.height <= 0
  ) {
    return null;
  }
  return { width: input.width, height: input.height };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
