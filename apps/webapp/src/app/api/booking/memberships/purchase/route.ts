import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  subscriptionPackageId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  try {
    const pkg = await deps.memberships.purchaseCatalogPackageForPatient({
      organizationId,
      platformUserId: gate.session.user.userId,
      subscriptionPackageId: parsed.data.subscriptionPackageId,
    });
    return NextResponse.json({ ok: true, package: pkg });
  } catch (error) {
    const message = error instanceof Error ? error.message : "purchase_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
