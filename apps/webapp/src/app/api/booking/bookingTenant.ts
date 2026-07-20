import { NextResponse } from "next/server";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

type PatientOrganizationServiceLike = {
  resolveActiveOrganizationForPatient(
    platformUserId: string,
    options?: { rememberedOrganizationId?: string | null },
  ): Promise<
    | { ok: true; organizationId: string }
    | { ok: false; reason: string; organizationIds?: string[] }
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
  const rememberedOrganizationId = getCurrentDbPrincipalOrganizationId() ?? null;
  const resolved = await deps.patientOrganization.resolveActiveOrganizationForPatient(platformUserId, {
    rememberedOrganizationId,
  });
  if (resolved.ok) return { ok: true, organizationId: resolved.organizationId };
  const status = resolved.reason === "organization_selection_required" ? 409 : 403;
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error: resolved.reason }, { status }),
  };
}
