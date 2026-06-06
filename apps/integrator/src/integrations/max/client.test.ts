import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageToChat = vi.fn();

vi.mock('@maxhub/max-bot-api', () => ({
  Bot: class MockBot {
    api = { sendMessageToChat, sendMessageToUser: sendMessageToChat };
  },
}));

describe('sendMaxMessage', () => {
  beforeEach(async () => {
    sendMessageToChat.mockReset();
    vi.resetModules();
  });

  it('throws MaxSendError instead of returning null on API failure', async () => {
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
  });
});
