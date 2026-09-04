import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DoctorConversationListRow } from './DoctorConversationListRow';

afterEach(cleanup);

const conversation = {
  conversationId: 'conversation-1',
  displayName: 'Берсон Дмитрий Юрьевич',
  firstName: 'Дмитрий',
  lastName: 'Берсон',
  lastMessageAt: '2026-08-31T18:14:00.000Z',
  lastMessageText: 'Нужна помощь',
  lastSenderRole: 'user',
  unreadFromUserCount: 1,
};

describe('DoctorConversationListRow', () => {
  it('labels only the doctor as the sender in the message preview', () => {
    render(
      <DoctorConversationListRow conversation={{ ...conversation, lastSenderRole: 'admin' }} />,
    );

    expect(screen.getByRole('button')).toHaveTextContent('Вы: Нужна помощь');
  });
});
