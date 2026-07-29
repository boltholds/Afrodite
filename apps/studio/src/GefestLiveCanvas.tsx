import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { UiDocument, UiNode } from "@afrodite/ui-ir";
import {
  GEFEST_IMPORT_ENTRY,
  GEFEST_PREVIEW_STORAGE_KEY,
  prepareImportedGefestDocument,
  shouldImportGefestTree,
} from "./gefestProjectSeed";
import {
  decodeGefestPreviewMessage,
  findBestRuntimeNode,
  type GefestRuntimeTarget,
} from "./gefestLivePreview";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";
const DEFAULT_PREVIEW_URL = import.meta.env.VITE_GEFEST_PREVIEW_URL ?? "http://localhost:3000";

interface GefestLiveCanvasProps {
  readonly getDocument: () => UiDocument;
  readonly onImported: (document: UiDocument, status: string) => void;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onShowSemantic: () => void;
}

interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export function GefestLiveCanvas(props: GefestLiveCanvasProps) {
  const initialPreviewUrl = readStorage(GEFEST_PREVIEW_STORAGE_KEY) ?? DEFAULT_PREVIEW_URL;
  const [previewUrl, setPreviewUrl] = createSignal(initialPreviewUrl);
  const [previewDraft, setPreviewDraft] = createSignal(initialPreviewUrl);
  const [inspectEnabled, setInspectEnabled] = createSignal(true);
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Waiting for the Gefest live preview.");
  const [hoverTarget, setHoverTarget] = createSignal<GefestRuntimeTarget>();
  const [selectedTarget, setSelectedTarget] = createSignal<GefestRuntimeTarget>();
  const [frameSize, setFrameSize] = createSignal<FrameSize>({ width: 1, height: 1 });
  let frame: HTMLIFrameElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let automaticImportStarted = false;

  const overlayTarget = createMemo(() => hoverTarget() ?? selectedTarget());
  const overlayStyle = createMemo(() => {
    const target = overlayTarget();
    if (!target) return undefined;
    const size = frameSize();
    const scaleX = size.width / target.viewport.width;
    const scaleY = size.height / target.viewport.height;
    return {
      left: `${target.rect.x * scaleX}px`,
      top: `${target.rect.y * scaleY}px`,
      width: `${target.rect.width * scaleX}px`,
      height: `${target.rect.height * scaleY}px`,
    };
  });

  const sendInspectMode = () => {
    const targetOrigin = originFor(previewUrl());
    if (!frame?.contentWindow || !targetOrigin) return;
    frame.contentWindow.postMessage({
      type: "afrodite.preview.set-inspect",
      enabled: inspectEnabled(),
    }, targetOrigin);
  };

  const importTree = async (automatic = false) => {
    const token = readSessionToken();
    if (token.length < 16) {
      setStatus("Connect Project Bridge in Source Sync first; the session token is required for automatic import.");
      return;
    }

    setBusy(true);
    try {
      const client = new ProjectBridgeClient(DEFAULT_BRIDGE_URL, token);
      const health = await client.health();
      const result = await client.importScreen({
        adapterId: GEFEST_IMPORT_ENTRY.adapterId,
        repositoryPath: GEFEST_IMPORT_ENTRY.repositoryPath,
        exportName: GEFEST_IMPORT_ENTRY.exportName,
        documentName: "Gefest CAD imported workspace",
        maxDepth: 128,
        maxFiles: 64,
        maxNodes: 8_000,
        maxGraphDepth: 16,
        expansionMode: "all-local",
      });
      const blocking = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      if (!result.document || blocking) {
        throw new Error(blocking?.message ?? "The source importer did not produce a Gefest document.");
      }

      const prepared = prepareImportedGefestDocument(result.document);
      const summary = `Imported ${result.stats.totalNodes} semantic nodes from ${result.graph?.filesRead ?? 1} Gefest source file(s) through ${health.projectName}.`;
      props.onImported(prepared, summary);
      setStatus(summary);
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : automatic
            ? "Automatic Gefest import failed"
            : "Gefest import failed");
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = () => {
    const next = normalizeUrl(previewDraft());
    if (!next) {
      setStatus("Enter a valid http:// or https:// preview URL.");
      return;
    }
    writeStorage(GEFEST_PREVIEW_STORAGE_KEY, next);
    setReady(false);
    setHoverTarget(undefined);
    setSelectedTarget(undefined);
    const unchanged = next === previewUrl();
    setPreviewUrl(next);
    if (unchanged && frame) {
      frame.src = next;
    }
  };

  const toggleInspect = () => {
    setInspectEnabled((current) => !current);
    queueMicrotask(sendInspectMode);
  };

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== frame?.contentWindow || event.origin !== originFor(previewUrl())) {
      return;
    }
    const message = decodeGefestPreviewMessage(event.data);
    if (!message) return;

    if (message.type === "afrodite.preview.ready") {
      setReady(true);
      setStatus(message.inspectEnabled
        ? "Gefest preview connected in inspect mode. Click an element to select its semantic source node."
        : "Gefest preview connected in interaction mode.");
      sendInspectMode();
      return;
    }

    if (message.type === "afrodite.preview.hover") {
      setHoverTarget(message.target ?? undefined);
      return;
    }

    setSelectedTarget(message.target);
    setHoverTarget(undefined);
    const node = findBestRuntimeNode(props.getDocument().root, message.target);
    setStatus(selectionStatus(node, message.target));
    props.onSelectNode(node.id);
  };

  onMount(() => {
    window.addEventListener("message", handleMessage);
    if (frame) {
      const updateFrameSize = () => setFrameSize({
        width: Math.max(1, frame?.clientWidth ?? 1),
        height: Math.max(1, frame?.clientHeight ?? 1),
      });
      resizeObserver = new ResizeObserver(updateFrameSize);
      resizeObserver.observe(frame);
      updateFrameSize();
    }

    queueMicrotask(() => {
      if (
        !automaticImportStarted
        && shouldImportGefestTree(props.getDocument())
        && readSessionToken().length >= 16
      ) {
        automaticImportStarted = true;
        void importTree(true);
      }
    });

    onCleanup(() => {
      window.removeEventListener("message", handleMessage);
      resizeObserver?.disconnect();
    });
  });

  createEffect(() => {
    inspectEnabled();
    if (ready()) queueMicrotask(sendInspectMode);
  });

  return (
    <section class="gefest-live-canvas" aria-label="Gefest CAD live preview">
      <div class="gefest-live-toolbar">
        <label>
          <span>Live URL</span>
          <input
            value={previewDraft()}
            spellcheck={false}
            onInput={(event) => setPreviewDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") loadPreview();
            }}
          />
        </label>
        <button onClick={loadPreview}>Load</button>
        <button classList={{ active: inspectEnabled() }} onClick={toggleInspect}>
          {inspectEnabled() ? "Inspecting" : "Interact"}
        </button>
        <button disabled={busy()} onClick={() => void importTree(false)}>
          {busy() ? "Importing…" : shouldImportGefestTree(props.getDocument()) ? "Import source tree" : "Refresh source tree"}
        </button>
        <button onClick={props.onShowSemantic}>Semantic canvas</button>
        <span classList={{ "gefest-live-state": true, ready: ready() }}>
          {ready() ? "runtime connected" : "runtime offline"}
        </span>
      </div>

      <div class="gefest-live-viewport">
        <iframe
          ref={frame}
          src={previewUrl()}
          title="Gefest CAD live application"
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals allow-downloads"
          onLoad={() => {
            setReady(false);
            setStatus("Gefest frame loaded; waiting for its Afrodite runtime bridge.");
            const targetOrigin = originFor(previewUrl());
            if (frame?.contentWindow && targetOrigin) {
              frame.contentWindow.postMessage({ type: "afrodite.preview.request-state" }, targetOrigin);
            }
          }}
        />
        <Show when={overlayTarget() && overlayStyle()} keyed>
          {() => (
            <div
              classList={{
                "gefest-live-overlay": true,
                selected: hoverTarget() === undefined,
              }}
              style={overlayStyle()}
            >
              <span>{runtimeLabel(overlayTarget()!)}</span>
            </div>
          )}
        </Show>
        <Show when={!ready()}>
          <div class="gefest-live-notice">
            <strong>Waiting for Gefest CAD</strong>
            <span>Start the Gefest frontend at {previewUrl()} and keep this view open.</span>
          </div>
        </Show>
      </div>
      <p class="gefest-live-status">{status()}</p>
    </section>
  );
}

function selectionStatus(node: UiNode, target: GefestRuntimeTarget): string {
  const label = runtimeLabel(target);
  const source = node.sourceRegion
    ? `${node.sourceRegion.repositoryPath}:${node.sourceRegion.line}`
    : node.sourceBinding?.repositoryPath;
  return source
    ? `Selected ${label} → ${node.name} (${source})`
    : `Selected ${label} → ${node.name}`;
}

function runtimeLabel(target: GefestRuntimeTarget): string {
  const descriptor = target.descriptor;
  return descriptor.ariaLabel
    ?? descriptor.text
    ?? descriptor.id
    ?? descriptor.classNames[0]
    ?? descriptor.tagName;
}

function readSessionToken(): string {
  try {
    return sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Restricted browser contexts may deny storage while the preview remains usable.
  }
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function originFor(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
