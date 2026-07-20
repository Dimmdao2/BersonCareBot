import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { patientClientBusinessGate } from "@/app-layer/platform-access";
import { routePaths } from "@/app-layer/routes/paths";
import { getCurrentSession } from "@/modules/auth/service";
import { PATIENT_ORGANIZATION_PREFERENCE_COOKIE } from "@/modules/patient-organization/preference";
import { canAccessPatient } from "@/modules/roles/service";
import { getRememberedPatientOrganizationId } from "@/app-layer/patient-organization/requestContext";

const querySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("treatment_program"),
    instanceId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("treatment_program_item"),
    instanceId: z.string().uuid(),
    itemId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("organization_go"),
    organizationId: z.string().uuid(),
    goKind: z.enum(["daily-warmup", "plan-start-lesson"]),
  }),
]);

function noStoreRedirect(path: string, requestUrl: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, requestUrl));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function addQuery(path: string, params: Record<string, string>): string {
  const url = new URL(path, "http://patient.local");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role) || (await patientClientBusinessGate(session)) !== "allow") {
    return noStoreRedirect(routePaths.root, request.url);
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return noStoreRedirect(routePaths.patientOrganizations, request.url);
  }

  const service = buildAppDeps().patientOrganization;
  if (!service) return noStoreRedirect(routePaths.patientOrganizations, request.url);
  const resolved =
    parsed.data.kind === "organization_go"
      ? await service.resolveActiveOrganizationForPatient(session.user.userId, {
          verifiedTargetOrganizationId: parsed.data.organizationId,
        })
      : await service.resolveTreatmentProgramOrganizationForPatient(session.user.userId, parsed.data.instanceId);
  if (!resolved.ok) {
    return noStoreRedirect(`${routePaths.patientOrganizations}?reason=organization_unavailable`, request.url);
  }

  const rememberedOrganizationId = await getRememberedPatientOrganizationId();
  const contextChanged = Boolean(rememberedOrganizationId && rememberedOrganizationId !== resolved.organizationId);
  let targetPath: string;
  if (parsed.data.kind === "organization_go") {
    const goPath =
      parsed.data.goKind === "daily-warmup" ? routePaths.patientGoDailyWarmup : routePaths.patientGoPlanStartLesson;
    targetPath = addQuery(goPath, {
      from: "reminder",
      organizationId: resolved.organizationId,
      ...(contextChanged ? { organizationChanged: "1" } : {}),
    });
  } else {
    targetPath =
      parsed.data.kind === "treatment_program_item" && parsed.data.itemId
        ? routePaths.patientTreatmentProgramItem(parsed.data.instanceId, parsed.data.itemId)
        : routePaths.patientTreatmentProgram(parsed.data.instanceId);
    if (contextChanged) targetPath = addQuery(targetPath, { organizationChanged: "1" });
  }
  const response = noStoreRedirect(targetPath, request.url);
  response.cookies.set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, resolved.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app/patient", "layout");
  return response;
}
