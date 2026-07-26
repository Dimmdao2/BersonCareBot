#!/usr/bin/env node
/**
 * Walks every `/app/**` page under all five product roles (doctor, clinic_admin, patient,
 * global_admin, public) against a target base URL and records the RAW response — status code,
 * `Location` header on 3xx, byte size, and whether a nominal 200 is actually the unauthenticated
 * login screen in disguise — WITHOUT ever following a redirect.
 *
 * Why this exists (2026-07-26): a previous walk reported 570/570 OK because it used `curl -L`
 * (follow redirects), so a bounce from a protected doctor page to the login screen counted as a
 * pass. This script never follows a redirect (`fetch(..., { redirect: "manual" })`) and treats a
 * 200 whose body contains the login screen's marker (`id="app-entry-content"`, see
 * apps/webapp/src/app/app/AppEntryLoginContent.tsx) as a distinct LOGIN-PAGE-AS-200 failure class,
 * even when the raw status code is 200. Dynamic routes ([id], [...catchAll]) that have no concrete
 * id available are reported as an explicit, itemized skip list — never silently dropped.
 *
 * Route discovery: every `page.tsx` under apps/webapp/src/app/app, minus Next.js route groups
 * `(group-name)/`, which are not part of the URL.
 *
 * Auth:
 *  --auth=dev-bypass   Only valid against a DEV server (ALLOW_DEV_AUTH_BYPASS=true). The script
 *                       itself performs one GET /api/auth/dev-bypass?token=dev:<role> per staff
 *                       role and captures the Set-Cookie session cookie in memory. `public` gets no
 *                       cookie. Never use against TEST/PROD (dev-bypass does not exist there).
 *  --auth=fixture       Reads the operator-managed fixture (see
 *                       docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md),
 *                       default path /run/bersoncarebot/saas-smoke.fixture, override with
 *                       --fixture-file=<path>. This is the only supported auth source for TEST.
 *
 * Secrets discipline: cookie/header VALUES are held only in local variables for the duration of
 * the run and are never written to the JSON/CSV output, console, or any file. Output identifies
 * sessions by role name only.
 *
 * GET-only, read-only. Never mutates state.
 *
 * Usage:
 *   node docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs \
 *     --base-url=http://127.0.0.1:5200 \
 *     --auth=dev-bypass \
 *     --out-json=/tmp/walk-dev.json \
 *     --out-csv=/tmp/walk-dev.csv
 *
 *   node docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs \
 *     --base-url=https://test.bersoncare.ru \
 *     --auth=fixture \
 *     --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
 *     --out-json=/tmp/walk-test.json \
 *     --out-csv=/tmp/walk-test.csv
 *
 * Optional:
 *   --concurrency=6            (default 6, in-flight request cap)
 *   --timeout-ms=15000         (per-request timeout)
 *   --params-file=<path>       JSON object { paramName: "concreteValue" } used to fill dynamic
 *                              route segments (e.g. { "id": "...", "userId": "..." }). Routes whose
 *                              params are not all present in this file are skipped and itemized —
 *                              never silently dropped.
 *   --include=<regex>          Only walk routes whose rendered path matches this regex.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const appRouterRoot = resolve(repoRoot, "apps/webapp/src/app");
const appDir = resolve(appRouterRoot, "app");

const SESSION_COOKIE_NAME = "bersoncare_webapp_session";
const LOGIN_PAGE_MARKER = 'id="app-entry-content"';
const ENTRY_PATHS = new Set(["/app", "/app/tg", "/app/max"]);

const ROLES = ["doctor", "clinic_admin", "patient", "global_admin", "public"];
const DEV_BYPASS_TOKEN_BY_ROLE = {
  doctor: "dev:doctor",
  clinic_admin: "dev:clinic-admin",
  patient: "dev:client",
  global_admin: "dev:admin",
  // public: no token, no session
};

function fail(message) {
  console.error(`walk-app-pages-no-redirect: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    auth: null,
    fixtureFile: "/run/bersoncarebot/saas-smoke.fixture",
    concurrency: 6,
    timeoutMs: 15000,
    paramsFile: null,
    outJson: null,
    outCsv: null,
    include: null,
  };
  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--auth=")) options.auth = arg.slice("--auth=".length);
    else if (arg.startsWith("--fixture-file=")) options.fixtureFile = arg.slice("--fixture-file=".length);
    else if (arg.startsWith("--concurrency=")) options.concurrency = Number(arg.slice("--concurrency=".length));
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else if (arg.startsWith("--params-file=")) options.paramsFile = arg.slice("--params-file=".length);
    else if (arg.startsWith("--out-json=")) options.outJson = arg.slice("--out-json=".length);
    else if (arg.startsWith("--out-csv=")) options.outCsv = arg.slice("--out-csv=".length);
    else if (arg.startsWith("--include=")) options.include = arg.slice("--include=".length);
    else fail(`unknown argument: ${arg}`);
  }
  if (!options.baseUrl) fail("--base-url=<url> is required");
  if (options.auth !== "dev-bypass" && options.auth !== "fixture") {
    fail('--auth=dev-bypass|fixture is required');
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    fail("--concurrency must be a positive integer");
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  return options;
}

// ---------------------------------------------------------------------------
// Route discovery
// ---------------------------------------------------------------------------

function findPageFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findPageFiles(full, out);
    } else if (entry === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

/**
 * Converts one apps/webapp/src/app/app/**\/page.tsx path into a route template with dynamic
 * segments preserved as `:paramName` (single), `:...paramName` (catch-all) or
 * `:...?paramName` (optional catch-all), plus the raw param names required.
 */
