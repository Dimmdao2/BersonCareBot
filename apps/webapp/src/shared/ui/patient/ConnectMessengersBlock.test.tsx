/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectMessengersBlock } from './ConnectMessengersBlock';
import type { ChannelCard } from '@/modules/channel-preferences/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const cards: ChannelCard[] = [
  {
    code: 'telegram',
    title: 'Telegram',
    openUrl: 'https://t.me/test',
    isLinked: false,
    isImplemented: true,
    isEnabledForMessages: true,
    isEnabledForNotifications: true,
  },
  {
    code: 'max',
    title: 'MAX',
    openUrl: 'https://max.ru/test',
    isLinked: false,
    isImplemented: true,
    isEnabledForMessages: true,
    isEnabledForNotifications: true,
  },
];

describe('ConnectMessengersBlock', () => {
  it('shows only channels enabled by the platform policy', () => {
    render(
      <ConnectMessengersBlock
        channelCards={cards}
        channelPolicy={{ email: true, sms: false, telegram: true, max: false }}
      />,
    );
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    expect(screen.queryByText('MAX')).not.toBeInTheDocument();
  });
});
