import type { FrameworkDescriptor } from "@afrodite/framework-core";

export const reactFrameworkDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.3.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react", "react-dom"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: true,
    propEditing: true,
  },
};
