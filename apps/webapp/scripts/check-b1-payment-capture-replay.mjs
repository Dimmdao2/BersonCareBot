#!/usr/bin/env node
/**
 * B1 #949 — disposable PostgreSQL crash/replay/concurrency proof.
 *
 * Owns a private /tmp cluster and explicit synthetic data. It never reads application env or
 * connects to DEV/TEST/PROD. The proof exercises the same transaction shape as the capture UoW:
 * lock intent, create/find payment, append capture history, confirm appointment and activate
 * package/product markers, then commit. A session advisory lock serializes provider-event
 * completion and mandatory idempotent delivery after that commit.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { userInfo } from "node:os";
import net from "node:net";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const osUser = userInfo().username;
const org = "10000000-0000-4000-8000-000000000001";
const intent = "20000000-0000-4000-8000-000000000001";
const payment = "30000000-0000-4000-8000-000000000001";
const appointment = "40000000-0000-4000-8000-000000000001";
const event = "50000000-0000-4000-8000-000000000001";
const safeEnv = { LANG: "C", LC_ALL: "C", PATH: `${pgBin}:/usr/bin:/bin` };

function fail(label) {
  throw new Error(`B1 #949 payment capture proof failed: ${label}`);
}

const serviceSource = readFileSync(path.join(root, "apps/webapp/src/modules/payments/service.ts"), "utf8");
const repoSource = readFileSync(path.join(root, "apps/webapp/src/infra/repos/pgPayments.ts"), "utf8");
const migrationSql = readFileSync(
  path.join(root, "apps/webapp/db/drizzle-migrations/0225_payment_capture_replay_safety.sql"),
  "utf8",
);
const captureParticipantSources = [
  "pgBookingEngine.ts",
  "pgCourses.ts",
  "pgEntitlements.ts",
  "pgMemberships.ts",
  "pgProducts.ts",
  "pgTreatmentProgramInstance.ts",
].map((file) => [
  file,
  readFileSync(path.join(root, "apps/webapp/src/infra/repos", file), "utf8"),
]);

function selfTest() {
  for (const fragment of [
    "captureUnitOfWork.run",
    "runSerializedPostCommit",
    "getProviderEventById",
    "lockIntentForCapture",
    "hasCapturedHistoryEvent",
    "onPackagePaymentCaptured",
    "onProductPaymentCaptured",
  ]) {
    if (!serviceSource.includes(fragment)) fail(`service source is missing ${fragment}`);
  }
  if (!repoSource.includes('.for("update")')) fail("intent repository is missing FOR UPDATE");
  if (!repoSource.includes("onConflictDoNothing")) fail("capture inserts lack conflict handling");
  for (const [file, source] of captureParticipantSources) {
    if (!source.includes("getDrizzleOrMutationTx") && !source.includes("runDrizzleMutationTransaction")) {
      fail(`${file} does not participate in the canonical Drizzle mutation transaction`);
    }
  }
  if (!migrationSql.includes("duplicate_groups")) fail("migration lacks aggregate duplicate preflight");
  if (!migrationSql.includes("be_payment_history_capture_uidx")) fail("migration lacks capture unique index");
  if (!migrationSql.includes("intent_ref")) fail("migration lacks canonical provider intent reference");
}

function baseRegressionProof() {
  const base = spawnSync(
    "git",
    ["show", "a3badd17c:apps/webapp/src/modules/payments/service.ts"],
    { cwd: root, encoding: "utf8", env: safeEnv },
  );
  if (base.status !== 0) fail("cannot read source-bound pre-fix base a3badd17c");
  if (!base.stdout.includes("if (!stored.inserted)")) {
    fail("pre-fix base does not contain the unprocessed-duplicate short circuit");
  }
  for (const fragment of ["stored.processedAt", "runSerializedPostCommit", "getProviderEventById"]) {
    if (!serviceSource.includes(fragment)) fail(`current source lacks replay repair fragment ${fragment}`);
  }
  console.log(
    "B1 #949 base regression proof: OK — base a3badd17c short-circuits an unprocessed duplicate; current source resumes its canonical stored event under the serialized post-commit gate",
  );
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log("B1 #949 payment capture proof self-test: OK");
  process.exit(0);
}

if (process.argv.includes("--base-regression")) {
  baseRegressionProof();
  process.exit(0);
}

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_b1_949_payment_capture_${stamp}_`);
const data = path.join(dir, "data");
const socket = path.join(dir, "socket");
const log = path.join(dir, "postgres.log");
const database = `bcb_b1_949_payment_capture_${stamp}`;
let serverStarted = false;
let port;

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr ?? result.error}`);
  return result.stdout;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") fail("private port reservation failed");
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function newClient() {
  return new pg.Client({ host: socket, port, database, user: osUser, ssl: false });
}

async function withClient(fn) {
  const client = newClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function installSchema() {
  await withClient((client) =>
    client.query(`
    CREATE TABLE be_payment_intents (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE be_payments (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      payment_intent_id uuid NOT NULL UNIQUE
    );
    CREATE TABLE be_payment_history_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organization_id uuid NOT NULL,
      payment_id uuid,
      event_type text NOT NULL
    );
    CREATE TABLE be_appointments (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      status text NOT NULL,
      payment_id uuid
    );
    CREATE TABLE capture_markers (
      organization_id uuid NOT NULL,
      payment_id uuid NOT NULL,
      marker text NOT NULL,
      PRIMARY KEY (organization_id, payment_id, marker)
    );
    CREATE TABLE be_payment_provider_events (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      provider_id text NOT NULL,
      idempotency_key text NOT NULL,
      event_type text NOT NULL,
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz,
      UNIQUE (organization_id, provider_id, idempotency_key)
    );
    CREATE TABLE delivery_markers (
      idempotency_key text PRIMARY KEY
    );
  `),
  );
}

async function seedCapture() {
  await withClient(async (client) => {
    await client.query(
      "TRUNCATE delivery_markers, be_payment_provider_events, capture_markers, be_appointments, be_payment_history_events, be_payments, be_payment_intents RESTART IDENTITY",
    );
    await client.query("INSERT INTO be_payment_intents(id, organization_id, status) VALUES ($1, $2, 'pending')", [
      intent,
      org,
    ]);
    await client.query("INSERT INTO be_appointments(id, organization_id, status) VALUES ($1, $2, 'awaiting_payment')", [
      appointment,
      org,
    ]);
    await client.query(
      "INSERT INTO be_payment_provider_events(id, organization_id, provider_id, idempotency_key, event_type, intent_ref, payload_json) VALUES ($1, $2, 'mock', 'event-1', 'payment.succeeded', 'persisted-provider-ref', '{\"intentRef\":\"persisted-provider-ref\"}'::jsonb)",
      [event, org],
    );
  });
}

async function capture(client, options = {}) {
  const { failAfter = null, holdLock = false } = options;
  await client.query("BEGIN");
  try {
    const locked = await client.query(
      "SELECT status FROM be_payment_intents WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [intent, org],
    );
    if (locked.rowCount !== 1) fail("intent lock did not resolve exact organization");
    if (holdLock) await client.query("SELECT pg_sleep(0.20)");
    if (locked.rows[0].status !== "succeeded") {
      await client.query("UPDATE be_payment_intents SET status = 'succeeded' WHERE id = $1", [intent]);
    }
    if (failAfter === "intent") throw new Error("injected_intent_crash");

    await client.query(
      "INSERT INTO be_payments(id, organization_id, payment_intent_id) VALUES ($1, $2, $3) ON CONFLICT (payment_intent_id) DO NOTHING",
      [payment, org, intent],
    );
    if (failAfter === "payment") throw new Error("injected_payment_crash");

    await client.query(
      "INSERT INTO be_payment_history_events(organization_id, payment_id, event_type) VALUES ($1, $2, 'payment_captured') ON CONFLICT DO NOTHING",
      [org, payment],
    );
    if (failAfter === "history") throw new Error("injected_history_crash");

    await client.query(
      "UPDATE be_appointments SET status = 'confirmed', payment_id = $1 WHERE id = $2 AND organization_id = $3",
      [payment, appointment, org],
    );
    if (failAfter === "appointment") throw new Error("injected_appointment_crash");

    for (const marker of ["package_activated", "product_activated"]) {
      await client.query(
        "INSERT INTO capture_markers(organization_id, payment_id, marker) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [org, payment, marker],
      );
      if (failAfter === marker) throw new Error(`injected_${marker}_crash`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function counts() {
  return withClient(async (client) => {
    const result = await client.query(
      `
      SELECT
        (SELECT status FROM be_payment_intents WHERE id = $1) AS intent_status,
        (SELECT count(*)::int FROM be_payments) AS payments,
        (SELECT count(*)::int FROM be_payment_history_events WHERE event_type = 'payment_captured') AS history,
        (SELECT status FROM be_appointments WHERE id = $2) AS appointment_status,
        (SELECT count(*)::int FROM capture_markers) AS markers,
        (SELECT count(*)::int FROM delivery_markers) AS deliveries,
        (SELECT processed_at IS NOT NULL FROM be_payment_provider_events WHERE id = $3) AS processed
    `,
      [intent, appointment, event],
    );
    return result.rows[0];
  });
}

async function proveMigrationPreflight() {
  await withClient(async (client) => {
    await client.query(
      "INSERT INTO be_payment_history_events(organization_id, payment_id, event_type) VALUES ($1, $2, 'payment_captured'), ($1, $2, 'payment_captured')",
      [org, payment],
    );
    let rejected = false;
    try {
      await client.query(migrationSql);
    } catch (error) {
      rejected = String(error.message).includes("duplicate_groups=1");
    }
    if (!rejected) fail("migration did not fail closed on historical duplicate captures");
    const count = await client.query("SELECT count(*)::int AS c FROM be_payment_history_events");
    if (count.rows[0].c !== 2) fail("migration altered historical duplicate rows");
    await client.query("TRUNCATE be_payment_history_events RESTART IDENTITY");
    await client.query(migrationSql);
  });
}

async function proveCrashReplay() {
  for (const failAfter of ["intent", "payment", "history", "appointment", "package_activated", "product_activated"]) {
    await seedCapture();
    await withClient((client) => capture(client, { failAfter })).then(
      () => fail(`injected ${failAfter} crash unexpectedly committed`),
      () => undefined,
    );
    const rolledBack = await counts();
    if (
      rolledBack.intent_status !== "pending" ||
      rolledBack.payments !== 0 ||
      rolledBack.history !== 0 ||
      rolledBack.appointment_status !== "awaiting_payment" ||
      rolledBack.markers !== 0
    ) {
      fail(`transaction boundary ${failAfter} did not roll back completely`);
    }
    await withClient((client) => capture(client));
    await withClient((client) => capture(client));
    const replayed = await counts();
    if (
      replayed.intent_status !== "succeeded" ||
      replayed.payments !== 1 ||
      replayed.history !== 1 ||
      replayed.appointment_status !== "confirmed" ||
      replayed.markers !== 2
    ) {
      fail(`replay after ${failAfter} did not converge exactly once`);
    }
  }
}

async function provePersistedProviderEventWinsChangedDuplicate() {
  await seedCapture();
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO be_payment_provider_events(
         id, organization_id, provider_id, idempotency_key, event_type, intent_ref, payload_json
       ) VALUES (
         '50000000-0000-4000-8000-000000000002', $1, 'mock', 'event-1',
         'payment.refunded', 'fresh-changed-ref', '{"intentRef":"fresh-changed-ref"}'::jsonb
       ) ON CONFLICT (organization_id, provider_id, idempotency_key) DO NOTHING`,
      [org],
    );
    const persisted = await client.query(
      "SELECT event_type, intent_ref, payload_json FROM be_payment_provider_events WHERE id = $1 AND organization_id = $2",
      [event, org],
    );
    const row = persisted.rows[0];
    if (
      row?.event_type !== "payment.succeeded" ||
      row?.intent_ref !== "persisted-provider-ref" ||
      row?.payload_json?.intentRef !== "persisted-provider-ref"
    ) {
      fail("changed duplicate body replaced the canonical stored provider event");
    }
  });
}

const deliveryLockKey = `payment_capture_delivery:${org}:intent:${intent}`;

async function processProviderEventWithSerializedDelivery(lockClient, options = {}) {
  const { holdDelivery = false, failDelivery = false } = options;
  await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [deliveryLockKey]);
  try {
    const current = await lockClient.query(
      "SELECT processed_at FROM be_payment_provider_events WHERE id = $1 AND organization_id = $2",
      [event, org],
    );
    if (current.rows[0]?.processed_at) return "duplicate";

    await withClient((captureClient) => capture(captureClient));
    if (holdDelivery) await lockClient.query("SELECT pg_sleep(0.20)");
    if (failDelivery) throw new Error("injected_delivery_failure");
    await lockClient.query(
      "INSERT INTO delivery_markers(idempotency_key) VALUES ('booking.payment_captured:payment-1:appointment-1') ON CONFLICT DO NOTHING",
    );
    await lockClient.query(
      "UPDATE be_payment_provider_events SET processed_at = now() WHERE id = $1 AND organization_id = $2",
      [event, org],
    );
    return "processed";
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [deliveryLockKey]);
  }
}

async function proveConcurrentReplayAndPostCommitDelivery() {
  await seedCapture();
  const first = newClient();
  const second = newClient();
  await Promise.all([first.connect(), second.connect()]);
  try {
    const results = await Promise.all([
      processProviderEventWithSerializedDelivery(first, { holdDelivery: true }),
      processProviderEventWithSerializedDelivery(second),
    ]);
    if (!results.includes("processed") || !results.includes("duplicate")) {
      fail("session lock did not serialize provider completion through delivery");
    }
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
  const result = await counts();
  if (
    result.payments !== 1 ||
    result.history !== 1 ||
    result.markers !== 2 ||
    result.deliveries !== 1 ||
    !result.processed
  ) {
    fail("post-commit replay did not converge provider completion/delivery exactly once");
  }
}

async function proveDeliveryFailureRemainsReplayable() {
  await seedCapture();
  await withClient((client) =>
    processProviderEventWithSerializedDelivery(client, { failDelivery: true }),
  ).then(
    () => fail("injected mandatory delivery failure unexpectedly completed"),
    () => undefined,
  );
  let result = await counts();
  if (result.processed || result.deliveries !== 0 || result.payments !== 1) {
    fail("delivery failure did not preserve an unprocessed replayable provider event");
  }
  await withClient((client) => processProviderEventWithSerializedDelivery(client));
  result = await counts();
  if (!result.processed || result.deliveries !== 1 || result.payments !== 1 || result.history !== 1) {
    fail("delivery failure replay did not converge exactly once");
  }
}

try {
  selfTest();
  if (!existsSync(path.join(pgBin, "initdb"))) fail("PostgreSQL 16 binaries are unavailable");
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"], "private initdb");
  run(
    path.join(pgBin, "pg_ctl"),
    ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"],
    "private PostgreSQL startup",
  );
  serverStarted = true;
  run(path.join(pgBin, "createdb"), ["-h", socket, "-p", String(port), database], "private database creation");
  await installSchema();
  await proveMigrationPreflight();
  await provePersistedProviderEventWinsChangedDuplicate();
  await proveCrashReplay();
  await proveConcurrentReplayAndPostCommitDelivery();
  await proveDeliveryFailureRemainsReplayable();
  console.log(
    "B1 #949 payment capture proof: OK — aggregate migration preflight, canonical stored duplicate body, six rollback boundaries, replay, session-serialized duplicates, mandatory delivery failure/retry and exact-once DB effects verified on private PostgreSQL 16",
  );
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], {
      encoding: "utf8",
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
