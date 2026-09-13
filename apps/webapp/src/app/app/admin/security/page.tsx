/**
 * `/app/admin/security` — «Безопасность» админа платформы: с каких устройств входили в ЕГО учётную
 * запись (#1112, этап Л-6в).
 *
 * Решение владельца 13.09 о порядке раскатки, дословно: «для начала для админа, наверное, имеет
 * смысл сделать и посмотреть, как это будет работать. Для специалист, когда поймём, что всё
 * работает, тогда уже там можно выкладывать, там, и решать уже делать это для пациентов или нет».
 * Поэтому экран сейчас ровно один и только здесь.
 *
 * ⛔ Это НЕ список активных сессий, и называть его так нельзя. Сессии у нас не пронумерованы
 * (см. `docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md`, вариант B): узнать, жива ли каждая
 * из них, и погасить ОДНУ мы не можем. Можем показать устройства, с которых входили, и погасить
 * ВСЕ сессии разом. Обещать человеку кнопку, которой нет, — хуже, чем её отсутствие.
 *
 * Показываются только СВОИ входы: `session.user.userId`. Чужие разбираются на экране входов, и
 * туда ведёт отдельный путь из журнала операций.
 */
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { listUserLoginDevices } from '@/app-layer/admin/loginHistory';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { logger } from '@/infra/logging/logger';
import { AdminSecurityClient, type SecurityDevice } from './AdminSecurityClient';

export default async function AdminSecurityPage() {
  const session = await requirePlatformOperationsPage();

  let devices: SecurityDevice[] = [];
  let loadFailed = false;
  try {
    const rows = await listUserLoginDevices(session.user.userId);
    devices = rows.map((row) => ({
      key: row.group_key,
      identifiedByMarker: row.device_id != null,
      lastSeenAt: row.last_seen_at.toISOString(),
      loginCount: Number(row.login_count),
      deviceKind: row.device_kind,
      os: row.os,
      browser: row.browser,
      method: row.method,
      countries: row.countries ?? [],
    }));
  } catch (err) {
    // Экран безопасности не должен падать целиком из-за журнала: кнопка «выйти со всех устройств»
    // важнее списка и обязана остаться доступной.
    // `reason` дублирует текст ошибки строкой намеренно: логгер сериализует `err` как `{"type":"Error"}`
    // и текст теряется, из-за чего отказ этого экрана виден в журнале, но неразбираем.
    logger.error({ err, reason: String(err) }, '[admin-security] device list unavailable');
    loadFailed = true;
  }

  return (
    <DoctorAppShell title="Безопасность" user={session.user}>
      <DoctorPageHeader title="Безопасность" />
      <AdminSecurityClient devices={devices} loadFailed={loadFailed} />
    </DoctorAppShell>
  );
}
