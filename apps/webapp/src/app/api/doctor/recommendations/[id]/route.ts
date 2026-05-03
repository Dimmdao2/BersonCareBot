import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isRecommendationArchiveAlreadyArchivedError,
  isRecommendationArchiveNotFoundError,
  isRecommendationInvalidDomainError,
  isRecommendationUsageConfirmationRequiredError,
} from "@/modules/recommendations/errors";

const mediaItemSchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(["image", "video", "gif"]),
  sortOrder: z.number().int().optional(),
});

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  bodyMd: z.string().max(100000).optional(),
  media: z.array(mediaItemSchema).nullable().optional(),
  tags: z.array(z.string()).optional().nullable(),
  domain: z.string().max(64).nullable().optional(),
  bodyRegionId: z.string().uuid().nullable().optional(),
  quantityText: z.string().max(2000).nullable().optional(),
  frequencyText: z.string().max(2000).nullable().optional(),
  durationText: z.string().max(2000).nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  const item = await deps.recommendations.getRecommendation(id);
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const rawDomain = parsed.data.domain;
    let domainPatch: string | null | undefined;
    if (rawDomain === undefined) {
      domainPatch = undefined;
    } else if (rawDomain === null || rawDomain === "") {
      domainPatch = null;
    } else {
      domainPatch = String(rawDomain).trim();
    }

    const item = await deps.recommendations.updateRecommendation(id, {
      ...parsed.data,
      domain: domainPatch,
      bodyRegionId: parsed.data.bodyRegionId,
      quantityText: parsed.data.quantityText,
      frequencyText: parsed.data.frequencyText,
      durationText: parsed.data.durationText,
      media:
        parsed.data.media === undefined
          ? undefined
          : parsed.data.media?.map((m, i) => ({
              ...m,
              sortOrder: m.sortOrder ?? i,
            })),
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (isRecommendationInvalidDomainError(e)) {
      return NextResponse.json({ ok: false, error: e.message, field: "domain" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "not_found_or_invalid" }, { status: 400 });
  }
}

/** Архивация (DELETE): при необходимости подтверждения usage — 409; повтор с `?acknowledgeUsageWarning=1`. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const ack = url.searchParams.get("acknowledgeUsageWarning");
  const acknowledgeUsageWarning = ack === "1" || ack === "true" || ack === "on";

  const deps = buildAppDeps();
  try {
    await deps.recommendations.archiveRecommendation(id, { acknowledgeUsageWarning });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isRecommendationUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isRecommendationArchiveAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: "already_archived" }, { status: 400 });
    }
    if (isRecommendationArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "archive_failed" }, { status: 400 });
  }
}
