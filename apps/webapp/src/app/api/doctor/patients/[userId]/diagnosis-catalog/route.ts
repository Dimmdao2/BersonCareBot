/**
 * GET  /api/doctor/patients/[userId]/diagnosis-catalog?q=  → { ok, suggestions }
 * POST /api/doctor/patients/[userId]/diagnosis-catalog      → create entry
 *
 * Собственный (общеклиничный) справочник диагнозов: autocomplete + создание новых.
 * Привязки к userId справочник не имеет — userId в пути для единообразия маршрутов.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const createBodySchema = z.object({
  label: z.string().min(1).max(500),
  note: z.string().max(2000).optional(),
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

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  const deps = buildAppDeps();
  const suggestions = await deps.patientClinical.searchDiagnosisCatalog(q);

  return NextResponse.json({ ok: true, suggestions });
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const entry = await deps.patientClinical.createDiagnosisCatalogEntry({
    label: parsed.data.label,
    note: parsed.data.note ?? null,
    createdBy: auth.session.user.userId,
  });

  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
