import {
  createDependencyDetection,
  type FrameworkAdapter,
  type FrameworkDescriptor,
} from "@afrodite/framework-core";

export const reactFrameworkDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.2.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react", "react-dom"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: false,
    propEditing: true,
  },
};

export function createReactFrameworkAdapter(): FrameworkAdapter {
  return {
    descriptor: reactFrameworkDescriptor,
    detect: (manifest) => createDependencyDetection(reactFrameworkDescriptor, manifest),
  };
}
