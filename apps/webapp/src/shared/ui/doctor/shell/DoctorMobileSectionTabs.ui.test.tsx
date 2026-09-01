import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorMobileSectionTabs } from './DoctorMobileSectionTabs';

afterEach(cleanup);

describe('DoctorMobileSectionTabs', () => {
  it('uses the same attention badge appearance for active and inactive tabs', () => {
    render(
      <DoctorMobileSectionTabs
        tabs={[
          { id: 'chats', label: 'Чаты', badge: 1 },
          { id: 'comments', label: 'Комментарии', badge: 21 },
        ]}
        activeTab="chats"
        onTabChange={vi.fn()}
        ariaLabel="Разделы коммуникаций"
      />,
    );

    const activeBadge = screen
      .getByRole('button', { name: /Чаты/ })
      .querySelector('span[aria-hidden]');
    const inactiveBadge = screen
      .getByRole('button', { name: /Комментарии/ })
      .querySelector('span[aria-hidden]');

    expect(activeBadge).not.toBeNull();
    expect(inactiveBadge).not.toBeNull();
    expect(activeBadge?.className).toBe(inactiveBadge?.className);
  });
});
