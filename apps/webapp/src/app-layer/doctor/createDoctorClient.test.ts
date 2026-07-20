import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOrCreateDoctorClientByPhoneMock = vi.hoisted(() => vi.fn());
const fireAndForgetContactEmailSetupMock = vi.hoisted(() => vi.fn());
const trustedPatientPhoneWriteAnchorMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/repos/pgDoctorClientCreate", () => ({
  resolveOrCreateDoctorClientByPhone: resolveOrCreateDoctorClientByPhoneMock,
}));

vi.mock("@/modules/auth/emailSetupAccess/enqueueContactEmailSetup", () => ({
  fireAndForgetContactEmailSetup: fireAndForgetContactEmailSetupMock,
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { DoctorStaffClientCreate: "doctor_staff_client_create" },
  trustedPatientPhoneWriteAnchor: trustedPatientPhoneWriteAnchorMock,
}));

import { createDoctorClient } from "./createDoctorClient";

const emailSetupAccess = { requestContactEmailSetup: vi.fn() };

describe("createDoctorClient", () => {
  beforeEach(() => {
    resolveOrCreateDoctorClientByPhoneMock.mockReset();
    fireAndForgetContactEmailSetupMock.mockReset();
    trustedPatientPhoneWriteAnchorMock.mockReset();
  });

  it("fails closed for malformed input without touching global identity writers", async () => {
    const result = await createDoctorClient({ phone: "bad", createdByUserId: "doc-1" }, emailSetupAccess);
    expect(result).toEqual({ ok: false, error: "create_failed" });
    expect(resolveOrCreateDoctorClientByPhoneMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
  });

  it("fails closed for valid input until organization enrollment creation is implemented", async () => {
    resolveOrCreateDoctorClientByPhoneMock.mockResolvedValue({
      ok: true,
      created: true,
      userId: "new-user",
      displayName: "New Client",
    });

    const result = await createDoctorClient(
      {
        phone: "+7 999 123-45-67",
        email: "NEW@Example.com",
        displayName: "  New Client  ",
        createdByUserId: "doc-1",
      },
      emailSetupAccess,
    );

    expect(result).toEqual({ ok: false, error: "create_failed" });
    expect(resolveOrCreateDoctorClientByPhoneMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
  });
});
