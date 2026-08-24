import type { JournalRetentionPort } from '@/modules/db-retention/ports';
import {
  runDbJournalRetention,
  type JournalRetentionOverrides,
  type JournalRetentionRunResult,
} from '@/modules/db-retention/journalRetention';

export function createDbJournalRetentionService(port: JournalRetentionPort) {
  return {
    async runRetention(overrides?: JournalRetentionOverrides): Promise<JournalRetentionRunResult> {
      return runDbJournalRetention(port, overrides);
    },
  };
}

export type DbJournalRetentionService = ReturnType<typeof createDbJournalRetentionService>;
