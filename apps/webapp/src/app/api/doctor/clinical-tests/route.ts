import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isClinicalAssessmentKind } from "@/modules/tests/clinicalTestAssessmentKind";

const mediaItemSchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(["image", "video", "gif"]),
  sortOrder: z.number().int().optional(),
});

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).nullable().optional(),
  testType: z.string().max(200).nullable().optional(),
  scoringConfig: z.unknown().optional(),
  media: z.array(mediaItemSchema).optional(),
  tags: z.array(z.string()).optional().nullable(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  testType: z.string().optional(),
  includeArchived: z.coerce.boolean().optional(),
  /** UUID `reference_items.id` (категория регионов тела), как на странице каталога `?region=`. */
  region: z.string().optional(),
  /** Код вида оценки (enum v1), как `?assessment=` на странице каталога. */
  assessment: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const regionTrim = parsed.data.region?.trim() ?? "";
  if (regionTrim && !z.string().uuid().safeParse(regionTrim).success) {
    return NextResponse.json({ ok: false, error: "invalid_query", field: "region" }, { status: 400 });
  }
  const assessmentTrim = parsed.data.assessment?.trim() ?? "";
  if (assessmentTrim && !isClinicalAssessmentKind(assessmentTrim)) {
    return NextResponse.json({ ok: false, error: "invalid_query", field: "assessment" }, { status: 400 });
  }

  const items = await deps.clinicalTests.listClinicalTests({
    search: parsed.data.q?.trim() || null,
    testType: parsed.data.testType?.trim() || null,
    includeArchived: parsed.data.includeArchived ?? false,
    regionRefId: regionTrim || null,
    assessmentKind: assessmentTrim || null,
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const row = await deps.clinicalTests.createClinicalTest(
      {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        testType: parsed.data.testType ?? null,
        scoringConfig: parsed.data.scoringConfig ?? null,
        media: parsed.data.media?.map((m, i) => ({
          ...m,
          sortOrder: m.sortOrder ?? i,
        })),
        tags: parsed.data.tags ?? null,
      },
      session.user.userId,
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
