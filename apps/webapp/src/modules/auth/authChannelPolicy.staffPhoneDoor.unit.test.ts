/**
 * Запрет канона нельзя снять тумблером админки.
 *
 * Канон дверей (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, таблица «Дверь | Способы входа»)
 * даёт специалисту и админу клиники «почта + пароль + код или 2FA», глобальному админу — «почта +
 * пароль». Телефонного кода в их наборе нет. До 16.09 дверь телефона спрашивала только записанный
 * переключатель поверхности, поэтому включённый `auth_surface_staff_sms_enabled` молча превращал
 * SMS в полноценную замену пароля сотрудника: `phone/start` отправлял код, `phone/confirm` выдавал
 * рабочую сессию врача, пароль не спрашивался ни разу.
 *
 * Оракул проверяет само правило, а не его текущую настройку: при записанном `true` сотрудничьи и
 * админские поверхности обязаны отвечать отказом, а пациентская — по-прежнему пускать. Владелец
 * 16.09: «для терапиго оно доступно а для тераписто и админ.тераписто - нет».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  headers: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
}));
vi.mock('next/headers', () => ({ headers: fakes.headers }));

const { isAuthChannelEnabled } = await import('./authChannelPolicy');

describe('состав двери задаётся кодом только для сотрудников', () => {
  beforeEach(() => {
    fakes.getPublicRuntimeBool.mockReset();
    fakes.headers.mockReset();
    // Настройка говорит «включено» для любой двери — именно этот случай и проверяем.
    fakes.getPublicRuntimeBool.mockResolvedValue(true);
  });

  it('не пускает сотрудника email-кодом или телефонным каналом при любых записанных значениях', async () => {
    for (const surface of ['staff', 'platform_admin'] as const) {
      for (const channel of ['email', 'sms', 'telegram', 'max'] as const) {
        await expect(isAuthChannelEnabled(channel, surface)).resolves.toBe(false);
      }
    }
    expect(fakes.getPublicRuntimeBool).not.toHaveBeenCalled();
  });

  it('сохраняет для пациента выбор каналов записанными переключателями', async () => {
    for (const enabled of [false, true]) {
      fakes.getPublicRuntimeBool.mockResolvedValue(enabled);
      for (const channel of ['email', 'sms', 'telegram', 'max'] as const) {
        await expect(isAuthChannelEnabled(channel, 'patient')).resolves.toBe(enabled);
        expect(fakes.getPublicRuntimeBool).toHaveBeenLastCalledWith(
          `auth_surface_patient_${channel}_enabled`,
          'public_auth_config',
        );
      }
    }
  });
});
