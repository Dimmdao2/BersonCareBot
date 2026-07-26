import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDbPatientPrincipal } from "@bersoncare/db-principal";

const queryMock = vi.hoisted(() => vi.fn());
const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runPgPoolPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

import { pgUserByPhonePort } from "./pgUserByPhone";

describe("pgUserByPhonePort.findByPhone", () => {
  beforeEach(() => {
    queryMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("returns null when no user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("returns null when more than one row (ambiguous phone; safe degradation)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "a" }, { id: "b" }],
    });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("returns user when exactly one row", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "u1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "u1",
            phone_normalized: "+79991234567",
            integrator_user_id: null,
            merged_into_id: null,
            display_name: "N",
            role: "client",
          },
        ],
      });
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "u1", display_name: "N", first_name: null, role: "client", phone_normalized: "+79991234567" }],
      })
      .mockResolvedValueOnce({ rows: [] as { channel_code: string; external_id: string }[] });

    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).not.toBeNull();
    expect(u?.userId).toBe("u1");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).not.toContain(
      "get_staff_security_session_state",
    );
    expect(u?.securityVersion).toBeUndefined();
    expect(u?.securityFactorRequired).toBeUndefined();
  });
});

describe("pgUserByPhonePort read helpers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("getPhoneByUserId returns normalized phone", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "u1",
          phone_normalized: "+79991234567",
          integrator_user_id: null,
          merged_into_id: null,
          display_name: "N",
          role: "client",
        },
      ],
    });
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ phone_normalized: "+79991234567" }] });

    const phone = await pgUserByPhonePort.getPhoneByUserId("u1");
    expect(phone).toBe("+79991234567");
  });

  it("findByUserId returns null when canonical user missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const user = await pgUserByPhonePort.findByUserId("missing");
    expect(user).toBeNull();
  });

  it("findByUserId loads staff security state only for the matching identity-self principal", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    queryMock.mockResolvedValueOnce({
      rows: [{ id: userId, merged_into_id: null }],
    });
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          display_name: "Owner Doctor",
          first_name: null,
          last_name: null,
          patronymic: null,
          role: "doctor",
          phone_normalized: null,
          security_version: 7,
          security_factor_required: true,
          sessions_valid_from: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const sessionUser = await runWithDbPatientPrincipal(
      { platformUserId: userId, source: "pgUserByPhone.test" },
      () => pgUserByPhonePort.findByUserId(userId),
    );

    expect(sessionUser).toMatchObject({
      userId,
      securityVersion: 7,
      securityFactorRequired: true,
      // S2 remedy (2026-07-25): a SQL NULL surfaces as `null` = "no revocation cutoff". It must be
      // present, because absence is the fail-closed "could not be read" state at the chokepoint.
      sessionsValidFrom: null,
    });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      "get_staff_security_session_state",
    );
  });

  it("findByUserId converts a real sessions_valid_from timestamp to unix seconds", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    queryMock.mockResolvedValueOnce({ rows: [{ id: userId, merged_into_id: null }] });
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          display_name: "Owner Doctor",
          first_name: null,
          last_name: null,
          patronymic: null,
          role: "doctor",
          phone_normalized: null,
          security_version: 0,
          security_factor_required: false,
          sessions_valid_from: new Date(1_700_000_000_000),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const sessionUser = await runWithDbPatientPrincipal(
      { platformUserId: userId, source: "pgUserByPhone.test" },
      () => pgUserByPhonePort.findByUserId(userId),
    );

    expect(sessionUser?.sessionsValidFrom).toBe(1_700_000_000);
  });

  it("findByUserId FAILS CLOSED when the row carries no sessions_valid_from key at all", async () => {
    // S2 remedy (2026-07-25): the SELECT always lists the column, so an absent key means the query
    // drifted. Returning "no cutoff" there would silently disable revocation for that user, so it
    // throws and the session chokepoint rejects instead.
    const userId = "11111111-1111-4111-8111-111111111111";
    queryMock.mockResolvedValueOnce({ rows: [{ id: userId, merged_into_id: null }] });
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Owner Doctor",
        first_name: null,
        last_name: null,
        patronymic: null,
        role: "doctor",
        phone_normalized: null,
        security_version: 0,
        security_factor_required: false,
      }],
    });

    await expect(runWithDbPatientPrincipal(
      { platformUserId: userId, source: "pgUserByPhone.test" },
      () => pgUserByPhonePort.findByUserId(userId),
    )).rejects.toThrow("session_user_sessions_valid_from_not_selected");
  });

  it("findByUserId FAILS CLOSED on an unparseable sessions_valid_from instead of dropping it", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    queryMock.mockResolvedValueOnce({ rows: [{ id: userId, merged_into_id: null }] });
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{
        id: userId,
        display_name: "Owner Doctor",
        first_name: null,
        last_name: null,
        patronymic: null,
        role: "doctor",
        phone_normalized: null,
        security_version: 0,
        security_factor_required: false,
        sessions_valid_from: "not-a-timestamp",
      }],
    });

    await expect(runWithDbPatientPrincipal(
      { platformUserId: userId, source: "pgUserByPhone.test" },
      () => pgUserByPhonePort.findByUserId(userId),
    )).rejects.toThrow("session_user_sessions_valid_from_unparseable");
  });

  it("findByUserId rejects a target that does not match the identity-self principal", async () => {
    const selfUserId = "11111111-1111-4111-8111-111111111111";
    const targetUserId = "22222222-2222-4222-8222-222222222222";
    queryMock.mockResolvedValueOnce({
      rows: [{ id: targetUserId, merged_into_id: null }],
    });

    await expect(runWithDbPatientPrincipal(
      { platformUserId: selfUserId, source: "pgUserByPhone.test" },
      () => pgUserByPhonePort.findByUserId(targetUserId),
    )).rejects.toThrow("session_user_identity_self_principal_mismatch");
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });
});
