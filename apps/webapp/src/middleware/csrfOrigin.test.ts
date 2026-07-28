/** @vitest-environment node */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { Agent, createServer, request as httpRequest } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPLE_FORM_POST_CSRF_EXEMPT_PATH,
  INTERNAL_BEARER_CSRF_EXEMPT_PATHS,
  INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS,
  PAYMENT_WEBHOOK_CSRF_EXEMPT_PATTERNS,
  classifyCsrfMutation,
  decideCsrfOrigin,
  type CsrfOriginInput,
} from "@/middleware/csrfOrigin";

const webappRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiRoot = join(webappRoot, "src/app/api");
const appRoot = join(webappRoot, "src/app");

const defaultInput: CsrfOriginInput = {
  method: "POST",
  pathname: "/api/auth/exchange",
  host: "bersoncare.ru",
  requestUrlProtocol: "http:",
  forwardedProto: "https",
  secFetchSite: "same-origin",
  origin: "https://bersoncare.ru",
  referer: null,
};

function decide(overrides: Partial<CsrfOriginInput> = {}) {
  return decideCsrfOrigin({ ...defaultInput, ...overrides });
}

function walkFiles(directory: string, fileName?: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(path, fileName);
      return !fileName || entry.name === fileName ? [path] : [];
    });
}

function sha256Lines(lines: readonly string[]): string {
  return createHash("sha256").update(`${lines.join("\n")}\n`).digest("hex");
}

function exportedHttpMethods(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/gm)]
    .map((match) => match[1])
    .filter((method): method is string => typeof method === "string")
    .sort();
}

function runtimePathToRouteFile(pathname: string): string {
  return `${pathname.replace(/^\/api\//, "")}/route.ts`;
}

