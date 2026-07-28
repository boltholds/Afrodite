import {
  createEffect,
  createSignal,
  ErrorBoundary,
  For,
  onCleanup,
  onMount,
  Show,
  type Component as SolidComponent,
  type JSX,
} from "solid-js";
import { Dynamic, render } from "solid-js/web";
import React, {
  type ComponentType as ReactComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { reactFrameworkDescriptor } from "@afrodite/adapter-react";
import { solidFrameworkDescriptor } from "@afrodite/adapter-solid";
import {
  createPreviewReadyMessage,
  createPreviewRenderResult,
  decodePreviewMessage,
  type PreviewDiagnostic,
  type PreviewRuntime,
} from "@afrodite/protocol";
import type { Layout, UiNode } from "@afrodite/ui-ir";
import { ActionCard } from "../../../packages/indexer-react/test/fixtures/react-app/src/ActionCard";
import { ContextBadge } from "../../../packages/indexer-react/test/fixtures/react-app/src/ContextBadge";
import { Button } from "../../../packages/project-indexer/test/fixtures/solid-app/src/Button";
import Panel from "../../../packages/project-indexer/test/fixtures/solid-app/src/Panel";
import "./styles.css";

type SolidRegistryComponent = SolidComponent<Record<string, unknown>>;
type ReactRegistryComponent = ReactComponentType<Record<string, unknown>>;

interface PreviewRuntimeAdapter {
  readonly runtime: PreviewRuntime;
  has(componentKey: string): boolean;
  render(
    componentKey: string,
    componentProps: Record<string, unknown>,
    onError: (error: unknown) => void,
  ): JSX.Element;
}

const solidComponentRegistry: Readonly<Record<string, SolidRegistryComponent>> = {
  "solid:src/Button.tsx#Button": Button as unknown as SolidRegistryComponent,
  "solid:src/Panel.tsx#default": Panel as unknown as SolidRegistryComponent,
  "solid:Button": Button as unknown as SolidRegistryComponent,
  "solid:Panel": Panel as unknown as SolidRegistryComponent,
};

const reactComponentRegistry: Readonly<Record<string, ReactRegistryComponent>> = {
  "react:src/ActionCard.tsx#ActionCard": ActionCard as unknown as ReactRegistryComponent,
  "react:src/ContextBadge.tsx#ContextBadge": ContextBadge as unknown as ReactRegistryComponent,
  "react:ActionCard": ActionCard as unknown as ReactRegistryComponent,
  "react:ContextBadge": ContextBadge as unknown as ReactRegistryComponent,
};

const runtimeAdapters: readonly PreviewRuntimeAdapter[] = [
  {
    runtime: {
      frameworkId: solidFrameworkDescriptor.frameworkId,
      adapterId: solidFrameworkDescriptor.adapterId,
      adapterVersion: solidFrameworkDescriptor.adapterVersion,
    },
    has: (componentKey) => Boolean(solidComponentRegistry[componentKey]),
    render: (componentKey, componentProps) => (
      <Dynamic
        component={solidComponentRegistry[componentKey]!}
        {...componentProps}
      />
    ),
  },
  {
    runtime: {
      frameworkId: reactFrameworkDescriptor.frameworkId,
      adapterId: reactFrameworkDescriptor.adapterId,
      adapterVersion: reactFrameworkDescriptor.adapterVersion,
    },
    has: (componentKey) => Boolean(reactComponentRegistry[componentKey]),
    render: (componentKey, componentProps, onError) => (
      <ReactRuntimeMount
        component={reactComponentRegistry[componentKey]!}
        componentProps={componentProps}
        onError={onError}
      />
    ),
  },
] as const;

const runtimeAdapterMap = new Map(
  runtimeAdapters.map((adapter) => [adapter.runtime.frameworkId, adapter] as const),
);
const previewRuntimes = runtimeAdapters.map((adapter) => adapter.runtime);

function PreviewHost() {
  const [rootNode, setRootNode] = createSignal<UiNode>();
  const [requestId, setRequestId] = createSignal("waiting");
  const [diagnostics, setDiagnostics] = createSignal<readonly PreviewDiagnostic[]>([]);

  const reportRuntimeFailure = (node: UiNode, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic: PreviewDiagnostic = {
      code: "RENDER_FAILED",
      severity: "error",
      message,
      nodeId: node.id,
      componentName: node.kind === "component" ? node.component : undefined,
      frameworkId: frameworkId(node),
    };

    setDiagnostics((current) => {
      if (current.some((item) => item.code === diagnostic.code
        && item.nodeId === diagnostic.nodeId
        && item.message === diagnostic.message)) {
        return current;
      }
      const next = [...current, diagnostic];
      window.parent.postMessage(createPreviewRenderResult(requestId(), next), "*");
      return next;
    });
  };

  onMount(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const message = decodePreviewMessage(event.data);
      if (!message || message.type !== "render") return;

      const nextDiagnostics = collectDiagnostics(message.node);
      setRootNode(message.node);
      setRequestId(message.requestId);
      setDiagnostics(nextDiagnostics);
      window.parent.postMessage(
        createPreviewRenderResult(message.requestId, nextDiagnostics),
        "*",
      );
    };

    const announceReady = () => window.parent.postMessage(
      createPreviewReadyMessage(previewRuntimes),
      "*",
    );
    window.addEventListener("message", handleMessage);
    announceReady();
    const readyTimer = window.setTimeout(announceReady, 120);

    onCleanup(() => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("message", handleMessage);
    });
  });

  return (
    <div class="preview-shell">
      <header class="preview-status">
        <div>
          <strong>Afrodite Runtime Preview</strong>
          <span>opaque-origin iframe · SolidJS + React runtime adapters</span>
        </div>
        <code>{requestId()}</code>
      </header>

      <main class="preview-stage">
        <Show
          when={rootNode()}
          fallback={
            <div class="preview-empty">
              <span>READY</span>
              <p>Waiting for a validated UI IR render request.</p>
            </div>
          }
        >
          {(node) => (
            <ErrorBoundary
              fallback={(error) => (
                <RenderFailure
                  error={error}
                  requestId={requestId()}
                  existingDiagnostics={diagnostics()}
                  onReport={setDiagnostics}
                />
              )}
            >
              <RuntimeNode
                node={node()}
                onRuntimeError={reportRuntimeFailure}
              />
            </ErrorBoundary>
          )}
        </Show>
      </main>

      <Show when={diagnostics().length > 0}>
        <footer class="preview-diagnostics">
          <For each={diagnostics()}>
            {(diagnostic) => (
              <p>
                <code>{diagnostic.code}</code>
                {diagnostic.message}
              </p>
            )}
          </For>
        </footer>
      </Show>
    </div>
  );
}

