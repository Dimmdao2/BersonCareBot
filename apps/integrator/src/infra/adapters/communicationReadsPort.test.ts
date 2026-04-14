import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test' },
  integratorWebhookSecret: () => 'test-secret-16chars!!',
}));

vi.mock('../../config/appBaseUrl.js', () => ({
  getAppBaseUrl: async () => 'https://webapp.test',
}));

import type { DbPort } from '../../kernel/contracts/index.js';
import { createCommunicationReadsPort } from './communicationReadsPort.js';

const mockDb = {} as DbPort;

const originalFetch = globalThis.fetch;

describe('communicationReadsPort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('listOpenConversations calls correct URL with params and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        conversations: [
          {
            integratorConversationId: 'conv-1',
            source: 'telegram',
            integratorUserId: '42',
            adminScope: 'support',
            status: 'open',
            openedAt: '2025-01-01T10:00:00Z',
            lastMessageAt: '2025-01-01T10:01:00Z',
            closedAt: null,
            closeReason: null,
            displayName: 'Test User',
            phoneNormalized: null,
            channelExternalId: 'tg123',
            lastMessageText: 'Hello',
            lastSenderRole: 'user',
          },
        ],
      }),
    });
    const port = createCommunicationReadsPort({ db: mockDb });
    const list = await port.listOpenConversations({ source: 'telegram', limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/communication/conversations');
    expect(url).toContain('source=telegram');
    expect(url).toContain('limit=10');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('conv-1');
    expect(list[0]!.first_name).toBe('Test User');
    expect(list[0]!.user_channel_id).toBe('tg123');
    expect(list[0]!.last_message_text).toBe('Hello');
  });

  it('getConversationById returns mapped data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        conversation: {
          integratorConversationId: 'conv-2',
          source: 'telegram',
          integratorUserId: '99',
          adminScope: 'support',
          status: 'open',
          openedAt: '2025-01-01T10:00:00Z',
          lastMessageAt: '2025-01-01T10:01:00Z',
          closedAt: null,
          closeReason: null,
          displayName: 'Admin',
          phoneNormalized: '+7999',
          channelExternalId: 'tg99',
          lastMessageText: 'Hi',
          lastSenderRole: 'admin',
          userChatId: 'chat-123',
        },
      }),
    });
    const port = createCommunicationReadsPort({ db: mockDb });
    const conv = await port.getConversationById('conv-2');
    expect(conv).not.toBeNull();
    expect(conv!.id).toBe('conv-2');
    expect(conv!.user_chat_id).toBe('chat-123');
  });

  it('getConversationById returns null for 404', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ ok: false, error: 'not_found' }) });
    const port = createCommunicationReadsPort({ db: mockDb });
    const conv = await port.getConversationById('conv-missing');
    expect(conv).toBeNull();
  });

  it('listUnansweredQuestions calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        questions: [
          {
            integratorQuestionId: 'q-1',
            integratorConversationId: 'conv-1',
            text: 'Help?',
            createdAt: '2025-01-01T10:00:00Z',
            answered: false,
            answeredAt: null,
            displayName: 'User',
            phoneNormalized: null,
            channelExternalId: 'tg1',
          },
        ],
      }),
    });
    const port = createCommunicationReadsPort({ db: mockDb });
    const list = await port.listUnansweredQuestions({ limit: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/communication/questions');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('q-1');
    expect(list[0]!.text).toBe('Help?');
    expect(list[0]!.conversation_id).toBe('conv-1');
  });

  it('getQuestionByConversationId returns mapped data or null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, question: { id: 'q-2', answered: true } }),
    });
    const port = createCommunicationReadsPort({ db: mockDb });
    const q = await port.getQuestionByConversationId('conv-2');
    expect(q).not.toBeNull();
    expect(q!.id).toBe('q-2');
    expect(q!.answered).toBe(true);
  });

  it('getQuestionByConversationId returns null when question is null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, question: null }),
    });
    const port = createCommunicationReadsPort({ db: mockDb });
    const q = await port.getQuestionByConversationId('conv-no-q');
    expect(q).toBeNull();
  });

  it('returns empty list when webapp is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    const port = createCommunicationReadsPort({ db: mockDb });
    const list = await port.listOpenConversations({});
    expect(list).toEqual([]);
  });

  it('returns null for getConversationById when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const port = createCommunicationReadsPort({ db: mockDb });
    const conv = await port.getConversationById('conv-1');
    expect(conv).toBeNull();
  });
});
