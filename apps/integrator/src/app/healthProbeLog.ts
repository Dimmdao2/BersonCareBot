/**
 * Что писать в журнал о проверках `/health`.
 *
 * Проверку дёргает docker каждые 10 секунд, и fastify по умолчанию писал по строке на каждый
 * запрос: 8640 строк в сутки на одном контейнере — половина всего журнала хоста (замер 14.09.2026).
 * В таком журнале настоящий отказ найти нельзя, он тонет.
 *
 * Молчать совсем тоже нельзя — тогда тишина значит и «всё хорошо», и «всё настолько плохо, что
 * даже отказ не записался». Решение владельца 14.09, дословно: «мы просто должны видеть, что минуту
 * назад всё было хорошо. Если вдруг последняя хорошо записана десять минут назад, значит, уже
 * что-то нехорошо».
 *
 * Поэтому строка пишется раз в минуту — и ещё немедленно в момент СМЕНЫ состояния, в обе стороны.
 * Минутный ритм сам по себе доказывает, что опрос жив: свежая строка = минуту назад было хорошо,
 * строка десятиминутной давности = что-то уже не так, независимо от того, что в ней написано.
 * 1440 строк в сутки вместо 8640, и каждая из них что-то значит.
 *
 * Ритм задан САМОЙ проверкой: `interval: 60s` в docker-compose. Здесь стоит только нижний порог —
 * он держит минутный ритм, если шаг проверки когда-нибудь снова опустят, и не съедает строку из-за
 * того, что docker пришёл на доли секунды раньше круглой минуты.
 */

export type HealthProbeState = 'ok' | 'db_down';

/** Нижний порог между строками. Проверка приходит раз в минуту, значит пишется каждая. */
export const HEALTH_PROBE_LOG_MIN_GAP_MS = 30 * 1000;

export type HealthProbeWindow = {
  /** Состояние, с которым писали прошлую строку. `null` — не писали ещё ни разу. */
  state: HealthProbeState | null;
  /** Момент прошлой записи. */
  loggedAtMs: number;
};

export type HealthProbeLogDecision = {
  window: HealthProbeWindow;
} & (
  | { log: false }
  | {
      log: true;
      reason: 'first' | 'state_changed' | 'tick';
      state: HealthProbeState;
      previous: HealthProbeState | null;
    }
);

export function emptyHealthProbeWindow(): HealthProbeWindow {
  return { state: null, loggedAtMs: 0 };
}

/**
 * Чистое решение «писать или нет» — без часов и без логгера, чтобы поведение проверялось тестом,
 * а не наблюдением за живым сервисом.
 */
export function decideHealthProbeLog(
  window: HealthProbeWindow,
  state: HealthProbeState,
  nowMs: number,
  minGapMs: number = HEALTH_PROBE_LOG_MIN_GAP_MS,
): HealthProbeLogDecision {
  const reason: 'first' | 'state_changed' | 'tick' | null =
    window.state === null
      ? 'first'
      : state !== window.state
        ? 'state_changed'
        : nowMs - window.loggedAtMs >= minGapMs
          ? 'tick'
          : null;

  if (reason === null) return { log: false, window };

  return {
    log: true,
    reason,
    state,
    previous: window.state,
    window: { state, loggedAtMs: nowMs },
  };
}
