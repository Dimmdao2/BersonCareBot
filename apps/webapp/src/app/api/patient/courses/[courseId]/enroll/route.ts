import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
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
  try {
    const instance = await deps.courses.enrollPatient({
      courseId: parsed.data.courseId,
      patientUserId: gate.session.user.userId,
    });
    return NextResponse.json({ ok: true, instance });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
