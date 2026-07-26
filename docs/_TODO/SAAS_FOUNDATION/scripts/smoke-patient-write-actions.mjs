#!/usr/bin/env node
/**
 * Exercises exactly the patient WRITE paths unblocked by the two grant fixes landed in commits
 * 7e0bf0a83 (patient support mark-read, deploy/postgres/patient-support-mark-read-grant.sql) and
 * 715867dfb (reminder_journal + treatment_program_instance* column grants,
 * deploy/postgres/patient-write-grants-role-pool-mismatch.sql). Both fixes are wired into the deploy
 * closure but have NEVER been proven live over HTTP — a GET-only page walk
 * (walk-app-pages-no-redirect.mjs) cannot catch this class of defect because it breaks on a BUTTON
 * PRESS (POST/PATCH), not a page load.
 *
 * This is a NEW script, not an extension of docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs.
 * That harness already has a `mutationScenarios` mechanism (contract-driven, `disabledByDefault`,
 * `--include-mutations`) that could eventually host this — but wiring into it means editing
 * saas-product-smoke-contract.json (repo root of SAAS_FOUNDATION, not scripts/) and
 * deploy/host/deploy-test-saas.sh's `run_locked_product_smoke`, both of which are explicitly
 * off-limits for this task (another agent owns them right now) and, more importantly, that harness's
 * `classifyResponse` has no notion of "identity must be the confirmed synthetic patient before any
 * write" or "derive target ids from the acting patient's OWN data, not a static ref" — the safety
 * model this script needs is different in kind, not just in scenario list. Recommendation: keep this
 * standalone; revisit folding in once the mutation-scenario contract grows an identity-confirmation
 * primitive.
 *
 * Auth:
 *  --auth=dev-bypass   DEV only (loopback base URL enforced). Acquires ONLY the patient
 *                      (`dev:client`) dev-bypass cookie. If this DEV instance has no seeded synthetic
 *                      patient account (see docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md §4.2.1),
 *                      dev-bypass returns 303 with NO Set-Cookie header — this script fails closed
 *                      and performs zero writes, exactly like walk-app-pages-no-redirect.mjs treats an
 *                      unavailable role.
 *  --auth=fixture      Reads the operator-managed fixture (same shape/loader as
 *                      walk-app-pages-no-redirect.mjs / smoke-saas-product.mjs), default path
 *                      /run/bersoncarebot/saas-smoke.fixture. Only authProfiles.patient is used.
 *
 * Identity confirmation (hard requirement, not optional):
 *  --expected-patient-user-id=<uuid> is REQUIRED. After acquiring a session this script calls
 *  GET /api/me and refuses to perform ANY write unless the returned user.userId matches exactly and
 *  user.role indicates the patient/client role. There is no default and no fallback — an unconfirmed
 *  identity aborts the whole run before the first mutation.
 *
 * Target discovery (never "the first row in a table"):
 *  - support.mark-read: conversationId comes from GET /api/patient/messages (bootstrap), which is
 *    inherently scoped to the confirmed session's own userId (finds-or-creates that user's own
 *    conversation; apps/webapp/src/app/api/patient/messages/route.ts). No static ref needed.
 *  - program.touch / program.complete: instanceId/itemId come from GET
 *    /api/patient/treatment-program-instances (own list) + GET .../{instanceId} (own detail,
 *    apps/webapp/src/infra/repos ownership-scoped), unless overridden by --refs-file. No static ref
 *    needed for discovery, but these two actions are gated OFF by default (see Irreversibility below).
 *  - reminders.done / .snooze / .skip: there is NO HTTP-reachable "list my reminder occurrences"
 *    endpoint in this codebase (the reminders page is server-rendered, not backed by a JSON API for
 *    occurrence listing — confirmed by repo search 2026-07-26). These three REQUIRE an explicit
 *    operator-supplied occurrence id via --refs-file (keys reminderDoneOccurrenceId /
 *    reminderSnoozeOccurrenceId / reminderSkipOccurrenceId), each scoped to the confirmed patient by
 *    the route's own ownership check (reminder_occurrence_history joined to platform_users.id). Missing
 *    a ref SKIPS that action explicitly — this script never guesses an occurrence id.
 *
 * Irreversibility gate:
 *  program.touch flips a stage from "available" to "in_progress" exactly once (idempotent no-op after
 *  that — re-running never re-exercises the grant). program.complete sets stage_item.completed_at from
 *  null to now() (idempotent on rerun, but the FIRST completion is a one-way state change on the
 *  patient's real program progress — there is no "uncomplete" API to clean up after). Neither can be
 *  made reversible without creating a disposable stage/item as the doctor first and deleting it after,
 *  which is materially more scope (a doctor-session program-assignment + cleanup flow) than this task
 *  sized for. Per the task's own instruction ("if an action cannot be undone, it must create its own
 *  synthetic subject first and clean it up after" is a MUST, and choosing to skip that is a decision,
 *  not a mechanical call), these two actions are SKIPPED unless --include-irreversible-program-writes
 *  is passed explicitly. Recommendation to the lead: on a demo/synthetic fixture patient (not a real
 *  person), a one-way "exercise touched, stage in progress" is very likely acceptable collateral —
 *  but that is a call for the lead, not this worker, so the default stays OFF.
 *
 * reminders.snooze / reminders.skip caveat (read before treating either as a real FAIL):
 *  patient-write-grants-role-pool-mismatch.sql documents, in the current code, that recordSnooze and
 *  recordSkip ALSO write reminder_occurrence_history (snoozed_at/skipped_at) BEFORE the
 *  reminder_journal insert, in the same transaction, and that table's RLS policy has no patient branch
 *  at all — EXCLUDED from the 715867dfb grant by explicit owner-gated design note, not an oversight.
 *  These two are EXPECTED to still fail today. A failure here is not evidence this task's fix is
 *  broken; a PASS here would actually be a surprise worth flagging.
 *
 * SQLSTATE / error-code visibility (read before grading a result "inconclusive"):
 *  - support.mark-read: the route has no try/catch around the write — a DB-level 42501 becomes an
 *    uncaught exception, so Next.js returns a bare 500 with a digest and NO error code in the body.
 *    This script can only observe the 500→200 status transition, not a literal SQLSTATE.
 *  - reminders.done/.snooze/.skip: pgReminderJournal.ts wraps every write in try/catch and SWALLOWS
 *    the underlying error into `{ok:false, error:"not_found"}` → HTTP 404. A 42501 permission failure
 *    and a genuinely-nonexistent occurrence id are HTTP-INDISTINGUISHABLE for these three actions. A
 *    404 here proves nothing either way; only a 200 is proof of success. This script marks 404 results
 *    `ambiguous: true` rather than pretending it identified the cause.
 *  - program.touch/.complete: the route catches and returns `{ok:false, error: e.message}` with the
 *    RAW (unsanitized) Postgres error text — a 42501 permission failure surfaces as HTTP 400 with a
 *    body containing "permission denied for table ...". This script pattern-matches that phrase, since
 *    the numeric SQLSTATE itself is never in the JSON body.
 *
 * Safety: never prints a cookie/header value. GET-discovery calls are read-only and scoped to the
 * confirmed session's own userId by the routes themselves. Every write is a POST already exposed to
 * the real patient UI/service-worker (no new capability is invented). No route touched here sends an
 * email/SMS/push/Telegram message — see the per-action "send-safety" notes inline below; none of the
 * chosen actions overlaps with apps/webapp/src/app/api/patient/support (the one patient route that
 * relays a live Telegram message) or any notification dispatch path.
 *
 * Usage:
 *   node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-write-actions.mjs \
 *     --base-url=http://127.0.0.1:5200 \
 *     --auth=dev-bypass \
 *     --expected-patient-user-id=<uuid> \
 *     [--refs-file=<path>] \
 *     [--include-irreversible-program-writes] \
 *     [--out-json=<path>]
 *
 *   node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-write-actions.mjs \
 *     --base-url=https://test.bersoncare.ru \
 *     --auth=fixture --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
 *     --expected-patient-user-id=<uuid> \
 *     --refs-file=<path with reminder occurrence ids>
 */
