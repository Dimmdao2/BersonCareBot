import type { IncomingEvent } from '../contracts/index.js';

/** Результат проверки rate-limit для входящего события. */
export type RateLimitResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Базовый rate-limit gateway уровня ядра.
 * Пока заглушка: всегда разрешает обработку.
 */
export async function checkGatewayRateLimit(_event: IncomingEvent): Promise<RateLimitResult> {
  return { allowed: true };
}
