import { createJsxSourceBindingAdapter } from "@afrodite/binding-core";
import {
  createDependencyDetection,
  type FrameworkAdapter,
} from "@afrodite/framework-core";
import { createJsxScreenImportAdapter } from "@afrodite/import-core";
import { solidFrameworkDescriptor } from "./descriptor.js";
import { planSolidLayoutPatch } from "./patch.js";

export { solidFrameworkDescriptor } from "./descriptor.js";
export { planSolidLayoutPatch } from "./patch.js";

export function createSolidFrameworkAdapter(): FrameworkAdapter {
  return {
    descriptor: solidFrameworkDescriptor,
    detect: (manifest) => createDependencyDetection(solidFrameworkDescriptor, manifest),
    planPatch: planSolidLayoutPatch,
  };
}

export function createSolidSourceBindingAdapter() {
  return createJsxSourceBindingAdapter({
    descriptor: solidFrameworkDescriptor,
    verification: [
      {
        kind: "typecheck",
        command: "pnpm exec tsc --noEmit --pretty false",
        required: true,
      },
    ],
  });
}

export function createSolidScreenImportAdapter() {
  return createJsxScreenImportAdapter({ descriptor: solidFrameworkDescriptor });
}