import { readFileSync, writeFileSync } from "node:fs";

const SESSION_COOKIE_NAME = "bersoncare_webapp_session";

function fail(message) {
  console.error(`smoke-patient-write-actions: FATAL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    auth: null,
    fixtureFile: "/run/bersoncarebot/saas-smoke.fixture",
    expectedPatientUserId: null,
    refsFile: null,
    includeIrreversible: false,
    outJson: null,
    timeoutMs: 15000,
  };
  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--auth=")) options.auth = arg.slice("--auth=".length);
    else if (arg.startsWith("--fixture-file=")) options.fixtureFile = arg.slice("--fixture-file=".length);
    else if (arg.startsWith("--expected-patient-user-id="))
      options.expectedPatientUserId = arg.slice("--expected-patient-user-id=".length);
    else if (arg.startsWith("--refs-file=")) options.refsFile = arg.slice("--refs-file=".length);
    else if (arg === "--include-irreversible-program-writes") options.includeIrreversible = true;
    else if (arg.startsWith("--out-json=")) options.outJson = arg.slice("--out-json=".length);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else fail(`unknown argument: ${arg}`);
  }
  if (!options.baseUrl) fail("--base-url=<url> is required");
  if (options.auth !== "dev-bypass" && options.auth !== "fixture") {
    fail("--auth=dev-bypass|fixture is required");
  }
  if (!options.expectedPatientUserId?.trim()) {
    fail(
      "--expected-patient-user-id=<uuid> is required — this script refuses to run against an " +
        "unconfirmed identity (hard requirement, not a default).",
    );
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  return options;
}

function loadRefs(refsFile) {
  if (!refsFile) return {};
  const raw = JSON.parse(readFileSync(refsFile, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("refs-file must be a JSON object");
  return raw;
}

// ---------------------------------------------------------------------------
// Auth acquisition — cookie VALUES only ever live in this in-memory variable.
// ---------------------------------------------------------------------------

function firstSessionCookie(setCookieHeaders) {
  for (const raw of setCookieHeaders ?? []) {
    const match = raw.match(new RegExp(`^(${SESSION_COOKIE_NAME}=[^;]+)`));
    if (match) return match[1];
  }
  return null;
}

async function acquireDevBypassPatientCookie(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/dev-bypass?token=${encodeURIComponent("dev:client")}`, {
    redirect: "manual",
  });
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const cookie = firstSessionCookie(setCookies);
  const observedStatus = response.status;
  const observedLocation = response.headers.get("location");
  await response.arrayBuffer().catch(() => {});
  if (!cookie) {
    fail(
      `dev-bypass login failed closed for role=patient (token=dev:client, status=${observedStatus}, ` +
        `location=${observedLocation ?? "(none)"}, no Set-Cookie). This DEV instance has no seeded ` +
        `synthetic patient platform_user + messenger binding (see ` +
        `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md §4.2.1). Zero writes attempted. Fixing this ` +
        `requires the one-time DEV seed preparation in that doc, not an ad hoc grant/insert from this ` +
        `script — the doc explicitly says not to invent a runtime account-creation path here.`,
    );
  }
  console.log("auth: acquired dev-bypass session for role=patient (cookie not printed)");
  return { Cookie: cookie };
}

