/**
 * POST /api/doctor/clients/:userId/symptom-trackings — создать отслеживание симптома для пациента (staff).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const postBodySchema = z.object({
  symptomTitle: z.string().min(1).max(200),
  symptomTypeRefId: z.string().uuid().nullable().optional(),
  regionRefId: z.string().uuid().nullable().optional(),
  side: z.enum(["left", "right", "both"]).nullable().optional(),
  diagnosisText: z.string().max(500).nullable().optional(),
  diagnosisRefId: z.string().uuid().nullable().optional(),
  stageRefId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const tracking = await deps.diaries.createSymptomTracking({
      userId,
      symptomTitle: parsed.data.symptomTitle.trim(),
      symptomTypeRefId: parsed.data.symptomTypeRefId ?? null,
      regionRefId: parsed.data.regionRefId ?? null,
      side: parsed.data.side ?? null,
      diagnosisText: parsed.data.diagnosisText?.trim() ? parsed.data.diagnosisText.trim() : null,
      diagnosisRefId: parsed.data.diagnosisRefId ?? null,
      stageRefId: parsed.data.stageRefId ?? null,
    });
    return NextResponse.json({
      ok: true,
      tracking: {
        id: tracking.id,
        symptomTitle: tracking.symptomTitle,
        symptomKey: tracking.symptomKey,
      },
    });
  } catch (e) {
    console.error("doctor symptom-tracking create", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
