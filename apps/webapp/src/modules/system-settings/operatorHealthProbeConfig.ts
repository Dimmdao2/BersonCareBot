export const OPERATOR_HEALTH_PROBE_CONFIG_KEY = 'operator_health_probe_config';

/**
 * Владелец 27.07, дословно: «ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ 2 часа» · «ПОТОЛОК - 24 часа».
 * Два разных числа, их легко перепутать (лид перепутал):
 *  - DEFAULT_DURATION — что подставляется в поле, когда оператор глушит алерты руками;
 *  - MAX_DURATION — предел, выше которого форма и сервер не дают поставить вообще.
 */
export const OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1_000;
export const OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS = 24 * 60 * 60 * 1_000;

export const OPERATOR_HEALTH_PROBE_DEFAULT_VALUE = {
  max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  telegram: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  google_calendar: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  /** Settings only: the IMAP round-trip probe itself is intentionally not implemented in this slice. */
  email: {
    intervalMs: 900_000,
    timeoutMs: 60_000,
    roundTripDeadlineMs: 300_000,
    retentionMs: 7 * 24 * 60 * 60 * 1_000,
    cleanupIntervalMs: 24 * 60 * 60 * 1_000,
  },
  quietWindowMaxDurationMs: OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS,
  quietUntil: null,
} as const;

const PROBE_NAMES = ['max', 'telegram', 'google_calendar'] as const;
const QUIET_WINDOW_CAP_MIN_MS = 60_000;
const QUIET_WINDOW_CAP_MAX_MS = OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS;

function formatDurationHours(durationMs: number): string {
  const hours = durationMs / (60 * 60 * 1_000);
  return Number.isInteger(hours) ? `${hours} hours` : `${durationMs} ms`;
}

/**
 * Authored validation refusal for this setting. S4 (owner plan
 * `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, wave 03.09) requires the admin
 * screen to keep seeing *these* sentences while never seeing an unknown internal failure. A plain
 * `Error` cannot tell the two apart at the route; a dedicated class can, exactly as
 * `InPersonBookingResolveError` already does for the booking family.
 */
export class OperatorHealthProbeConfigInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorHealthProbeConfigInvalidError';
  }
}

/** Reject unsafe admin input; callers must never silently clamp probe cadence or timeouts. */
export function assertOperatorHealthProbeConfig(valueJson: unknown, now = new Date()): void {
  const value =
    valueJson && typeof valueJson === 'object' && 'value' in valueJson
      ? (valueJson as { value: unknown }).value
      : valueJson;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OperatorHealthProbeConfigInvalidError('operator_health_probe_config must be an object');
  }
  const config = value as Record<string, unknown>;
  for (const name of PROBE_NAMES) {
    const probe = config[name];
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
      throw new OperatorHealthProbeConfigInvalidError(`operator_health_probe_config.${name} is required`);
    }
    const p = probe as Record<string, unknown>;
    if (typeof p.enabled !== 'boolean')
      throw new OperatorHealthProbeConfigInvalidError(`Проба ${name}: укажите, включена она или выключена, и сохраните снова.`);
    const timeoutMs = p.timeoutMs;
    if (
      typeof timeoutMs !== 'number' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 60_000
    ) {
      throw new OperatorHealthProbeConfigInvalidError(
        `Таймаут пробы ${name} должен быть от 1 до 60 секунд: меньше создаёт ложные сбои и нагрузку на провайдера. Исправьте таймаут и сохраните снова.`,
      );
    }
    const intervalMs = p.intervalMs;
    if (
      typeof intervalMs !== 'number' ||
      !Number.isInteger(intervalMs) ||
      intervalMs < 300_000 ||
      intervalMs > 3_600_000
    ) {
      throw new OperatorHealthProbeConfigInvalidError(
        `Период пробы ${name} должен быть от 5 до 60 минут: более частые запросы могут перегрузить провайдера. Увеличьте период и сохраните снова.`,
      );
    }
    const consecutiveFailures = p.consecutiveFailures;
    if (
      typeof consecutiveFailures !== 'number' ||
      !Number.isInteger(consecutiveFailures) ||
      consecutiveFailures < 2 ||
      consecutiveFailures > 10
    ) {
      throw new OperatorHealthProbeConfigInvalidError(
        `Порог пробы ${name} должен быть от 2 до 10 подряд: тревога требует подтверждённых сбоев. Исправьте порог и сохраните снова.`,
      );
    }
  }
  const email = config.email;
  if (!email || typeof email !== 'object' || Array.isArray(email)) {
    throw new OperatorHealthProbeConfigInvalidError('Настройки почтовой пробы обязательны. Заполните их и сохраните снова.');
  }
  const mail = email as Record<string, unknown>;
  const assertRange = (key: string, min: number, max: number, label: string) => {
    const candidate = mail[key];
    if (
      typeof candidate !== 'number' ||
      !Number.isInteger(candidate) ||
      candidate < min ||
      candidate > max
    ) {
      throw new OperatorHealthProbeConfigInvalidError(
        `${label} должен быть от ${min / 60_000} до ${max / 60_000} минут. Исправьте значение и сохраните снова.`,
      );
    }
  };
  assertRange('intervalMs', 300_000, 3_600_000, 'Период почтовой пробы');
  assertRange('timeoutMs', 30_000, 120_000, 'Таймаут почтовой пробы');
  assertRange('roundTripDeadlineMs', 60_000, 900_000, 'Дедлайн доставки письма');
  assertRange('retentionMs', 86_400_000, 30 * 86_400_000, 'Срок хранения служебной почты');
  assertRange('cleanupIntervalMs', 86_400_000, 7 * 86_400_000, 'Период очистки служебной почты');
  const quietWindowMaxDurationMs =
    config.quietWindowMaxDurationMs ?? OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS;
  if (
    !Number.isInteger(quietWindowMaxDurationMs) ||
    (quietWindowMaxDurationMs as number) < QUIET_WINDOW_CAP_MIN_MS ||
    (quietWindowMaxDurationMs as number) > QUIET_WINDOW_CAP_MAX_MS
  ) {
    throw new OperatorHealthProbeConfigInvalidError(
      `operator_health_probe_config.quietWindowMaxDurationMs must be ${QUIET_WINDOW_CAP_MIN_MS}–${QUIET_WINDOW_CAP_MAX_MS} ms; the maintenance-window cap must remain bounded`,
    );
  }
  if (
    config.quietUntil !== null &&
    (typeof config.quietUntil !== 'string' || Number.isNaN(Date.parse(config.quietUntil)))
  ) {
    throw new OperatorHealthProbeConfigInvalidError(
      'Окно тишины должно быть корректной датой или пустым. Исправьте дату и сохраните снова.',
    );
  }
  if (
    typeof config.quietUntil === 'string' &&
    Date.parse(config.quietUntil) - now.getTime() > (quietWindowMaxDurationMs as number)
  ) {
    throw new OperatorHealthProbeConfigInvalidError(
      `operator_health_probe_config.quietUntil exceeds the configured maintenance-window limit of ${formatDurationHours(quietWindowMaxDurationMs as number)}; longer quiet windows can indefinitely silence mandatory probes`,
    );
  }
}
