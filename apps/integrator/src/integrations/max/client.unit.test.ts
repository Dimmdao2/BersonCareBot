import { beforeEach, describe, expect, it, vi } from 'vitest';

// W8 (SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md): restores the genuine coverage loss
// confirmed for the MAX HTTP client — `sendMaxMessage` throwing `MaxSendError` (instead of a
// silent null/undefined) is the only thing standing between a delivery failure and a message that
// looks sent but never arrived. Oracle: the removed `client.test.ts`
// (commit a380533b4dca81f6502f2688881694715e1ae7bd) plus the current `client.ts` source, which
// still implements exactly this contract. Mocking `@maxhub/max-bot-api` is a stub at the external
// SDK boundary (§10b «Заглушки допустимы на внешних границах»), not a fake of our own code.

const sendMessageToChat = vi.fn();
const sendMessageToUser = vi.fn();

vi.mock('@maxhub/max-bot-api', () => ({
  Bot: class MockBot {
    api = { sendMessageToChat, sendMessageToUser };
  },
}));

describe('sendMaxMessage', () => {
  beforeEach(async () => {
    sendMessageToChat.mockReset();
    sendMessageToUser.mockReset();
    vi.resetModules();
  });

  it('throws MaxSendError instead of returning null/undefined on API failure', async () => {
    sendMessageToChat.mockRejectedValue(new Error('User blocked the bot'));
    const { sendMaxMessage, MaxSendError } = await import('./client.js');
    await expect(
      sendMaxMessage({ apiKey: 'test-key-a' }, { chatId: 1, text: 'hi' }),
    ).rejects.toBeInstanceOf(MaxSendError);
    await expect(
      sendMaxMessage({ apiKey: 'test-key-a' }, { chatId: 1, text: 'hi' }),
    ).rejects.toMatchObject({
      name: 'MaxSendError',
      apiMessage: 'User blocked the bot',
    });
  });

  it('throws MaxSendError when chatId and userId are both missing', async () => {
    const { sendMaxMessage } = await import('./client.js');
    await expect(sendMaxMessage({ apiKey: 'test-key-b' }, { text: 'hi' })).rejects.toMatchObject({
      message: 'MAX_PAYLOAD_INVALID: chatId or userId required',
    });
    expect(sendMessageToChat).not.toHaveBeenCalled();
    expect(sendMessageToUser).not.toHaveBeenCalled();
  });
});