function loadFixturePatientHeaders(fixtureFile) {
  let raw;
  try {
    raw = readFileSync(fixtureFile, "utf8");
  } catch (error) {
    fail(`cannot read fixture file ${fixtureFile}: ${error.code ?? error.message}`);
  }
  const fixture = JSON.parse(raw);
  if (fixture.schemaVersion !== 1) fail("fixture schemaVersion must be 1");
  const headers = fixture.authProfiles?.patient?.headers;
  if (!headers || Object.keys(headers).length === 0) {
    fail("fixture missing non-empty authProfiles.patient.headers");
  }
  console.log("auth: loaded fixture auth profile for role=patient (headers not printed)");
  return { ...headers };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function mutationOriginHeader(baseUrl) {
  return { Origin: new URL(baseUrl).origin };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callJson({ baseUrl, path, method, headers, body, timeoutMs }) {
  const url = `${baseUrl}${path}`;
  const isMutation = method !== "GET" && method !== "HEAD";
  const reqHeaders = { ...headers, ...(isMutation ? mutationOriginHeader(baseUrl) : {}) };
  if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: reqHeaders,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
      },
      timeoutMs,
    );
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text, requestError: null };
  } catch (error) {
    return {
      status: null,
      json: null,
      text: "",
      requestError: error.name === "AbortError" ? "timeout" : (error.code ?? error.message),
    };
  }
}

