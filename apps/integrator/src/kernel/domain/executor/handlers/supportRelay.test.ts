import { describe, expect, it, vi } from 'vitest';
import type { Action, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import { handleConversationUserMessage } from './supportRelay.js';

const baseCtx = (): DomainContext => ({
  event: {
    type: 'webhook.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-04-02T12:00:00.000Z',
      source: 'telegram',
    },
    payload: {},
  },
  nowIso: '2026-04-02T12:00:00.000Z',
  values: {},
  base: {
    actor: { isAdmin: false },
    identityLinks: [],
    conversationState: 'waiting_skip_reason:occ-123',
  },
});

describe('handleConversationUserMessage', () => {
  it('does not relay user text to admin when collecting skip reason (S3.T07)', async () => {
    const readDb = vi.fn();
    const action: Action = {
      id: 'a-skip-guard',
      type: 'conversation.user.message',
      mode: 'sync',
      params: { source: 'telegram', text: 'my private skip reason' },
    };
    const deps = { readPort: { readDb } } as unknown as ExecutorDeps;
    const res = await handleConversationUserMessage(action, baseCtx(), deps);
    expect(res.status).toBe('skipped');
    expect(res.error).toBe('CONVERSATION_USER_BLOCKED_SKIP_REASON');
    expect(readDb).not.toHaveBeenCalled();
  });
});
