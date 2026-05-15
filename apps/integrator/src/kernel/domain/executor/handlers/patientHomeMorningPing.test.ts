import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Action, DomainContext } from "../../../contracts/index.js";
import { handlePatientHomeMorningPing } from "./patientHomeMorningPing.js";

const queryMock = vi.fn();

vi.mock("../../../../infra/db/client.js", () => ({
  createDbPort: () => ({ query: (...args: unknown[]) => queryMock(...args) }),
}));

vi.mock("../../../../config/appBaseUrl.js", () => ({
  getAppBaseUrl: vi.fn(async () => "https://app.example"),
}));

vi.mock("../../../../config/appTimezone.js", () => ({
  getAppDisplayTimezone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("../../../../integrations/webappEntryToken.js", () => ({
  buildWebappEntryUrl: vi.fn(() => "https://app.example/app/tg?t=tg"),
  buildWebappEntryUrlForMax: vi.fn(() => "https://app.example/app/max?t=max"),
}));

const action: Action = {
  id: "mp1",
  type: "patient_home.morningWarmupPing",
  mode: "sync",
  params: { batchLimit: 10 },
};

function makeCtx(): DomainContext {
  return {
    nowIso: "2026-04-28T01:00:00.000Z",
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
    },
    event: {
      type: "schedule.tick",
      meta: {
        eventId: "sch-1",
        occurredAt: "2026-04-28T01:00:00.000Z",
        source: "scheduler",
      },
      payload: {},
    },
  };
}

describe("handlePatientHomeMorningPing", () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.useFakeTimers();
    // 04:00 Europe/Moscow = 01:00 UTC (fixed +3, no DST April)
    vi.setSystemTime(new Date("2026-04-28T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips when disabled in system_settings", async () => {
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: false } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await handlePatientHomeMorningPing(action, makeCtx(), {});
    expect(res.status).toBe("skipped");
    expect(res.values).toMatchObject({ reason: "morning_ping_disabled" });
  });

  it("skips when not the configured local minute", async () => {
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "10:00" } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await handlePatientHomeMorningPing(action, makeCtx(), {});
    expect(res.status).toBe("skipped");
    expect(res.values).toMatchObject({ reason: "not_ping_minute" });
  });

  it("accepts ticks inside due window after configured minute", async () => {
    vi.setSystemTime(new Date("2026-04-28T01:01:00.000Z"));
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "04:00" } }], rowCount: 1 };
      }
      if (sql.includes("patient_home_block_items") && sql.includes("daily_warmup")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (sql.includes("DISTINCT ON")) {
        return {
          rows: [{ user_id: "42", resource: "telegram", external_id: "999001" }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO idempotency_keys")) {
        return { rows: [{ key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const res = await handlePatientHomeMorningPing(action, makeCtx(), { queuePort: { enqueue } });
    expect(res.status).toBe("success");
    expect(res.values).toMatchObject({ deliveryMode: "queued", enqueued: 1 });
  });

  it("enqueues one morning ping job with web_app button when queuePort is set", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    let insertedKey = "";
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "04:00" } }], rowCount: 1 };
      }
      if (sql.includes("patient_home_block_items") && sql.includes("daily_warmup")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (sql.includes("DISTINCT ON")) {
        return {
          rows: [{ user_id: "42", resource: "telegram", external_id: "999001" }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO idempotency_keys")) {
        insertedKey = String(params?.[0] ?? "");
        return { rows: [{ key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await handlePatientHomeMorningPing(action, makeCtx(), { queuePort: { enqueue } });
    expect(res.status).toBe("success");
    expect(res.values).toMatchObject({ deliveryMode: "queued", enqueued: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = enqueue.mock.calls[0]![0] as { kind: string; payload: { intent: { payload: { message: { text: string } } }; retry: { backoffSeconds: number[] } } };
    expect(call.kind).toBe("message.deliver");
    expect(call.payload.intent.payload.message.text).toContain("Разминка дня");
    expect(call.payload.retry.backoffSeconds[0]).toBe(0);
    expect(insertedKey).toContain(":42:telegram");
  });

  it("returns intents when queuePort is absent (test / fallback)", async () => {
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "04:00" } }], rowCount: 1 };
      }
      if (sql.includes("patient_home_block_items") && sql.includes("daily_warmup")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (sql.includes("DISTINCT ON")) {
        return {
          rows: [{ user_id: "42", resource: "telegram", external_id: "999001" }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO idempotency_keys")) {
        return { rows: [{ key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await handlePatientHomeMorningPing(action, makeCtx(), {});
    expect(res.status).toBe("success");
    const intents = "intents" in res && Array.isArray(res.intents) ? res.intents : [];
    expect(intents).toHaveLength(1);
    const first = intents[0] as unknown as {
      type: string;
      payload: { message: { text: string } };
    };
    expect(first.type).toBe("message.send");
    expect(first.payload.message.text).toContain("Разминка дня");
  });

  it("staggers queue delays for multiple recipients", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "04:00" } }], rowCount: 1 };
      }
      if (sql.includes("patient_home_block_items") && sql.includes("daily_warmup")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (sql.includes("DISTINCT ON")) {
        return {
          rows: [
            { user_id: "1", resource: "telegram", external_id: "101" },
            { user_id: "2", resource: "telegram", external_id: "102" },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes("INSERT INTO idempotency_keys")) {
        return { rows: [{ key: "k" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await handlePatientHomeMorningPing(action, makeCtx(), { queuePort: { enqueue } });
    expect(res.values).toMatchObject({ enqueued: 2 });
    expect(enqueue).toHaveBeenCalledTimes(2);
    const a = enqueue.mock.calls[0]![0] as { payload: { retry: { backoffSeconds: number[] } } };
    const b = enqueue.mock.calls[1]![0] as { payload: { retry: { backoffSeconds: number[] } } };
    expect(a.payload.retry.backoffSeconds[0]).toBe(0);
    expect(b.payload.retry.backoffSeconds[0]).toBe(1);
  });

  it("does not enqueue twice for the same user/date on a second scheduler tick (idempotency)", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    let idemAttempts = 0;
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_enabled") {
        return { rows: [{ value_json: { value: true } }], rowCount: 1 };
      }
      if (sql.includes("system_settings") && params?.[0] === "patient_home_morning_ping_local_time") {
        return { rows: [{ value_json: { value: "04:00" } }], rowCount: 1 };
      }
      if (sql.includes("patient_home_block_items") && sql.includes("daily_warmup")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      if (sql.includes("DISTINCT ON")) {
        return {
          rows: [{ user_id: "99", resource: "telegram", external_id: "501" }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO idempotency_keys")) {
        idemAttempts += 1;
        return idemAttempts === 1 ?
            { rows: [{ key: "k" }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const ctx = makeCtx();
    const first = await handlePatientHomeMorningPing(action, ctx, { queuePort: { enqueue } });
    expect(first.values).toMatchObject({ enqueued: 1 });
    enqueue.mockClear();
    const second = await handlePatientHomeMorningPing(action, ctx, { queuePort: { enqueue } });
    expect(second.values).toMatchObject({ enqueued: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
