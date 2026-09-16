import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Последняя линия, когда идентификатор сборки не удалось узнать ничем. Это НЕ время старта:
 * точный момент рестарта — операционный факт, и анониму его знать незачем (D4).
 */
const UNKNOWN_BUILD_ID = randomUUID();

/** Ключа подписи нет — публичный идентификатор постоянен и пуст по смыслу. */
const UNSIGNED_BUILD_ID = 'unsigned';

/**
 * Возвращает один публичный непрозрачный идентификатор сборки для layout и `/api/version`.
 * Хостовая выкладка объявляет BUILD_ID, docker-выкладка полагается на файл Next; значение
 * процесса остаётся только безопасным fallback. HMAC не позволяет восстановить из ответа
 * короткий git SHA или Unix-время даже при малом пространстве возможных исходных значений.
 */
export function resolvePublicBuildId(): string {
  let privateBuildId = process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID;
  privateBuildId = privateBuildId?.trim();

  if (!privateBuildId) {
    try {
      privateBuildId = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    } catch {
      // Сборки рядом нет — остаётся безопасное значение на процесс.
    }
  }

  if (!privateBuildId) privateBuildId = UNKNOWN_BUILD_ID;

  const secret = process.env.SESSION_COOKIE_SECRET?.trim();
  // Без ключа хеш не защищает: пространство исходных значений мало и перебирается. Но и значение
  // НА ПРОЦЕСС сюда ставить нельзя — вкладка перезагружается, когда видит новый идентификатор,
  // поэтому каждый рестарт выбрасывал бы всех открытых пользователей (находка круга 2). Пустой
  // секрет на этом стенде уже случался, поэтому ветка настоящая. Отдаём постоянную строку: она
  // одинакова у всех процессов и не несёт наружу ничего.
  if (!secret) return UNSIGNED_BUILD_ID;

  return createHmac('sha256', secret)
    .update('public-build-id:v1\0', 'utf8')
    .update(privateBuildId, 'utf8')
    .digest('base64url');
}
