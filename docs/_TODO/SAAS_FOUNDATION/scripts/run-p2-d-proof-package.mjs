#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const p2ScriptsDir = "docs/_TODO/SAAS_FOUNDATION/scripts";

const staticCheckScripts = [
  `${p2ScriptsDir}/check-p2-b-protected-context-sql.mjs`,
  `${p2ScriptsDir}/check-p2-c1-patient-value-guards-sql.mjs`,
  `${p2ScriptsDir}/check-p2-c2-patient-value-guards-sql.mjs`,
  `${p2ScriptsDir}/check-p2-c3-patient-booking-lfk-guards-sql.mjs`,
];

const scratchSmokeScripts = [
  `${p2ScriptsDir}/smoke-p2-b-protected-context.mjs`,
  `${p2ScriptsDir}/smoke-p2-c1-patient-value-guards.mjs`,
  `${p2ScriptsDir}/smoke-p2-c2-patient-value-guards.mjs`,
  `${p2ScriptsDir}/smoke-p2-c3-patient-booking-lfk-guards.mjs`,
];

const runnerPath = `${p2ScriptsDir}/run-p2-d-proof-package.mjs`;
const regressionCheckerPath = "scripts/check-saas-db-regression.mjs";

const defaultMode = "static";
const modes = new Set(["static", "scratch"]);

function usage() {
  return [
    "Usage:",
    `  node ${runnerPath} [--mode=static]`,
    `  node ${runnerPath} --mode=scratch`,
    `  node ${runnerPath} --with-scratch-smokes`,
    "",
    "Modes:",
    "  static   DB-free default. Runs node --check, P2-B/C1/C2/C3 static guards, and SaaS DB regression guard.",
    "  scratch  Runs static mode plus scratch-only P2-B/C1/C2/C3 smokes on disposable bcb_saas_*_scratch_* DBs.",
    "",
    "DB safety:",
    "  This runner never uses DATABASE_URL. Scratch mode sanitizes DATABASE_URL and PG* env vars for child commands",
    "  and refuses obvious prod/test/dev-shaped DB names if they are present in the parent environment.",
  ].join("\n");
}

function parseArgs(argv) {
  let mode = defaultMode;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--with-scratch-smokes") {
      mode = "scratch";
      continue;
    }

    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!modes.has(mode)) {
    throw new Error(`Unsupported mode: ${mode}\n\n${usage()}`);
  }

  return { mode };
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname ? decodeURIComponent(pathname) : null;
  } catch {
    return null;
  }
}

function unsafeDbNameReason(name) {
  const normalized = name.toLowerCase();
  if (!normalized) return "empty DB name";

  const forbiddenExact = new Set([
    "bcb_webapp_prod",
    "bcb_webapp_test",
    "bcb_webapp_dev",
    "bersoncarebot_prod",
    "bersoncarebot_test",
    "bersoncarebot_dev",
    "production",
    "prod",
    "test",
    "dev",
  ]);

  if (forbiddenExact.has(normalized)) {
    return `forbidden DB name ${name}`;
  }

  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    return `prod/test/dev-shaped DB name ${name}`;
  }

  if (!/(^|[_-])(scratch|rehearsal|copy)([_-]|$)/.test(normalized)) {
    return `DB-touching modes require scratch/rehearsal/copy-shaped DB names, got ${name}`;
  }

  return null;
}

function assertNoUnsafeParentDbHints() {
  const candidates = [];

  if (process.env.DATABASE_URL) {
    candidates.push({
      source: "DATABASE_URL",
      name: databaseNameFromUrl(process.env.DATABASE_URL),
    });
  }

  if (process.env.PGDATABASE) {
    candidates.push({
      source: "PGDATABASE",
      name: process.env.PGDATABASE,
    });
  }

  for (const candidate of candidates) {
    if (!candidate.name) {
      throw new Error(`${candidate.source} is set but its database name could not be parsed; refusing DB-touching mode`);
    }

    const reason = unsafeDbNameReason(candidate.name);
    if (reason) {
      throw new Error(`${candidate.source}: ${reason}; refusing DB-touching mode`);
    }
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
}

function runStep(step, env) {
  const [command, ...args] = step.command;
  console.log(`\n[P2-D] ${step.label}`);
  console.log(`$ ${step.command.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${step.label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${step.label} failed with status ${result.status ?? "unknown"}`);
  }
}

function buildSteps(mode) {
  const syntaxCheckTargets = [
    runnerPath,
    regressionCheckerPath,
    ...staticCheckScripts,
    ...scratchSmokeScripts,
  ];

  const steps = [
    ...syntaxCheckTargets.map((target) => ({
      label: `node --check ${target}`,
      command: ["node", "--check", target],
    })),
    ...staticCheckScripts.map((target) => ({
      label: `static guard ${target}`,
      command: ["node", target],
    })),
    {
      label: "SaaS DB regression guard",
      command: ["node", regressionCheckerPath],
    },
  ];

  if (mode === "scratch") {
    steps.push(
      ...scratchSmokeScripts.map((target) => ({
        label: `scratch smoke ${target}`,
        command: ["node", target],
      })),
    );
  }

  return steps;
}

function main() {
  const { mode } = parseArgs(process.argv.slice(2));

  if (mode === "scratch") {
    assertNoUnsafeParentDbHints();
  }

  const childEnv = sanitizedChildEnv();
  const steps = buildSteps(mode);

  console.log(`[P2-D] proof package mode: ${mode}`);
  console.log(`[P2-D] steps: ${steps.length}`);
  if (mode === "static") {
    console.log("[P2-D] scratch smokes skipped; pass --with-scratch-smokes or --mode=scratch to run them.");
  }

  for (const step of steps) {
    runStep(step, childEnv);
  }

  console.log(`\n[P2-D] proof package OK (${mode})`);
}

try {
  main();
} catch (error) {
  console.error(`[P2-D] proof package FAILED: ${error.message}`);
  process.exit(1);
}
