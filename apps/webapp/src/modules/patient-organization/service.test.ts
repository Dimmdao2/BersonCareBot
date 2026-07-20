import { describe, expect, it, vi } from "vitest";
import { createPatientOrganizationService } from "./service";
import type { PatientOrganizationEnrollment, PatientOrganizationPort } from "./ports";

function enrollment(
  organizationId: string,
  title: string,
  organizationIsActive = true,
): PatientOrganizationEnrollment {
  return {
    organizationId,
    organizationTitle: title,
    organizationIsActive,
    platformUserId: "patient-1",
    status: "active",
    createdAt: "2026-07-20T00:00:00.000Z",
  };
}

function service(rows: PatientOrganizationEnrollment[]) {
  const port: PatientOrganizationPort = {
    listActiveEnrollmentsByPlatformUser: vi.fn().mockResolvedValue(rows),
    hasActiveEnrollment: vi.fn().mockResolvedValue(false),
    createManualOrganizationClient: vi.fn().mockResolvedValue({ ok: false, error: "create_failed" }),
    findTreatmentProgramOrganizationForPatient: vi.fn().mockResolvedValue(null),
  };
  return createPatientOrganizationService({ port });
}

describe("patient organization resolver", () => {
  it("returns neutral recovery for zero usable organizations", async () => {
    await expect(service([]).resolveActiveOrganizationForPatient("patient-1")).resolves.toEqual({
      ok: false,
      reason: "no_active_enrollment",
    });
  });

  it("does not accept enrollment rows resolved for another signed patient identity", async () => {
    await expect(
      service([enrollment("org-a", "Клиника А")]).resolveActiveOrganizationForPatient("patient-2"),
    ).resolves.toEqual({ ok: false, reason: "no_active_enrollment" });
  });

  it("uses the exact-org enrollment port for trusted organization/M2M checks", async () => {
    const hasActiveEnrollment = vi.fn().mockResolvedValue(true);
    const port: PatientOrganizationPort = {
      listActiveEnrollmentsByPlatformUser: vi.fn().mockResolvedValue([]),
      hasActiveEnrollment,
      createManualOrganizationClient: vi.fn().mockResolvedValue({ ok: false, error: "create_failed" }),
      findTreatmentProgramOrganizationForPatient: vi.fn().mockResolvedValue(null),
    };
    await expect(
      createPatientOrganizationService({ port }).hasActiveEnrollment("patient-1", "org-a"),
    ).resolves.toBe(true);
    expect(hasActiveEnrollment).toHaveBeenCalledWith("patient-1", "org-a");
    expect(port.listActiveEnrollmentsByPlatformUser).not.toHaveBeenCalled();
  });

  it("selects the only active organization deterministically when there is no stale preference", async () => {
    const result = await service([
      enrollment("org-disabled", "Недоступная", false),
      enrollment("org-a", "Клиника А"),
    ]).resolveActiveOrganizationForPatient("patient-1");
    expect(result).toMatchObject({
      ok: true,
      organizationId: "org-a",
      selectedBy: "only_active",
    });
  });

  it("requires confirmation instead of silently substituting the sole org for a stale preference", async () => {
    const result = await service([
      enrollment("org-disabled", "Недоступная", false),
      enrollment("org-a", "Клиника А"),
    ]).resolveActiveOrganizationForPatient("patient-1", {
      rememberedOrganizationId: "org-disabled",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "organization_selection_required",
      organizationIds: ["org-a"],
      invalidRememberedOrganization: true,
    });
  });

  it("requires an explicit choice for multiple organizations without a valid hint", async () => {
    const result = await service([
      enrollment("org-a", "Клиника А"),
      enrollment("org-b", "Клиника Б"),
    ]).resolveActiveOrganizationForPatient("patient-1", {
      rememberedOrganizationId: "org-revoked",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "organization_selection_required",
      organizationIds: ["org-a", "org-b"],
      invalidRememberedOrganization: true,
    });
  });

  it("uses a remembered organization only after current enrollment proof", async () => {
    const result = await service([
      enrollment("org-a", "Клиника А"),
      enrollment("org-b", "Клиника Б"),
    ]).resolveActiveOrganizationForPatient("patient-1", {
      rememberedOrganizationId: "org-b",
    });
    expect(result).toMatchObject({ ok: true, organizationId: "org-b", selectedBy: "remembered" });
  });

  it("accepts an exact target only when it is currently authorized", async () => {
    const patientOrganization = service([
      enrollment("org-a", "Клиника А"),
      enrollment("org-b", "Клиника Б"),
    ]);
    await expect(
      patientOrganization.resolveActiveOrganizationForPatient("patient-1", {
        verifiedTargetOrganizationId: "org-b",
      }),
    ).resolves.toMatchObject({ ok: true, organizationId: "org-b", selectedBy: "verified_target" });
    await expect(
      patientOrganization.resolveActiveOrganizationForPatient("patient-1", {
        verifiedTargetOrganizationId: "org-foreign",
      }),
    ).resolves.toEqual({ ok: false, reason: "organization_target_not_authorized" });
  });

  it("maps a treatment-program object to its organization before authorizing the context", async () => {
    const port: PatientOrganizationPort = {
      listActiveEnrollmentsByPlatformUser: vi.fn().mockResolvedValue([
        enrollment("org-a", "Клиника А"),
        enrollment("org-b", "Клиника Б"),
      ]),
      hasActiveEnrollment: vi.fn().mockResolvedValue(false),
      createManualOrganizationClient: vi.fn().mockResolvedValue({ ok: false, error: "create_failed" }),
      findTreatmentProgramOrganizationForPatient: vi.fn().mockResolvedValue("org-b"),
    };
    const result = await createPatientOrganizationService({ port })
      .resolveTreatmentProgramOrganizationForPatient("patient-1", "instance-b");
    expect(result).toMatchObject({ ok: true, organizationId: "org-b", selectedBy: "verified_target" });
    expect(port.findTreatmentProgramOrganizationForPatient).toHaveBeenCalledWith("patient-1", "instance-b");
  });
});
