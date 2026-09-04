import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleWorkTab } from './ScheduleWorkTab';

const apiJson = vi.fn();

vi.mock('@/app/app/settings/bookingSoloAdminApi', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/app/app/settings/bookingSoloAdminApi',
  );
  return { ...actual, apiJson: (...args: unknown[]) => apiJson(...args) };
});

vi.mock('../doctorScheduleApi', () => ({
  fetchDoctorScheduleBootstrap: async () => ({
    specialistId: 'spec-1',
    branches: [
      { id: 'b1', title: 'Санкт-Петербург', shortTitle: 'СПб', color: '#2563eb', isActive: true },
    ],
  }),
}));

/**
 * WORK-08: у сохранённого недельного шаблона путь редактирования прямой — тап по плашке дня
 * недели ведёт к его же сохранению, без промежуточного выбора дат и «Применить». Проверяется
 * контракт состояния и мутации; внешний вид плашек и ячеек принимается живой проверкой.
 */
describe('ScheduleWorkTab weekly template path', () => {
  it('saves the weekday template straight from its plate, without an intermediate apply', async () => {
    apiJson.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/doctor/booking-engine/working-hours')) {
        return {
          ok: true,
          rows: [
            {
              id: 'wh-1',
              weekday: 1,
              startMinute: 720,
              endMinute: 1140,
              isActive: true,
              branchId: 'b1',
            },
          ],
        };
      }
      if (url.startsWith('/api/doctor/booking-engine/working-days')) return { ok: true, rows: [] };
      return { ok: true, rows: [] };
    });

    render(
      <ScheduleWorkTab
        deepLinkParams={{ month: '2026-09' }}
        onDeepLinkChange={() => {}}
        isActive
        scheduleScopeBootstrap={
          { canSeeAllSpecialists: false, specialists: [], ownSpecialistId: 'spec-1' } as never
        }
        paymentsVisible={false}
        paymentsReadOnly
        notificationTemplatesVisible={false}
        packagesVisible={false}
        packagesReadOnly
        doctorStatisticsEnabled={false}
      />,
    );

    // Ждём, пока недельный шаблон реально доехал в состояние таба: путь WORK-08 существует
    // только для дня недели с сохранённым шаблоном.
    await waitFor(() => expect(screen.getByTestId('weekday-template-summary-1')).toBeTruthy());

    fireEvent.click(screen.getByTestId('weekday-header-1'));
    await waitFor(() => expect(screen.getByTestId('weekday-btn-save')).toBeTruthy());

    apiJson.mockClear();
    fireEvent.click(screen.getByTestId('weekday-btn-save'));
    await waitFor(() => {
      const post = apiJson.mock.calls.find(
        ([, init]) => (init as { method?: string } | undefined)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        weekday: 1,
        startMinute: 720,
        endMinute: 1140,
        replace: true,
        branchId: 'b1',
      });
    });
    await waitFor(() => expect(screen.queryByTestId('weekday-btn-save')).toBeNull());
  });
});
