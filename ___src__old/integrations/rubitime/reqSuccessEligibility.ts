import type { RubitimeRecordForLinking } from '../../db/repos/rubitimeRecords.js';
import type { TelegramUserByPhone } from '../../db/repos/telegramUsers.js';

export type ReqSuccessEligibilityResult = {
  showButton: boolean;
};

export type ReqSuccessEligibilityInput = {
  now: Date;
  windowMinutes: number;
  record: RubitimeRecordForLinking | null;
  linkedUser: TelegramUserByPhone | null;
};

export function isReqSuccessRecordFresh(recordAt: Date | null, now: Date, windowMinutes: number): boolean {
  if (!recordAt) return false;
  const ageMs = now.getTime() - recordAt.getTime();
  const windowMs = windowMinutes * 60 * 1000;
  return ageMs >= 0 && ageMs <= windowMs;
}

export function evaluateReqSuccessEligibility(
  input: ReqSuccessEligibilityInput,
): ReqSuccessEligibilityResult {
  if (!input.record) return { showButton: false };
  if (!isReqSuccessRecordFresh(input.record.recordAt, input.now, input.windowMinutes)) {
    return { showButton: false };
  }
  if (input.linkedUser) return { showButton: false };
  return { showButton: true };
}
