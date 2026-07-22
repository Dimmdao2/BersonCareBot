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
    expect(INTERNAL_BEARER_CSRF_EXEMPT_PATHS).toHaveLength(13);
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
    expect(routeFiles).toHaveLength(518);
    expect(sha256Lines(routeInventory)).toBe("8f538644114959c210a151f12b243c3f519b610777b2977f6a3226601a4f3755");
    expect(unsafeInventory).toHaveLength(353);
    expect(unsafeInventory.reduce((count, entry) => count + entry.methods.length, 0)).toBe(392);
    expect(sha256Lines(unsafeInventoryLines)).toBe("053b1290b161837c67067dd9a23262f2d346c4efd85108ba5494a4de617bc634");
  });

  it("exhaustively classifies unsafe files as browser, integrator, internal, webhook, or Apple", () => {
    const actualUnsafeFiles = new Set(unsafeInventory.map((entry) => entry.file));
    for (const file of specialFiles) expect(actualUnsafeFiles.has(file), file).toBe(true);
    expect(specialFiles.size).toBe(34);
    const browser = unsafeInventory.filter((entry) => !specialFiles.has(entry.file));
    expect(browser).toHaveLength(319);
    expect(browser.reduce((count, entry) => count + entry.methods.length, 0)).toBe(358);
    expect([...integratorFiles]).toHaveLength(18);
    expect([...internalFiles]).toHaveLength(13);
    expect([...paymentFiles]).toHaveLength(2);
    expect([...appleFiles]).toHaveLength(1);
  });

  it("freezes all Server Action files", () => {
    const serverActions = walkFiles(appRoot)
      .filter((file) => /\.[tj]sx?$/.test(file) && readFileSync(file, "utf8").includes("use server"))
      .map((file) => relative(webappRoot, file))
      .sort();
    expect(serverActions).toHaveLength(28);
    expect(sha256Lines(serverActions)).toBe("ca418715bca5ed91ad56b35df9dbe968db9769cf2d132f16b1b246b6d991eded");
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
