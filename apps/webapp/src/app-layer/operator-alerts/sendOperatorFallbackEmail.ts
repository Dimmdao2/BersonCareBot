import { logger } from '@/app-layer/logging/logger';
import { createIntegratorEmailAdapter } from '@/infra/integrations/email/integratorEmailAdapter';
import { env, integratorWebhookSecret } from '@/config/env';
import { stampOperatorAlertSubject } from '@/modules/operator-alerts/operatorAlertEnvLabel';

/**
 * Доставка в fallback-адрес операторских алертов (design D-b).
 *
 * Идёт через тот же подписанный чокпоинт `send-email`, что и всё остальное, — отдельного
 * пути отправки не заводим. Это ЗНАЧИТ, что fallback разделяет судьбу с почтой: если умер
 * провайдер, умрёт и он. Ровно поэтому D-b не полагается на fallback в одиночку — счётчик
 * пустой аудитории поднимает критический сигнал, который уходит по НЕ-почтовому каналу
 * (staff web push), а dead man's switch (D-d) живёт вообще вне этой коробки.
 *
 * Разный транспорт/разные учётные данные для операторских алертов (design D-c) в этот
 * слайс не входят и остаются открытым пунктом.
 */
export async function sendOperatorFallbackEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!input.to.trim()) return false;
  const adapter = createIntegratorEmailAdapter({
    integratorBaseUrl: env.INTEGRATOR_API_URL,
    sharedSecret: integratorWebhookSecret(),
  });
  const result = await adapter.sendTransactionalEmail(
    input.to,
    stampOperatorAlertSubject(input.subject),
    input.text,
  );
  if (!result.ok) {
    logger.warn(
      { scope: 'operator_alert', event: 'operator_fallback_email_failed', reason: result.error },
      'operator fallback email failed',
    );
    return false;
  }
  return true;
}
