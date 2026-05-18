import nodemailer from "nodemailer";
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
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

  try {
    await transporter.sendMail({
      from: c.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
