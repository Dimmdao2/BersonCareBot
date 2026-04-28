import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const bodySchema = z.object({
  score: z.number().int().min(1).max(5),
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
  const tz = await getAppDisplayTimeZone();
  const mood = await deps.patientMood.upsertToday(gate.session.user.userId, tz, parsed.data.score);
  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, mood });
}
