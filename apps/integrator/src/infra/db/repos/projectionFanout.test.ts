import { describe, expect, it, vi } from "vitest";
import type { DbPort } from "../../../kernel/contracts/index.js";
import type { WebappEventsPort } from "../../../kernel/contracts/index.js";
import { stubIntegratorDrizzleForTests } from "../stubIntegratorDrizzleForTests.js";
import { tryEmitWebappProjectionThenEnqueue } from "./projectionFanout.js";

describe("projectionFanout: sync emit then outbox fallback", () => {
  const input = {
    eventType: "contact.linked",
    idempotencyKey: "contact.linked:test",
    occurredAt: new Date().toISOString(),
    payload: { integratorUserId: "1", phoneNormalized: "+79990001122" },
  };

  it("skips outbox when sync emit succeeds", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
      tx: vi.fn() as unknown as DbPort["tx"],
      integratorDrizzle: stubIntegratorDrizzleForTests(capture),
    } as unknown as DbPort;
    const webapp: WebappEventsPort = {
      emit: vi.fn().mockResolvedValue({ ok: true, status: 202 }),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    await tryEmitWebappProjectionThenEnqueue(db, webapp, input);
    expect(webapp.emit).toHaveBeenCalledTimes(1);
    expect(capture.projectionInserts).toHaveLength(0);
  });

  it("enqueues when sync emit fails", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
      tx: vi.fn() as unknown as DbPort["tx"],
      integratorDrizzle: stubIntegratorDrizzleForTests(capture),
    } as unknown as DbPort;
    const webapp: WebappEventsPort = {
      emit: vi.fn().mockResolvedValue({ ok: false, status: 503, error: "unavailable" }),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    await tryEmitWebappProjectionThenEnqueue(db, webapp, input);
    expect(webapp.emit).toHaveBeenCalledTimes(1);
    expect(capture.projectionInserts).toHaveLength(1);
    expect(capture.projectionInserts[0]?.eventType).toBe("contact.linked");
  });

  it("enqueues when webapp port is missing", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
      tx: vi.fn() as unknown as DbPort["tx"],
      integratorDrizzle: stubIntegratorDrizzleForTests(capture),
    } as unknown as DbPort;
    await tryEmitWebappProjectionThenEnqueue(db, undefined, input);
    expect(capture.projectionInserts).toHaveLength(1);
    expect(capture.projectionInserts[0]?.idempotencyKey).toBe("contact.linked:test");
  });
});
