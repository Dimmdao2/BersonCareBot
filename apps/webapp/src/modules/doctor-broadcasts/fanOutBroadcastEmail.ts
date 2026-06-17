/**
 * Email fan-out для рассылки врача.
 * Этап 4a (2026-06-13) → S10 refactor (2026-06-17).
 *
 * Отправляет письмо каждому eligible-клиенту через integrator relay-outbound (channel:'email').
 * Eligibility: подтверждённый email (resolverPort.getVerifiedEmailsForUserIds).
 *
 * ⚠️ GUARDED: relay-outbound → integrator dispatchPort (redirect-covered). No direct SMTP.
 * Если relay недоступен — результат `errors++` (не скрывает сбои).
 */

import { randomUUID } from "node:crypto";
import { logger } from "@/infra/logging/logger";
import { relayOutbound, type RelayOutboundDeps } from "@/modules/messaging/relayOutbound";
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

export type FanOutBroadcastEmailDeps = RelayOutboundDeps & {
  /** Порт для получения email-адресов. Если не задан — фанаут отключён. */
  emailRecipientsPort: BroadcastEmailRecipientsPort;
  /**
   * @deprecated Не используется с S10: SMTP-конфиг читается в integrator EmailDeliveryAdapter.
   * Оставлен для совместимости DI-слоя; будет удалён в S15.
   */
  getSmtpValueJson?: () => Promise<unknown>;
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
      const messageId = `broadcast:${input.auditId}:${client.userId}`;
      const result = await relayOutbound(
        {
          messageId,
          channel: "email",
          recipient: emailAddress,
          text: `${input.broadcastTitle}\n\n${input.broadcastBody}`,
          metadata: { subject: input.broadcastTitle },
        },
        deps,
      );

      if (result.ok) {
        delivered += 1;
      } else {
        errors += 1;
        logger.warn(
          {
            event: "doctor_broadcast.email.send_failed",
            auditId: input.auditId,
            platformUserId: client.userId,
            error: result.reason,
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
