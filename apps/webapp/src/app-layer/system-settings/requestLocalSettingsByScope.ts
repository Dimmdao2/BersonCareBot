import { cache } from 'react';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { SystemSetting, SystemSettingScope } from '@/modules/system-settings/types';

type SettingsByScopeReader = {
  listSettingsByScope(
    scope: SystemSettingScope,
    options?: { organizationId?: string | null },
  ): Promise<SystemSetting[]>;
};

/**
 * Один список настроек области на запрос вместо одного на загрузчик.
 *
 * Зачем. `listSettingsByScope` — это ДВА чтения: legacy `system_settings` и авторитетный
 * `app_runtime_settings`. Один рендер `/app/doctor/schedule` спрашивал ровно один и тот же
 * список (`scope='doctor'`, та же клиника) дважды — из `loadDoctorWorkspaceShell` и из
 * `loadDoctorScheduleCalendarBootstrap`, — то есть четыре port-транзакции вместо двух, каждая с
 * установкой и снятием контекста. То же удвоение есть на `/app/account` и на странице настроек.
 *
 * Почему обёртка сервиса, а не мемо у загрузчика. Спрашивающих у этого чтения много (страницы
 * врача, аккаунт, настройки, API-роуты), и мемо у одного из них оставило бы остальных мимо.
 * Память живёт в ЕДИНСТВЕННОЙ точке — в сервисе, и её получают все потребители сразу.
 *
 * Почему не может протечь между арендаторами и принципалами. Ключ — полная тройка
 * (принципал, scope, organizationId). `organizationId` разделяет клиники; `principalKey`
 * разделяет роль и субъект, от которых зависит, что вообще видно спрашивающему под RLS.
 * Смена принципала внутри запроса даёт другой ключ и новое обращение к базе, а не чужой ответ.
 *
 * Почему НЕ кэш между запросами. Настройку меняет админ клиники, и следующий запрос обязан
 * увидеть новое значение. `react.cache` живёт ровно один серверный запрос. Записи (`upsert`,
 * `persistAdminModesBatch`) идут мимо этой памяти и в пределах своего запроса не перечитывают
 * список: PATCH возвращает результат собственной записи, а не повторное чтение.
 */
export function settingsByScopeMemoKey(
  scope: SystemSettingScope,
  organizationId: string | null,
): string {
  const principal = getCurrentDbPrincipal();
  const principalKey = principal
    ? [
        principal.kind,
        'organizationId' in principal ? (principal.organizationId ?? '') : '',
        'platformUserId' in principal ? (principal.platformUserId ?? '') : '',
      ].join(':')
    : 'none';
  return [principalKey, scope, organizationId ?? ''].join(' ');
}

export function wrapSystemSettingsServiceWithRequestLocalScopeReads<S extends SettingsByScopeReader>(
  service: S,
): S {
  const listOnce = cache(
    (
      _memoKey: string,
      scope: SystemSettingScope,
      organizationId: string | null,
    ): Promise<SystemSetting[]> =>
      service.listSettingsByScope(
        scope,
        organizationId === null ? { organizationId: null } : { organizationId },
      ),
  );
  return {
    ...service,
    listSettingsByScope: (
      scope: SystemSettingScope,
      options?: { organizationId?: string | null },
    ) => {
      const organizationId = options?.organizationId?.trim() || null;
      return listOnce(settingsByScopeMemoKey(scope, organizationId), scope, organizationId);
    },
  };
}
