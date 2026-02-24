import type { RubitimeRecordForLinking } from '../../db/repos/rubitimeRecords.js';
import type { RubitimeTelegramUser } from './webhook.js';

export type LinkCheckEligibilityResult = {
  showButton: boolean;
};

export type LinkCheckEligibilityInput = {
  now: Date;
  windowMinutes: number;
  record: RubitimeRecordForLinking | null;
  linkedUser: RubitimeTelegramUser | null;
};

export function isRecordFresh(recordAt: Date | null, now: Date, windowMinutes: number): boolean {
  if (!recordAt) return false;
  const ageMs = now.getTime() - recordAt.getTime();
  const windowMs = windowMinutes * 60 * 1000;
  return ageMs >= 0 && ageMs <= windowMs;
}

export function evaluateLinkCheckEligibility(
  input: LinkCheckEligibilityInput,
): LinkCheckEligibilityResult {
  if (!input.record) return { showButton: false };
  if (!isRecordFresh(input.record.recordAt, input.now, input.windowMinutes)) {
    return { showButton: false };
  }
  if (input.linkedUser) return { showButton: false };
  return { showButton: true };
}
