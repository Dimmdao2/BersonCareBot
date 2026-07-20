import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { setSessionFromUser } from "@/modules/auth/service";
import {
  clearPatientInviteContinuationCookie,
  readPatientInviteContinuationCookie,
} from "@/modules/patient-invites/continuationCookie";
import { PATIENT_ORGANIZATION_PREFERENCE_COOKIE } from "@/modules/patient-organization/preference";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

const bodySchema = z.object({ code: z.string().trim().min(1).max(12) }).strict();

function response(body: Record<string, unknown>, status = 200, retryAfter?: number): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  if (retryAfter != null) result.headers.set("Retry-After", String(retryAfter));
  return result;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/join/email/confirm:POST");
  const continuation = await readPatientInviteContinuationCookie();
  if (!continuation) return response({ ok: false, error: "invalid_continuation" }, 400);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ ok: false, error: "invalid_code" }, 400);

  const deps = buildAppDeps();
  const result = await deps.patientInvites.redeemEmailProof(continuation, parsed.data.code);
  if (!result.ok) {
    const retryAfter = "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined;
    const status = result.code === "too_many_attempts" ? 429 : result.code === "conflicting_identity" ? 409 : 400;
    return response({ ok: false, error: result.code, retryAfterSeconds: retryAfter }, status, retryAfter);
  }

  if (!isPlatformUserUuid(result.platformUserId)) {
    return response({ ok: false, error: "server_error" }, 500);
  }
  enterStaffSecuritySelfPrincipal(result.platformUserId, "api/join/email/confirm:otp-verified-patient");
  const user = await deps.userByPhone.findByUserId(result.platformUserId);
  if (!user || user.role !== "client") {
    return response({ ok: false, error: "server_error" }, 500);
  }
  await setSessionFromUser(user);
  (await cookies()).set(PATIENT_ORGANIZATION_PREFERENCE_COOKIE, result.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await clearPatientInviteContinuationCookie();
  return response({ ok: true, redirectTo: routePaths.patient });
}
