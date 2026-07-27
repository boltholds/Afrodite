import { randomBytes } from "node:crypto";
import path from "node:path";
import { ProjectCollaborationStore } from "./collaboration.js";
import { MotionBridgeService } from "./motion.js";
import { ReviewedExecutionService } from "./reviewExecution.js";
import { SemanticBatchReviewStore } from "./semanticBatchReview.js";
import { createProjectBridgeServer } from "./server.js";
import { ProjectBridgeService } from "./service.js";

interface CliOptions {
  readonly projectRoot: string;
  readonly host: string;
  readonly port: number;
  readonly token: string;
  readonly allowedOrigins: string[];
  readonly generatedToken: boolean;
}

const options = parseCliOptions(process.argv.slice(2), process.env);
const service = new ProjectBridgeService({ projectRoot: options.projectRoot });
const motion = new MotionBridgeService({ projectRoot: options.projectRoot });
const collaboration = new ProjectCollaborationStore(options.projectRoot);
const batchReviews = new SemanticBatchReviewStore(options.projectRoot, collaboration);
const reviewedExecution = new ReviewedExecutionService({
  collaboration,
  projectBridge: service,
});
const server = createProjectBridgeServer({
  service,
  motion,
  collaboration,
  reviewedExecution,
  batchReviews,
  token: options.token,
  allowedOrigins: options.allowedOrigins,
});

server.listen(options.port, options.host, () => {
  const address = `http://${options.host}:${options.port}`;
  console.log(`Afrodite project bridge listening at ${address}`);
  console.log(`Project root: ${options.projectRoot}`);
  console.log(`Collaboration state: ${path.join(options.projectRoot, ".afrodite", "collaboration.json")}`);
  console.log(`Semantic batch reviews: ${path.join(options.projectRoot, ".afrodite", "semantic-batch-reviews.json")}`);
  console.log("Motion CSS plans use the same authenticated verified-write boundary.");
  console.log(`Allowed Studio origins: ${options.allowedOrigins.join(", ")}`);
  console.log(`Session token${options.generatedToken ? " (generated)" : ""}: ${options.token}`);
  console.log("Keep this terminal open and paste the token into Afrodite Studio.");
});

const shutdown = () => {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function parseCliOptions(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions {
  const projectArgument = valueAfter(argv, "--project") ?? env.AFRODITE_PROJECT_ROOT;
  if (!projectArgument) {
    throw new Error(
      "Project root is required. Use --project ./path/to/project or AFRODITE_PROJECT_ROOT.",
    );
  }

  const host = valueAfter(argv, "--host") ?? env.AFRODITE_PROJECT_BRIDGE_HOST ?? "127.0.0.1";
  const portSource = valueAfter(argv, "--port") ?? env.AFRODITE_PROJECT_BRIDGE_PORT ?? "4175";
  const port = Number(portSource);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid project bridge port: ${portSource}`);
  }

  const configuredToken = valueAfter(argv, "--token") ?? env.AFRODITE_PROJECT_BRIDGE_TOKEN;
  const token = configuredToken ?? randomBytes(24).toString("base64url");
  if (token.length < 16) throw new Error("Project bridge tokens must contain at least 16 characters.");

  const originArguments = valuesAfter(argv, "--origin");
  const environmentOrigins = env.AFRODITE_STUDIO_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = originArguments.length > 0
    ? originArguments
    : environmentOrigins && environmentOrigins.length > 0
      ? environmentOrigins
      : ["http://localhost:4173", "http://127.0.0.1:4173"];

  return {
    projectRoot: path.resolve(projectArgument),
    host,
    port,
    token,
    allowedOrigins,
    generatedToken: configuredToken === undefined,
  };
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function valuesAfter(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    values.push(value);
    index += 1;
  }
  return values;
}
