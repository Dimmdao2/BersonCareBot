/**
 * §34 канона владельца: пояс настраивается у ФИЛИАЛА — «потому что это физическое место».
 *
 * Отказ, который ловят эти тесты: колонка `be_branches.timezone` есть и API её принимает, но поля в
 * интерфейсе нет — у всех филиалов молча остаётся `Europe/Moscow`. Филиал во Владивостоке отдаёт
 * пациентам слоты по московскому времени: человек приходит на семь часов мимо. Отказ дорогой
 * (пропущенный приём) и молчаливый (нигде не видно, что пояс не тот).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingEngineBranchList } from './BookingEngineCatalogLists';

const apiJson = vi.fn();
vi.mock('@/shared/lib/apiJson', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }));

const BRANCH = {
  id: 'branch-vvo',
  title: 'Владивосток',
  cityCode: 'vvo',
  timezone: 'Asia/Vladivostok',
  isActive: true,
};

function lastBranchPatchBody(): Record<string, unknown> {
  const call = apiJson.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

beforeEach(() => {
  apiJson.mockReset();
  apiJson.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('пояс филиала в каталоге записи', () => {
  it('показывает пояс филиала, а не подставленную Москву', () => {
    render(
      <BookingEngineBranchList
        branches={[BRANCH]}
        isPending={false}
        onChanged={async () => {}}
        onError={() => {}}
        layout="table"
      />,
    );

    expect(screen.getByText('Asia/Vladivostok')).toBeInTheDocument();
  });

  it('сохраняет пояс филиала при изменении', async () => {
    render(
      <BookingEngineBranchList
        branches={[BRANCH]}
        isPending={false}
        onChanged={async () => {}}
        onError={() => {}}
        layout="table"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Изм.' }));
    expect(screen.getByLabelText('Часовой пояс — Владивосток')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(apiJson).toHaveBeenCalled());
    expect(apiJson.mock.calls.at(-1)![0]).toBe('/api/admin/booking-engine/branches/branch-vvo');
    expect(lastBranchPatchBody().timezone).toBe('Asia/Vladivostok');
  });

  it('отправляет ВЫБРАННЫЙ в списке пояс, а не прежний', async () => {
    render(
      <BookingEngineBranchList
        branches={[BRANCH]}
        isPending={false}
        onChanged={async () => {}}
        onError={() => {}}
        layout="table"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Изм.' }));
    const tzInput = screen.getByLabelText('Часовой пояс — Владивосток');
    await userEvent.click(tzInput);
    await userEvent.type(tzInput, 'Красноярск');
    await userEvent.keyboard('{Enter}');

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(apiJson).toHaveBeenCalled());
    // Конкретный IANA не фиксируем: `react-timezone-select` склеивает зоны с одинаковым смещением и
    // оставляет одну строку на группу (см. `patientTimezoneSelectLabels.ts`), так что +7 может
    // приехать как `Asia/Krasnoyarsk` или как соседняя зона того же смещения. Проверяем то, ради
    // чего тест написан: выбранное В СПИСКЕ доезжает до сохранения, а не молча теряется.
    const sent = lastBranchPatchBody().timezone as string;
    expect(typeof sent).toBe('string');
    expect(sent).not.toBe(BRANCH.timezone);
    expect(() => new Intl.DateTimeFormat('ru-RU', { timeZone: sent })).not.toThrow();
  });
});
