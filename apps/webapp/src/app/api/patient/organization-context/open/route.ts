import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import {
  PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE,
  PATIENT_ORGANIZATION_PREFERENCE_COOKIE,
} from "@/modules/patient-organization/preference";
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

function noStoreRedirect(path: string): NextResponse {
  // Keep Location relative: request.url may contain an internal upstream host,
  // while the session cookie belongs to the browser's current origin.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: path },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function addQuery(path: string, params: Record<string, string>): string {
  const url = new URL(path, "http://patient.local");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return noStoreRedirect(routePaths.root);
  const session = gate.session;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return noStoreRedirect(routePaths.patientOrganizations);
  }

  const service = buildAppDeps().patientOrganization;
  if (!service) return noStoreRedirect(routePaths.patientOrganizations);
  const resolved =
    parsed.data.kind === "organization_go"
      ? await service.resolveActiveOrganizationForPatient(session.user.userId, {
          verifiedTargetOrganizationId: parsed.data.organizationId,
        })
      : await service.resolveTreatmentProgramOrganizationForPatient(session.user.userId, parsed.data.instanceId);
  if (!resolved.ok) {
    return noStoreRedirect(`${routePaths.patientOrganizations}?reason=organization_unavailable`);
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
    });
  } else {
    targetPath =
      parsed.data.kind === "treatment_program_item" && parsed.data.itemId
        ? routePaths.patientTreatmentProgramItem(parsed.data.instanceId, parsed.data.itemId)
        : routePaths.patientTreatmentProgram(parsed.data.instanceId);
  }
  const response = noStoreRedirect(targetPath);
  response.cookies.set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, resolved.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  if (contextChanged) {
    response.cookies.set(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE, resolved.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 5 * 60,
    });
  } else {
    response.cookies.delete(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE);
  }
  revalidatePath("/app/patient", "layout");
  return response;
}