// ---------------------------------------------------------------------------
// Identity confirmation
// ---------------------------------------------------------------------------

async function confirmSyntheticPatientIdentity({ baseUrl, headers, expectedPatientUserId, timeoutMs }) {
  const res = await callJson({ baseUrl, path: "/api/me", method: "GET", headers, timeoutMs });
  if (res.requestError) fail(`GET /api/me request failed: ${res.requestError}`);
  if (res.status !== 200 || !res.json?.ok) {
    fail(
      `GET /api/me did not return an authenticated session (status=${res.status}). Cannot confirm ` +
        `acting identity — zero writes attempted.`,
    );
  }
  const user = res.json.user;
  const userId = user?.userId ?? user?.id;
  const role = user?.role;
  if (userId !== expectedPatientUserId) {
    fail(
      `identity mismatch: acquired session is userId=${userId ? "(redacted, does not match expected)" : "(missing)"}, ` +
        `expected the confirmed synthetic patient (--expected-patient-user-id). Refusing to run any ` +
        `write against an unconfirmed identity.`,
    );
  }
  if (role !== "client" && role !== "patient") {
    fail(`identity confirmed userId matches, but session role="${role}" is not a patient role. Aborting.`);
  }
  console.log(`identity: confirmed acting session is the expected synthetic patient (role=${role})`);
  return { userId, role };
}

// ---------------------------------------------------------------------------
// Per-action runners
// ---------------------------------------------------------------------------

function pgPermissionDenied(text) {
  return /permission denied for table/i.test(text ?? "");
}

async function runSupportMarkRead({ baseUrl, headers, timeoutMs }) {
  const boot = await callJson({
    baseUrl,
    path: "/api/patient/messages",
    method: "GET",
    headers,
    timeoutMs,
  });
  if (boot.requestError || boot.status !== 200 || !boot.json?.ok || !boot.json?.conversationId) {
    return {
      id: "support.mark-read",
      outcome: "BLOCKED",
      reason: `bootstrap GET /api/patient/messages failed (status=${boot.status ?? "n/a"}, ` +
        `requestError=${boot.requestError ?? "none"})`,
      httpStatus: boot.status,
      errorCode: null,
    };
  }
  const conversationId = boot.json.conversationId;
  const res = await callJson({
    baseUrl,
    path: "/api/patient/messages/read",
    method: "POST",
    headers,
    body: { conversationId },
    timeoutMs,
  });
  const pass = res.status === 200 && res.json?.ok === true;
  return {
    id: "support.mark-read",
    outcome: res.requestError ? "FAIL" : pass ? "PASS" : "FAIL",
    reason: res.requestError
      ? `request_failed:${res.requestError}`
      : pass
        ? "ok"
        : `unexpected status/body (route has no try/catch around the DB write — a 500 here with no ` +
          `error code in the body is the exact original defect shape; body=${JSON.stringify(res.json ?? res.text).slice(0, 300)})`,
    httpStatus: res.status,
    errorCode: res.json?.error ?? (res.status === 500 ? "500_no_code_in_body" : null),
  };
}

async function runReminderAction({ baseUrl, headers, timeoutMs, action, occurrenceId, path }) {
  if (!occurrenceId) {
    return {
      id: `reminders.${action}`,
      outcome: "SKIPPED",
      reason:
        `missing refs-file key for this occurrence id — there is no HTTP-reachable "list my reminder ` +
        `occurrences" endpoint in this codebase to auto-discover one; operator must supply an ` +
        `occurrence id owned by the confirmed synthetic patient.`,
      httpStatus: null,
      errorCode: null,
    };
  }
  const res = await callJson({ baseUrl, path, method: "POST", headers, timeoutMs });
  const pass = res.status === 200 && res.json?.ok === true;
  const ambiguous404 = res.status === 404;
  return {
    id: `reminders.${action}`,
    outcome: res.requestError ? "FAIL" : pass ? "PASS" : ambiguous404 ? "FAIL" : "FAIL",
    reason: res.requestError
      ? `request_failed:${res.requestError}`
      : pass
        ? "ok"
        : ambiguous404
          ? "404 not_found — pgReminderJournal swallows the underlying DB error into this SAME shape " +
            "as a genuinely-nonexistent occurrence; this status alone does not prove a 42501, but does " +
            "not prove the grant works either (ambiguous, see script header comment)"
          : `unexpected status/body (body=${JSON.stringify(res.json ?? res.text).slice(0, 300)})`,
    httpStatus: res.status,
    errorCode: res.json?.error ?? null,
    ambiguous: ambiguous404,
  };
}

