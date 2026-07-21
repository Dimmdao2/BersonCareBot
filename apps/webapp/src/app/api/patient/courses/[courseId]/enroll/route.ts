import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePatientEnrollmentOrganizationId } from "@/app/api/booking/bookingTenant";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { requireEntitlement } from "@/app-layer/guards/requireEntitlement";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const paramsSchema = z.object({
  courseId: z.string().uuid(),
});

export async function POST(
  _request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientCourses });
  if (!gate.ok) return gate.response;

  const rawParams = await context.params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_course" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const patientOrganization = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!patientOrganization.ok) return patientOrganization.response;
  const entitlement = await requireEntitlement(
    { organizationId: patientOrganization.organizationId },
    "courses",
    { kind: "mutation" },
  );
  if (!entitlement.ok) return entitlement.response;
  try {
    const instance = await withPatientOrganizationPrincipal(
      {
        organizationId: patientOrganization.organizationId,
        platformUserId: gate.session.user.userId,
        source: "patient.courses.enroll",
      },
      () =>
        deps.courses.enrollPatient({
          courseId: parsed.data.courseId,
          patientUserId: gate.session.user.userId,
        }),
    );
    return NextResponse.json({ ok: true, instance });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
