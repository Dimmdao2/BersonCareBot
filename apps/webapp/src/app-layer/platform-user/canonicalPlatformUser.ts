import { getDrizzle } from '@/app-layer/db/drizzle';
import { resolveCanonicalUserId as resolveCanonicalUserIdOn } from '@/infra/repos/pgCanonicalPlatformUser';

/**
 * Фасад для вызывающих вне infra: сессия базы берётся здесь, а не передаётся снаружи.
 * Внутри транзакции звать НЕЛЬЗЯ — там нужен исполнитель того же соединения, то есть
 * `@/infra/repos/pgCanonicalPlatformUser` напрямую.
 */
export function resolveCanonicalUserId(userId: string): Promise<string | null> {
  return resolveCanonicalUserIdOn(getDrizzle(), userId);
}