function toRouteTemplate(pageFilePath) {
  const rel = relative(appRouterRoot, dirname(pageFilePath)); // e.g. "app/(global-admin)/doctor/admin/x"
  const segments = rel.split(sep).filter(Boolean);
  const kept = [];
  const dynamicParams = [];
  for (const segment of segments) {
    if (/^\(.+\)$/.test(segment)) continue; // route group — not part of the URL
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    const dynamic = segment.match(/^\[(.+)\]$/);
    if (optionalCatchAll) {
      dynamicParams.push(optionalCatchAll[1]);
      kept.push(`:...?${optionalCatchAll[1]}`);
    } else if (catchAll) {
      dynamicParams.push(catchAll[1]);
      kept.push(`:...${catchAll[1]}`);
    } else if (dynamic) {
      dynamicParams.push(dynamic[1]);
      kept.push(`:${dynamic[1]}`);
    } else {
      kept.push(segment);
    }
  }
  return { template: `/${kept.join("/")}`, dynamicParams };
}

function discoverRoutes() {
  const pageFiles = findPageFiles(appDir);
  return pageFiles.map(toRouteTemplate).sort((a, b) => a.template.localeCompare(b.template));
}

function renderRoute(routeInfo, paramsByName) {
  if (routeInfo.dynamicParams.length === 0) return routeInfo.template;
  const missing = routeInfo.dynamicParams.filter((p) => !(p in paramsByName));
  if (missing.length > 0) return null;
  let rendered = routeInfo.template;
  for (const p of routeInfo.dynamicParams) {
    const value = String(paramsByName[p]);
    rendered = rendered
      .replace(`:...?${p}`, value)
      .replace(`:...${p}`, value)
      .replace(`:${p}`, value);
  }
  return rendered;
}

// ---------------------------------------------------------------------------
// Auth acquisition — cookie VALUES only ever live in this in-memory map.
// ---------------------------------------------------------------------------

function firstSessionCookie(setCookieHeaders) {
  for (const raw of setCookieHeaders ?? []) {
    const match = raw.match(new RegExp(`^(${SESSION_COOKIE_NAME}=[^;]+)`));
    if (match) return match[1];
  }
  return null;
}

/**
 * Returns { headersByRole, unavailableRoles }. A role whose dev-bypass login fails closed (this
 * DEV instance has no seeded synthetic account for it — see LOCAL_DEV_AND_AGENT_TESTING.md §4.2.1)
 * is NOT a script error: it is recorded in `unavailableRoles` with the observed status/location and
 * excluded from the probe matrix, never silently dropped from the report.
 */
