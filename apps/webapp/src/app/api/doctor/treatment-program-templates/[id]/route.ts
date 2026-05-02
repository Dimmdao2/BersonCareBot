import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isTreatmentProgramTemplateAlreadyArchivedError,
  isTreatmentProgramTemplateArchiveNotFoundError,
  isTreatmentProgramTemplateUsageConfirmationRequiredError,
} from "@/modules/treatment-program/errors";

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  acknowledgeUsageWarning: z.boolean().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.getTemplate(id);
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
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
  const { acknowledgeUsageWarning, ...patch } = parsed.data;
  try {
    const row = await deps.treatmentProgram.updateTemplate(id, patch, { acknowledgeUsageWarning });
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    if (isTreatmentProgramTemplateUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isTreatmentProgramTemplateArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
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
    await deps.treatmentProgram.deleteTemplate(id, { acknowledgeUsageWarning });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isTreatmentProgramTemplateUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isTreatmentProgramTemplateAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: "already_archived" }, { status: 400 });
    }
    if (isTreatmentProgramTemplateArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "archive_failed" }, { status: 400 });
  }
}
