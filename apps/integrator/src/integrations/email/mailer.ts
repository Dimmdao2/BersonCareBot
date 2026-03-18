/**
 * Mailer: отправка email через SMTP (nodemailer).
 * Пока сервер не настроен (SMTP_HOST / MAIL_FROM и т.д. не заданы), sendMail не отправляет письма и резолвится без ошибки.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { emailConfig } from './config.js';

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

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cachedTransport !== null) return cachedTransport;
  if (!emailConfig.configured) return null;

  cachedTransport = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpSecure,
    auth: {
      user: emailConfig.smtpUser,
      pass: emailConfig.smtpPass,
    },
  });
  return cachedTransport;
}

/**
 * Отправляет письмо. Если SMTP не настроен (MAIL_FROM и сервер не заданы в env), ничего не отправляет и возвращает успех (accepted = []).
 */
export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
  const transport = getTransport();
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const from = params.from ?? emailConfig.fromAddress;

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

/**
 * true, если в env заданы SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM и sendMail будет реально отправлять.
 */
export function isMailerConfigured(): boolean {
  return emailConfig.configured;
}
