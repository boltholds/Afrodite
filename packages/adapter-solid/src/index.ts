import {
  createDependencyDetection,
  type FrameworkAdapter,
  type FrameworkDescriptor,
} from "@afrodite/framework-core";

export const solidFrameworkDescriptor: FrameworkDescriptor = {
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

export function createSolidFrameworkAdapter(): FrameworkAdapter {
  return {
    descriptor: solidFrameworkDescriptor,
    detect: (manifest) => createDependencyDetection(solidFrameworkDescriptor, manifest),
  };
}
