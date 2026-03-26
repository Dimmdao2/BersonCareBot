import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { verifyPinForLogin } from "@/modules/auth/pinAuth";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidRuMobileNormalized } from "@/modules/auth/phoneValidation";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const GENERIC_PIN_FAIL = "Неверный номер или PIN";

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
  pin: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Номер и PIN обязательны (ровно 4 цифры)" },
      { status: 400 }
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidRuMobileNormalized(phone)) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone", message: "Неверный формат номера" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(phone);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "invalid_credentials", message: GENERIC_PIN_FAIL },
      { status: 401 }
    );
  }

  const v = await verifyPinForLogin(user.userId, parsed.data.pin, deps.userPins);
  if (!v.ok) {
    if (v.code === "no_pin") {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials", message: GENERIC_PIN_FAIL },
        { status: 401 }
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
        error: "invalid_credentials",
        message: GENERIC_PIN_FAIL,
        attemptsLeft: v.attemptsLeft,
      },
      { status: 401 }
    );
  }

  let sessionUser = user;
  const envRole = resolveRoleFromEnv({
    phone: user.phone,
    telegramId: user.bindings?.telegramId,
    maxId: user.bindings?.maxId,
  });
  if (user.role !== envRole) {
    await deps.userProjection.updateRole(user.userId, envRole);
    sessionUser = { ...user, role: envRole };
  }

  await setSessionFromUser(sessionUser);
  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
  });
}
