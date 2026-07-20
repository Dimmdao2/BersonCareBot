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
    });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      "get_staff_security_session_state",
    );
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
