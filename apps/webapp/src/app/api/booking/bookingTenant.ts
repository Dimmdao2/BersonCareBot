import { NextResponse } from "next/server";

type PatientOrganizationServiceLike = {
  resolveActiveOrganizationForPatient(
    platformUserId: string,
  ): Promise<
    | { ok: true; organizationId: string }
    | { ok: false; reason: "no_active_enrollment" }
    | { ok: false; reason: "organization_selection_required"; organizationIds: string[] }
  >;
};

export async function resolvePatientEnrollmentOrganizationId(
  deps: { patientOrganization: PatientOrganizationServiceLike | null },
  platformUserId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; response: NextResponse }> {
  if (!deps.patientOrganization) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "patient_organization_unavailable" }, { status: 503 }),
    };
  }
  const resolved = await deps.patientOrganization.resolveActiveOrganizationForPatient(platformUserId);
  if (resolved.ok) return { ok: true, organizationId: resolved.organizationId };
  const status = resolved.reason === "organization_selection_required" ? 409 : 403;
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error: resolved.reason }, { status }),
  };
}

