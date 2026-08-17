import type { SessionUser } from '@/shared/types/session';
import { formatPatientGreetingName } from '@/shared/lib/fio';

/** Имя в приветствии: `first_name`, иначе только первый токен legacy `display_name`. */
export function patientGreetingPersonalizedName(
  user: Pick<SessionUser, 'firstName' | 'displayName'>,
): string | null {
  const first = user.firstName?.trim();
  if (first) return first;
  const display = user.displayName?.trim() ?? '';
  return formatPatientGreetingName(null, display) || null;
}
