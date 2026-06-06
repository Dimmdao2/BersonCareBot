import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));
const findCanonicalUserIdByPhoneMock = vi.hoisted(() => vi.fn());
const applyPhoneHistoryMock = vi.hoisted(() => vi.fn());
const fireAndForgetContactEmailSetupMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/client", () => ({
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

vi.mock("@/modules/auth/emailSetupAccess/enqueueContactEmailSetup", () => ({
  fireAndForgetContactEmailSetup: fireAndForgetContactEmailSetupMock,
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { DoctorStaffClientCreate: "doctor_staff_client_create" },
  trustedPatientPhoneWriteAnchor: vi.fn(),
}));

import { createDoctorClient } from "./createDoctorClient";

const emailSetupAccess = { requestContactEmailSetup: vi.fn() };

describe("createDoctorClient", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    findCanonicalUserIdByPhoneMock.mockReset();
    applyPhoneHistoryMock.mockReset();
    fireAndForgetContactEmailSetupMock.mockReset();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
    findCanonicalUserIdByPhoneMock.mockResolvedValue(null);
    applyPhoneHistoryMock.mockResolvedValue(undefined);
  });

  it("returns invalid_phone for malformed input", async () => {
    const result = await createDoctorClient(
      { phone: "bad", createdByUserId: "doc-1" },
      emailSetupAccess,
    );
    expect(result).toEqual({ ok: false, error: "invalid_phone" });
  });

  it("returns invalid_email for malformed email", async () => {
    const result = await createDoctorClient(
      { phone: "+79991234567", email: "not-an-email", createdByUserId: "doc-1" },
      emailSetupAccess,
    );
    expect(result).toEqual({ ok: false, error: "invalid_email" });
  });

  it("returns existing canonical user without insert", async () => {
    findCanonicalUserIdByPhoneMock.mockResolvedValue("user-existing");
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ display_name: "Existing", phone_normalized: "+79991234567" }],
    });

    const result = await createDoctorClient(
      { phone: "+7 999 123-45-67", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toMatchObject({
      ok: true,
      userId: "user-existing",
      created: false,
    });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns create_failed when canonical id exists but row missing", async () => {
    findCanonicalUserIdByPhoneMock.mockResolvedValue("user-existing");
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await createDoctorClient(
      { phone: "+79991234567", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toEqual({ ok: false, error: "create_failed" });
  });

  it("creates user in transaction via runWebappPgText on tx client", async () => {
    const txClient = { query: clientQueryMock, release: vi.fn() };
    connectMock.mockResolvedValueOnce(txClient);
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "new-user", display_name: "New Client" }],
    });

    const result = await createDoctorClient(
      { phone: "+79991234567", displayName: "New Client", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toMatchObject({
      ok: true,
      userId: "new-user",
      created: true,
      emailSetupEnqueued: false,
    });
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

  it("enqueues email setup when email provided on create", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "new-user", display_name: "New Client" }],
      });

    const result = await createDoctorClient(
      {
        phone: "+79991234567",
        email: "new@example.com",
        displayName: "New Client",
        createdByUserId: "doc-1",
      },
      emailSetupAccess,
    );

    expect(result).toMatchObject({ ok: true, emailSetupEnqueued: true });
    expect(fireAndForgetContactEmailSetupMock).toHaveBeenCalledTimes(1);
  });

  it("returns email_conflict when email already taken", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "other-user" }] });

    const result = await createDoctorClient(
      {
        phone: "+79991234567",
        email: "taken@example.com",
        createdByUserId: "doc-1",
      },
      emailSetupAccess,
    );

    expect(result).toEqual({ ok: false, error: "email_conflict" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rolls back when INSERT returns no user id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await createDoctorClient(
      { phone: "+79991234567", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toEqual({ ok: false, error: "create_failed" });
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });
});
