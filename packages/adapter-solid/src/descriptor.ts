import type { FrameworkDescriptor } from "@afrodite/framework-core";

export const solidFrameworkDescriptor: FrameworkDescriptor = {
  frameworkId: "solid",
  adapterId: "afrodite.adapter.solid",
  displayName: "SolidJS",
  adapterVersion: "0.2.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["solid-js"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: true,
    propEditing: true,
  },
};
