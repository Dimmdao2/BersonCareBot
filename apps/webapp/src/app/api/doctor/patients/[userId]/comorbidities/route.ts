/**
 * GET  /api/doctor/patients/[userId]/comorbidities?status=active|removed|all
 *   → { ok: true, comorbidities: Comorbidity[] }
 *
 * POST /api/doctor/patients/[userId]/comorbidities
 *   Body: { text: string, since?: string | null }
 *   → { ok: true, comorbidity: Comorbidity }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const statusSchema = z
  .enum(["active", "removed", "all"])
  .optional()
  .default("active");

const addSchema = z.object({
  text: z.string().trim().min(1, "comorbidity_text_required").max(500),
  since: z.string().trim().max(100).nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const statusParsed = statusSchema.safeParse(searchParams.get("status") ?? "active");
  if (!statusParsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const status = statusParsed.data;
  let comorbidities;
  if (status === "active") {
    comorbidities = await deps.patientComorbidities.listActive(userId);
  } else if (status === "removed") {
    comorbidities = await deps.patientComorbidities.listRemoved(userId);
  } else {
    // "all"
    const [active, removed] = await Promise.all([
      deps.patientComorbidities.listActive(userId),
      deps.patientComorbidities.listRemoved(userId),
    ]);
    comorbidities = [...active, ...removed].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  return NextResponse.json({ ok: true, comorbidities });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const deps = buildAppDeps();
  try {
    const comorbidity = await deps.patientComorbidities.add({
      patientUserId: userId,
      text: parsed.data.text,
      since: parsed.data.since ?? null,
      createdBy: auth.session.user.userId,
    });
    return NextResponse.json({ ok: true, comorbidity }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "comorbidity_text_required") {
      return NextResponse.json({ ok: false, error: "comorbidity_text_required" }, { status: 422 });
    }
    throw err;
  }
}
