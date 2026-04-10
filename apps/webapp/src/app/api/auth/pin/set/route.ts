import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { hashPin } from "@/modules/auth/pinHash";
import { isPinSetRateLimited } from "@/modules/auth/pinSetRateLimit";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  pinConfirm: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите PIN и подтверждение" },
      { status: 400 }
    );
  }

  const { pin, pinConfirm } = parsed.data;
  if (pin !== pinConfirm) {
    return NextResponse.json(
      { ok: false, error: "pin_mismatch", message: "PIN не совпадает" },
      { status: 400 }
    );
  }
  const deps = buildAppDeps();
  if (isPinSetRateLimited(session.user.userId)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  const pinHash = await hashPin(pin);
  await deps.userPins.upsertPinHash(session.user.userId, pinHash);

  return NextResponse.json({ ok: true });
}
