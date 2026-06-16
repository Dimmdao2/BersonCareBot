import nodemailer from "nodemailer";
import { logger } from "@/infra/logging/logger";
import { smtpOutboundInnerSchema } from "@/modules/system-settings/smtpOutboundPatch";

export function smtpInnerFromValueJson(valueJson: unknown): ReturnType<typeof smtpOutboundInnerSchema.safeParse> {
  const inner =
    typeof valueJson === "object" && valueJson !== null && "value" in valueJson ?
      (valueJson as { value: unknown }).value
    : valueJson;
  return smtpOutboundInnerSchema.safeParse(inner);
}

export async function sendTransactionalSmtpEmail(params: {
  smtpValueJson: unknown;
  to: string;
  subject: string;
  text: string;
  /** RFC 2369 — одна строка, например `<mailto:support@example.com?subject=unsubscribe>` */
  listUnsubscribe?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // DEV SAFETY GUARD — this webapp SMTP sink (S5) is reached via bypass paths (P3/P14/P16/P19) that do
  // NOT go through the integrator dispatchPort dev-redirect. In dev the DB is a prod refresh with real
  // patient/doctor email addresses → sending would leak to real people. Suppress entirely unless
  // explicitly opted in. Prod is a pure passthrough (NODE_ENV === 'production').
  // (Proper fix later: consolidate both SMTP transports into one dispatchPort adapter; guard retired then.)
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_EMAIL !== "1") {
    logger.warn(
      {
        scope: "email",
        event: "dev_email_suppressed",
        to: params.to,
        subject: params.subject,
      },
      "[email] DEV suppress: not sending transactional SMTP in non-production (set ALLOW_DEV_EMAIL=1 to override)",
    );
    return { ok: false, error: "dev_suppressed" };
  }

  const parsed = smtpInnerFromValueJson(params.smtpValueJson);
  if (!parsed.success) {
    return { ok: false, error: "smtp_not_configured" };
  }
  const c = parsed.data;
  if (!c.password?.trim()) {
    return { ok: false, error: "smtp_password_missing" };
  }

  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.password },
  });

  const headers =
    typeof params.listUnsubscribe === "string" && params.listUnsubscribe.trim().length > 0 ?
      { "List-Unsubscribe": params.listUnsubscribe.trim() }
    : undefined;

  try {
    await transporter.sendMail({
      from: c.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(headers ? { headers } : {}),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
