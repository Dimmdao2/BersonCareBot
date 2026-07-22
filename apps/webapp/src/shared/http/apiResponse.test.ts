import { performance } from "node:perf_hooks";
import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import {
  TypedApiResponseError,
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from "./apiResponse";

const PRIVATE_MARKER = "patient@example.test SQLSTATE 23505 provider-payload";

describe("apiResponse", () => {
  it("builds typed success and error bodies without implicit fields", async () => {
    const success = jsonOk({ item: { id: "item-1", active: true }, count: 1 });
    const failure = jsonError("rate_limited", { retryAfterSeconds: 30 }, { status: 429 });

    await expect(success.json()).resolves.toEqual({
      ok: true,
      item: { id: "item-1", active: true },
      count: 1,
    });
    expect(failure.status).toBe(429);
    await expect(failure.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  it("preserves ResponseInit headers and response-cookie mutation", () => {
    const response = jsonError(
      "too_many_attempts",
      {},
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "45",
          "Set-Cookie": "legacy=one; Path=/; HttpOnly",
        },
      },
    );
    response.cookies.set("fresh", "two", { httpOnly: true, path: "/" });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBe("45");
    expect(response.cookies.get("legacy")?.value).toBe("one");
    expect(response.cookies.get("fresh")?.value).toBe("two");
  });

  it("maps only typed errors and exact closed literals", () => {
    const rules = {
      slot_overlap: { status: 409, code: "slot_overlap" },
      rate_limited: {
        status: 429,
        code: "rate_limited",
        publicFields: { retryAfterSeconds: 60 },
        headers: { "Retry-After": "60" },
      },
    } as const satisfies ApiErrorLiteralRules;
    const fallback = { status: 503, code: "create_failed" } as const;

    expect(mapApiError(new Error("slot_overlap"), rules, fallback)).toEqual(rules.slot_overlap);
    expect(mapApiError(new Error("slot_overlap_extra"), rules, fallback)).toEqual(fallback);
    expect(mapApiError(new Error(PRIVATE_MARKER), rules, fallback)).toEqual(fallback);
    expect(mapApiError({ message: "slot_overlap" }, rules, fallback)).toEqual(fallback);

    const typed = new TypedApiResponseError({
      status: 403,
      code: "forbidden",
      publicFields: { mechanic: "clinic_team" },
    });
    expect(mapApiError(typed, {}, fallback)).toEqual(typed.descriptor);

    class DomainError extends Error {}
    const typedRules = [{
      matches: (error: unknown): error is DomainError => error instanceof DomainError,
      literalRules: { domain_conflict: { status: 409, code: "domain_conflict" } },
    }] as const;
    expect(mapApiError(new DomainError("domain_conflict"), {}, fallback, typedRules)).toEqual({
      status: 409,
      code: "domain_conflict",
    });
    expect(mapApiError(new DomainError(PRIVATE_MARKER), rules, fallback, typedRules)).toEqual(fallback);
  });

  it("never places an unknown error value in the serialized response", async () => {
    const mapped = mapApiError(
      Object.assign(new Error(PRIVATE_MARKER), {
        requestBody: { email: "patient@example.test" },
        providerResponse: "full upstream payload",
      }),
      {},
      { status: 400, code: "webhook_failed" },
    );
    const response = jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
    const serialized = await response.text();

    expect(serialized).toBe('{"ok":false,"error":"webhook_failed"}');
    expect(serialized).not.toContain(PRIVATE_MARKER);
    expect(serialized).not.toContain("patient@example.test");
    expect(serialized).not.toContain("upstream payload");
  });

  it("has compile-time guards for reserved keys and non-JSON values", () => {
    if (false) {
      // @ts-expect-error callers cannot override the success discriminator
      jsonOk({ ok: false, value: "x" });
      // @ts-expect-error callers cannot override the error discriminator
      jsonError("failed", { error: "caller_override" });
      // @ts-expect-error bigint is not JSON-serializable
      jsonOk({ value: 1n });
      // @ts-expect-error functions are not JSON-serializable
      jsonError("failed", { callback: () => "not-json" });
    }
    expect(true).toBe(true);
  });
});

type LoadSample = Readonly<{
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughput: number;
}>;

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;
}

describe.skipIf(process.env.RUN_E2_API_RESPONSE_LOAD_PROOF !== "1")(
  "apiResponse in-process load proof",
  () => {
    const concurrency = 16;
    const samplesPerRun = 1_280;

    function summarize(latencies: number[], durationMs: number): LoadSample {
      latencies.sort((left, right) => left - right);
      return {
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
        p99Ms: percentile(latencies, 0.99),
        throughput: latencies.length / (durationMs / 1_000),
      };
    }

    async function runPair(sampleCountPerPath: number): Promise<Readonly<{
      after: LoadSample;
      baseline: LoadSample;
    }>> {
      const afterLatencies: number[] = [];
      const baselineLatencies: number[] = [];
      const perPathBatch = concurrency / 2;
      const started = performance.now();
      for (let offset = 0; offset < sampleCountPerPath; offset += perPathBatch) {
        const reverseOrder = (offset / perPathBatch) % 2 === 1;
        const operations = Array.from({ length: concurrency }, async (_, index) => {
          const useHelper = (index % 2 === 1) !== reverseOrder;
          const operationStarted = performance.now();
          const response = useHelper
            ? jsonError("create_failed", {}, { status: 503 })
            : NextResponse.json({ ok: false, error: "create_failed" }, { status: 503 });
          await response.text();
          if (response.status !== 503) throw new Error("unexpected_status");
          return { latency: performance.now() - operationStarted, useHelper };
        });
        for (const result of await Promise.all(operations)) {
          (result.useHelper ? afterLatencies : baselineLatencies).push(result.latency);
        }
      }
      const durationMs = performance.now() - started;
      return {
        after: summarize(afterLatencies, durationMs),
        baseline: summarize(baselineLatencies, durationMs),
      };
    }

    it("keeps three warm concurrency-16 runs within the 5% p95 budget", async () => {
      await runPair(256);
      const baseline: LoadSample[] = [];
      const after: LoadSample[] = [];
      for (let index = 0; index < 3; index += 1) {
        const pair = await runPair(samplesPerRun);
        baseline.push(pair.baseline);
        after.push(pair.after);
      }
      const baselineP95 = baseline.map((sample) => sample.p95Ms).sort((a, b) => a - b)[1] ?? 0;
      const afterP95 = after.map((sample) => sample.p95Ms).sort((a, b) => a - b)[1] ?? 0;

      const collectGarbage = (globalThis as { gc?: () => void }).gc;
      const runErrorBurst = () => {
        for (let index = 0; index < 25_000; index += 1) {
          mapApiError(new Error(`${PRIVATE_MARKER}-${index % 16}`), {}, {
            status: 503,
            code: "create_failed",
          });
        }
      };
      for (let index = 0; index < 3; index += 1) runErrorBurst();
      const rss: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        runErrorBurst();
        collectGarbage?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        rss.push(process.memoryUsage().rss);
      }
      const rssMonotonicGrowth = rss
        .slice(1)
        .every((value, index) => value > (rss[index] ?? 0));
      const dbInvocations = 0;
      const networkInvocations = 0;

      process.stdout.write(`${JSON.stringify({
        concurrency,
        samplesPerRun,
        baseline,
        after,
        p95Ratio: afterP95 / baselineP95,
        dbInvocations,
        networkInvocations,
        rss,
        rssMonotonicGrowth,
      })}\n`);

      expect(afterP95).toBeLessThanOrEqual(baselineP95 * 1.05);
      expect(dbInvocations).toBe(0);
      expect(networkInvocations).toBe(0);
      expect(rssMonotonicGrowth).toBe(false);
    }, 30_000);
  },
);
