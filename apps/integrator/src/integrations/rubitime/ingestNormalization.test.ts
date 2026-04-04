import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertIncidentMock = vi.hoisted(() => vi.fn());

vi.mock("../../infra/db/repos/integrationDataQualityIncidents.js", () => ({
  upsertIntegrationDataQualityIncident: upsertIncidentMock,
}));

import type { DbPort } from "../../kernel/contracts/index.js";
import { toRubitimeIncoming } from "./connector.js";
import { normalizeRubitimeIncomingForIngest } from "./ingestNormalization.js";

describe("normalizeRubitimeIncomingForIngest (Stage 3 ingest)", () => {
  const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    upsertIncidentMock.mockReset();
    upsertIncidentMock.mockResolvedValue({ occurrences: 2 });
    dispatchOutgoing.mockClear();
  });

  function makeStubDb(): DbPort {
    const query = vi.fn();
    const self: DbPort = {
      query,
      tx: async <T>(fn: (inner: DbPort) => Promise<T>) => fn(self),
    };
    return self;
  }

  function depsForTz(tz: string) {
    return {
      db: makeStubDb(),
      dispatchPort: { dispatchOutgoing },
      getBranchTimezone: vi.fn(async () => tz),
    };
  }

  it('maps naive "2026-04-07 11:00:00" with Europe/Moscow to 08:00Z on incoming payload', async () => {
    const body = {
      from: "rubitime" as const,
      event: "event-update-record" as const,
      data: {
        record: {
          id: "r1",
          datetime: "2026-04-07 11:00:00",
          branch_id: 1,
        },
      },
    };
    const incoming = toRubitimeIncoming(body);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));
    expect(incoming.recordAt).toBe("2026-04-07T08:00:00.000Z");
    expect(incoming.recordAtFormatted).toBe("07.04.2026 в 11:00");
    expect(incoming.timeNormalizationStatus).toBe("ok");
    expect(incoming.timeNormalizationFieldErrors).toBeUndefined();
  });

  it('maps same wall clock with Europe/Samara to 07:00Z', async () => {
    const body = {
      from: "rubitime" as const,
      event: "event-update-record" as const,
      data: {
        record: {
          id: "r2",
          datetime: "2026-04-07 11:00:00",
          branch_id: 2,
        },
      },
    };
    const incoming = toRubitimeIncoming(body);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Samara"));
    expect(incoming.recordAt).toBe("2026-04-07T07:00:00.000Z");
    expect(incoming.recordAtFormatted).toBe("07.04.2026 в 11:00");
  });

  it("normalizes dateTimeEnd alongside recordAt", async () => {
    const body = {
      from: "rubitime" as const,
      event: "event-update-record" as const,
      data: {
        record: {
          id: "r3",
          datetime: "2026-04-07 11:00:00",
          datetime_end: "2026-04-07 12:00:00",
          branch_id: 1,
        },
      },
    };
    const incoming = toRubitimeIncoming(body);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));
    expect(incoming.recordAt).toBe("2026-04-07T08:00:00.000Z");
    expect(incoming.dateTimeEnd).toBe("2026-04-07T09:00:00.000Z");
  });

  it("Variant A: invalid recordAt clears field, records incident, alerts on first dedup insert (S3.T08 business-critical path)", async () => {
    upsertIncidentMock.mockResolvedValueOnce({ occurrences: 1 });
    const body = {
      from: "rubitime" as const,
      event: "event-create-record" as const,
      data: {
        record: {
          id: "r-bad",
          datetime: "not-a-date",
          branch_id: 1,
        },
      },
    };
    const incoming = toRubitimeIncoming(body);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));
    expect(incoming.recordAt).toBeUndefined();
    expect(incoming.timeNormalizationStatus).toBe("degraded");
    expect(incoming.timeNormalizationFieldErrors).toEqual([
      { field: "recordAt", reason: "unsupported_format" },
    ]);
    expect(upsertIncidentMock).toHaveBeenCalled();
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it("invalid dateTimeEnd: optional field cleared but still incident + alert on first seen", async () => {
    upsertIncidentMock.mockResolvedValueOnce({ occurrences: 1 });
    const body = {
      from: "rubitime" as const,
      event: "event-update-record" as const,
      data: {
        record: {
          id: "r-end-bad",
          datetime: "2026-04-07 11:00:00",
          datetime_end: "totally-bogus",
          branch_id: 1,
        },
      },
    };
    const incoming = toRubitimeIncoming(body);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));
    expect(incoming.recordAt).toBe("2026-04-07T08:00:00.000Z");
    expect(incoming.dateTimeEnd).toBeUndefined();
    expect(incoming.timeNormalizationStatus).toBe("degraded");
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });
});
