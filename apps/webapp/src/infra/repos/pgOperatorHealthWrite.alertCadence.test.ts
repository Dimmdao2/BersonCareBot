import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

import { pgOperatorHealthWritePort } from "./pgOperatorHealthWrite";

describe("pgOperatorHealthWritePort provider alert cadence", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
  });

  it("does not open a DB checkout for an empty incident set", async () => {
    await expect(
      pgOperatorHealthWritePort.markOpenIncidentsAlertSent({
        incidentIds: [],
        alertSentAtIso: "2026-07-22T07:00:00.000Z",
      }),
    ).resolves.toEqual({ updated: 0 });
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("updates only the selected still-open incident rows", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "incident-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    getDrizzleMock.mockReturnValue({ update });

    await expect(
      pgOperatorHealthWritePort.markOpenIncidentsAlertSent({
        incidentIds: ["incident-1", "incident-1"],
        alertSentAtIso: "2026-07-22T07:00:00.000Z",
      }),
    ).resolves.toEqual({ updated: 1 });
    expect(set).toHaveBeenCalledWith({ alertSentAt: "2026-07-22T07:00:00.000Z" });
    expect(where).toHaveBeenCalledOnce();
  });

  it("claims one exact due phase atomically across scheduler processes", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    getDrizzleMock.mockReturnValue({ execute });
    await expect(pgOperatorHealthWritePort.claimDueOutboundProviderAlert({
      nowIso: "2026-07-22T07:00:00.000Z",
      staleBeforeIso: "2026-07-22T06:50:00.000Z",
      claimToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      excludeIncidentIds: [],
    })).resolves.toBeNull();
    const fragment = execute.mock.calls[0]![0];
    const query = new PgDialect().sqlToQuery(fragment);
    expect(query.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.sql).toContain("alert_claimed_at IS NULL OR alert_claimed_at <");
    expect(query.sql).toContain("acknowledged_at IS NULL");
    expect(query.sql).toContain("one_hour_alert_sent_at IS NULL");
    expect(query.sql).toContain("LIMIT 1");
  });

  it("ack clears outstanding claims while resolve permits a clean new incident row", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "incident-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    getDrizzleMock.mockReturnValue({ update: vi.fn().mockReturnValue({ set }) });
    await expect(pgOperatorHealthWritePort.acknowledgeOpenOutboundProviderIncidents()).resolves.toEqual({ acknowledged: 1 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      acknowledgedAt: expect.any(String), alertClaimPhase: null, alertClaimToken: null, alertClaimedAt: null,
    }));
    await expect(pgOperatorHealthWritePort.resolveAllOpenIncidents()).resolves.toEqual({ resolved: 1 });
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ resolvedAt: expect.any(String), alertClaimToken: null }));
  });
});
