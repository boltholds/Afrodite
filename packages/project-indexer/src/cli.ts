#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { indexSolidProject } from "./indexer.js";
import { serializeComponentCatalog } from "./catalog.js";

interface CliOptions {
  projectRoot: string;
  tsconfigPath?: string;
  outputPath?: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const catalog = indexSolidProject({
    projectRoot: options.projectRoot,
    ...(options.tsconfigPath ? { tsconfigPath: options.tsconfigPath } : {}),
  });
  const serialized = serializeComponentCatalog(catalog);

  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    process.stdout.write(
      `Indexed ${catalog.components.length} components with ${catalog.diagnostics.length} diagnostics into ${outputPath}.\n`,
    );
  } else {
    process.stdout.write(serialized);
  }

  if (catalog.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    process.exitCode = 1;
  }
}

function parseArguments(args: string[]): CliOptions {
  let projectRoot = ".";
  let tsconfigPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;

    if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--tsconfig") {
      tsconfigPath = requireValue(args, ++index, "--tsconfig");
      continue;
    }
    if (argument === "--out" || argument === "-o") {
      outputPath = requireValue(args, ++index, argument);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    projectRoot = argument;
  }

  return {
    projectRoot: path.resolve(projectRoot),
    ...(tsconfigPath ? { tsconfigPath } : {}),
    ...(outputPath ? { outputPath } : {}),
  };
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function printHelp(): void {
  process.stdout.write(`Afrodite SolidJS component indexer\n\nUsage:\n  afrodite-index-solid [project-root] [options]\n\nOptions:\n  --tsconfig <path>  Use a specific tsconfig relative to the project root\n  -o, --out <path>   Write the component catalog to a JSON file\n  -h, --help         Show this help\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Afrodite indexer failed: ${message}\n`);
  process.exitCode = 1;
});