describe("CSRF origin policy", () => {
  it("allows safe methods without changing their header contract", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(decide({ method, origin: null, referer: null, secFetchSite: null })).toEqual({
        action: "allow",
        proof: "safe_method",
        mutationClass: null,
      });
    }
  });

  it("allows exact same-origin Origin and Referer fallback", () => {
    expect(decide()).toMatchObject({ action: "allow", proof: "same_origin_origin" });
    expect(decide({ origin: null, referer: "https://bersoncare.ru/app/doctor?q=1#section" }))
      .toMatchObject({ action: "allow", proof: "same_origin_referer" });
    expect(decide({
      host: "127.0.0.1:5200",
      forwardedProto: null,
      requestUrlProtocol: "http:",
      origin: "http://127.0.0.1:5200",
    })).toMatchObject({ action: "allow", proof: "same_origin_origin" });
    expect(decide({
      host: "localhost:5200",
      forwardedProto: "http, https",
      origin: "http://localhost:5200",
    })).toMatchObject({ action: "allow", proof: "same_origin_origin" });
  });

  it("fails closed for fetch metadata and missing source headers", () => {
    for (const secFetchSite of ["cross-site", "same-site", "none", "", "same-origin, cross-site"]) {
      expect(decide({ secFetchSite })).toMatchObject({ action: "reject", proof: "fetch_site_forbidden" });
    }
    expect(decide({ secFetchSite: null, origin: null, referer: null }))
      .toMatchObject({ action: "reject", proof: "source_headers_missing" });
  });

  it("rejects malformed, multiple, null, and non-canonical Origin values", () => {
    for (const origin of [
      "",
      "null",
      "not a url",
      "https://bersoncare.ru, https://evil.example",
      "https://user@bersoncare.ru",
      "https://bersoncare.ru/path",
      "https://bersoncare.ru/",
      "https://bersoncare.ru:443",
      "file://bersoncare.ru",
    ]) {
      expect(decide({ origin })).toMatchObject({ action: "reject", proof: "origin_invalid" });
    }
  });

  it("rejects sibling same-site, scheme, port, and localhost alias mismatches", () => {
    for (const origin of [
      "https://test.bersoncare.ru",
      "http://bersoncare.ru",
      "https://bersoncare.ru:8443",
    ]) {
      expect(decide({ origin })).toMatchObject({ action: "reject", proof: "origin_mismatch" });
    }
    expect(decide({
      host: "127.0.0.1:5200",
      forwardedProto: null,
      origin: "http://localhost:5200",
    })).toMatchObject({ action: "reject", proof: "origin_mismatch" });
    expect(decide({
      host: "localhost:5200",
      forwardedProto: null,
      origin: "http://127.0.0.1:5200",
    })).toMatchObject({ action: "reject", proof: "origin_mismatch" });
  });

  it("does not fall back to Referer when Origin is present but invalid", () => {
    expect(decide({ origin: "null", referer: "https://bersoncare.ru/app" }))
      .toMatchObject({ action: "reject", proof: "origin_invalid" });
    expect(decide({ origin: null, referer: "::::" }))
      .toMatchObject({ action: "reject", proof: "referer_invalid" });
    expect(decide({
      origin: null,
      referer: "https://bersoncare.ru/app, https://evil.example/x",
    })).toMatchObject({ action: "reject", proof: "referer_invalid" });
    expect(decide({ origin: null, referer: "https://test.bersoncare.ru/app" }))
      .toMatchObject({ action: "reject", proof: "referer_mismatch" });
  });

  it("uses exact Host and only a validated first forwarded proto", () => {
    for (const forwardedProto of ["ftp", "javascript", ",https"] as const) {
      expect(decide({ forwardedProto })).toMatchObject({ action: "reject", proof: "request_origin_invalid" });
    }
    for (const host of [null, "", "bersoncare.ru,evil.example", "user@bersoncare.ru", "bersoncare.ru/path"] as const) {
      expect(decide({ host })).toMatchObject({ action: "reject", proof: "request_origin_invalid" });
    }
    expect(decide({ forwardedProto: "https, javascript" }))
      .toMatchObject({ action: "allow", proof: "same_origin_origin" });
  });

  it("has only the exact typed runtime exemptions and rejects lookalikes", () => {
    expect(INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS).toHaveLength(18);
    expect(INTERNAL_BEARER_CSRF_EXEMPT_PATHS).toHaveLength(15);
    expect(PAYMENT_WEBHOOK_CSRF_EXEMPT_PATTERNS).toHaveLength(2);
    for (const pathname of INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS) {
      expect(decide({ pathname, origin: null, referer: null, secFetchSite: null }))
        .toEqual({ action: "allow", proof: "integrator_hmac", mutationClass: "integrator_hmac" });
    }
    for (const pathname of INTERNAL_BEARER_CSRF_EXEMPT_PATHS) {
      expect(decide({ pathname, origin: null, referer: null, secFetchSite: null }))
        .toEqual({ action: "allow", proof: "internal_bearer", mutationClass: "internal_bearer" });
    }
    for (const pathname of [
      "/api/payments/webhook/yookassa",
      "/api/payments/patient-acquiring-webhook/tinkoff",
    ]) {
      expect(decide({ pathname, origin: null, referer: null, secFetchSite: null }))
        .toEqual({ action: "allow", proof: "payment_webhook", mutationClass: "payment_webhook" });
    }
    expect(decide({
      pathname: APPLE_FORM_POST_CSRF_EXEMPT_PATH,
      origin: null,
      referer: null,
      secFetchSite: null,
    })).toEqual({ action: "allow", proof: "apple_form_post", mutationClass: "apple_form_post" });

    for (const pathname of [
      "/api/integrator/events/",
      "/api/integrator/events-lookalike",
      "/api/internal/media-preview/process/extra",
      "/api/payments/webhook/yookassa/extra",
      "/api/payments/webhookish/yookassa",
      "/api/auth/oauth/callback/apple/extra",
      "/api/auth/exchange",
      "/api/auth/dev-bypass",
      "/api/booking/public/create",
      "/api/booking/payments/mock-complete",
      "/api/booking/memberships/payments/mock-complete",
      "/api/booking/products/payments/mock-complete",
      "/api/booking/public/payments/mock-complete",
      "/api/booking/public/products/payments/mock-complete",
    ]) {
      expect(decide({ pathname, origin: null, referer: null, secFetchSite: null }))
        .toMatchObject({ action: "reject", mutationClass: "browser" });
    }
    expect(classifyCsrfMutation("PUT", INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS[0])).toBe("browser");
  });
});

