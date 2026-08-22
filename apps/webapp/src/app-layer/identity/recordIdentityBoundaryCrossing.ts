/**
 * D15b/7a Ш8 — четыре точки пересечения границы «личность ↔ медицина», как их видит приложение.
 *
 * План (`D15B7A_ACTOR_SUBJECT_SPLIT_SCHEME_2026-08-22.md`, раздел 4, шаг Ш8) называет четыре точки
 * и объём записи на каждой. Первая — создание связки — сюда не приходит вовсе: subject-ссылка
 * рождается ВНУТРИ `app_ext.resolve_variant_a_identity`, и акт связывания записывает та же дверь
 * журнала прямо оттуда. Здесь живут три остальные.
 *
 * Правило владельца, ради которого журнал вообще существует (§2c): «журнал имеет смысл ТОЛЬКО
 * вместе с одним правилом тревоги на аномальный объём». Само правило считает база — иначе его
 * можно было бы забыть позвать; здесь только ДОСТАВКА уже сработавшей тревоги, и она идёт в
 * существующий операторский канал (`dispatchOperatorAlert`), без новой сущности и без нового
 * конфига.
 *
 * Запись журнала НИКОГДА не роняет пользовательский сценарий: врач не должен получить 500 при
 * открытии карточки из-за аудита. Отказ уходит в лог — ровно та же дисциплина, что у
 * `writePlatformAuditLog` в путях аутентификации.
 */
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { logger } from '@/infra/logging/logger';
import {
  IDENTITY_BOUNDARY_ACTIONS,
  identitySessionRef,
  recordIdentityBoundaryCrossing,
  type IdentityBoundaryAction,
  type IdentityBoundaryAuditResult,
} from '@/infra/identityBoundaryAudit';
import { dispatchOperatorAlert } from '@/modules/operator-alerts/dispatchOperatorAlert';

const VOLUME_ALARM_TOPIC = 'identity_linkage_volume_anomaly';

/**
 * Тревога уходит в блок `account_conflicts`: это тот же класс происшествий про личности
 * (конфликты привязок, автомерж), которым операторский канал уже настроен, а не новая тема с
 * собственным переключателем.
 */
async function relayVolumeAlarm(input: {
  actorId: string;
  organizationId: string | null;
  crossings24h: number;
}): Promise<void> {
  await dispatchOperatorAlert({
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    block: 'account_conflicts',
    topic: VOLUME_ALARM_TOPIC,
    dedupKey: `${VOLUME_ALARM_TOPIC}|${input.actorId}|${new Date().toISOString().slice(0, 10)}`,
    lines: [
      'Аномальный объём обращений к медицинским данным',
      `сотрудник: ${input.actorId}`,
      `пересечений границы за сутки: ${input.crossings24h}`,
      'журнал: раздел «Журнал действий», действие identity_linkage_volume_anomaly',
    ],
  });
}

async function record(input: {
  action: IdentityBoundaryAction;
  organizationId: string | null;
  actorId: string | null;
  subjectId: string | null;
  details: { point: string; session_ref?: string; subject_count?: number };
}): Promise<IdentityBoundaryAuditResult | null> {
  let result: IdentityBoundaryAuditResult;
  try {
    result = await recordIdentityBoundaryCrossing(input);
  } catch (err) {
    logger.error(
      { err, action: input.action },
      'identity boundary crossing was not recorded',
    );
    return null;
  }
  if (result.alarmFired && input.actorId) {
    try {
      await relayVolumeAlarm({
        actorId: input.actorId,
        organizationId: input.organizationId,
        crossings24h: result.crossings24h,
      });
    } catch (err) {
      logger.error({ err, action: input.action }, 'identity linkage volume alarm was not relayed');
    }
  }
  return result;
}

/**
 * Вход — РАЗ НА СЕССИЮ, не на запрос. Ключ схлопывания считает база из непрозрачной метки сессии,
 * поэтому продление cookie, переоткрытие вкладок и любое количество запросов той же сессии второй
 * строки не создают.
 *
 * Принципал ставится явным bootstrap-ом, а не берётся окружающий: часть маршрутов входа доходит
 * сюда уже с человеческим принципалом (смена пароля, второй фактор), и тогда класс контекста
 * оказался бы `staff`/`patient` — дверь такое действие не принимает и ответила бы `42501`.
 */
export async function recordIdentitySessionStart(input: {
  userId: string;
  issuedAtSeconds: number;
}): Promise<void> {
  await runWithDbBootstrapPrincipal({ source: 'identity-boundary-audit/session-start' }, () =>
    record({
      action: IDENTITY_BOUNDARY_ACTIONS.sessionStart,
      organizationId: null,
      // «Кто» на входе — сам человек: он и актор, и субъект собственной медицинской области.
      // Второй раз тот же идентификатор в `target_id` не кладём — это были бы лишние
      // персональные данные ради ничего.
      actorId: input.userId,
      subjectId: null,
      details: {
        point: 'session_start',
        session_ref: identitySessionRef(input.userId, input.issuedAtSeconds),
      },
    }),
  );
}

/** Открытие карточки — РАЗ на пару «врач-пациент» в сутки; повторные открытия идут счётчиком. */
export async function recordPatientCardOpen(input: {
  organizationId: string;
  actorId: string;
  patientUserId: string;
}): Promise<void> {
  await record({
    action: IDENTITY_BOUNDARY_ACTIONS.patientCardOpen,
    organizationId: input.organizationId,
    actorId: input.actorId,
    subjectId: input.patientUserId,
    details: { point: 'card_open' },
  });
}

/**
 * Список — ОДНО событие на пакет, не строка на человека. В записи остаётся размер пакета, а не
 * перечень людей: пациенты клиники и так известны по её зачислениям, а список идентификаторов в
 * журнале был бы теми самыми лишними персональными данными, которых §2c велит избегать.
 */
export async function recordPatientListView(input: {
  organizationId: string;
  actorId: string;
  subjectCount: number;
}): Promise<void> {
  await record({
    action: IDENTITY_BOUNDARY_ACTIONS.patientListView,
    organizationId: input.organizationId,
    actorId: input.actorId,
    subjectId: null,
    details: { point: 'list_view', subject_count: input.subjectCount },
  });
}
