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
