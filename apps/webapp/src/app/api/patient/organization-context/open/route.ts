import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { patientClientBusinessGate } from "@/app-layer/platform-access";
import { routePaths } from "@/app-layer/routes/paths";
import { getCurrentSession } from "@/modules/auth/service";
import { PATIENT_ORGANIZATION_PREFERENCE_COOKIE } from "@/modules/patient-organization/preference";
import { canAccessPatient } from "@/modules/roles/service";

const querySchema = z.object({
  kind: z.enum(["treatment_program", "treatment_program_item"]),
  instanceId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role) || (await patientClientBusinessGate(session)) !== "allow") {
    return NextResponse.redirect(new URL(routePaths.root, request.url));
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || (parsed.data.kind === "treatment_program_item" && !parsed.data.itemId)) {
    return NextResponse.redirect(new URL(routePaths.patient, request.url));
  }

  const service = buildAppDeps().patientOrganization;
  if (!service) return NextResponse.redirect(new URL(routePaths.patient, request.url));
  const resolved = await service.resolveTreatmentProgramOrganizationForPatient(
    session.user.userId,
    parsed.data.instanceId,
  );
  if (!resolved.ok) {
    return NextResponse.redirect(new URL(routePaths.patient, request.url));
  }

  const targetPath = parsed.data.kind === "treatment_program_item" && parsed.data.itemId
    ? routePaths.patientTreatmentProgramItem(parsed.data.instanceId, parsed.data.itemId)
    : routePaths.patientTreatmentProgram(parsed.data.instanceId);
  const response = NextResponse.redirect(new URL(targetPath, request.url));
  response.cookies.set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, resolved.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  response.headers.set("Cache-Control", "private, no-store");
  revalidatePath("/app/patient", "layout");
  return response;
}
