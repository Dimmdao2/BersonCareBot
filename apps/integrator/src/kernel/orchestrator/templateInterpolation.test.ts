import { describe, expect, it } from 'vitest';
import { interpolateTemplate } from './templateInterpolation.js';

describe('interpolateTemplate', () => {
  it('preserves unresolved values.* at plan build time', () => {
    const out = interpolateTemplate(
      { state: '{{values.programNoteReplyState}}', userId: '{{values.reminderUserId}}' },
      { actor: { channelUserId: '1' } },
      { preserveUnresolvedValues: true },
    ) as Record<string, unknown>;
    expect(out.state).toBe('{{values.programNoteReplyState}}');
    expect(out.userId).toBe('{{values.reminderUserId}}');
  });

  it('resolves values.* at runtime when present in vars', () => {
    const out = interpolateTemplate(
      { state: '{{values.programNoteReplyState}}' },
      { values: { programNoteReplyState: 'admin_reply:webapp:platform:u#pn:1' } },
    ) as Record<string, unknown>;
    expect(out.state).toBe('admin_reply:webapp:platform:u#pn:1');
  });
});