async function acquireDevBypassCookies(baseUrl) {
  const headersByRole = {};
  const unavailableRoles = [];
  for (const role of ROLES) {
    const token = DEV_BYPASS_TOKEN_BY_ROLE[role];
    if (!token) {
      headersByRole[role] = {};
      continue;
    }
    const response = await fetch(
      `${baseUrl}/api/auth/dev-bypass?token=${encodeURIComponent(token)}`,
      { redirect: "manual" },
    );
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    const cookie = firstSessionCookie(setCookies);
    const observedStatus = response.status;
    const observedLocation = response.headers.get("location");
    // Drain body so the socket is released; ignore contents.
    await response.arrayBuffer().catch(() => {});
    if (!cookie) {
      console.warn(
        `auth: WARNING dev-bypass login failed closed for role=${role} ` +
          `(status=${observedStatus}, location=${observedLocation ?? "(none)"}, no Set-Cookie). ` +
          `This DEV instance has no seeded account for this role (see LOCAL_DEV_AND_AGENT_TESTING.md §4.2.1). ` +
          `Excluding role=${role} from the probe matrix — reported explicitly, not dropped silently.`,
      );
      unavailableRoles.push({ role, status: observedStatus, location: observedLocation });
      headersByRole[role] = null;
      continue;
    }
    headersByRole[role] = { Cookie: cookie };
    console.log(`auth: acquired dev-bypass session for role=${role} (cookie not printed)`);
  }
  return { headersByRole, unavailableRoles };
}

