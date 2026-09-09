/**
 * Mailer: отправка email через SMTP (nodemailer).
 * Конфиг передаётся вызывающим кодом после restricted DB-only загрузки `smtp_outbound`
 * (см. config/smtpOutbound).
 *
 * Dev safety: email delivery is protected solely by the pre-fork redirect in dispatchPort
 * (applyPreForkDevRedirect). All email paths now route through dispatchPort → EmailDeliveryAdapter →
 * sendMail (S8/S9/S10). The interim ALLOW_DEV_EMAIL guard was retired in S15 after the redirect
 * was proven to cover this path (S11 dispatchPort.redirect.test.ts).
 */
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';

export type MailAttachment = {
  /** Имя файла вложения (например, `booking.ics`). */
  filename: string;
  /** Содержимое вложения (строка или Buffer). */
  content: string | Buffer;
  /** MIME-тип вложения (например, `text/calendar`). */
  contentType: string;
};

export type SendMailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  /** Bound transport setup and socket inactivity for a health probe without changing normal delivery. */
  timeoutMs?: number;
  /** Probe ownership marker; never use this to carry user content or credentials. */
  headers?: Record<string, string>;
  /** Опциональные вложения (например, .ics-файл). */
  attachments?: MailAttachment[];
};

export type SendMailResult = {
  accepted: string[];
  rejected: string[];
  messageId?: string;
  response?: string;
};

let transportCache: { sig: string; transport: Transporter } | null = null;

function transportSignature(cfg: ResolvedSmtpOutboundConfig, timeoutMs?: number): string {
  return createHash('sha256')
    .update(
      `${cfg.smtpHost}\0${cfg.smtpPort}\0${cfg.smtpSecure}\0${cfg.smtpUser}\0${cfg.smtpPass}\0${cfg.fromAddress}\0${timeoutMs ?? ''}`,
    )
    .digest('hex');
}

function getOrCreateTransport(cfg: ResolvedSmtpOutboundConfig, timeoutMs?: number): Transporter | null {
  if (!cfg.configured) return null;
  const sig = transportSignature(cfg, timeoutMs);
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
        ...(timeoutMs !== undefined
          ? {
              connectionTimeout: timeoutMs,
              greetingTimeout: timeoutMs,
              socketTimeout: timeoutMs,
            }
          : {}),
      }),
    };
  }
  return transportCache.transport;
}

/**
 * Если SMTP не сконфигурирован, ничего не отправляет (accepted=[]).
 */
export async function sendMail(
  resolved: ResolvedSmtpOutboundConfig,
  params: SendMailParams,
): Promise<SendMailResult> {
  const transport = getOrCreateTransport(resolved, params.timeoutMs);
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const fromAddress = params.from ?? resolved.fromAddress;
  const fromName = params.fromName ?? resolved.senderDisplayName;
  const from = fromName ? { name: fromName, address: fromAddress } : fromAddress;

  if (!transport || !fromAddress) {
    return { accepted: [], rejected: [] };
  }

  const info = await transport.sendMail({
    from,
    to: toList,
    subject: params.subject,
    /* nodemailer 10 принёс собственные типы, где опциональные поля объявлены без `undefined`:
       под exactOptionalPropertyTypes каждое передаётся, только когда задано — так же, как раньше
       передавались attachments. Пустая строка по-прежнему уходит как значение. */
    ...(params.text !== undefined ? { text: params.text } : {}),
    ...(params.html !== undefined ? { html: params.html } : {}),
    ...(params.replyTo !== undefined ? { replyTo: params.replyTo } : {}),
    ...(params.headers !== undefined ? { headers: params.headers } : {}),
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  });

  return {
    accepted: info.accepted ?? [],
    rejected: info.rejected ?? [],
    messageId: info.messageId,
    ...(info.response !== undefined ? { response: info.response } : {}),
  };
}

export function isResolvedMailerConfigured(resolved: ResolvedSmtpOutboundConfig): boolean {
  return resolved.configured;
}
