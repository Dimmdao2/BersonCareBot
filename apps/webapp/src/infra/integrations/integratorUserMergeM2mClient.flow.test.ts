/** @vitest-environment node */
/**
 * Stage 5 AUDIT follow-up: stubbed `fetch` + integrationRuntime — сквозная цепочка M2M без живого integrator.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorApiUrl: vi.fn().mockResolvedValue("http://127.0.0.1:9"),
  getIntegratorWebhookSecret: vi.fn().mockResolvedValue("test-stage5-m2m-secret-16"),
}));

import { checkIntegratorCanonicalPair, callIntegratorUserMerge } from "./integratorUserMergeM2mClient";

describe("integratorUserMergeM2mClient (Stage 5 stubbed fetch flow)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("canonical-pair: parses ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, sameCanonical: true, canonicalA: "1", canonicalB: "1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await checkIntegratorCanonicalPair("10", "20");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sameCanonical).toBe(true);
      expect(r.canonicalA).toBe("1");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(String(call[0])).toContain("/api/integrator/users/canonical-pair");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect((call[1] as RequestInit).headers).toMatchObject({
      "x-bersoncare-timestamp": expect.any(String),
      "x-bersoncare-signature": expect.any(String),
    });
  });

  it("users merge: parses ok result", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { winnerId: "1", loserId: "2", dryRun: true } }), {
        status: 200,
      }),
    );
    const r = await callIntegratorUserMerge({
      winnerIntegratorUserId: "1",
      loserIntegratorUserId: "2",
      dryRun: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.winnerId).toBe("1");
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain("/api/integrator/users/merge");
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      dryRun?: boolean;
    };
    expect(body.dryRun).toBe(true);
  });

  it("sequence canonical then merge uses two fetch calls (operator flow shape)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, sameCanonical: false, canonicalA: "10", canonicalB: "20" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { winnerId: "10", loserId: "20" } }), { status: 200 }),
      );
    const pre = await checkIntegratorCanonicalPair("10", "20");
    expect(pre.ok && pre.sameCanonical).toBe(false);
    const merged = await callIntegratorUserMerge({
      winnerIntegratorUserId: "10",
      loserIntegratorUserId: "20",
    });
    expect(merged.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