async function discoverTouchableAndCompletableItems({ baseUrl, headers, timeoutMs, refs }) {
  if (refs.programInstanceId && refs.programTouchItemId) {
    return {
      instanceId: refs.programInstanceId,
      touchItemId: refs.programTouchItemId,
      completeItemId: refs.programCompleteItemId ?? null,
    };
  }
  const list = await callJson({
    baseUrl,
    path: "/api/patient/treatment-program-instances",
    method: "GET",
    headers,
    timeoutMs,
  });
  if (list.requestError || list.status !== 200 || !list.json?.ok || !Array.isArray(list.json.items)) {
    return { error: `GET /api/patient/treatment-program-instances failed (status=${list.status ?? "n/a"})` };
  }
  for (const summary of list.json.items) {
    const instanceId = summary?.id;
    if (!instanceId) continue;
    const detail = await callJson({
      baseUrl,
      path: `/api/patient/treatment-program-instances/${instanceId}`,
      method: "GET",
      headers,
      timeoutMs,
    });
    if (detail.status !== 200 || !detail.json?.ok) continue;
    const stages = detail.json.item?.stages ?? [];
    let touchItemId = null;
    let completeItemId = null;
    for (const stage of stages) {
      for (const item of stage.items ?? []) {
        if (!touchItemId && stage.status === "available") touchItemId = item.id;
        if (
          !completeItemId &&
          item.completedAt == null &&
          item.itemType !== "clinical_test" &&
          item.isPersistentRecommendation !== true &&
          item.active !== false
        ) {
          completeItemId = item.id;
        }
      }
    }
    if (touchItemId || completeItemId) {
      return { instanceId, touchItemId, completeItemId };
    }
  }
  return { error: "no instance with a touchable/completable item found in the patient's own program list" };
}

async function runProgramTouch({ baseUrl, headers, timeoutMs, instanceId, itemId }) {
  const res = await callJson({
    baseUrl,
    path: `/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/progress/touch`,
    method: "POST",
    headers,
    timeoutMs,
  });
  const pass = res.status === 200 && res.json?.ok === true;
  const denied = pgPermissionDenied(res.text);
  return {
    id: "program.touch",
    outcome: res.requestError ? "FAIL" : pass ? "PASS" : "FAIL",
    reason: res.requestError
      ? `request_failed:${res.requestError}`
      : pass
        ? "ok"
        : denied
          ? "permission_denied_for_table (raw pg error text present in body — this IS the 42501 signal)"
          : `unexpected status/body (body=${JSON.stringify(res.json ?? res.text).slice(0, 300)})`,
    httpStatus: res.status,
    errorCode: denied ? "permission_denied_for_table" : (res.json?.error ?? null),
  };
}

