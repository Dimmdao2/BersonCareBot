/**
 * §34 канона владельца: пояс человека определяется устройством и НЕ настраивается руками.
 *
 * Отказ, который ловит этот тест: сняли селектор пояса из профиля пациента и вместе с ним сломали
 * ОПРЕДЕЛЕНИЕ — у нового пациента `calendar_timezone` остаётся пустым навсегда, и напоминания с
 * календарём молча считаются по поясу приложения, а не по его собственному. Отказ дорогой (человек
 * получает напоминания не в своё время) и молчаливый (ни ошибки, ни экрана).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const syncFromDevice = vi.fn(async () => {});
const getIanaForUser = vi.fn(async () => 'Asia/Novosibirsk' as string | null);
const guard = vi.fn();

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientCalendarTimezone: { getIanaForUser, syncFromDevice } }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: () => guard(),
}));

const SESSION = { ok: true, session: { user: { userId: 'user-1' } } };

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue(SESSION);
});

describe('/api/patient/profile/calendar-timezone', () => {
  it('пишет определённый браузером пояс через «только если пусто»', async () => {
    const route = await import('./calendar-timezone/route');
    const res = await route.POST(
      new Request('http://localhost/api/patient/profile/calendar-timezone', {
        method: 'POST',
        body: JSON.stringify({ browserCalendarIana: 'Asia/Novosibirsk' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(syncFromDevice).toHaveBeenCalledWith('user-1', 'Asia/Novosibirsk');
  });

  it('возвращает сохранённый пояс на чтение', async () => {
    const route = await import('./calendar-timezone/route');
    const res = await route.GET();

    expect(await res.json()).toEqual({ ok: true, calendarTimezone: 'Asia/Novosibirsk' });
  });

  /**
   * Защита от отката (§10a, ступень 3): ручная дверь «поставить пациенту произвольный пояс» — это и
   * есть тот контрол, который §34 снимает. Проверка снимается, если владелец отменит §34.
   */
  it('не даёт ручной двери для установки пояса', async () => {
    const route = (await import('./calendar-timezone/route')) as Record<string, unknown>;
    expect(route.PATCH).toBeUndefined();
    expect(route.PUT).toBeUndefined();
  });
});
