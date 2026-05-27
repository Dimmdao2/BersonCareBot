import { describe, expect, it } from 'vitest';
import { buildProgramNoteReplyState } from './programNoteReplyState.js';

describe('buildProgramNoteReplyState', () => {
  it('embeds stage item id after #pn suffix', () => {
    expect(buildProgramNoteReplyState('webapp:platform:abc', 'item-1')).toBe(
      'admin_reply:webapp:platform:abc#pn:item-1',
    );
  });
});
