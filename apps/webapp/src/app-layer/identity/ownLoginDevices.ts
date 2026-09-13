/**
 * Устройства, с которых человек входил В СВОЮ учётную запись (#1112).
 *
 * Загрузка живёт здесь, а не на экране, потому что экранов два и они в разных кабинетах: админ
 * платформы (`/app/admin/security`) и специалист (`/app/account`, вкладка «Безопасность»). Решение
 * владельца о порядке раскатки — сначала админ, потом специалист — иначе разъехалось бы в две копии
 * одного отображения, и правило «не обещать человеку того, чего нет» пришлось бы держать дважды.
 *
 * ⛔ Только СВОИ входы, и идентификатор сюда не передаётся вовсе: чьи устройства вернутся, решает
 * принятый контекст сессии на стороне базы (дверь `app.list_own_login_devices()`). Чужие входы
 * разбираются на отдельном экране, куда ведёт журнал операций.
 */
import { listUserLoginDevices } from '@/infra/userLoginEventsRead';
import { logger } from '@/infra/logging/logger';

export type OwnLoginDevice = {
  key: string;
  /** true — устройство опознано меткой; false — только по строке браузера, то есть приблизительно. */
  identifiedByMarker: boolean;
  lastSeenAt: string;
  loginCount: number;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  method: string | null;
  countries: string[];
};

export type OwnLoginDevicesView = {
  devices: OwnLoginDevice[];
  /** Журнал не ответил. Экран обязан остаться живым: соседние разделы безопасности важнее списка. */
  loadFailed: boolean;
};

export async function loadOwnLoginDevices(): Promise<OwnLoginDevicesView> {
  try {
    const rows = await listUserLoginDevices();
    return {
      devices: rows.map((row) => ({
        key: row.group_key,
        identifiedByMarker: row.device_id != null,
        lastSeenAt: row.last_seen_at.toISOString(),
        loginCount: Number(row.login_count),
        deviceKind: row.device_kind,
        os: row.os,
        browser: row.browser,
        method: row.method,
        countries: row.countries ?? [],
      })),
      loadFailed: false,
    };
  } catch (err) {
    // `reason` дублирует текст ошибки строкой намеренно: логгер сериализует `err` как
    // `{"type":"Error"}` и текст теряет, из-за чего отказ виден в журнале, но неразбираем.
    logger.error({ err, reason: String(err) }, '[login-devices] device list unavailable');
    return { devices: [], loadFailed: true };
  }
}
