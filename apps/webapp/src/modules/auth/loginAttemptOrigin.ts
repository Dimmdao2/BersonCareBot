import { isIP } from 'node:net';
import { cookies } from 'next/headers';
import { readDeviceMarkerCookie } from '@/modules/auth/sessionCookie';

/**
 * Откуда пришла попытка входа: то же самое, что журнал записывает об успешном входе, но снятое до
 * того, как стало известно, удачная попытка или нет (#1112 Л-8).
 */
export type LoginAttemptOrigin = {
  /** Метка устройства, если браузер её уже носит; новая здесь не заводится. */
  deviceKey: string | null;
  sourceIp: string | null;
};

/**
 * Адрес берём ТОЛЬКО из `x-real-ip`, который ставит nginx: `x-forwarded-for` подделывается клиентом,
 * и подделанный адрес превратил бы «попытки с четырёх разных адресов» в выдумку подбирающего. Тот же
 * заголовок и та же проверка формы, что при записи успешного входа, — иначе адрес одной и той же
 * машины выглядел бы в двух местах журнала по-разному.
 */
export async function resolveLoginAttemptOrigin(request: Request): Promise<LoginAttemptOrigin> {
  const rawIp = request.headers.get('x-real-ip')?.trim() || null;
  let deviceKey: string | null = null;
  try {
    deviceKey = readDeviceMarkerCookie(await cookies());
  } catch {
    // Вызов вне запросного контекста Next (юнит-вызовы): метки просто нет, это допустимое состояние.
  }
  return { deviceKey, sourceIp: rawIp && isIP(rawIp) !== 0 ? rawIp : null };
}
