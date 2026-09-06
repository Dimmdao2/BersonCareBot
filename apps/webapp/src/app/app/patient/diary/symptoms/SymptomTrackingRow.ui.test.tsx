/**
 * Ручная отметка симптома пациентом (#1095, Work3) — поведение, наблюдаемое только через UI.
 *
 * Ловит две поломки, которых не видно ни на одном слое ниже (server action по-прежнему принимает
 * и `daily` — его пишут журнал и бот, поэтому тип записи этой поверхности задаётся только здесь):
 * 1. форма снова начала отправлять `daily` (вернулся селектор типа или тип потёк из состояния) →
 *    вместо «в моменте» копится одна дневная точка, и владельческое решение «новая форма не создаёт
 *    дневных точек» молча отменено;
 * 2. после успешного сохранения не рассылается событие обновления графика → пациент видит тост
 *    «Запись сохранена», а история в той же модалке остаётся прежней, что неотличимо от потери записи.
 *
 * График и тосты подменены на границе: предмет проверки — что уходит в действие и что происходит
 * в модалке после ответа, а не рендер recharts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fakes = vi.hoisted(() => ({
  addSymptomEntry: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./actions', () => ({ addSymptomEntry: fakes.addSymptomEntry }));
vi.mock('react-hot-toast', () => ({
  default: { success: fakes.toastSuccess, error: fakes.toastError },
}));
vi.mock('@/modules/diaries/components/SymptomChart', () => ({
  SymptomChart: () => <div data-testid="symptom-chart" />,
}));

import { DIARY_SYMPTOM_ENTRY_SAVED_EVENT } from '@/modules/diaries/symptomDiaryClientEvents';
import { SymptomTrackingRow } from './SymptomTrackingRow';

const TRACKING_ID = 'tracking-knee-1095';

async function openModalAndPick(value: string) {
  const user = userEvent.setup();
  render(<SymptomTrackingRow id={TRACKING_ID} title="Боль в колене" />);
  await user.click(screen.getByRole('button', { name: /Боль в колене/ }));
  await user.click(await screen.findByRole('button', { name: value }));
  return user;
}

describe('SymptomTrackingRow: manual symptom entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.addSymptomEntry.mockResolvedValue({ ok: true });
  });

  it('submits the picked 0–10 value as an instant entry', async () => {
    const user = await openModalAndPick('6');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(fakes.addSymptomEntry).toHaveBeenCalledTimes(1));
    const sent = fakes.addSymptomEntry.mock.calls[0]![0] as FormData;
    expect(sent.get('entryType')).toBe('instant');
    expect(sent.get('value')).toBe('6');
    expect(sent.get('trackingId')).toBe(TRACKING_ID);
  });

  it('announces the saved entry so the open chart refetches, and stays in the same modal', async () => {
    const saved = vi.fn();
    window.addEventListener(DIARY_SYMPTOM_ENTRY_SAVED_EVENT, saved);
    try {
      const user = await openModalAndPick('4');

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
      expect(fakes.toastSuccess).toHaveBeenCalledWith('Запись сохранена');
      expect(screen.getByTestId('symptom-chart')).toBeInTheDocument();
    } finally {
      window.removeEventListener(DIARY_SYMPTOM_ENTRY_SAVED_EVENT, saved);
    }
  });
});
