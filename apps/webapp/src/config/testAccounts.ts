import { env } from './env';
import { normalizeEmail } from '@/modules/auth/emailNormalize';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';

export type TestAccountIdentifiers = {
  phones: string[];
  telegramIds: string[];
  maxIds: string[];
  emails: string[];
  webPushUserIds: string[];
};

function uniqueCsv(value: string, normalize: (item: string) => string | null): string[] {
  const result: string[] = [];
  for (const raw of value.split(',')) {
    const item = normalize(raw.trim());
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}

function exact(value: string): string | null {
  return value || null;
}

function email(value: string): string | null {
  const normalized = normalizeEmail(value);
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : null;
}

function phone(value: string): string | null {
  const normalized = normalizePhone(value);
  return isValidPhoneE164(normalized) ? normalized : null;
}

/** Single webapp source of test-account identity: deploy-owned environment variables. */
export function getTestAccountIdentifiers(): TestAccountIdentifiers {
  return {
    phones: uniqueCsv(env.TEST_ACCOUNT_PHONES, phone),
    telegramIds: uniqueCsv(env.TEST_ACCOUNT_TELEGRAM_IDS, exact),
    maxIds: uniqueCsv(env.TEST_ACCOUNT_MAX_IDS, exact),
    emails: uniqueCsv(env.TEST_ACCOUNT_EMAILS, email),
    webPushUserIds: uniqueCsv(env.TEST_ACCOUNT_WEB_PUSH_USER_IDS, exact),
  };
}

export function sessionMatchesTestAccountIdentifiers(
  session: {
    phone?: string | null;
    telegramId?: string | null;
    maxId?: string | null;
    email?: string | null;
    userId?: string | null;
  },
  spec: TestAccountIdentifiers = getTestAccountIdentifiers(),
): boolean {
  const normalizedPhone = session.phone ? phone(session.phone) : null;
  if (normalizedPhone && spec.phones.includes(normalizedPhone)) return true;
  const telegramId = session.telegramId?.trim();
  if (telegramId && spec.telegramIds.includes(telegramId)) return true;
  const maxId = session.maxId?.trim();
  if (maxId && spec.maxIds.includes(maxId)) return true;
  const normalizedEmail = session.email ? email(session.email) : null;
  if (normalizedEmail && spec.emails.includes(normalizedEmail)) return true;
  const userId = session.userId?.trim();
  return Boolean(userId && spec.webPushUserIds.includes(userId));
}
