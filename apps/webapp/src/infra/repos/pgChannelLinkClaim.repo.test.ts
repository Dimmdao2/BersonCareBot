import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const upsertBroadcastDefaultsAfterChannelBindMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock("@/infra/upsertBroadcastDefaultsAfterChannelBind", () => ({
  upsertBroadcastDefaultsAfterChannelBind: (...args: unknown[]) =>
    upsertBroadcastDefaultsAfterChannelBindMock(...args),
}));

import { claimMessengerChannelBinding } from "./pgChannelLinkClaim";

const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const pool = {
  connect: vi.fn(async () => ({
    query: clientQueryMock,
    release: releaseMock,
  })),
};

function resultForSql(queryText: string) {
  if (queryText.includes("FROM platform_users WHERE id = $1::uuid")) {
    return { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] };
  }
  if (queryText.includes("count(*)::text AS c FROM user_channel_bindings")) {
    return { rows: [{ c: "1" }] };
  }
  if (queryText.includes("count(*)::text AS c FROM user_oauth_bindings")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM symptom_trackings st")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM patient_bookings")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM doctor_notes")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM online_intake_requests")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM patient_lfk_assignments")) {
    return { rows: [{ c: "0" }] };
  }
  if (queryText.includes("FROM channel_link_secrets")) {
    return { rows: [{ id: "secret-1" }] };
  }
  if (queryText.includes("FROM user_channel_bindings") && queryText.includes("FOR UPDATE")) {
    return { rows: [{ user_id: "stub-1" }] };
  }
  return { rows: [], rowCount: 1 };
}

describe("claimMessengerChannelBinding", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    upsertBroadcastDefaultsAfterChannelBindMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    pool.connect.mockClear();
    clientQueryMock.mockResolvedValue({ rows: [] });
    upsertBroadcastDefaultsAfterChannelBindMock.mockResolvedValue(undefined);
  });

  it("wraps disposable claim in BEGIN/COMMIT and releases the client", async () => {
    runWebappPgTextMock.mockImplementation((queryText: unknown) => resultForSql(String(queryText)));

    const res = await claimMessengerChannelBinding(pool, {
      tokenUserId: "token-1",
      stubUserId: "stub-1",
      channelCode: "telegram",
      externalId: "tg-1",
      secretRowId: "secret-1",
    });

    expect(res).toEqual({ ok: true });
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(clientQueryMock).not.toHaveBeenCalledWith("ROLLBACK");
    expect(upsertBroadcastDefaultsAfterChannelBindMock).toHaveBeenCalledWith(
      expect.anything(),
      "token-1",
      "telegram",
    );
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("rolls back and returns rejected when recheck classifies the stub as real", async () => {
    runWebappPgTextMock.mockImplementation((queryText: unknown) => {
      const sql = String(queryText);
      if (sql.includes("FROM platform_users WHERE id = $1::uuid")) {
        return { rows: [{ merged_into_id: null, phone_normalized: "+79990001122", role: "client" }] };
      }
      return resultForSql(sql);
    });

    const res = await claimMessengerChannelBinding(pool, {
      tokenUserId: "token-1",
      stubUserId: "stub-1",
      channelCode: "telegram",
      externalId: "tg-1",
      secretRowId: "secret-1",
    });

    expect(res).toEqual({ ok: false, code: "rejected", reason: "stub_has_phone" });
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
