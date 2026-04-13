import { describe, expect, it, vi } from "vitest";
import type { DbPort } from "../../../kernel/contracts/index.js";
import type { WebappEventsPort } from "../../../kernel/contracts/index.js";
import { tryEmitWebappProjectionThenEnqueue } from "./projectionFanout.js";

describe("projectionFanout: sync emit then outbox fallback", () => {
  const input = {
    eventType: "contact.linked",
    idempotencyKey: "contact.linked:test",
    occurredAt: new Date().toISOString(),
    payload: { integratorUserId: "1", phoneNormalized: "+79990001122" },
  };

  it("skips outbox when sync emit succeeds", async () => {
    const projectionQueries: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        projectionQueries.push([sql, params]);
        return { rows: [] };
      }),
    } as unknown as DbPort;
    const webapp: WebappEventsPort = {
      emit: vi.fn().mockResolvedValue({ ok: true, status: 202 }),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    await tryEmitWebappProjectionThenEnqueue(db, webapp, input);
    expect(webapp.emit).toHaveBeenCalledTimes(1);
    expect(projectionQueries.some((q) => String(q[0]).includes("projection_outbox"))).toBe(false);
  });

  it("enqueues when sync emit fails", async () => {
    const projectionQueries: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        projectionQueries.push([sql, params]);
        return { rows: [] };
      }),
    } as unknown as DbPort;
    const webapp: WebappEventsPort = {
      emit: vi.fn().mockResolvedValue({ ok: false, status: 503, error: "unavailable" }),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    await tryEmitWebappProjectionThenEnqueue(db, webapp, input);
    expect(webapp.emit).toHaveBeenCalledTimes(1);
    expect(projectionQueries.some((q) => String(q[0]).includes("projection_outbox"))).toBe(true);
  });

  it("enqueues when webapp port is missing", async () => {
    const projectionQueries: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        projectionQueries.push([sql, params]);
        return { rows: [] };
      }),
    } as unknown as DbPort;
    await tryEmitWebappProjectionThenEnqueue(db, undefined, input);
    expect(projectionQueries.some((q) => String(q[0]).includes("projection_outbox"))).toBe(true);
  });
});
