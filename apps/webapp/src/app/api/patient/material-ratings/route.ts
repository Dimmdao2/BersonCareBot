import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalPatientSession, requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { patientClientBusinessGate, resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { MaterialRatingAccessError } from "@/modules/material-rating/types";

const targetKindSchema = z.enum(["content_page", "lfk_exercise", "lfk_complex"]);

const getQuerySchema = z.object({
  kind: targetKindSchema,
  id: z.string().uuid(),
  programInstanceId: z.string().uuid().optional(),
  programStageItemId: z.string().uuid().optional(),
});

const putBodySchema = z.object({
  targetKind: targetKindSchema,
  targetId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  programInstanceId: z.string().uuid().optional(),
  programStageItemId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const session = await getOptionalPatientSession();
  let userId: string | null = null;
  if (session) {
    const gate = await patientClientBusinessGate(session);
    if (gate === "allow") userId = session.user.userId;
  }

  const canViewAuthOnlyContent = session ? await resolvePatientCanViewAuthOnlyContent(session) : false;

  const deps = buildAppDeps();

  try {
    const data = await deps.materialRating.getForPatient({
      userId,
      targetKind: parsed.data.kind,
      targetId: parsed.data.id,
      programInstanceId: parsed.data.programInstanceId,
      programStageItemId: parsed.data.programStageItemId,
      canViewAuthOnlyContent,
    });
    return NextResponse.json({
      ok: true,
      avg: data.aggregate.avg,
      count: data.aggregate.count,
      distribution: data.aggregate.distribution,
      myStars: data.myStars,
    });
  } catch (e) {
    if (e instanceof MaterialRatingAccessError) {
      // getForPatient для чтения материала использует только `not_found` (нет утечки «есть, но закрыто»).
      return NextResponse.json({ ok: false, error: e.accessCode }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

export async function PUT(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const { targetKind, targetId, stars, programInstanceId, programStageItemId } = parsed.data;
  if (targetKind !== "content_page" && (!programInstanceId || !programStageItemId)) {
    return NextResponse.json({ ok: false, error: "missing_program_context" }, { status: 400 });
  }

  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(gate.session);

  const deps = buildAppDeps();
  const result = await deps.materialRating.putForPatient({
    userId: gate.session.user.userId,
    stars,
    targetKind,
    targetId,
    programInstanceId: programInstanceId ?? null,
    programStageItemId: programStageItemId ?? null,
    canViewAuthOnlyContent,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "missing_program_context" ? 400 : 403;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    avg: result.aggregate.avg,
    count: result.aggregate.count,
    distribution: result.aggregate.distribution,
    myStars: result.myStars,
  });
}
