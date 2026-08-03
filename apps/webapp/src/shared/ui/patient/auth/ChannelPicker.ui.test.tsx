import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelPicker } from './ChannelPicker';
import type { AuthMethodsPayload } from '@/modules/auth/checkPhoneMethods';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §3.3: "Подтвердить другим способом" показывает все configured+enabled
 * каналы независимо от того, привязан ли этот способ у введённого номера — состав списка не должен
 * зависеть от чего-то, кроме `methods` (глобальной политики). Это жёсткое требование владельца.
 */
describe('ChannelPicker — no per-account binding leak', () => {
  const allEnabled: AuthMethodsPayload = { sms: false, telegram: true, max: true, email: true };

  it('shows every globally enabled channel, not just ones a specific phone would have bound', () => {
    const onChoose = vi.fn();
    render(<ChannelPicker methods={allEnabled} onChoose={onChoose} />);

    // Primary channel button is shown for the top-priority enabled channel...
    expect(screen.getByRole('button', { name: 'Получить код в Telegram' })).toBeInTheDocument();
    // ...and the remaining globally enabled channels are reachable via "Другие способы", regardless
    // of whether the entered phone actually has them bound (methods carries no such fact at all).
    fireEvent.click(screen.getByRole('button', { name: 'Другие способы' }));
    expect(screen.getByRole('button', { name: 'Получить код в Max' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить код на email' })).toBeInTheDocument();
  });

  it('never offers SMS on the public picker regardless of policy', () => {
    const onChoose = vi.fn();
    render(
      <ChannelPicker
        methods={{ sms: true, telegram: true, max: false, email: false }}
        onChoose={onChoose}
      />,
    );
    expect(screen.queryByRole('button', { name: /SMS/i })).not.toBeInTheDocument();
  });

  it('shows nothing selectable when no channel is globally enabled, without naming a reason tied to an account', () => {
    render(
      <ChannelPicker
        methods={{ sms: false, telegram: false, max: false, email: false }}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
