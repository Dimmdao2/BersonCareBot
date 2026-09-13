import { logger } from '@/app-layer/logging/logger';
import { countBlockedMediaPreviews } from '@/infra/repos/pgMediaPreviewControl';

/**
 * Сколько файлов ждут починки окружения — для сигнала глобальному админу.
 *
 * Best-effort намеренно: сбор здоровья обязан пережить отказ любого отдельного замера, иначе одна
 * недоступная таблица гасит ВСЕ сигналы разом. Ноль здесь читается как «нечего сообщать», и это
 * честно: тревога поднимается по положительному числу, а не по отсутствию ответа.
 */
export async function countBlockedMediaPreviewsSafe(): Promise<number> {
  try {
    return await countBlockedMediaPreviews();
  } catch (error) {
    logger.warn({ err: error }, '[health] blocked media preview count unavailable');
    return 0;
  }
}
