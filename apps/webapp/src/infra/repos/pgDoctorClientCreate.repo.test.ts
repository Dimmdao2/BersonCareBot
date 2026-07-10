import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: releaseMock,
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));
const findCanonicalUserIdByPhoneMock = vi.hoisted(() => vi.fn());
const applyPhoneHistoryMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
  };
});

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  findCanonicalUserIdByPhone: findCanonicalUserIdByPhoneMock,
}));

vi.mock("@/infra/repos/pgPhoneHistory", () => ({
  applyPlatformUserPhoneHistoryTransition: applyPhoneHistoryMock,
}));

import { resolveOrCreateDoctorClientByPhone } from "./pgDoctorClientCreate";

describe("resolveOrCreateDoctorClientByPhone", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
    findCanonicalUserIdByPhoneMock.mockReset();
    applyPhoneHistoryMock.mockReset();
    clientQueryMock.mockImplementation(async (sqlText: string) => {
      if (sqlText === "BEGIN" || sqlText === "COMMIT" || sqlText === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
    findCanonicalUserIdByPhoneMock.mockResolvedValue(null);
    applyPhoneHistoryMock.mockResolvedValue(undefined);
  });

  it("returns existing canonical user without insert", async () => {
    findCanonicalUserIdByPhoneMock.mockResolvedValue("user-existing");
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ display_name: "Existing", phone_normalized: "+79991234567" }],
    });

    const result = await resolveOrCreateDoctorClientByPhone({
      phoneNormalized: "+79991234567",
      displayName: "New",
      emailRaw: null,
      emailNormalized: null,
    });

    expect(result).toMatchObject({
      ok: true,
      created: false,
      userId: "user-existing",
    });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns create_failed when canonical id exists but row is missing", async () => {
    findCanonicalUserIdByPhoneMock.mockResolvedValue("user-existing");
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await resolveOrCreateDoctorClientByPhone({
      phoneNormalized: "+79991234567",
      displayName: "New",
      emailRaw: null,
      emailNormalized: null,
    });

    expect(result).toEqual({ ok: false, error: "create_failed" });
  });

  it("returns email_conflict when normalized email is already taken", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "other-user" }] });

    const result = await resolveOrCreateDoctorClientByPhone({
      phoneNormalized: "+79991234567",
      displayName: "New",
      emailRaw: "taken@example.com",
      emailNormalized: "taken@example.com",
    });

    expect(result).toEqual({ ok: false, error: "email_conflict" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("creates user in transaction and records phone history", async () => {
    const txClient = { query: clientQueryMock, release: releaseMock };
    connectMock.mockResolvedValueOnce(txClient);
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "new-user", display_name: "New Client" }],
    });

    const result = await resolveOrCreateDoctorClientByPhone({
      phoneNormalized: "+79991234567",
      displayName: "New Client",
      emailRaw: null,
      emailNormalized: null,
    });

    expect(result).toMatchObject({ ok: true, created: true, userId: "new-user" });
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const insertSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(insertSql).toContain("INSERT INTO platform_users");
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBeDefined();
    expect(applyPhoneHistoryMock).toHaveBeenCalledWith(
      txClient,
      expect.objectContaining({ platformUserId: "new-user", newPhoneNormalized: "+79991234567" }),
    );
  });

  it("rolls back when insert returns no user id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await resolveOrCreateDoctorClientByPhone({
      phoneNormalized: "+79991234567",
      displayName: "New",
      emailRaw: null,
      emailNormalized: null,
    });

    expect(result).toEqual({ ok: false, error: "create_failed" });
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });
});
