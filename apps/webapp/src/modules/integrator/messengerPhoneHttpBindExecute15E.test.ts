/** Wave 3 phase 15E — messenger HTTP bind execute runtime + TX contract. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessengerPhoneLinkError } from "@bersoncare/platform-merge";
import { writeAuditLog } from "@/infra/adminAuditLog";
import { notifyMessengerPhoneBindBlockedFromWebapp } from "@/modules/admin-incidents/sendAdminIncidentAlerts";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runPgPoolPgTextMock = vi.hoisted(() => vi.fn());
const applyMessengerPhonePublicBindMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runPgPoolPgText: (...args: unknown[]) => runPgPoolPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

vi.mock("@/infra/adminAuditLog", () => ({
  computeConflictKeyFromCandidateIds: vi.fn(() => "conflict-key"),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentAlerts", () => ({
  notifyMessengerPhoneBindBlockedFromWebapp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrl: vi.fn().mockResolvedValue("https://app.example"),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@bersoncare/platform-merge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bersoncare/platform-merge")>();
  return {
    ...actual,
    applyMessengerPhonePublicBind: (...args: unknown[]) => applyMessengerPhonePublicBindMock(...args),
    enrichMessengerBindAuditDetailsFields: vi.fn().mockResolvedValue({
      candidates: [{ platformUserId: "id-1", displayName: null, phoneNormalized: null, email: null }],
      initiator: null,
      reasonHumanRu: "test",
    }),
    buildMessengerBindBlockedRelayLines: vi.fn(() => ["line"]),
    messengerPhoneBindReasonHumanRu: vi.fn(() => "human"),
  };
});

import { executeMessengerPhoneHttpBind } from "@/app-layer/integrator/messengerPhoneHttpBindExecute";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockBindSqlHappyPath() {
  return async (sql: string) => {
    const s = String(sql);
    if (s.includes("merged_into_user_id")) {
      return { rows: [{ merged_into_user_id: null }], rowCount: 1 };
    }
    if (s.includes("FROM identities") && s.includes("user_id")) {
      return { rows: [{ user_id: "42" }], rowCount: 1 };
    }
    if (s.includes("INSERT INTO contacts")) {
      return { rows: [], rowCount: 1 };
    }
    if (s.includes("INSERT INTO users") || s.includes("INSERT INTO identities")) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
}

describe("Wave3 phase 15E messengerPhoneHttpBindExecute (runtime constraints)", () => {
  it("has no pool.query / client.query in messengerPhoneHttpBindExecute.ts", () => {
    const src = readFileSync(
      join(__dirname, "../../app-layer/integrator/messengerPhoneHttpBindExecute.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
    expect(src).toContain("runPgPoolPgText");
    expect(src).toMatch(/Wave 3 phase 15E/);
    expect(src).toContain("bindInputSchema");
    expect(src).toContain("integratorIdentityRowSchema");
  });
});

describe("executeMessengerPhoneHttpBind", () => {
  const pool = { connect: connectMock } as unknown as import("pg").Pool;

  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runPgPoolPgTextMock.mockReset();
    applyMessengerPhonePublicBindMock.mockReset();
    connectMock.mockReset();
    vi.mocked(writeAuditLog).mockClear();
    vi.mocked(notifyMessengerPhoneBindBlockedFromWebapp).mockClear();
    runPgPoolPgTextMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("rejects invalid input without opening TX", async () => {
    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "telegram",
      externalId: "",
      phoneNormalized: "+79001234567",
    });
    expect(result).toMatchObject({ ok: false, reason: "db_transient_failure", phoneLinkIndeterminate: true });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("runs BEGIN/COMMIT and applies bind on happy path", async () => {
    const client = { release: vi.fn() };
    connectMock.mockResolvedValueOnce(client);
    applyMessengerPhonePublicBindMock.mockResolvedValueOnce({ platformUserId: "pu-1" });
    runWebappPgTextMock.mockImplementation(mockBindSqlHappyPath());

    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "telegram",
      externalId: "tg-1",
      phoneNormalized: "+79001234567",
    });

    expect(result).toEqual({ ok: true, platformUserId: "pu-1" });
    expect(runPgPoolPgTextMock.mock.calls.map((c) => String(c[1]))).toEqual(
      expect.arrayContaining(["BEGIN", "COMMIT"]),
    );
    expect(applyMessengerPhonePublicBindMock).toHaveBeenCalled();
  });

  it("runs ensureIdentityForMessenger CTE on max channel before bind", async () => {
    const client = { release: vi.fn() };
    const sqlCalls: string[] = [];
    connectMock.mockResolvedValueOnce(client);
    applyMessengerPhonePublicBindMock.mockResolvedValueOnce({ platformUserId: "pu-max" });
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      sqlCalls.push(String(sql));
      return mockBindSqlHappyPath()(sql);
    });

    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "max",
      externalId: "max-1",
      phoneNormalized: "+79001234567",
    });

    expect(result).toEqual({ ok: true, platformUserId: "pu-max" });
    const ensureIdx = sqlCalls.findIndex(
      (s) => s.includes("INSERT INTO users") && s.includes("INSERT INTO identities"),
    );
    const peekIdx = sqlCalls.findIndex(
      (s) => s.includes("FROM identities i") && s.includes("external_id = $1"),
    );
    expect(ensureIdx).toBeGreaterThanOrEqual(0);
    expect(peekIdx).toBeGreaterThan(ensureIdx);
  });

  it("returns no_integrator_identity when identity row fails Zod", async () => {
    const client = { release: vi.fn() };
    connectMock.mockResolvedValueOnce(client);
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: 42 }],
      rowCount: 1,
    });

    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "telegram",
      externalId: "tg-bad-row",
      phoneNormalized: "+79001234567",
    });

    expect(result).toEqual({ ok: false, reason: "no_integrator_identity" });
    expect(runPgPoolPgTextMock.mock.calls.map((c) => String(c[1]))).toEqual(
      expect.arrayContaining(["BEGIN", "ROLLBACK"]),
    );
    expect(applyMessengerPhonePublicBindMock).not.toHaveBeenCalled();
  });

  it("returns no_integrator_identity when identity row missing", async () => {
    const client = { release: vi.fn() };
    connectMock.mockResolvedValueOnce(client);
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "telegram",
      externalId: "tg-missing",
      phoneNormalized: "+79001234567",
    });

    expect(result).toEqual({ ok: false, reason: "no_integrator_identity" });
    expect(runPgPoolPgTextMock.mock.calls.map((c) => String(c[1]))).toEqual(
      expect.arrayContaining(["BEGIN", "ROLLBACK"]),
    );
  });

  it("rolls back and writes audit when bind is blocked by MessengerPhoneLinkError", async () => {
    const client = { release: vi.fn() };
    connectMock.mockResolvedValueOnce(client);
    applyMessengerPhonePublicBindMock.mockRejectedValueOnce(
      new MessengerPhoneLinkError("merge_blocked_ambiguous_candidates", {
        candidateIds: ["id-1", "id-2"],
      }),
    );
    runWebappPgTextMock.mockImplementation(mockBindSqlHappyPath());

    const result = await executeMessengerPhoneHttpBind(pool, {
      channelCode: "telegram",
      externalId: "tg-blocked",
      phoneNormalized: "+79001234567",
    });

    expect(result).toEqual({ ok: false, reason: "merge_blocked_ambiguous_candidates" });
    expect(runPgPoolPgTextMock.mock.calls.map((c) => String(c[1]))).toEqual(
      expect.arrayContaining(["BEGIN", "ROLLBACK"]),
    );

    await vi.waitFor(() => {
      expect(writeAuditLog).toHaveBeenCalledWith(
        pool,
        expect.objectContaining({
          action: "messenger_phone_bind_blocked",
          status: "error",
          targetId: "id-1",
        }),
      );
      expect(notifyMessengerPhoneBindBlockedFromWebapp).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "merge_blocked_ambiguous_candidates",
          candidateIds: ["id-1", "id-2"],
        }),
      );
    });
  });
});
