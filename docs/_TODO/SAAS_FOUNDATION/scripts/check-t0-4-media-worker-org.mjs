#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  enqueue: "apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts",
  enqueueTest: "apps/webapp/src/infra/repos/pgMediaTranscodeJobs.test.ts",
  claim: "apps/media-worker/src/jobs/claim.ts",
  claimTest: "apps/media-worker/src/jobs/claim.test.ts",
  process: "apps/media-worker/src/processTranscodeJob.ts",
  executor: "apps/media-worker/src/runMediaWorkerSql.ts",
  executorTest: "apps/media-worker/src/runMediaWorkerSql.test.ts",
  tx: "apps/media-worker/src/withClient.ts",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const enqueue = overrides.enqueue ?? read(files.enqueue);
  const enqueueTest = overrides.enqueueTest ?? read(files.enqueueTest);
  const claim = overrides.claim ?? read(files.claim);
  const claimTest = overrides.claimTest ?? read(files.claimTest);
  const process = overrides.process ?? read(files.process);
  const executor = overrides.executor ?? read(files.executor);
  const executorTest = overrides.executorTest ?? read(files.executorTest);
  const tx = overrides.tx ?? read(files.tx);

  for (const needle of [
    "SELECT id, organization_id, mime_type",
    "organizationId: media.organization_id",
    "insertTranscodeJobAndMarkPending(loaded)",
  ]) {
    assertContains(files.enqueue, enqueue, needle);
  }

  for (const needle of [
    "inserts job in transaction with media organization context",
    "enqueues job for program submission video with media organization context",
    "organizationId: \"dddddddd-dddd-4ddd-8ddd-dddddddddddd\"",
    "organizationId: \"22222222-2222-4222-8222-222222222222\"",
  ]) {
    assertContains(files.enqueueTest, enqueueTest, needle);
  }

  for (const needle of [
    "organization_id = COALESCE(j.organization_id, mf.organization_id)",
    "RETURNING j.id, j.media_id, j.organization_id, j.attempts",
    "organizationId: job.organization_id",
  ]) {
    assertContains(files.claim, claim, needle);
  }

  for (const needle of [
    "organizationId: \"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\"",
    "organization_id = COALESCE(j.organization_id, mf.organization_id)",
    "preserves missing organization as dormant no-op context",
  ]) {
    assertContains(files.claimTest, claimTest, needle);
  }

  for (const needle of [
    "runWithOptionalMediaWorkerOrganizationPrincipal(job.organizationId",
    "processTranscodeJobInner(ctx, job)",
    "processProgramSubmissionTranscodeJob(ctx, job",
  ]) {
    assertContains(files.process, process, needle);
  }

  for (const needle of [
    "getCurrentDbPrincipalOrganizationId()",
    "startMediaWorkerTransaction(pool)",
    "runWithDbOrganizationPrincipal(organizationId, fn)",
  ]) {
    assertContains(files.executor, executor, needle);
  }

  for (const needle of [
    "SELECT set_config('app.org', $1, true)",
    "uses media-worker transaction chokepoint when organization principal is set",
  ]) {
    assertContains(files.executorTest, executorTest, needle);
  }

  assertContains(files.tx, tx, "applyCurrentDbPrincipalToTransaction(client)");
}

if (process.argv.includes("--self-test")) {
  const enqueue = read(files.enqueue).replace(
    "organizationId: media.organization_id",
    "organizationId: null",
  );
  try {
    runChecks({ enqueue });
  } catch {
    console.log("check-t0-4-media-worker-org self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing enqueue organization stamp");
}

try {
  runChecks();
  console.log("check-t0-4-media-worker-org: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-media-worker-org: ${message}`);
  process.exit(1);
}
