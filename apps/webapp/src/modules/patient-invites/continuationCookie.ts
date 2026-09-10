import { cookies } from 'next/headers';
import { isProduction } from '@/config/env';

const COOKIE_NAME = 'bersoncare_patient_invite';
const CONTINUATION_MAX_AGE_SECONDS = 10 * 60;

// Путь ОБЯЗАН покрывать обе поверхности продолжения: страницу `/join/<continuation>` и двери
// `/api/join/**`, которые и есть единственные потребители этой куки. Прежний `'/join'` покрывал
// только страницу: по RFC 6265 путь `/join` не совпадает с `/api/join/email/start`, поэтому браузер
// туда куку не слал, и весь почтовый путь приглашения отвечал `invalid_continuation` — замер на
// живом TEST 11.09.2026. Общего префикса у `/join` и `/api/join` нет, поэтому путь корневой.
// Сужение пути здесь и не было границей безопасности: кука httpOnly + SameSite=Lax и живёт 10 минут,
// а хост пациента целиком наш.
const cookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
};

export async function issuePatientInviteContinuationCookie(continuation: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, continuation, {
    ...cookieOptions,
    maxAge: CONTINUATION_MAX_AGE_SECONDS,
  });
}

export async function readPatientInviteContinuationCookie(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

export async function clearPatientInviteContinuationCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
}
