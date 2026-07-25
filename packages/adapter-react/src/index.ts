import {
  createDependencyDetection,
  type FrameworkAdapter,
  type FrameworkDescriptor,
} from "@afrodite/framework-core";

export const reactFrameworkDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.1.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react", "react-dom"],
  capabilities: {
    projectDetection: true,
    staticIndexing: false,
    runtimePreview: false,
    sourcePatching: false,
    propEditing: false,
  },
};

export function createReactFrameworkAdapter(): FrameworkAdapter {
  return {
    descriptor: reactFrameworkDescriptor,
    detect: (manifest) => createDependencyDetection(reactFrameworkDescriptor, manifest),
  };
}
