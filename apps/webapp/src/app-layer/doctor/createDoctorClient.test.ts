import { beforeEach, describe, expect, it, vi } from "vitest";

const fireAndForgetContactEmailSetupMock = vi.hoisted(() => vi.fn());
const trustedPatientPhoneWriteAnchorMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/emailSetupAccess/enqueueContactEmailSetup", () => ({
  fireAndForgetContactEmailSetup: fireAndForgetContactEmailSetupMock,
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { DoctorStaffClientCreate: "doctor_staff_client_create" },
  trustedPatientPhoneWriteAnchor: trustedPatientPhoneWriteAnchorMock,
}));

import { createDoctorClient } from "./createDoctorClient";

const createManualOrganizationClient = vi.fn();
const emailSetupAccess = { requestContactEmailSetup: vi.fn() };
const deps = {
  patientOrganization: { createManualOrganizationClient },
  emailSetupAccess,
};
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

describe("createDoctorClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed phone before touching identity or enrollment", async () => {
    const result = await createDoctorClient(
      {
        phone: "bad",
        lastName: "Иванов",
        firstName: "Иван",
        createdByUserId: "doc-1",
        organizationId: "org-1",
      },
      deps,
    );
    expect(result).toEqual({ ok: false, error: "invalid_phone" });
    expect(createManualOrganizationClient).not.toHaveBeenCalled();
  });

  it("rejects missing structured FIO before touching identity or enrollment", async () => {
    const result = await createDoctorClient(
      {
        phone: "+79991234567",
        lastName: " ",
        firstName: "Иван",
        createdByUserId: "doc-1",
        organizationId: "org-1",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_fio" });
    expect(createManualOrganizationClient).not.toHaveBeenCalled();
  });

  it("creates the identity and exact-organization enrollment through one domain operation", async () => {
    createManualOrganizationClient.mockResolvedValue({
      ok: true,
      created: true,
      userId: "new-user",
      displayName: "New Client",
      lastName: "Client",
      firstName: "New",
      patronymic: null,
      phoneNormalized: "+79991234567",
    });

    const result = await createDoctorClient(
      {
        phone: "+7 999 123-45-67",
        email: "NEW@Example.com",
        lastName: "  client ",
        firstName: " new ",
        createdByUserId: "doc-1",
        organizationId: "org-1",
      },
      deps,
    );

    expect(createManualOrganizationClient).toHaveBeenCalledWith({
      organizationId: "org-1",
      commandId: undefined,
      phoneNormalized: "+79991234567",
      lastName: "Client",
      firstName: "New",
      patronymic: null,
      emailRaw: "NEW@Example.com",
      emailNormalized: "new@example.com",
    });
    expect(result).toEqual({
      ok: true,
      userId: "new-user",
      displayName: "New Client",
      lastName: "Client",
      firstName: "New",
      patronymic: null,
      phoneNormalized: "+79991234567",
      created: true,
      emailSetupEnqueued: true,
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
      { hook: "doctor.clients.create" },
    );
  });

  it("creates a structured patient without phone or email and does not grant contact trust", async () => {
    createManualOrganizationClient.mockResolvedValue({
      ok: true,
      created: true,
      userId: "contactless-user",
      displayName: "Иванов Иван Иванович",
      lastName: "Иванов",
      firstName: "Иван",
      patronymic: "Иванович",
      phoneNormalized: null,
    });

    await expect(
      createDoctorClient(
        {
          requestId: REQUEST_ID,
          lastName: " иванов ",
          firstName: " иван ",
          patronymic: " иванович ",
          phone: null,
          email: null,
          createdByUserId: "doc-1",
          organizationId: "org-1",
        },
        deps,
      ),
    ).resolves.toMatchObject({
      ok: true,
      userId: "contactless-user",
      phoneNormalized: null,
      emailSetupEnqueued: false,
    });
    expect(createManualOrganizationClient).toHaveBeenCalledWith({
      organizationId: "org-1",
      commandId: REQUEST_ID,
      phoneNormalized: null,
      lastName: "Иванов",
      firstName: "Иван",
      patronymic: "Иванович",
      emailRaw: null,
      emailNormalized: null,
    });
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("requires a durable request UUID for a standalone no-contact card", async () => {
    await expect(createDoctorClient({
      lastName: "Иванов", firstName: "Иван", phone: null, email: null,
      createdByUserId: "doc-1", organizationId: "org-1",
    }, deps)).resolves.toEqual({ ok: false, error: "invalid_request_id" });
    expect(createManualOrganizationClient).not.toHaveBeenCalled();
  });

  it("returns the same no-contact card on exact replay without contact side effects", async () => {
    createManualOrganizationClient
      .mockResolvedValueOnce({ ok: true, created: true, userId: "contactless-user", displayName: "Иванов Иван", lastName: "Иванов", firstName: "Иван", patronymic: null, phoneNormalized: null })
      .mockResolvedValueOnce({ ok: true, created: false, userId: "contactless-user", displayName: "Иванов Иван", lastName: "Иванов", firstName: "Иван", patronymic: null, phoneNormalized: null });
    const input = { requestId: REQUEST_ID, lastName: "Иванов", firstName: "Иван", phone: null, email: null, createdByUserId: "doc-1", organizationId: "org-1" };
    await expect(createDoctorClient(input, deps)).resolves.toMatchObject({ ok: true, userId: "contactless-user", created: true });
    await expect(createDoctorClient(input, deps)).resolves.toMatchObject({ ok: true, userId: "contactless-user", created: false });
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("is idempotent for an existing organization client and does not claim a new phone trust write", async () => {
    createManualOrganizationClient.mockResolvedValue({
      ok: true,
      created: false,
      userId: "existing-user",
      displayName: "Existing Client",
      phoneNormalized: "+79991234567",
    });

    await expect(
      createDoctorClient(
        {
          phone: "+79991234567",
          lastName: "Иванов",
          firstName: "Иван",
          createdByUserId: "doc-1",
          organizationId: "org-1",
        },
        deps,
      ),
    ).resolves.toMatchObject({ ok: true, created: false, userId: "existing-user" });
    expect(trustedPatientPhoneWriteAnchorMock).not.toHaveBeenCalled();
    expect(fireAndForgetContactEmailSetupMock).not.toHaveBeenCalled();
  });

  it("preserves a neutral failure for identity/enrollment conflicts", async () => {
    createManualOrganizationClient.mockResolvedValue({ ok: false, error: "inactive_enrollment" });
    await expect(
      createDoctorClient(
        {
          phone: "+79991234567",
          lastName: "Иванов",
          firstName: "Иван",
          createdByUserId: "doc-1",
          organizationId: "org-1",
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, error: "create_failed" });
  });
});
