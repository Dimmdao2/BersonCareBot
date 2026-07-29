import { describe, expect, it, vi } from 'vitest';
import { enrichMessengerBindAuditDetailsFields } from '@bersoncare/platform-merge';

describe('enrichMessengerBindAuditDetailsFields', () => {
  it('resolves the Telegram display hint from canonical identity state, not telegram_users', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ platform_user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ username: null, fullName: 'Alice Example' }] });

    const result = await enrichMessengerBindAuditDetailsFields(
      { query } as never,
      {
        reason: 'channel_already_bound_to_other_user',
        candidateIds: [],
        channelCode: 'telegram',
        externalId: '123456',
      },
    );

    expect(result.initiator?.messengerDisplayHint).toBe('Alice Example');
    const displayHintSql = String(query.mock.calls[1]?.[0]);
    expect(displayHintSql).toContain('FROM integrator.identities i');
    expect(displayHintSql).toContain('integrator.telegram_state ts');
    expect(displayHintSql).not.toContain('telegram_users');
  });
});
