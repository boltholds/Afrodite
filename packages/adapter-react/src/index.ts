import { createJsxSourceBindingAdapter } from "@afrodite/binding-core";
import {
  createDependencyDetection,
  type FrameworkAdapter,
} from "@afrodite/framework-core";
import { reactFrameworkDescriptor } from "./descriptor.js";
import { planReactLayoutPatch } from "./patch.js";

export { reactFrameworkDescriptor } from "./descriptor.js";
export { planReactLayoutPatch } from "./patch.js";

export function createReactFrameworkAdapter(): FrameworkAdapter {
  return {
    descriptor: reactFrameworkDescriptor,
    detect: (manifest) => createDependencyDetection(reactFrameworkDescriptor, manifest),
    planPatch: planReactLayoutPatch,
  };
}

export function createReactSourceBindingAdapter() {
  return createJsxSourceBindingAdapter({
    descriptor: reactFrameworkDescriptor,
    rejectUseServer: true,
    verification: [
      {
        kind: "typecheck",
        command: "pnpm exec tsc --noEmit --pretty false",
        required: true,
      },
    ],
  });
}