function RenderFailure(props: {
  error: unknown;
  requestId: string;
  existingDiagnostics: readonly PreviewDiagnostic[];
  onReport: (diagnostics: readonly PreviewDiagnostic[]) => void;
}) {
  const message = () => props.error instanceof Error ? props.error.message : String(props.error);

  onMount(() => {
    const nextDiagnostics: PreviewDiagnostic[] = [
      ...props.existingDiagnostics,
      {
        code: "RENDER_FAILED",
        severity: "error",
        message: message(),
      },
    ];
    props.onReport(nextDiagnostics);
    window.parent.postMessage(
      createPreviewRenderResult(props.requestId, nextDiagnostics),
      "*",
    );
  });

  return (
    <div class="runtime-error">
      <strong>Render failed</strong>
      <p>{message()}</p>
    </div>
  );
}

function RuntimeNode(props: {
  node: UiNode;
  onRuntimeError: (node: UiNode, error: unknown) => void;
}) {
  const framework = () => frameworkId(props.node);
  const adapter = () => runtimeAdapterMap.get(framework());
  const key = () => componentKeyForFramework(props.node, framework());
  const registered = () => Boolean(adapter()?.has(key()));
  const renderableAdapter = () => {
    const candidate = adapter();
    return candidate && registered() ? candidate : undefined;
  };

  return (
    <div
      classList={{
        "runtime-node": true,
        "runtime-component": props.node.kind === "component",
      }}
      data-node-id={props.node.id}
      data-framework={framework()}
      style={layoutStyle(props.node.layout)}
    >
      <Show
        when={props.node.kind === "component"}
        fallback={
          <For each={props.node.children}>
            {(child) => (
              <RuntimeNode node={child} onRuntimeError={props.onRuntimeError} />
            )}
          </For>
        }
      >
        <Show
          when={renderableAdapter()}
          keyed
          fallback={
            <div class="missing-component">
              Missing {framework()} component: {props.node.kind === "component" ? props.node.component : "unknown"}
            </div>
          }
        >
          {(resolvedAdapter) => (
            <>
              {resolvedAdapter.render(
                key(),
                props.node.props,
                (error) => props.onRuntimeError(props.node, error),
              )}
              <For each={props.node.children}>
                {(child) => (
                  <RuntimeNode node={child} onRuntimeError={props.onRuntimeError} />
                )}
              </For>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
}

function ReactRuntimeMount(props: {
  component: ReactRegistryComponent;
  componentProps: Record<string, unknown>;
  onError: (error: unknown) => void;
}) {
  let host!: HTMLDivElement;
  let root: ReactRoot | undefined;

  onMount(() => {
    root = createRoot(host);
    createEffect(() => {
      const component = props.component;
      const componentProps = props.componentProps;
      root?.render(
        React.createElement(
          ReactPreviewBoundary,
          {
            key: stablePropsKey(componentProps),
            onError: props.onError,
          },
          React.createElement(component, componentProps),
        ),
      );
    });
  });

  onCleanup(() => root?.unmount());
  return <div ref={host} class="react-runtime-root" />;
}

class ReactPreviewBoundary extends React.Component<{
  onError: (error: unknown) => void;
  children?: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return React.createElement(
        "div",
        { className: "runtime-error" },
        "React component failed to render.",
      );
    }
    return this.props.children;
  }
}

function stablePropsKey(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "unserializable-props";
  }
}

