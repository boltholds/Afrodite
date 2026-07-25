#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { indexReactProject, serializeReactComponentCatalog } from "./indexer.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const projectRoot = args[0];
  if (!projectRoot) {
    throw new Error("Usage: afrodite-index-react <project-root> [--out catalog.json] [--tsconfig tsconfig.json]");
  }

  const outIndex = args.indexOf("--out");
  const configIndex = args.indexOf("--tsconfig");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const tsconfigPath = configIndex >= 0 ? args[configIndex + 1] : undefined;
  const catalog = indexReactProject({
    projectRoot,
    ...(tsconfigPath ? { tsconfigPath } : {}),
  });
  const serialized = serializeReactComponentCatalog(catalog);

  if (!outPath) {
    process.stdout.write(serialized);
    return;
  }

  const resolved = path.resolve(outPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, serialized, "utf8");
  process.stdout.write(`Indexed ${catalog.components.length} React components into ${resolved}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
