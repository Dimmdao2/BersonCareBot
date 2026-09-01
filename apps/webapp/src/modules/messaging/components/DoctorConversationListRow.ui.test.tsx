import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorConversationListRow } from './DoctorConversationListRow';

afterEach(cleanup);

const conversation = {
  conversationId: 'conversation-1',
  displayName: 'Берсон Дмитрий',
  lastMessageAt: '2026-08-31T18:14:00.000Z',
  lastMessageText: 'Нужна помощь',
  lastSenderRole: 'user',
  unreadFromUserCount: 1,
};

describe('DoctorConversationListRow', () => {
  it('renders the same complete conversation row as a navigational link', () => {
    render(
      <DoctorConversationListRow
        conversation={conversation}
        displayIana="Europe/Moscow"
        href="/app/doctor/communications?conversation=conversation-1"
      />,
    );

    const row = screen.getByRole('link', { name: /Берсон Дмитрий/ });
    expect(row).toHaveAttribute('href', '/app/doctor/communications?conversation=conversation-1');
    expect(row).toHaveClass('flex');
    expect(row).not.toHaveClass('block');
    expect(row).toHaveTextContent('Берсон: Нужна помощь');
    expect(row).toHaveTextContent('1');
  });

  it('uses the same row content for the selectable communications list', () => {
    const onClick = vi.fn();
    render(<DoctorConversationListRow conversation={conversation} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Берсон Дмитрий/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
