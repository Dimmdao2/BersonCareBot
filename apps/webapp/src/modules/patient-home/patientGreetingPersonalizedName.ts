import type { SessionUser } from '@/shared/types/session';
/**
 * Имя в приветствии берётся только из структурированного `first_name`.
 * Legacy `display_name` не парсим: строка может быть записана как ФИО, где первый токен — фамилия.
 */
export function patientGreetingPersonalizedName(
  user: Pick<SessionUser, 'firstName' | 'displayName'>,
): string | null {
  const first = user.firstName?.trim();
  return first || null;
}
