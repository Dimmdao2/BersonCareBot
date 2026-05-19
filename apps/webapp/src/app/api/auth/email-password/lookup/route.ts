import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import type { EmailPasswordAuthState } from "@/modules/auth/emailPasswordLookup/types";

const bodySchema = z.object({
  email: z.string().email(),
});

export type EmailPasswordLookupPublicState = EmailPasswordAuthState["kind"];

function toPublicState(state: EmailPasswordAuthState): EmailPasswordLookupPublicState {
  return state.kind;
}

/** Состояние email для ветвления UI входа/регистрации без перебора паролей. */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);

  return NextResponse.json({ ok: true, state: toPublicState(state) });
}
