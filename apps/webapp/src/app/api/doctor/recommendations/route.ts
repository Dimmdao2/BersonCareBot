import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  parseRecommendationDomain,
} from "@/modules/recommendations/recommendationDomain";
import { isRecommendationInvalidDomainError } from "@/modules/recommendations/errors";

const mediaItemSchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(["image", "video", "gif"]),
  sortOrder: z.number().int().optional(),
});

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  bodyMd: z.string().max(100000),
  media: z.array(mediaItemSchema).optional(),
  tags: z.array(z.string()).optional().nullable(),
  domain: z.string().max(64).nullable().optional(),
  bodyRegionId: z.string().uuid().nullable().optional(),
  quantityText: z.string().max(2000).nullable().optional(),
  frequencyText: z.string().max(2000).nullable().optional(),
  durationText: z.string().max(2000).nullable().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  includeArchived: z.coerce.boolean().optional(),
  /** Проверка UUID вручную после Zod — чтобы при невалидном значении вернуть `field: "region"` (паритет с `domain`). */
  region: z.string().optional(),
  domain: z.string().max(64).optional(),
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

  const rawRegion = parsed.data.region?.trim() ?? "";
  if (rawRegion && !z.string().uuid().safeParse(rawRegion).success) {
    return NextResponse.json({ ok: false, error: "invalid_query", field: "region" }, { status: 400 });
  }
  const regionRefId = rawRegion || null;

  const deps = buildAppDeps();
  const domainRefItems = await deps.references.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
  const rawDomain = parsed.data.domain?.trim() ?? "";
  const domainParsed = rawDomain ? parseRecommendationDomain(rawDomain, domainRefItems) : undefined;
  if (rawDomain && domainParsed === undefined) {
    return NextResponse.json({ ok: false, error: "invalid_query", field: "domain" }, { status: 400 });
  }
  const domain = domainParsed ?? null;

  const items = await deps.recommendations.listRecommendations({
    search: parsed.data.q?.trim() || null,
    includeArchived: parsed.data.includeArchived ?? false,
    regionRefId,
    domain,
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

  const rawDomain = parsed.data.domain;
  const domain =
    rawDomain === undefined || rawDomain === null || rawDomain === ""
      ? null
      : String(rawDomain).trim();

  const deps = buildAppDeps();
  try {
    const row = await deps.recommendations.createRecommendation(
      {
        title: parsed.data.title,
        bodyMd: parsed.data.bodyMd,
        media: parsed.data.media?.map((m, i) => ({
          ...m,
          sortOrder: m.sortOrder ?? i,
        })),
        tags: parsed.data.tags ?? null,
        domain,
        bodyRegionId: parsed.data.bodyRegionId ?? null,
        quantityText: parsed.data.quantityText ?? null,
        frequencyText: parsed.data.frequencyText ?? null,
        durationText: parsed.data.durationText ?? null,
      },
      session.user.userId,
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    if (isRecommendationInvalidDomainError(e)) {
      return NextResponse.json({ ok: false, error: e.message, field: "domain" }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
