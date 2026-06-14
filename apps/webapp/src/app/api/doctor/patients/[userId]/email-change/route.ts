/**
 * POST /api/doctor/patients/[userId]/email-change
 *   ADMIN ONLY (doctors get 403). Body: { email }.
 *   Sends a verification code to the new email via startEmailChallenge.
 *   Returns { ok: true, pending: { email, expiresAt } }.
 *
 * GET /api/doctor/patients/[userId]/email-change
 *   ADMIN ONLY (doctors get 403).
 *   Returns current pending email challenge for the patient, if any.
 *   Returns { ok: true, pending: { email, expiresAt } | null }.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import {
  startEmailChallenge,
  normalizeEmail,
  getPendingEmailChallenge,
} from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  email: z.string().trim().min(1).max(320).email({ message: "Некорректный email" }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  ensureAuthModulePortsBound();

  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  if (auth.session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "Только администратор может менять email пациента" },
      { status: 403 },
    );
  }

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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await startEmailChallenge(userId, parsed.data.email);
  if (!result.ok) {
    const status =
      result.code === "rate_limited" || result.code === "too_many_attempts"
        ? 429
        : result.code === "email_send_failed"
          ? 503
          : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const expiresAt = new Date((Math.floor(Date.now() / 1000) + 600) * 1000).toISOString();

  return NextResponse.json({ ok: true, pending: { email, expiresAt } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  ensureAuthModulePortsBound();

  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  if (auth.session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "Только администратор может просматривать ожидающий email" },
      { status: 403 },
    );
  }

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const pending = await getPendingEmailChallenge(userId);
  return NextResponse.json({ ok: true, pending });
}
