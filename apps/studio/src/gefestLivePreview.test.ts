import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import { decodeGefestPreviewMessage, findBestRuntimeNode } from "./gefestLivePreview";

describe("decodeGefestPreviewMessage", () => {
  it("accepts a bounded runtime selection", () => {
    const message = decodeGefestPreviewMessage({
      type: "afrodite.preview.select",
      target: {
        descriptor: {
          tagName: "button",
          classNames: ["glassButton"],
          path: "[data-afrodite-id=\"gefest.workspace\"] > button.glassButton",
          ariaLabel: "Snap",
          text: "Snap",
        },
        ancestors: [{
          tagName: "main",
          classNames: ["workspace"],
          path: "[data-afrodite-id=\"gefest.workspace\"] > main.workspace",
        }],
        rect: { x: 10, y: 20, width: 44, height: 44 },
        viewport: { width: 1440, height: 900 },
      },
    });

    expect(message?.type).toBe("afrodite.preview.select");
  });

  it("rejects invalid viewport data", () => {
    expect(decodeGefestPreviewMessage({
      type: "afrodite.preview.ready",
      version: 1,
      marker: "gefest.workspace",
      inspectEnabled: true,
      viewport: { width: 0, height: 900 },
    })).toBeNull();
  });
});

describe("findBestRuntimeNode", () => {
  it("matches a live button through aria label and class provenance", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.gefest-cad",
      name: "Gefest CAD live binding",
      root: {
        id: "node.canvas",
        kind: "element",
        element: "div",
        name: "Gefest CAD workspace",
        layout: { display: "block", direction: "column", sizing: { width: "fill", height: "fill" } },
        props: { "data-afrodite-id": "gefest.workspace" },
        sourceBinding: {
          frameworkId: "react",
          repositoryPath: "frontend/features/workspace/AfroditeBoundWorkspacePage.tsx",
          stableMarker: "gefest.workspace",
        },
        children: [{
          id: "node.snap",
          kind: "element",
          element: "button",
          name: "Snap control",
          layout: { display: "block", direction: "column", sizing: { width: "hug", height: "hug" } },
          props: { className: "glassButton", "aria-label": "Snap" },
          children: [],
        }],
      },
    });

    const node = findBestRuntimeNode(document.root, {
      descriptor: {
        tagName: "button",
        classNames: ["glassButton", "active"],
        path: "main.workspace > button.glassButton",
        ariaLabel: "Snap",
      },
      ancestors: [],
      rect: { x: 0, y: 0, width: 44, height: 44 },
      viewport: { width: 1000, height: 700 },
    });

    expect(node.id).toBe("node.snap");
  });

  it("falls back to the marked workspace boundary", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.gefest-cad",
      name: "Gefest CAD live binding",
      root: {
        id: "node.canvas",
        kind: "element",
        element: "div",
        name: "Gefest CAD workspace",
        layout: { display: "block", direction: "column", sizing: { width: "fill", height: "fill" } },
        props: {},
        sourceBinding: {
          repositoryPath: "frontend/features/workspace/AfroditeBoundWorkspacePage.tsx",
          stableMarker: "gefest.workspace",
        },
        children: [],
      },
    });

    const node = findBestRuntimeNode(document.root, {
      descriptor: { tagName: "canvas", classNames: [], path: "main > canvas" },
      ancestors: [{
        tagName: "div",
        classNames: [],
        path: "[data-afrodite-id=\"gefest.workspace\"]",
        marker: "gefest.workspace",
      }],
      rect: { x: 0, y: 0, width: 800, height: 600 },
      viewport: { width: 800, height: 600 },
    });

    expect(node.id).toBe("node.canvas");
  });
});
