import { describe, expect, it } from "vitest";
import {
  FrameworkAdapterRegistry,
  createDependencyDetection,
  type FrameworkAdapter,
  type FrameworkDescriptor,
} from "../src/index";

function createAdapter(descriptor: FrameworkDescriptor): FrameworkAdapter {
  return {
    descriptor,
    detect: (manifest) => createDependencyDetection(descriptor, manifest),
  };
}

const solidDescriptor: FrameworkDescriptor = {
  frameworkId: "solid",
  adapterId: "afrodite.adapter.solid",
  displayName: "SolidJS",
  adapterVersion: "0.1.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["solid-js"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: false,
    propEditing: true,
  },
};

const reactDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.1.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react"],
  capabilities: {
    projectDetection: true,
    staticIndexing: false,
    runtimePreview: false,
    sourcePatching: false,
    propEditing: false,
  },
};

describe("FrameworkAdapterRegistry", () => {
  it("registers multiple frameworks and detects them independently", () => {
    const registry = new FrameworkAdapterRegistry();
    registry.register(createAdapter(solidDescriptor));
    registry.register(createAdapter(reactDescriptor));

    const detections = registry.detect({
      projectRoot: "/workspace",
      dependencies: { react: "^19.0.0" },
      devDependencies: {},
    });

    expect(registry.list().map((adapter) => adapter.descriptor.frameworkId)).toEqual([
      "react",
      "solid",
    ]);
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ frameworkId: "react", matched: true });
  });

  it("resolves an adapter through a framework-neutral source binding", () => {
    const registry = new FrameworkAdapterRegistry();
    registry.register(createAdapter(solidDescriptor));

    expect(registry.resolveForBinding({
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      repositoryPath: "src/Button.tsx",
    })?.descriptor.displayName).toBe("SolidJS");
  });
});
