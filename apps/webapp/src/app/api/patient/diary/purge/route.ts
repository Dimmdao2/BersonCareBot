import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { logger } from "@/infra/logging/logger";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { clearDiaryPurgeReauth, isDiaryPurgePinReauthValid } from "@/modules/auth/service";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";

const bodySchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(1),
});

/**
 * Финальное удаление всех дневниковых данных после PIN + OTP.
 */
export async function POST(request: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.diary });
  if (!gate.ok) return gate.response;
  const session = gate.session;
  if (!isDiaryPurgePinReauthValid(session)) {
    return NextResponse.json(
      { ok: false, error: "pin_reauth_required", message: "Сначала подтвердите PIN" },
      { status: 403 }
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите challengeId и код" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const result = await deps.auth.confirmPhoneAuth(parsed.data.challengeId, parsed.data.code);

  if (!result.ok) {
    const status = result.code === "too_many_attempts" ? 429 : 400;
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
      }
    );
  }

  if (result.user.userId !== session.user.userId) {
    return NextResponse.json({ ok: false, error: "identity_mismatch", message: "Неверный код" }, { status: 403 });
  }

  const sessionPhone = session.user.phone?.trim();
  const confirmedPhone = result.user.phone?.trim();
  if (sessionPhone && confirmedPhone && normalizePhone(sessionPhone) !== normalizePhone(confirmedPhone)) {
    return NextResponse.json({ ok: false, error: "phone_mismatch", message: "Неверный код" }, { status: 403 });
  }

  try {
    await deps.diaries.purgeAllDiaryDataForUser(session.user.userId);
  } catch (e) {
    logger.error({ err: e }, "[patient/diary/purge] purgeAllDiaryDataForUser failed");
    return NextResponse.json({ ok: false, error: "purge_failed", message: "Не удалось удалить данные" }, { status: 500 });
  }

  await clearDiaryPurgeReauth();
  revalidatePath(routePaths.diary);
  revalidatePath(routePaths.profile);

  return NextResponse.json({ ok: true });
}
