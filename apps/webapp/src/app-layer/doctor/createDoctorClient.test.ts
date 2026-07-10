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

  it("returns invalid_phone for malformed input", async () => {
    const result = await createDoctorClient({ phone: "bad", createdByUserId: "doc-1" }, emailSetupAccess);
    expect(result).toEqual({ ok: false, error: "invalid_phone" });
    expect(resolveOrCreateDoctorClientByPhoneMock).not.toHaveBeenCalled();
  });

  it("returns invalid_email for malformed email", async () => {
    const result = await createDoctorClient(
      { phone: "+79991234567", email: "not-an-email", createdByUserId: "doc-1" },
      emailSetupAccess,
    );
    expect(result).toEqual({ ok: false, error: "invalid_email" });
    expect(resolveOrCreateDoctorClientByPhoneMock).not.toHaveBeenCalled();
  });

  it("returns existing canonical user without email setup", async () => {
    resolveOrCreateDoctorClientByPhoneMock.mockResolvedValue({
      ok: true,
      created: false,
      userId: "user-existing",
      displayName: "Existing",
      phoneNormalized: "+79991234567",
    });

    const result = await createDoctorClient(
      { phone: "+7 999 123-45-67", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toMatchObject({
      ok: true,
      userId: "user-existing",
      created: false,
      emailSetupEnqueued: false,
    });
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("passes normalized values and display fallback to the repo", async () => {
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

    expect(result).toMatchObject({ ok: true, created: true, emailSetupEnqueued: true });
    expect(resolveOrCreateDoctorClientByPhoneMock).toHaveBeenCalledWith({
      phoneNormalized: "+79991234567",
      displayName: "New Client",
      emailRaw: "NEW@Example.com",
      emailNormalized: "new@example.com",
    });
    expect(trustedPatientPhoneWriteAnchorMock).toHaveBeenCalledWith("doctor_staff_client_create");
    expect(fireAndForgetContactEmailSetupMock).toHaveBeenCalledWith(
      emailSetupAccess,
      {
        userId: "new-user",
        emailNormalized: "new@example.com",
        source: "doctor_profile",
        createdByUserId: "doc-1",
      },
      { hook: "doctor_client_create" },
    );
  });

  it("passes repo failures through", async () => {
    resolveOrCreateDoctorClientByPhoneMock.mockResolvedValue({ ok: false, error: "email_conflict" });

    const result = await createDoctorClient(
      { phone: "+79991234567", email: "taken@example.com", createdByUserId: "doc-1" },
      emailSetupAccess,
    );

    expect(result).toEqual({ ok: false, error: "email_conflict" });
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });
});