describe("frozen webapp mutation census", () => {
  const routeFiles = walkFiles(apiRoot, "route.ts").sort();
  const routeInventory = routeFiles.map((file) => relative(apiRoot, file));
  const unsafeInventory = routeFiles
    .map((file) => {
      const unsafe = exportedHttpMethods(readFileSync(file, "utf8"))
        .filter((method) => method !== "GET");
      return { file: relative(apiRoot, file), methods: unsafe };
    })
    .filter((entry) => entry.methods.length > 0);
  const unsafeInventoryLines = unsafeInventory.map((entry) => `${entry.file}|${entry.methods.join(",")}`);
  const integratorFiles = new Set(INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS.map(runtimePathToRouteFile));
  const internalFiles = new Set(INTERNAL_BEARER_CSRF_EXEMPT_PATHS.map(runtimePathToRouteFile));
  const paymentFiles = new Set([
    "payments/webhook/[provider]/route.ts",
    "payments/patient-acquiring-webhook/[provider]/route.ts",
  ]);
  const appleFiles = new Set([runtimePathToRouteFile(APPLE_FORM_POST_CSRF_EXEMPT_PATH)]);
  const specialFiles = new Set([...integratorFiles, ...internalFiles, ...paymentFiles, ...appleFiles]);

  it("freezes every API route, unsafe route, and unsafe handler", () => {
    // 517 -> 518: 1561246d8 added `api/doctor/proactive-insights/by-patient/route.ts` (GET only,
    // so the unsafe-handler census below is unchanged) and left this frozen census red.
    // 518 -> 520: the dead man's switch receiver (design D-d) added
    // `api/internal/heartbeat/pipeline_delivery/route.ts` and `api/internal/heartbeat/digest/route.ts`.
    // Both are POST+GET behind constant-time INTERNAL_JOB_SECRET, so the internal-bearer
    // exemption count below moves 13 -> 15 and the unsafe census 353 -> 355 / 392 -> 394.
    // 520 -> 521: A-3 split the anonymous booking write in two — `api/booking/public/create` now
    // issues a one-time code and `api/booking/public/create/confirm/route.ts` creates the booking
    // once it verifies. POST only, and a plain browser mutation with no exemption, so the
    // unsafe census moves 355 -> 356 / 394 -> 395 and the browser class below 319 -> 320.
    // 521 -> 522: C-5 added `api/account/security/password/change/route.ts`. Its POST is called
    // by the account UI with the session cookie and is not in any exemption set, so it is a browser
    // mutation: the unsafe census moves 356 -> 357 / 395 -> 396 and browser 320 -> 321.
    // 522 -> 523: clinic slug management added `api/clinic/slug/route.ts`. Its POST is called by
    // the organization settings UI and remains in the browser class, so the unsafe census moves
    // 357 -> 358 / 396 -> 397 and browser 321 -> 322 / 360 -> 361.
    // 523 -> 524: mandatory specialist-signup slug availability added
    // `api/auth/specialist-signup/slug/route.ts`. Its browser POST is intentionally not exempt, so
    // unsafe moves 358 -> 359 / 397 -> 398 and browser 322 -> 323 / 361 -> 362.
    // The existing `api/admin/settings/route.ts` then gained DELETE for the owner-facing reset to
    // registry default. It is another same-origin browser mutation, so route/file counts stay fixed
    // while unsafe handlers move 398 -> 399 and browser handlers 362 -> 363.
    // 524 -> 503: the Rubitime retirement removed 21 intentional API routes (one GET-only and
    // 20 mutating files with 26 unsafe handlers). The separately deleted appointment-record
    // soft-delete route is NOT included in that reduction: AdminDangerActions still POSTs to it
    // from two live doctor surfaces, so freezing the observed 502 would hide a broken mutation.
    // Keep its exact path/method in the intended inventory until runtime/UI ownership resolves it.
    // 503 -> 504: the platform clinic console added `api/admin/organizations/route.ts`. It is GET
    // only and guarded by `requirePlatformOperationsApiContext`, so the exact route hash changes
    // while all unsafe-file, unsafe-handler and mutation-class censuses below remain unchanged.
    // 504 -> 506: the platform support console added the GET-only conversation list and detail
    // routes. Both use the platform guard, so only the route-file inventory/hash changes.
    // 506 -> 507: the read-only clinic-account panel added
    // `api/admin/organizations/[organizationId]/members/route.ts`. It has the same platform guard,
    // exports GET only, and therefore changes only the route-file inventory/hash.
    // 507 -> 509: billing added two read-only GET routes. The platform organization endpoint uses
    // `requirePlatformOperationsApiContext`; the clinic endpoint uses
    // `requireClinicManagementApiContext` and additionally requires owner membership. Neither is a
    // mutation or a CSRF exemption, so all unsafe-file/handler/class counts remain unchanged.
    expect(routeInventory).toContain("admin/appointment-records/[integratorRecordId]/soft-delete/route.ts");
    expect(routeInventory).toContain("admin/organizations/route.ts");
    expect(routeInventory).toContain("admin/organizations/[organizationId]/members/route.ts");
    expect(routeInventory).toContain("admin/organizations/[organizationId]/billing/route.ts");
    expect(routeInventory).toContain("clinic/billing/route.ts");
    expect(routeFiles).toHaveLength(509);
    expect(sha256Lines(routeInventory)).toBe("ad73af224b6d0c7c424bbc0a37127d9689324ddfcc82378267879fc255c6b0a9");
    expect(unsafeInventory).toHaveLength(339);
    expect(unsafeInventory.reduce((count, entry) => count + entry.methods.length, 0)).toBe(373);
    expect(sha256Lines(unsafeInventoryLines)).toBe("0285e65270f53a3222ad681c1d2a94a8bbb5d1fe2659dfcf4f823dc62a8a598f");
  });

  it("exhaustively classifies unsafe files as browser, integrator, internal, webhook, or Apple", () => {
    const actualUnsafeFiles = new Set(unsafeInventory.map((entry) => entry.file));
    for (const file of specialFiles) expect(actualUnsafeFiles.has(file), file).toBe(true);
    expect(specialFiles.size).toBe(36);
    const browser = unsafeInventory.filter((entry) => !specialFiles.has(entry.file));
    // 323 -> 303 files / 363 -> 337 handlers: the same Rubitime cut removed 20 browser
    // mutation files and 26 handlers. The still-called appointment-record soft-delete POST remains
    // deliberately required here, so the observed 302/336 is a regression rather than a new freeze.
    expect(browser).toHaveLength(303);
    expect(browser.reduce((count, entry) => count + entry.methods.length, 0)).toBe(337);
    expect(browser).toContainEqual({
      file: "admin/settings/route.ts",
      methods: ["DELETE", "PATCH"],
    });
    expect(browser).toContainEqual({
      file: "auth/specialist-signup/slug/route.ts",
      methods: ["POST"],
    });
    expect([...integratorFiles]).toHaveLength(18);
    expect([...internalFiles]).toHaveLength(15);
    expect([...paymentFiles]).toHaveLength(2);
    expect([...appleFiles]).toHaveLength(1);
  });

  it("freezes all Server Action files", () => {
    const serverActions = walkFiles(appRoot)
      .filter((file) => /\.[tj]sx?$/.test(file) && readFileSync(file, "utf8").includes("use server"))
      .map((file) => relative(webappRoot, file))
      .sort();
    // 28 -> 29: ad9db8266 added `src/app/app/settings/brandingActions.ts` and left this frozen
    // census red. A permanently red gate teaches everyone to ignore gates, so the count and the
    // hash are re-frozen here against the reviewed file list.
    expect(serverActions).toHaveLength(29);
    expect(sha256Lines(serverActions)).toBe("0cd77097478786b48646ec7a7043f64e927ed3412444e005e73b14c12a739829");
  });

  it("freezes nine stateful GET exceptions and their stronger proof", () => {
    const statefulGetProofs = [
      ["admin/google-calendar/callback/route.ts", /updateSetting\("google_refresh_token"/],
      ["auth/dev-bypass/route.ts", /exchangeIntegratorToken\(token\)/],
      ["auth/dev-public/route.ts", /clearSession\(\)/],
      ["auth/logout/route.ts", /export async function GET[\s\S]*clearSession\(\)/],
      ["auth/oauth/callback/route.ts", /handleYandexOAuthCallbackGet\(request\)/],
      ["auth/oauth/callback/google/route.ts", /completeOAuthWebLoginRedirectUrls/],
      ["auth/oauth/callback/yandex/route.ts", /handleYandexOAuthCallbackGet\(request\)/],
      ["media\/\[id\]\/playback\/route.ts", /resolveMediaPlaybackPayload/],
      ["patient/organization-context/open/route.ts", /PATIENT_ORGANIZATION_PREFERENCE_COOKIE/],
    ] as const;
    expect(statefulGetProofs).toHaveLength(9);
    for (const [relativeFile, proof] of statefulGetProofs) {
      const normalizedFile = relativeFile.replaceAll("\\/", "/");
      const source = readFileSync(join(apiRoot, normalizedFile), "utf8");
      expect(exportedHttpMethods(source), normalizedFile).toContain("GET");
      expect(source, normalizedFile).toMatch(proof);
    }
    const playbackSource = readFileSync(join(webappRoot, "src/app-layer/media/resolveMediaPlaybackPayload.ts"), "utf8");
    expect(playbackSource).toMatch(/recordPlaybackResolutionStat/);
    expect(playbackSource).toMatch(/recordPlaybackResolutionEvent/);
  });
});

describe("exemption stronger-proof audit", () => {
  it("binds every integrator exemption to verifyIntegratorSignature", () => {
    for (const pathname of INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS) {
      const source = readFileSync(join(apiRoot, runtimePathToRouteFile(pathname)), "utf8");
      expect(source, pathname).toMatch(/verifyIntegratorSignature\s*\(/);
    }
  });

  it("binds every internal exemption to constant-time INTERNAL_JOB_SECRET verification", () => {
    for (const pathname of INTERNAL_BEARER_CSRF_EXEMPT_PATHS) {
      const source = readFileSync(join(apiRoot, runtimePathToRouteFile(pathname)), "utf8");
      expect(source, pathname).toMatch(/timingSafeEqual\s*\(/);
      expect(source, pathname).toMatch(/env\.INTERNAL_JOB_SECRET/);
      expect(source, pathname).toMatch(/Bearer /);
    }
  });

  it("binds both provider webhooks and Apple form_post to their stronger proofs", () => {
    const bookingWebhook = readFileSync(join(apiRoot, "payments/webhook/[provider]/route.ts"), "utf8");
    const patientWebhook = readFileSync(join(apiRoot, "payments/patient-acquiring-webhook/[provider]/route.ts"), "utf8");
    const paymentsService = readFileSync(join(webappRoot, "src/modules/payments/service.ts"), "utf8");
    expect(bookingWebhook).toMatch(/processProviderWebhook/);
    expect(paymentsService).toMatch(/async processProviderWebhook[\s\S]*adapter\.verifyWebhook\s*\(/);
    expect(patientWebhook).toMatch(/adapter\.verifyWebhook\s*\(/);

    const apple = readFileSync(join(apiRoot, "auth/oauth/callback/apple/route.ts"), "utf8");
    expect(apple).toMatch(/parseVerifiedSignedOAuthState\(stateRaw, "apple"\)/);
    expect(apple).toMatch(/!verified\.nonce/);
    expect(apple).toMatch(/expectedNonce:\s*verified\.nonce/);
  });

  it("keeps the shared helper synchronous and free of I/O dependencies", () => {
    const source = readFileSync(join(webappRoot, "src/middleware/csrfOrigin.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\basync\b|\bawait\b/);
    expect(source).not.toMatch(/buildAppDeps|@\/modules\/auth|database|\bdb\b|logger|fetch\s*\(|process\.env|system_settings/i);
  });
});

type LoadSample = Readonly<{ p50Ms: number; p95Ms: number; p99Ms: number; throughput: number }>;

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;
}

describe.skipIf(process.env.RUN_D2_CSRF_LOAD_PROOF !== "1")("CSRF helper loopback load proof", () => {
  const samplesPerRun = 640;
  const concurrency = 16;
  const rss: number[] = [];
  let baseUrl = "";
  let server: ReturnType<typeof createServer> | null = null;
  let transportFailures = 0;
  let unexpectedStatuses = 0;
  const agent = new Agent({ keepAlive: true, maxSockets: concurrency });

  beforeAll(async () => {
    const createdServer = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/guarded") {
        const decision = decideCsrfOrigin({
          method: request.method ?? "POST",
          pathname: "/api/auth/exchange",
          host: request.headers.host ?? null,
          requestUrlProtocol: "http:",
          forwardedProto: null,
          secFetchSite: typeof request.headers["sec-fetch-site"] === "string" ? request.headers["sec-fetch-site"] : null,
          origin: typeof request.headers.origin === "string" ? request.headers.origin : null,
          referer: typeof request.headers.referer === "string" ? request.headers.referer : null,
        });
        if (decision.action !== "allow") {
          response.writeHead(403).end();
          return;
        }
      }
      response.writeHead(204).end();
    });
    server = createdServer;
    await new Promise<void>((resolveListen) => createdServer.listen(0, "127.0.0.1", resolveListen));
    const address = createdServer.address();
    if (!address || typeof address === "string") throw new Error("loopback_listener_missing");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    agent.destroy();
    const runningServer = server;
    if (runningServer) {
      await new Promise<void>((resolveClose, rejectClose) => {
        runningServer.close((error) => error ? rejectClose(error) : resolveClose());
      });
    }
  });

  async function one(pathname: string): Promise<number> {
    const started = performance.now();
    const status = await new Promise<number>((resolveRequest, rejectRequest) => {
      const request = httpRequest(`${baseUrl}${pathname}`, {
        method: "POST",
        agent,
        headers: {
          Origin: baseUrl,
          "Sec-Fetch-Site": "same-origin",
          "Content-Length": "0",
        },
      }, (response) => {
        response.resume();
        response.on("end", () => resolveRequest(response.statusCode ?? 0));
      });
      request.on("error", (error) => {
        transportFailures += 1;
        rejectRequest(error);
      });
      request.end();
    });
    if (status !== 204) unexpectedStatuses += 1;
    return performance.now() - started;
  }

  function summarize(latencies: number[], durationMs: number): LoadSample {
    latencies.sort((left, right) => left - right);
    return {
      p50Ms: percentile(latencies, 0.50),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      throughput: latencies.length / (durationMs / 1000),
    };
  }

  async function runPair(sampleCountPerPath: number): Promise<Readonly<{
    baseline: LoadSample;
    guarded: LoadSample;
  }>> {
    const baselineLatencies: number[] = [];
    const guardedLatencies: number[] = [];
    const perPathBatch = concurrency / 2;
    const started = performance.now();
    for (let offset = 0; offset < sampleCountPerPath; offset += perPathBatch) {
      const reverseOrder = (offset / perPathBatch) % 2 === 1;
      const requests = Array.from({ length: concurrency }, (_, index) => {
        const isGuarded = (index % 2 === 1) !== reverseOrder;
        return one(isGuarded ? "/guarded" : "/baseline")
          .then((latency) => ({ isGuarded, latency }));
      });
      for (const result of await Promise.all(requests)) {
        (result.isGuarded ? guardedLatencies : baselineLatencies).push(result.latency);
      }
    }
    const durationMs = performance.now() - started;
    return {
      baseline: summarize(baselineLatencies, durationMs),
      guarded: summarize(guardedLatencies, durationMs),
    };
  }

  it("keeps three concurrency-16 browser POST runs within the 5% p95 budget", async () => {
    await runPair(128);
    const baseline: LoadSample[] = [];
    const guarded: LoadSample[] = [];
    for (let index = 0; index < 3; index += 1) {
      const pair = await runPair(samplesPerRun);
      baseline.push(pair.baseline);
      guarded.push(pair.guarded);
      rss.push(process.memoryUsage().rss);
    }
    const baselineP95 = baseline.map((sample) => sample.p95Ms).sort((a, b) => a - b)[1] ?? 0;
    const guardedP95 = guarded.map((sample) => sample.p95Ms).sort((a, b) => a - b)[1] ?? 0;
    const dbPoolConnections = 0;
    process.stdout.write(`${JSON.stringify({
      concurrency,
      samplesPerRun,
      baseline,
      guarded,
      rss,
      transportFailures,
      unexpectedStatuses,
      dbPoolConnections,
    })}\n`);
    expect(transportFailures).toBe(0);
    expect(unexpectedStatuses).toBe(0);
    expect(dbPoolConnections).toBe(0);
    expect(guardedP95).toBeLessThanOrEqual(baselineP95 * 1.05);
    expect(Math.max(...rss) - Math.min(...rss)).toBeLessThan(32 * 1024 * 1024);
  }, 30_000);
});
