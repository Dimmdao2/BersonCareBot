/* eslint-disable no-secrets/no-secrets -- test titles reference exported symbol names */
import { describe, expect, it } from 'vitest';
import {
  classifyMaxRecipientBlockedError,
  classifyRecipientBlockedBotError,
  classifyTelegramRecipientBlockedError,
  isRecipientBlockedBotDispatchError,
  isRecipientBlockedBotMessage,
  RecipientBlockedBotError,
  RECIPIENT_BLOCKED_BOT,
} from './recipientBotBlocked.js';
import { isOutgoingDeliveryDispatchErrorRetryable } from './deliveryContract.js';
import { MaxSendError } from '../../integrations/max/client.js';

describe('recipientBlockedBot', () => {
  it('classifies telegram 403 blocked by user', () => {
    const err = { error_code: 403, description: 'Forbidden: bot was blocked by the user' };
    const blocked = classifyTelegramRecipientBlockedError(err);
    expect(blocked).toBeInstanceOf(RecipientBlockedBotError);
    expect(blocked?.channel).toBe('telegram');
  });

  it('classifies max blocked message via MaxSendError', () => {
    const err = new MaxSendError('MAX_SEND_FAILED', { apiMessage: 'User blocked the bot' });
    const blocked = classifyMaxRecipientBlockedError(err);
    expect(blocked?.channel).toBe('max');
  });

  it('classifies max dialog.suspended (403) as recipient blocked', () => {
    const err = new MaxSendError('MAX_SEND_FAILED', {
      apiMessage: '403: Key: error.dialog.suspended, args: [14039325,].',
    });
    const blocked = classifyMaxRecipientBlockedError(err);
    expect(blocked).toBeInstanceOf(RecipientBlockedBotError);
    expect(blocked?.channel).toBe('max');
    expect(classifyRecipientBlockedBotError(err, 'max')?.channel).toBe('max');
  });

  it('is non-retryable in delivery contract', () => {
    const msg = `${RECIPIENT_BLOCKED_BOT}: bot was blocked by the user`;
    expect(isRecipientBlockedBotDispatchError(msg)).toBe(true);
    expect(isOutgoingDeliveryDispatchErrorRetryable(msg)).toBe(false);
  });

  it('matches legacy last_error backfill patterns', () => {
    expect(isRecipientBlockedBotMessage('bot was blocked by the user')).toBe(true);
    expect(isRecipientBlockedBotMessage('PEER_ID_INVALID')).toBe(false);
  });

  it('classifyRecipientBlockedBotError preserves instance', () => {
    const original = new RecipientBlockedBotError('telegram', 'blocked');
    expect(classifyRecipientBlockedBotError(original, 'telegram')).toBe(original);
  });
});
