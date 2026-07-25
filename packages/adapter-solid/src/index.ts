import {
  createDependencyDetection,
  type FrameworkAdapter,
} from "@afrodite/framework-core";
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