async function runProgramComplete({ baseUrl, headers, timeoutMs, instanceId, itemId }) {
  const res = await callJson({
    baseUrl,
    path: `/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/progress/complete`,
    method: "POST",
    headers,
    body: {},
    timeoutMs,
  });
  const pass = res.status === 200 && res.json?.ok === true;
  const denied = pgPermissionDenied(res.text);
  return {
    id: "program.complete",
    outcome: res.requestError ? "FAIL" : pass ? "PASS" : "FAIL",
    reason: res.requestError
      ? `request_failed:${res.requestError}`
      : pass
        ? "ok (ONE-WAY: item.completedAt is now set; no uncomplete API exists)"
        : denied
          ? "permission_denied_for_table (raw pg error text present in body — this IS the 42501 signal)"
          : `unexpected status/body (body=${JSON.stringify(res.json ?? res.text).slice(0, 300)})`,
    httpStatus: res.status,
    errorCode: denied ? "permission_denied_for_table" : (res.json?.error ?? null),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.auth === "dev-bypass" && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(options.baseUrl)) {
    fail("--auth=dev-bypass refused against a non-loopback base URL; use --auth=fixture there.");
  }

  const refs = loadRefs(options.refsFile);

  const headers =
    options.auth === "dev-bypass"
      ? await acquireDevBypassPatientCookie(options.baseUrl)
      : loadFixturePatientHeaders(options.fixtureFile);

  await confirmSyntheticPatientIdentity({
    baseUrl: options.baseUrl,
    headers,
    expectedPatientUserId: options.expectedPatientUserId,
    timeoutMs: options.timeoutMs,
  });

  const results = [];

  results.push(await runSupportMarkRead({ baseUrl: options.baseUrl, headers, timeoutMs: options.timeoutMs }));

  results.push(
    await runReminderAction({
      baseUrl: options.baseUrl,
      headers,
      timeoutMs: options.timeoutMs,
      action: "done",
      occurrenceId: refs.reminderDoneOccurrenceId ?? null,
      path: `/api/patient/reminders/${refs.reminderDoneOccurrenceId}/done`,
    }),
  );
  results.push(
    await runReminderAction({
      baseUrl: options.baseUrl,
      headers,
      timeoutMs: options.timeoutMs,
      action: "snooze",
      occurrenceId: refs.reminderSnoozeOccurrenceId ?? null,
      path: `/api/patient/reminders/occurrences/${refs.reminderSnoozeOccurrenceId}/snooze`,
    }),
  );
  results.push(
    await runReminderAction({
      baseUrl: options.baseUrl,
      headers,
      timeoutMs: options.timeoutMs,
      action: "skip",
      occurrenceId: refs.reminderSkipOccurrenceId ?? null,
      path: `/api/patient/reminders/occurrences/${refs.reminderSkipOccurrenceId}/skip`,
    }),
  );

  if (!options.includeIrreversible) {
    results.push({
      id: "program.touch",
      outcome: "SKIPPED",
      reason:
        "irreversible one-way state change on synthetic fixture data; rerun with " +
        "--include-irreversible-program-writes after the lead accepts that as safe collateral",
      httpStatus: null,
      errorCode: null,
    });
    results.push({
      id: "program.complete",
      outcome: "SKIPPED",
      reason:
        "irreversible one-way state change (no uncomplete API); rerun with " +
        "--include-irreversible-program-writes after the lead accepts that as safe collateral",
      httpStatus: null,
      errorCode: null,
    });
  } else {
    const discovered = await discoverTouchableAndCompletableItems({
      baseUrl: options.baseUrl,
      headers,
      timeoutMs: options.timeoutMs,
      refs,
    });
    if (discovered.error) {
      results.push({
        id: "program.touch",
        outcome: "BLOCKED",
        reason: discovered.error,
        httpStatus: null,
        errorCode: null,
      });
      results.push({
        id: "program.complete",
        outcome: "BLOCKED",
        reason: discovered.error,
        httpStatus: null,
        errorCode: null,
      });
    } else {
      if (discovered.touchItemId) {
        results.push(
          await runProgramTouch({
            baseUrl: options.baseUrl,
            headers,
            timeoutMs: options.timeoutMs,
            instanceId: discovered.instanceId,
            itemId: discovered.touchItemId,
          }),
        );
      } else {
        results.push({
          id: "program.touch",
          outcome: "BLOCKED",
          reason: "no item with stage.status=available found for this patient",
          httpStatus: null,
          errorCode: null,
        });
      }
      if (discovered.completeItemId) {
        results.push(
          await runProgramComplete({
            baseUrl: options.baseUrl,
            headers,
            timeoutMs: options.timeoutMs,
            instanceId: discovered.instanceId,
            itemId: discovered.completeItemId,
          }),
        );
      } else {
        results.push({
          id: "program.complete",
          outcome: "BLOCKED",
          reason: "no not-yet-completed, non-test, active item found for this patient",
          httpStatus: null,
          errorCode: null,
        });
      }
    }
  }

  console.log("\n=== RESULTS ===");
  for (const r of results) {
    console.log(
      `${r.outcome.padEnd(8)} ${r.id.padEnd(20)} status=${r.httpStatus ?? "n/a"} errorCode=${r.errorCode ?? "none"} — ${r.reason}`,
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    auth: options.auth,
    includeIrreversible: options.includeIrreversible,
    results,
  };
  if (options.outJson) {
    writeFileSync(options.outJson, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`\nwrote JSON: ${options.outJson}`);
  }

  const anyFail = results.some((r) => r.outcome === "FAIL");
  if (anyFail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`smoke-patient-write-actions: fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
