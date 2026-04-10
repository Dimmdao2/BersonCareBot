import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { verifyPinForLogin } from "@/modules/auth/pinAuth";
import { setDiaryPurgePinReauth } from "@/modules/auth/service";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * Подтверждение PIN при активной сессии (для опасных действий, напр. удаление дневников).
 */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.diary });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите PIN (4 цифры)" },
      { status: 400 }
    );
  }

  const pin = parsed.data.pin;

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
