import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isValidPinFormat, verifyPinForLogin } from "@/modules/auth/pinAuth";
import { getCurrentSession, setDiaryPurgePinReauth } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * Подтверждение PIN при активной сессии (для опасных действий, напр. удаление дневников).
 */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "Требуется вход" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden", message: "Доступ запрещён" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите PIN (4 цифры)" },
      { status: 400 }
    );
  }

  const pin = parsed.data.pin;
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ ok: false, error: "invalid_pin", message: "Неверный формат PIN" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const v = await verifyPinForLogin(session.user.userId, pin, deps.userPins);
  if (!v.ok) {
    if (v.code === "no_pin") {
      return NextResponse.json(
        { ok: false, error: "no_pin", message: "Сначала задайте PIN в профиле" },
        { status: 400 }
      );
    }
    if (v.code === "locked") {
      return NextResponse.json(
        {
          ok: false,
          error: "lockout",
          message: "Слишком много попыток. Попробуйте позже.",
          lockedUntil: v.lockedUntilIso,
        },
        { status: 423 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_pin",
        message: "Неверный PIN",
        attemptsLeft: v.attemptsLeft,
      },
      { status: 401 }
    );
  }

  await setDiaryPurgePinReauth();
  return NextResponse.json({ ok: true });
}
