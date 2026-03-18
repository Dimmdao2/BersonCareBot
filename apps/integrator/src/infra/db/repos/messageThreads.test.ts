import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  cancelDraftByIdentity,
  getActiveDraftByIdentity,
  getConversationById,
  getOpenConversationByIdentity,
  insertConversation,
  insertConversationMessage,
  listOpenConversations,
  setConversationState,
  upsertDraftByIdentity,
} from './messageThreads.js';

function createDbMock() {
  const queryMock = vi.fn();
  const txMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: txMock as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('messageThreads repo', () => {
  it('upserts and cancels drafts through identities', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValue({ rows: [], rowCount: 1 } as DbQueryResult);

    await upsertDraftByIdentity(db, {
      id: 'draft-1',
      resource: 'telegram',
      externalId: '123',
      source: 'telegram',
      externalChatId: '123',
      externalMessageId: '55',
      draftTextCurrent: 'hello',
    });

    const [upsertSql, upsertParams] = query.mock.calls[0] ?? [];
    expect(String(upsertSql)).toContain('INSERT INTO message_drafts');
    expect(String(upsertSql)).toContain('ON CONFLICT (identity_id, source)');
    expect(upsertParams).toEqual(['telegram', '123', 'draft-1', 'telegram', '123', '55', 'hello', 'pending_confirmation']);

    await cancelDraftByIdentity(db, {
      resource: 'telegram',
      externalId: '123',
      source: 'telegram',
    });

    const [cancelSql] = query.mock.calls[1] ?? [];
    expect(String(cancelSql)).toContain('DELETE FROM message_drafts');
    expect(String(cancelSql)).toContain('USING identities i');
  });

  it('reads active draft and open conversation via identities joins', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'draft-1',
          identity_id: '77',
          source: 'telegram',
          external_chat_id: '123',
          external_message_id: '55',
          draft_text_current: 'hello',
          state: 'pending_confirmation',
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
          channel_id: '123',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'Example',
          phone_normalized: '+79990001122',
        }],
        rowCount: 1,
      } as DbQueryResult)
      .mockResolvedValueOnce({
        rows: [{
          id: 'conv-1',
          source: 'telegram',
          user_identity_id: '77',
          admin_scope: 'default',
          status: 'waiting_admin',
          opened_at: '2026-03-10T12:00:00.000Z',
          last_message_at: '2026-03-10T12:00:00.000Z',
          closed_at: null,
          close_reason: null,
          user_channel_id: '123',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'Example',
          phone_normalized: '+79990001122',
        }],
        rowCount: 1,
      } as DbQueryResult);

    const draft = await getActiveDraftByIdentity(db, { resource: 'telegram', externalId: '123', source: 'telegram' });
    const conversation = await getOpenConversationByIdentity(db, { resource: 'telegram', externalId: '123', source: 'telegram' });

    expect(draft?.draft_text_current).toBe('hello');
    expect(conversation?.id).toBe('conv-1');

    const [draftSql] = query.mock.calls[0] ?? [];
    expect(String(draftSql)).toContain('FROM identities i');
    expect(String(draftSql)).toContain('JOIN message_drafts md');

    const [conversationSql] = query.mock.calls[1] ?? [];
    expect(String(conversationSql)).toContain('JOIN conversations c');
    expect(String(conversationSql)).toContain('c.closed_at IS NULL');
  });

  it('writes and lists conversations/messages', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult)
      .mockResolvedValueOnce({
        rows: [{
          id: 'conv-1',
          source: 'telegram',
          user_identity_id: '77',
          admin_scope: 'default',
          status: 'waiting_user',
          opened_at: '2026-03-10T12:00:00.000Z',
          last_message_at: '2026-03-10T12:01:00.000Z',
          closed_at: null,
          close_reason: null,
          user_channel_id: '123',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'Example',
          phone_normalized: '+79990001122',
          last_message_text: 'reply',
          last_sender_role: 'admin',
        }],
        rowCount: 1,
      } as DbQueryResult)
      .mockResolvedValueOnce({
        rows: [{
          id: 'conv-1',
          source: 'telegram',
          user_identity_id: '77',
          admin_scope: 'default',
          status: 'waiting_user',
          opened_at: '2026-03-10T12:00:00.000Z',
          last_message_at: '2026-03-10T12:01:00.000Z',
          closed_at: null,
          close_reason: null,
          user_channel_id: '123',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'Example',
          phone_normalized: '+79990001122',
        }],
        rowCount: 1,
      } as DbQueryResult);

    await insertConversation(db, {
      id: 'conv-1',
      source: 'telegram',
      resource: 'telegram',
      externalId: '123',
      adminScope: 'default',
      status: 'waiting_admin',
      openedAt: '2026-03-10T12:00:00.000Z',
      lastMessageAt: '2026-03-10T12:00:00.000Z',
    });
    await insertConversationMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderRole: 'user',
      text: 'hello',
      source: 'telegram',
      externalChatId: '123',
      externalMessageId: '55',
      createdAt: '2026-03-10T12:00:00.000Z',
    });
    await setConversationState(db, {
      id: 'conv-1',
      status: 'waiting_user',
      lastMessageAt: '2026-03-10T12:01:00.000Z',
    });

    const items = await listOpenConversations(db, { source: 'telegram', limit: 10 });
    const byId = await getConversationById(db, { id: 'conv-1' });

    expect(items).toHaveLength(1);
    expect(byId?.id).toBe('conv-1');

    expect(String(query.mock.calls[0]?.[0])).toContain('INSERT INTO conversations');
    expect(String(query.mock.calls[1]?.[0])).toContain('INSERT INTO conversation_messages');
    expect(String(query.mock.calls[2]?.[0])).toContain('UPDATE conversations');
    expect(String(query.mock.calls[3]?.[0])).toContain('LEFT JOIN LATERAL');
    expect(String(query.mock.calls[4]?.[0])).toContain('WHERE c.id = $1');
  });
});
