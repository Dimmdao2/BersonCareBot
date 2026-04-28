import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  contentPageId: z.string().uuid(),
  source: z.enum(["home", "reminder", "section_page", "daily_warmup"]),
  feeling: z.number().int().min(1).max(5).optional().nullable(),
});

export async function POST(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.patientPractice.record({
    userId: gate.session.user.userId,
    contentPageId: parsed.data.contentPageId,
    source: parsed.data.source,
    feeling: parsed.data.feeling ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, id: result.id });
}
