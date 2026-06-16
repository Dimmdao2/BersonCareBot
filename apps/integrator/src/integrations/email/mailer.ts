/**
 * Mailer: отправка email через SMTP (nodemailer).
 * Конфиг передаётся вызывающим кодом после загрузки исходящего SMTP из БД или env (см. config/smtpOutbound).
 *
 * SAFETY: sendMail() calls applyEmailRedirect() before opening any SMTP
 * connection. In non-production environments email sends are NO-OP + warn so
 * that no real patient/client address is ever reached by accident.
 * See shared/devDeliveryRedirect.ts.
 */
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { applyEmailRedirect } from '../../shared/devDeliveryRedirect.js';

export type SendMailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

export type SendMailResult = {
  accepted: string[];
  rejected: string[];
  messageId?: string;
};

let transportCache: { sig: string; transport: Transporter } | null = null;

function transportSignature(cfg: ResolvedSmtpOutboundConfig): string {
  return createHash('sha256')
    .update(
      `${cfg.smtpHost}\0${cfg.smtpPort}\0${cfg.smtpSecure}\0${cfg.smtpUser}\0${cfg.smtpPass}\0${cfg.fromAddress}`,
    )
    .digest('hex');
}

function getOrCreateTransport(cfg: ResolvedSmtpOutboundConfig): Transporter | null {
  if (!cfg.configured) return null;
  const sig = transportSignature(cfg);
  if (transportCache?.sig !== sig) {
    transportCache = {
      sig,
      transport: nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpSecure,
        auth: {
          user: cfg.smtpUser,
          pass: cfg.smtpPass,
        },
      }),
    };
  }
  return transportCache.transport;
}

/**
 * Если SMTP не сконфигурирован, ничего не отправляет (accepted=[]).
 *
 * SAFETY chokepoint: applyEmailRedirect() is called here (before transport
 * creation) so ALL email sends pass through the dev guard. In dev the send is
 * suppressed and a warning is logged. In production this is a no-op.
 */
export async function sendMail(
  resolved: ResolvedSmtpOutboundConfig,
  params: SendMailParams,
): Promise<SendMailResult> {
  // Dev redirect guard — must run before any transport interaction.
  const warnLogger = { warn: (obj: Record<string, unknown>, msg: string) => console.warn('[warn]', msg, obj) };
  const redirect = applyEmailRedirect(params.to, warnLogger);
  if (redirect.suppressed) {
    return { accepted: [], rejected: [] };
  }

  const transport = getOrCreateTransport(resolved);
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const from = params.from ?? resolved.fromAddress;

  if (!transport || !from) {
    return { accepted: [], rejected: [] };
  }

  const info = await transport.sendMail({
    from,
    to: toList,
    subject: params.subject,
    text: params.text,
    html: params.html,
    replyTo: params.replyTo,
  });

  return {
    accepted: info.accepted ?? [],
    rejected: info.rejected ?? [],
    messageId: info.messageId,
  };
}

export function isResolvedMailerConfigured(resolved: ResolvedSmtpOutboundConfig): boolean {
  return resolved.configured;
}
