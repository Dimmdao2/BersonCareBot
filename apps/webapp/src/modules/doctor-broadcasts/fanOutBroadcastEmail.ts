/**
 * Email fan-out для рассылки врача.
 * Этап 4a (2026-06-13).
 *
 * Отправляет письмо каждому eligible-клиенту через SMTP (`sendTransactionalSmtpEmail`).
 * Eligibility: подтверждённый email (resolverPort.getVerifiedEmailsForUserIds).
 *
 * ⚠️ GUARDED: отправка активна только при наличии порта `resolverPort` и непустого SMTP.
 * Если порт не подключён — фанаут возвращает { attempted: 0, ... } без ошибки.
 */

import { logger } from "@/infra/logging/logger";
import { sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import type { BroadcastCategory } from "./ports";

/** Маппинг email-адресов по userId (только с подтверждённым email). */
export type BroadcastEmailRecipientsPort = {
  /**
   * Возвращает Map userId → email (normalised) для пользователей с подтверждённым email.
   * Пользователи без подтверждённого email НЕ включаются.
   */
  getVerifiedEmailsForUserIds(userIds: string[]): Promise<Map<string, string>>;
};

export type FanOutBroadcastEmailInput = {
  auditId: string;
  broadcastCategory: BroadcastCategory;
  broadcastTitle: string;
  broadcastBody: string;
  eligibleClients: readonly ClientListItem[];
};

export type FanOutBroadcastEmailDeps = {
  /** Порт для получения email-адресов. Если не задан — фанаут отключён. */
  emailRecipientsPort: BroadcastEmailRecipientsPort;
  /**
   * Async-геттер, возвращающий `value_json` из system_settings (ключ smtp_outbound).
   * Вызывается один раз перед фанаутом. Lazy — позволяет не ждать при инициализации DI.
   */
  getSmtpValueJson: () => Promise<unknown>;
};

export type FanOutBroadcastEmailResult = {
  attempted: number;
  delivered: number;
  errors: number;
  skipped: number;
};

export async function fanOutBroadcastEmail(
  input: FanOutBroadcastEmailInput,
  deps: FanOutBroadcastEmailDeps,
): Promise<FanOutBroadcastEmailResult> {
  const { emailRecipientsPort } = deps;
  const smtpValueJson = await deps.getSmtpValueJson();

  const userIds = input.eligibleClients.map((c) => c.userId);
  let emailMap: Map<string, string>;
  try {
    emailMap = await emailRecipientsPort.getVerifiedEmailsForUserIds(userIds);
  } catch (err) {
    logger.warn(
      {
        err,
        event: "doctor_broadcast.email.resolve_failed",
        auditId: input.auditId,
      },
      "doctor broadcast email resolve failed",
    );
    return { attempted: 0, delivered: 0, errors: 0, skipped: userIds.length };
  }

  let attempted = 0;
  let delivered = 0;
  let errors = 0;
  let skipped = 0;

  for (const client of input.eligibleClients) {
    const emailAddress = emailMap.get(client.userId);
    if (!emailAddress) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    try {
      const result = await sendTransactionalSmtpEmail({
        smtpValueJson,
        to: emailAddress,
        subject: input.broadcastTitle,
        text: `${input.broadcastTitle}\n\n${input.broadcastBody}`,
      });

      if (result.ok) {
        delivered += 1;
      } else {
        errors += 1;
        logger.warn(
          {
            event: "doctor_broadcast.email.send_failed",
            auditId: input.auditId,
            platformUserId: client.userId,
            error: result.error,
          },
          "doctor broadcast email send failed",
        );
      }
    } catch (err) {
      errors += 1;
      logger.warn(
        {
          err,
          event: "doctor_broadcast.email.client_failed",
          auditId: input.auditId,
          platformUserId: client.userId,
        },
        "doctor broadcast email client failed",
      );
    }
  }

  logger.info(
    {
      event: "doctor_broadcast.email.result",
      auditId: input.auditId,
      attempted,
      delivered,
      errors,
      skipped,
    },
    "doctor broadcast email result",
  );

  return { attempted, delivered, errors, skipped };
}