function frameworkId(node: UiNode): string {
  if (node.sourceBinding?.frameworkId) return node.sourceBinding.frameworkId;
  if (node.kind !== "component") return solidFrameworkDescriptor.frameworkId;

  const matches = runtimeAdapters.filter((adapter) =>
    adapter.has(componentKeyForFramework(node, adapter.runtime.frameworkId)),
  );
  return matches.length === 1
    ? matches[0]!.runtime.frameworkId
    : solidFrameworkDescriptor.frameworkId;
}

function componentKeyForFramework(node: UiNode, framework: string): string {
  if (node.kind !== "component") return "";
  const binding = node.sourceBinding;
  if (!binding) return `${framework}:${node.component}`;
  return `${framework}:${binding.repositoryPath}#${binding.exportName ?? node.component}`;
}

function collectDiagnostics(node: UiNode): PreviewDiagnostic[] {
  const diagnostics: PreviewDiagnostic[] = [];
  const framework = frameworkId(node);
  const adapter = runtimeAdapterMap.get(framework);
  const key = componentKeyForFramework(node, framework);

  if (node.kind === "component" && !adapter) {
    diagnostics.push({
      code: "FRAMEWORK_NOT_SUPPORTED",
      severity: "error",
      message: `The preview host has no runtime adapter for ${framework}.`,
      nodeId: node.id,
      componentName: node.component,
      frameworkId: framework,
    });
  } else if (node.kind === "component" && !adapter?.has(key)) {
    diagnostics.push({
      code: "COMPONENT_NOT_REGISTERED",
      severity: "error",
      message: `The ${framework} preview registry has no entry for ${key}.`,
      nodeId: node.id,
      componentName: node.component,
      frameworkId: framework,
    });
  }

  for (const child of node.children) {
    diagnostics.push(...collectDiagnostics(child));
  }
  return diagnostics;
}

function layoutStyle(layout: Layout) {
  const width = layout.sizing.width;
  const height = layout.sizing.height;

  return {
    display: layout.display,
    "flex-direction": layout.direction,
    gap: `${layout.gap ?? 0}px`,
    padding: `${layout.padding ?? 0}px`,
    width: typeof width === "number" ? `${width}px` : width === "fill" ? "100%" : "fit-content",
    height: typeof height === "number" ? `${height}px` : height === "fill" ? "100%" : "fit-content",
    "min-width": width === "fill" ? "0" : undefined,
    "min-height": height === "fill" ? "0" : undefined,
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("Afrodite preview root element was not found");
render(() => <PreviewHost />, root);
