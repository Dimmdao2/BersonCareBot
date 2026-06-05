/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runPgPoolPgTextMock = vi.hoisted(() => vi.fn());
const getConfigBoolMock = vi.hoisted(() => vi.fn());
const checkCanonicalMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runPgPoolPgText: (...args: unknown[]) => runPgPoolPgTextMock(...args),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...args: unknown[]) => getConfigBoolMock(...args),
}));

vi.mock("@/infra/integrations/integratorUserMergeM2mClient", () => ({
  checkIntegratorCanonicalPair: (...args: unknown[]) => checkCanonicalMock(...args),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  buildMergePreview,
  searchMergeCandidates,
  searchMergeUsersForManualMerge,
} from "./platformUserMergePreview";

const T = "00000000-0000-4000-8000-000000000011";
const D = "00000000-0000-4000-8000-000000000022";

function platformRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    phone_normalized: "+79000000001",
    integrator_user_id: null,
    merged_into_id: null,
    display_name: "Client",
    first_name: null,
    last_name: null,
    email: null,
    email_verified_at: null,
    role: "client",
    created_at: new Date("2020-01-01T00:00:00.000Z"),
    updated_at: new Date("2020-01-01T00:00:00.000Z"),
    is_blocked: false,
    is_archived: false,
    blocked_at: null,
    blocked_reason: null,
    blocked_by: null,
    ...over,
  };
}

const pool = {} as never;

describe("buildMergePreview (read-only load path)", () => {
  beforeEach(() => {
    runPgPoolPgTextMock.mockReset();
    getConfigBoolMock.mockReset();
    checkCanonicalMock.mockReset();
    getConfigBoolMock.mockResolvedValue(false);
    checkCanonicalMock.mockResolvedValue({ ok: true, sameCanonical: true, canonicalA: "1", canonicalB: "1" });
  });

  it("returns same_id without SQL when ids match", async () => {
    const r = await buildMergePreview(pool, T, T);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("same_id");
    expect(runPgPoolPgTextMock).not.toHaveBeenCalled();
  });

  it("issues only SELECT/COUNT queries (no mutations) for happy path", async () => {
    runPgPoolPgTextMock.mockImplementation(async (_pool: unknown, sql: string, values?: unknown[]) => {
      const s = String(sql);
      if (s.includes("FROM platform_users") && s.includes("WHERE id = $1")) {
        return { rows: [platformRow(String(values?.[0] ?? T))] };
      }
      if (s.includes("FROM user_channel_bindings")) return { rows: [] };
      if (s.includes("FROM user_oauth_bindings")) return { rows: [] };
      if (s.includes("COUNT(")) return { rows: [{ c: 0 }] };
      return { rows: [] };
    });

    const r = await buildMergePreview(pool, T, D);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected preview");
    expect(r.mergeAllowed).toBe(true);
    const sqlTexts = runPgPoolPgTextMock.mock.calls.map((c) => String(c[1]));
    expect(sqlTexts.every((s) => !/\b(DELETE|UPDATE|INSERT)\b/i.test(s))).toBe(true);
    expect(sqlTexts.some((s) => s.includes("FROM platform_users"))).toBe(true);
  });

  it("returns missing_user when a platform row is absent", async () => {
    runPgPoolPgTextMock.mockImplementation(async (_pool: unknown, sql: string, values?: unknown[]) => {
      if (String(sql).includes("FROM platform_users") && String(sql).includes("WHERE id = $1")) {
        if (values?.[0] === T) return { rows: [platformRow(T)] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    const r = await buildMergePreview(pool, T, D);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("missing_user");
  });

  it("searchMergeUsersForManualMerge returns empty array for blank query without SQL", async () => {
    const rows = await searchMergeUsersForManualMerge(pool, "   ", 10);
    expect(rows).toEqual([]);
    expect(runPgPoolPgTextMock).not.toHaveBeenCalled();
  });

  it("searchMergeUsersForManualMerge issues read-only ILIKE query", async () => {
    runPgPoolPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: D,
          display_name: "Dup",
          phone_normalized: "+79000000002",
          email: null,
          integrator_user_id: null,
          created_at: new Date(),
        },
      ],
    });
    const rows = await searchMergeUsersForManualMerge(pool, "Dup", 5);
    expect(rows).toHaveLength(1);
    const sql = String(runPgPoolPgTextMock.mock.calls[0]?.[1]);
    expect(sql).toContain("ILIKE");
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT)\b/i);
  });

  it("searchMergeCandidates returns not_found for missing anchor", async () => {
    runPgPoolPgTextMock.mockResolvedValueOnce({ rows: [] });
    const r = await searchMergeCandidates(pool, T, null);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toBe("not_found");
  });

  it("searchMergeCandidates returns read-only candidate rows", async () => {
    runPgPoolPgTextMock
      .mockResolvedValueOnce({ rows: [platformRow(T)] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: D,
            display_name: "Dup",
            phone_normalized: "+79000000001",
            email: null,
            integrator_user_id: null,
            created_at: new Date(),
          },
        ],
      });
    const r = await searchMergeCandidates(pool, T, null);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected candidates");
    expect(r.candidates).toHaveLength(1);
    const sql = String(runPgPoolPgTextMock.mock.calls[1]?.[1]);
    expect(sql).toContain("FROM platform_users pu");
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT)\b/i);
  });
});
