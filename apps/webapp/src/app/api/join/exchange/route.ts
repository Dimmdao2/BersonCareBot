import { NextResponse } from "next/server";
import { z } from "zod";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { issuePatientInviteContinuationCookie } from "@/modules/patient-invites/continuationCookie";

const bodySchema = z.object({ bearer: z.string().min(32).max(256) }).strict();

function safeResponse(body: Record<string, unknown>, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/join/exchange:POST");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return safeResponse({ ok: false, error: "invalid_token" }, 400);

  // Shared exchange chokepoint. U3B registers the patient invite kind first; future invite kinds
  // extend this resolver instead of adding another public join tree.
  const result = await buildAppDeps().patientInvites.exchangeBearer(parsed.data.bearer);
  if (!result.ok) return safeResponse({ ok: false, error: result.code }, 400);

  await issuePatientInviteContinuationCookie(result.continuation);
  return safeResponse({
    ok: true,
    kind: result.kind,
    redirectTo: `/join/${result.continuation}`,
  });
}
