import { type NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { requestMessengerContactViaIntegrator } from "@/modules/messaging/requestMessengerContact";
import { patientClientBusinessGate } from "@/modules/platform-access";
import { canAccessPatient } from "@/modules/roles/service";
import { env } from "@/config/env";

const RATE_LIMIT_MS = 60_000;
const lastRequestContactByUserId = new Map<string, number>();

function resolveMessengerContactTarget(input: {
  headerHint: string | null;
  telegramId: string;
  maxId: string;
}): { channel: "telegram" | "max"; recipientId: string } | null {
  const tg = input.telegramId.trim();
  const mx = input.maxId.trim();
  const hint = input.headerHint?.trim().toLowerCase();
  if (tg && mx) {
    if (hint === "max" && mx) return { channel: "max", recipientId: mx };
    if (hint === "telegram" && tg) return { channel: "telegram", recipientId: tg };
    return null;
  }
  if (hint === "max" && mx) return { channel: "max", recipientId: mx };
  if (hint === "telegram" && tg) return { channel: "telegram", recipientId: tg };
  if (tg) return { channel: "telegram", recipientId: tg };
  if (mx) return { channel: "max", recipientId: mx };
  return null;
}

/**
 * Mini App: отправить в чат пользователя запрос контакта (Telegram reply / MAX inline request_contact).
 * Только при tier onboarding и привязке к мессенджеру.
 */
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (env.DATABASE_URL?.trim()) {
    const gate = await patientClientBusinessGate(session);
    if (gate === "stale_session") {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (gate !== "need_activation") {
      return NextResponse.json({ ok: false, error: "not_required" }, { status: 400 });
    }
  } else {
    if (session.user.phone?.trim()) {
      return NextResponse.json({ ok: false, error: "not_required" }, { status: 400 });
    }
  }

  const tg = session.user.bindings.telegramId?.trim() ?? "";
  const mx = session.user.bindings.maxId?.trim() ?? "";
  const hint = request.headers.get("x-bersoncare-contact-channel");
  const target = resolveMessengerContactTarget({ headerHint: hint, telegramId: tg, maxId: mx });
  if (!target) {
    const err = tg && mx ? "contact_channel_required" : "no_messenger_binding";
    return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const uid = session.user.userId?.trim();
  if (uid) {
    const now = Date.now();
    const prev = lastRequestContactByUserId.get(uid);
    if (prev !== undefined && now - prev < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  }

  const result = await requestMessengerContactViaIntegrator({
    channel: target.channel,
    recipientId: target.recipientId,
  });
  if (!result.ok) {
    const status = result.reason === "no_integrator_url" || result.reason === "no_webhook_secret" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  /** Rate limit only after integrator success. `duplicate` counts as success — chat already got (or deduped) the prompt. */
  if (uid) {
    lastRequestContactByUserId.set(uid, Date.now());
  }

  return NextResponse.json({ ok: true, status: result.status });
}
