import { logger } from '@/app-layer/logging/logger';
import { loadCuratedSystemHealthSnapshot } from '@/infra/repos/pgCuratedSystemHealthDiagnostics';

/**
 * Сколько файлов ждут починки окружения — для сигнала глобальному админу.
 *
 * Число приезжает курируемой дверью здоровья, а НЕ прямым счётом по `media_files`. Роль в
 * rev10-режиме выбирает порт-контекст, и у сборщика здоровья это `app_worker`: прав на `media_files`
 * у него нет и по стене быть не должно — сборщик здоровья не арендатор. Прямой счёт поэтому 119 раз
 * в сутки писал `permission denied for table media_files` и отдавал ноль вместо сигнала.
 *
 * Best-effort намеренно: сбор здоровья обязан пережить отказ любого отдельного замера, иначе одна
 * недоступная таблица гасит ВСЕ сигналы разом. Ноль здесь читается как «нечего сообщать», и это
 * честно: тревога поднимается по положительному числу, а не по отсутствию ответа.
 */
export async function countBlockedMediaPreviewsSafe(): Promise<number> {
  try {
    const snapshot = await loadCuratedSystemHealthSnapshot();
    return snapshot.mediaPreview.blockedCount;
  } catch (error) {
    logger.warn({ err: error }, '[health] blocked media preview count unavailable');
    return 0;
  }
}
