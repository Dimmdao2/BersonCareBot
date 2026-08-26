/**
 * Final TEST delivery gate.
 *
 * Business code and previews always operate on the real recipient. Only the integrator,
 * immediately before the provider fork, applies this process-level environment policy:
 * local development suppresses every external send; TEST delivers only to explicitly listed
 * test-account contacts; production passes the original recipient unchanged.
 */

export type TestAccountIdentifiers = {
  phones: ReadonlySet<string>;
  telegramIds: ReadonlySet<string>;
  maxIds: ReadonlySet<string>;
  emails: ReadonlySet<string>;
  webPushUserIds: ReadonlySet<string>;
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function readCsv(value: string | undefined, normalize: (item: string) => string): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => normalize(item.trim()))
      .filter((item) => item.length > 0),
  );
}

function normalizeEmail(value: string): string {
  return value.toLowerCase();
}

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/u.test(compact) ? compact : '';
}

function normalizeExact(value: string): string {
  return value;
}

export function parseTestFlag(value: string | undefined): boolean {
  return /^(?:1|true|yes)$/iu.test((value ?? '').trim());
}

/** Vitest itself exports TEST=true; that is not the deployed TEST environment. */
export function isTestDeployment(source: EnvironmentSource = process.env): boolean {
  return parseTestFlag(source.TEST) && !parseTestFlag(source.VITEST);
}

export function isLocalDevelopmentDeliverySuppressed(
  source: EnvironmentSource = process.env,
): boolean {
  return source.NODE_ENV === 'development' && !source.VITEST_WORKER_ID;
}

export function readTestAccountIdentifiers(
  source: EnvironmentSource = process.env,
): TestAccountIdentifiers {
  return {
    phones: readCsv(source.TEST_ACCOUNT_PHONES, normalizePhone),
    telegramIds: readCsv(source.TEST_ACCOUNT_TELEGRAM_IDS, normalizeExact),
    maxIds: readCsv(source.TEST_ACCOUNT_MAX_IDS, normalizeExact),
    emails: readCsv(source.TEST_ACCOUNT_EMAILS, normalizeEmail),
    webPushUserIds: readCsv(source.TEST_ACCOUNT_WEB_PUSH_USER_IDS, normalizeExact),
  };
}

function recipientString(
  recipient: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!recipient) return null;
  for (const key of keys) {
    const value = recipient[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

/** True only when the original recipient belongs to an env-declared TEST account. */
export function isTestDeliveryRecipientAllowed(
  rawChannel: string | null | undefined,
  recipient: Record<string, unknown> | null | undefined,
  identifiers: TestAccountIdentifiers = readTestAccountIdentifiers(),
): boolean {
  switch (rawChannel) {
    case 'telegram': {
      const value = recipientString(recipient, 'chatId', 'telegramId');
      return value !== null && identifiers.telegramIds.has(value);
    }
    case 'max': {
      const value = recipientString(recipient, 'userId', 'chatId', 'maxId');
      return value !== null && identifiers.maxIds.has(value);
    }
    case 'sms':
    case 'smsc': {
      const value = recipientString(recipient, 'phoneNormalized', 'phone');
      return value !== null && identifiers.phones.has(normalizePhone(value));
    }
    case 'email': {
      const value = recipientString(recipient, 'email');
      return value !== null && identifiers.emails.has(normalizeEmail(value));
    }
    case 'web_push': {
      const value = recipientString(recipient, 'pushUserId', 'userId');
      return value !== null && identifiers.webPushUserIds.has(value);
    }
    default:
      return false;
  }
}
