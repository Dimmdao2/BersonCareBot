import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { patientClientBusinessGate } from "@/app-layer/platform-access";
import { resolvePatientOrganizationRequestContext } from "@/app-layer/patient-organization/requestContext";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";
import {
  PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE,
  PATIENT_ORGANIZATION_PREFERENCE_COOKIE,
} from "@/modules/patient-organization/preference";
import { jsonError, jsonOk } from "@/shared/http/apiResponse";

const switchSchema = z.object({ organizationId: z.string().uuid() }).strict();

async function requirePatientContextAccount() {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return { ok: false as const, response: jsonError("unauthorized", {}, { status: 401 }) };
  }
  const gate = await patientClientBusinessGate(session);
  if (gate !== "allow") {
    return {
      ok: false as const,
      response: jsonError("patient_activation_required", {}, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  const gate = await requirePatientContextAccount();
  if (!gate.ok) return noStore(gate.response);
  const resolved = await resolvePatientOrganizationRequestContext(
    buildAppDeps().patientOrganization,
    gate.session.user.userId,
  );
  const cookieStore = await cookies();
  const rawReceipt = cookieStore.get(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE)?.value;
  const receipt = switchSchema.shape.organizationId.safeParse(rawReceipt);
  const contextChanged = Boolean(
    resolved.ok && receipt.success && receipt.data === resolved.organizationId,
  );
  if (rawReceipt) cookieStore.delete(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE);
  return noStore(jsonOk({ context: resolved, contextChanged }));
}

export async function POST(request: Request) {
  const gate = await requirePatientContextAccount();
  if (!gate.ok) return noStore(gate.response);
  const cookieStore = await cookies();
  cookieStore.delete(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE);
  const parsed = switchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(jsonError("invalid_body", {}, { status: 400 }));
  }

  const resolved = await resolvePatientOrganizationRequestContext(
    buildAppDeps().patientOrganization,
    gate.session.user.userId,
    { rememberedOrganizationId: null, verifiedTargetOrganizationId: parsed.data.organizationId },
  );
  if (!resolved.ok) {
    return noStore(jsonError("organization_not_available", {}, { status: 403 }));
  }

  cookieStore.set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, resolved.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app/patient", "layout");
  return noStore(jsonOk({ organization: resolved.organization }));
}

export async function DELETE() {
  const gate = await requirePatientContextAccount();
  if (!gate.ok) return noStore(gate.response);
  const cookieStore = await cookies();
  cookieStore.delete(PATIENT_ORGANIZATION_PREFERENCE_COOKIE);
  cookieStore.delete(PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE);
  revalidatePath("/app/patient", "layout");
  return noStore(jsonOk({}));
}
