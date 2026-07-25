import {
  createSignal,
  ErrorBoundary,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { Dynamic, render } from "solid-js/web";
import { solidFrameworkDescriptor } from "@afrodite/adapter-solid";
import {
  createPreviewReadyMessage,
  createPreviewRenderResult,
  decodePreviewMessage,
  type PreviewDiagnostic,
} from "@afrodite/protocol";
import type { Layout, UiNode } from "@afrodite/ui-ir";
import { Button } from "../../../packages/project-indexer/test/fixtures/solid-app/src/Button";
import Panel from "../../../packages/project-indexer/test/fixtures/solid-app/src/Panel";
import "./styles.css";

type RegistryComponent = Component<Record<string, unknown>>;

const previewRuntimes = [
  {
    frameworkId: solidFrameworkDescriptor.frameworkId,
    adapterId: solidFrameworkDescriptor.adapterId,
    adapterVersion: solidFrameworkDescriptor.adapterVersion,
  },
] as const;
const supportedFrameworks = new Set(previewRuntimes.map((runtime) => runtime.frameworkId));

const componentRegistry: Readonly<Record<string, RegistryComponent>> = {
  "solid:src/Button.tsx#Button": Button as unknown as RegistryComponent,
  "solid:src/Panel.tsx#default": Panel as unknown as RegistryComponent,
  "solid:Button": Button as unknown as RegistryComponent,
  "solid:Panel": Panel as unknown as RegistryComponent,
};

function PreviewHost() {
  const [rootNode, setRootNode] = createSignal<UiNode>();
  const [requestId, setRequestId] = createSignal("waiting");
  const [diagnostics, setDiagnostics] = createSignal<readonly PreviewDiagnostic[]>([]);

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
          <span>opaque-origin iframe · framework runtime registry</span>
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
              <RuntimeNode node={node()} />
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

function RuntimeNode(props: { node: UiNode }) {
  const component = () => props.node.kind === "component"
    ? componentRegistry[componentKey(props.node)]
    : undefined;

  return (
    <div
      classList={{
        "runtime-node": true,
        "runtime-component": props.node.kind === "component",
      }}
      data-node-id={props.node.id}
      data-framework={frameworkId(props.node)}
      style={layoutStyle(props.node.layout)}
    >
      <Show
        when={props.node.kind === "component"}
        fallback={
          <For each={props.node.children}>
            {(child) => <RuntimeNode node={child} />}
          </For>
        }
      >
        <Show
          when={component()}
          fallback={
            <div class="missing-component">
              Missing component: {props.node.kind === "component" ? props.node.component : "unknown"}
            </div>
          }
        >
          {(resolved) => (
            <>
              <Dynamic component={resolved()} {...props.node.props} />
              <For each={props.node.children}>
                {(child) => <RuntimeNode node={child} />}
              </For>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
}

function frameworkId(node: UiNode): string {
  return node.sourceBinding?.frameworkId ?? "solid";
}

function componentKey(node: UiNode): string {
  if (node.kind !== "component") return "";
  const framework = frameworkId(node);
  const binding = node.sourceBinding;
  if (!binding) return `${framework}:${node.component}`;
  return `${framework}:${binding.repositoryPath}#${binding.exportName ?? node.component}`;
}

function collectDiagnostics(node: UiNode): PreviewDiagnostic[] {
  const diagnostics: PreviewDiagnostic[] = [];
  const framework = frameworkId(node);

  if (node.kind === "component" && !supportedFrameworks.has(framework)) {
    diagnostics.push({
      code: "FRAMEWORK_NOT_SUPPORTED",
      severity: "error",
      message: `The preview host has no runtime adapter for ${framework}.`,
      nodeId: node.id,
      componentName: node.component,
      frameworkId: framework,
    });
  } else if (node.kind === "component" && !componentRegistry[componentKey(node)]) {
    diagnostics.push({
      code: "COMPONENT_NOT_REGISTERED",
      severity: "error",
      message: `The ${framework} preview registry has no entry for ${componentKey(node)}.`,
      nodeId: node.id,
      componentName: node.component,
      frameworkId: framework,
    });
  }

  for (const child of node.children) diagnostics.push(...collectDiagnostics(child));
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
