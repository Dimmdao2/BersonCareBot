/**
 * Stage 13: machine-readable registry of legacy vs runtime/raw storage.
 * Prevents accidental removal of runtime/raw paths during cleanup.
 */

export type LegacyCategory =
  | 'raw'
  | 'runtime'
  | 'shadow'
  | 'legacy_product_read'
  | 'legacy_product_write';

export type Stage13Action = 'keep' | 'freeze' | 'remove_after_tests';

export type LegacyCleanupEntry = {
  domain: string;
  fileOrSymbol: string;
  category: LegacyCategory;
  stage13Action: Stage13Action;
};

const MIGRATED_DOMAINS = [
  'person',
  'communication',
  'reminders',
  'appointments',
  'subscription_mailing',
] as const;

export const LEGACY_CLEANUP_MATRIX: LegacyCleanupEntry[] = [
  { domain: 'person', fileOrSymbol: 'repos/channelUsers.ts', category: 'shadow', stage13Action: 'keep' },
  { domain: 'person', fileOrSymbol: 'repos/userLookup.ts', category: 'runtime', stage13Action: 'keep' },
  { domain: 'communication', fileOrSymbol: 'repos/messageThreads.ts', category: 'runtime', stage13Action: 'keep' },
  { domain: 'communication', fileOrSymbol: 'readPort conversation.*', category: 'legacy_product_read', stage13Action: 'remove_after_tests' },
  { domain: 'reminders', fileOrSymbol: 'repos/reminders.ts', category: 'runtime', stage13Action: 'keep' },
  { domain: 'reminders', fileOrSymbol: 'readPort reminders.rules.forUser', category: 'legacy_product_read', stage13Action: 'remove_after_tests' },
  { domain: 'appointments', fileOrSymbol: 'repos/bookingRecords.ts', category: 'raw', stage13Action: 'keep' },
  { domain: 'appointments', fileOrSymbol: 'readPort booking.*', category: 'legacy_product_read', stage13Action: 'remove_after_tests' },
  { domain: 'subscription_mailing', fileOrSymbol: 'repos/topics.ts', category: 'legacy_product_write', stage13Action: 'freeze' },
  { domain: 'subscription_mailing', fileOrSymbol: 'repos/subscriptions.ts', category: 'legacy_product_write', stage13Action: 'freeze' },
  { domain: 'subscription_mailing', fileOrSymbol: 'mailing_topics', category: 'legacy_product_write', stage13Action: 'freeze' },
  { domain: 'subscription_mailing', fileOrSymbol: 'user_subscriptions', category: 'legacy_product_write', stage13Action: 'freeze' },
  { domain: 'subscription_mailing', fileOrSymbol: 'mailing_logs', category: 'shadow', stage13Action: 'keep' },
];

export function getMigratedDomains(): readonly string[] {
  return MIGRATED_DOMAINS;
}

export function getMatrixByDomain(domain: string): LegacyCleanupEntry[] {
  return LEGACY_CLEANUP_MATRIX.filter((e) => e.domain === domain);
}

export function getEntriesWithAction(action: Stage13Action): LegacyCleanupEntry[] {
  return LEGACY_CLEANUP_MATRIX.filter((e) => e.stage13Action === action);
}
