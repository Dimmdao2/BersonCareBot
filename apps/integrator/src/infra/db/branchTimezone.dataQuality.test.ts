import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const upsertIncidentMock = vi.hoisted(() => vi.fn());

vi.mock("./client.js", () => ({
  db: { query: queryMock },
}));

vi.mock("./repos/integrationDataQualityIncidents.js", () => ({
  upsertIntegrationDataQualityIncident: upsertIncidentMock,
}));

import type { DbPort } from "../../kernel/contracts/index.js";
import { createGetBranchTimezoneWithDataQuality, resetBranchTimezoneCacheForTests } from "./branchTimezone.js";

describe("createGetBranchTimezoneWithDataQuality", () => {
  const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    queryMock.mockReset();
    upsertIncidentMock.mockReset();
    upsertIncidentMock.mockResolvedValue({ occurrences: 1 });
    dispatchOutgoing.mockClear();
    resetBranchTimezoneCacheForTests();
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeDb(): DbPort {
    const query = queryMock;
    const self: DbPort = {
      query,
      tx: async <T>(fn: (inner: DbPort) => Promise<T>) => fn(self),
    };
    return self;
  }

  it("records incident and dispatches Telegram on missing branch row (first dedup insert)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const getTz = createGetBranchTimezoneWithDataQuality({
      db: makeDb(),
      dispatchPort: { dispatchOutgoing },
    });
    await expect(getTz("999999")).resolves.toBe("Europe/Moscow");
    expect(upsertIncidentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        integration: "rubitime",
        entity: "branch",
        externalId: "999999",
        field: "branch_timezone",
        errorReason: "missing_or_empty",
      }),
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it("records invalid_branch_id without DB query", async () => {
    const getTz = createGetBranchTimezoneWithDataQuality({
      db: makeDb(),
      dispatchPort: { dispatchOutgoing },
    });
    await expect(getTz("not-a-number")).resolves.toBe("Europe/Moscow");
    expect(queryMock).not.toHaveBeenCalled();
    expect(upsertIncidentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalId: "not-a-number",
        errorReason: "invalid_branch_id",
      }),
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it("does not alert again within TTL (cached fallback)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const getTz = createGetBranchTimezoneWithDataQuality({
      db: makeDb(),
      dispatchPort: { dispatchOutgoing },
    });
    await getTz("42");
    expect(upsertIncidentMock).toHaveBeenCalledTimes(1);
    await getTz("42");
    expect(upsertIncidentMock).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });
});
