/**
 * POST /api/patient/email-change/confirm
 *   Patient-only. Body: { code }.
 *   Confirms the latest pending email challenge for the session user.
 *   On success, switches the account email to the pending address.
 *   Returns { ok: true } or an error.
 *
 * This is the patient-facing step of the admin-initiated email change flow:
 *   1. Admin calls POST /api/doctor/patients/[userId]/email-change → code sent to new email.
 *   2. Patient receives code, submits here → email switches.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import { confirmLatestEmailChallengeCodeForUser } from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  code: z.string().trim().min(4).max(12),
});

export async function POST(request: Request) {
  ensureAuthModulePortsBound();

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "Требуется вход" }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "Некорректный код" },
      { status: 400 },
    );
  }

  const result = await confirmLatestEmailChallengeCodeForUser(session.user.userId, parsed.data.code);
  if (!result.ok) {
    const status =
      result.code === "too_many_attempts"
        ? 429
        : result.code === "email_conflict"
          ? 409
          : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errMsg(result.code),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  return NextResponse.json({ ok: true });
}

function errMsg(code: string): string {
  switch (code) {
    case "invalid_code":
      return "Неверный код";
    case "expired_code":
      return "Код истёк. Попросите администратора выслать новый.";
    case "too_many_attempts":
      return "Превышено число попыток.";
    case "email_conflict":
      return "Этот email уже используется другим аккаунтом";
    default:
      return "Ошибка подтверждения";
  }
}