function loadFixtureCookies(fixtureFile) {
  let raw;
  try {
    raw = readFileSync(fixtureFile, "utf8");
  } catch (error) {
    fail(
      `cannot read fixture file ${fixtureFile}: ${error.code ?? error.message}. ` +
        `This file is root:deploy-owned by design (see SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md); ` +
        `run this script as an operator/user with read access to it.`,
    );
  }
  const fixture = JSON.parse(raw);
  if (fixture.schemaVersion !== 1) fail("fixture schemaVersion must be 1");
  const headersByRole = {};
  for (const role of ROLES) {
    const profile = fixture.authProfiles?.[role];
    if (!profile) fail(`fixture missing authProfiles.${role}`);
    headersByRole[role] = { ...(profile.headers ?? {}) };
  }
  console.log(`auth: loaded fixture auth profiles for roles: ${ROLES.join(", ")} (headers not printed)`);
  return { headersByRole, unavailableRoles: [] };
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

function classify(status, location, isLoginPageBody) {
  if (status >= 300 && status < 400) {
    return `REDIRECT->${location ?? "(no Location header)"}`;
  }
  if (status === 200 && isLoginPageBody) return "LOGIN-PAGE-AS-200";
  if (status >= 200 && status < 300) return "OK";
  if (status >= 400 && status < 500) return `4xx:${status}`;
  if (status >= 500 && status < 600) return `5xx:${status}`;
  return `OTHER:${status}`;
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

async function probe({ baseUrl, path, role, headers, timeoutMs }) {
  const url = `${baseUrl}${path}`;
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, { redirect: "manual", headers }, timeoutMs);
    const status = response.status;
    const location = response.headers.get("location");
    const contentType = response.headers.get("content-type") ?? "";
    let bytes = 0;
    let isLoginPageBody = false;
    if (status >= 300 && status < 400) {
      // Never follow — just drain and discard.
      const buf = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
      bytes = buf.byteLength;
    } else {
      const buf = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
      bytes = buf.byteLength;
      if (contentType.includes("html")) {
        const text = Buffer.from(buf).toString("utf8");
        isLoginPageBody = text.includes(LOGIN_PAGE_MARKER);
      }
    }
    const judgement = classify(status, location, isLoginPageBody);
    const expected = role === "public" && ENTRY_PATHS.has(path) && judgement === "LOGIN-PAGE-AS-200";
    return {
      path,
      role,
      status,
      judgement,
      location: status >= 300 && status < 400 ? location : null,
      bytes,
      expected,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path,
      role,
      status: null,
      judgement: `ERROR:${error.name === "AbortError" ? "timeout" : (error.code ?? error.message)}`,
      location: null,
      bytes: 0,
      expected: false,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runPool(tasks, worker, concurrency) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function runOne() {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await worker(tasks[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, runOne);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function toCsv(rows) {
  const header = ["path", "role", "status", "judgement", "location", "bytes", "expected", "durationMs"];
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => escape(row[key])).join(","));
  }
  return lines.join("\n") + "\n";
}

function summarize(rows, skipped) {
  const byJudgementClass = {};
  const nonOk = [];
  for (const row of rows) {
    const bucket = row.judgement.split("->")[0].split(":")[0];
    byJudgementClass[bucket] = (byJudgementClass[bucket] ?? 0) + 1;
    if (row.judgement !== "OK" && !row.expected) {
      nonOk.push(row);
    }
  }
  return {
    totalProbes: rows.length,
    byJudgementClass,
    nonOkCount: nonOk.length,
    nonOk,
    skippedRouteCount: skipped.length,
    skipped,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.auth === "dev-bypass" && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(options.baseUrl)) {
    fail(
      "--auth=dev-bypass refused against a non-loopback base URL. Dev bypass does not exist on " +
        "TEST/PROD; use --auth=fixture there.",
    );
  }

  let paramsByName = {};
  if (options.paramsFile) {
    paramsByName = JSON.parse(readFileSync(options.paramsFile, "utf8"));
  }

  const routes = discoverRoutes();
  const includeRe = options.include ? new RegExp(options.include) : null;

  const staticTasks = [];
  const skipped = [];
  for (const routeInfo of routes) {
    if (includeRe && !includeRe.test(routeInfo.template)) continue;
    if (routeInfo.dynamicParams.length === 0) {
      staticTasks.push(routeInfo.template);
      continue;
    }
    const rendered = renderRoute(routeInfo, paramsByName);
    if (rendered === null) {
      skipped.push({
        template: routeInfo.template,
        reason: `needs concrete id(s) for param(s): ${routeInfo.dynamicParams.join(", ")}`,
        missingParams: routeInfo.dynamicParams.filter((p) => !(p in paramsByName)),
      });
    } else {
      staticTasks.push(rendered);
    }
  }

  console.log(
    `routes: ${routes.length} page.tsx discovered, ${staticTasks.length} concrete paths to walk, ` +
      `${skipped.length} dynamic route(s) skipped (see summary).`,
  );

  const { headersByRole, unavailableRoles } =
    options.auth === "dev-bypass"
      ? await acquireDevBypassCookies(options.baseUrl)
      : loadFixtureCookies(options.fixtureFile);

  const activeRoles = ROLES.filter((role) => headersByRole[role] !== null);
  const probeTasks = [];
  for (const path of staticTasks) {
    for (const role of activeRoles) {
      probeTasks.push({ path, role });
    }
  }

  if (unavailableRoles.length > 0) {
    console.log(
      `roles unavailable on this target (excluded from probe matrix, reported explicitly): ` +
        unavailableRoles.map((r) => r.role).join(", "),
    );
  }

  console.log(
    `probing ${probeTasks.length} (path, role) combinations across roles [${activeRoles.join(", ")}] against ` +
      `${options.baseUrl} at concurrency=${options.concurrency}, redirect: manual, GET-only...`,
  );

  const results = await runPool(
    probeTasks,
    (task) =>
      probe({
        baseUrl: options.baseUrl,
        path: task.path,
        role: task.role,
        headers: headersByRole[task.role],
        timeoutMs: options.timeoutMs,
      }),
    options.concurrency,
  );

  const summary = summarize(results, skipped);

  console.log("\n=== SUMMARY ===");
  console.log(`base URL:        ${options.baseUrl}`);
  console.log(`auth mode:       ${options.auth}`);
  console.log(`roles active:    ${activeRoles.join(", ")}`);
  console.log(`roles skipped:   ${unavailableRoles.map((r) => r.role).join(", ") || "(none)"}`);
  console.log(`total probes:    ${summary.totalProbes}`);
  console.log(`by class:        ${JSON.stringify(summary.byJudgementClass)}`);
  console.log(`non-OK (real):   ${summary.nonOkCount}`);
  console.log(`dynamic skipped: ${summary.skippedRouteCount}`);
  if (summary.skipped.length > 0) {
    console.log("\n--- skipped dynamic routes ---");
    for (const s of summary.skipped) console.log(`  ${s.template}  (${s.reason})`);
  }
  if (summary.nonOk.length > 0) {
    console.log("\n--- non-OK (path, role, status, judgement, location) ---");
    for (const r of summary.nonOk) {
      console.log(`  ${r.path}  [${r.role}]  status=${r.status}  ${r.judgement}${r.location ? `  location=${r.location}` : ""}`);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    auth: options.auth,
    concurrency: options.concurrency,
    routesDiscovered: routes.length,
    concretePathCount: staticTasks.length,
    activeRoles,
    unavailableRoles,
    results,
    summary,
  };

  if (options.outJson) {
    writeFileSync(options.outJson, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`\nwrote JSON: ${options.outJson}`);
  }
  if (options.outCsv) {
    writeFileSync(options.outCsv, toCsv(results));
    console.log(`wrote CSV: ${options.outCsv}`);
  }
}

main().catch((error) => {
  console.error(`walk-app-pages-no-redirect: fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
