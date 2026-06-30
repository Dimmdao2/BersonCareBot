/**
 * PATCH  /api/doctor/patients/[userId]/comorbidities/[comorbidityId]
 *   Body (at least one required):
 *     { text?: string, since?: string | null }          — редактировать текст/since
 *     { action: "restore" }                              — восстановить снятое
 *   → { ok: true } | { ok: false, error: "not_found" }
 *
 * DELETE /api/doctor/patients/[userId]/comorbidities/[comorbidityId]
 *   Soft-delete: помечает как «removed» (снято).
 *   → { ok: true } | { ok: false, error: "not_found" }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const patchSchema = z
  .union([
    z.object({
      action: z.literal("restore"),
    }),
    z.object({
      text: z.string().trim().min(1, "comorbidity_text_required").max(500).optional(),
      since: z.string().trim().max(100).nullable().optional(),
    }),
  ])
  .refine(
    (v) => {
      if ("action" in v) return true;
      return v.text !== undefined || v.since !== undefined;
    },
    { message: "nothing_to_update" },
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; comorbidityId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId, comorbidityId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(comorbidityId).success) {
    return NextResponse.json({ ok: false, error: "invalid_comorbidity_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const deps = buildAppDeps();

  if ("action" in parsed.data && parsed.data.action === "restore") {
    const ok = await deps.patientComorbidities.restore(userId, comorbidityId);
    if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // editText branch
  const editData = parsed.data as { text?: string; since?: string | null };
  try {
    const ok = await deps.patientComorbidities.editText({
      patientUserId: userId,
      comorbidityId,
      ...(editData.text !== undefined ? { text: editData.text } : {}),
      ...(editData.since !== undefined ? { since: editData.since } : {}),
    });
    if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (err) {
    if (err instanceof Error && err.message === "comorbidity_text_required") {
      return NextResponse.json({ ok: false, error: "comorbidity_text_required" }, { status: 422 });
    }
    if (err instanceof Error && err.message === "nothing_to_update") {
      return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 422 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string; comorbidityId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId, comorbidityId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(comorbidityId).success) {
    return NextResponse.json({ ok: false, error: "invalid_comorbidity_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const ok = await deps.patientComorbidities.markRemoved(userId, comorbidityId);
  if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
