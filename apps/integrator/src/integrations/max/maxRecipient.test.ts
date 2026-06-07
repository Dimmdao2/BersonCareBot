import { describe, expect, it } from 'vitest';
import { maxUserRecipient, readMaxOutboundRecipient } from './maxRecipient.js';

describe('maxRecipient', () => {
  it('maxUserRecipient parses string platform user id', () => {
    expect(maxUserRecipient('207278131')).toEqual({ userId: 207278131 });
  });

  it('readMaxOutboundRecipient prefers userId over chatId', () => {
    expect(readMaxOutboundRecipient({ userId: 1, chatId: 2 })).toEqual({ userId: 1 });
  });

  it('readMaxOutboundRecipient maps legacy channelId to userId', () => {
    expect(readMaxOutboundRecipient({ channelId: '555' })).toEqual({ userId: 555 });
  });

  it('readMaxOutboundRecipient falls back to chatId for in-dialog sends', () => {
    expect(readMaxOutboundRecipient({ chatId: 9001 })).toEqual({ chatId: 9001 });
  });
});
