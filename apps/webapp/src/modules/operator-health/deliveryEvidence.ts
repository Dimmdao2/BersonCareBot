/**
 * Позитивное доказательство доставки для сводки (design D-d).
 *
 * «Зелёный» обязан означать НАЛИЧИЕ доказательства, а не отсутствие записей об ошибках.
 * В июле сводка сутки рапортовала зелёное именно потому, что «ошибок не залогировано»
 * считалось успехом. Это тот же класс, что GitHub 2022-09-28: «алерты следили за долей
 * ошибок, но не алертили на отсутствие трафика вообще».
 *
 * Сводка обязана нести три числа:
 *  1. количество ПОДТВЕРЖДЁННЫХ доставок за окно;
 *  2. метку времени последней подтверждённой доставки;
 *  3. возраст самой старой неотправленной позиции.
 *
 * Возраст, а не глубина очереди, — по Amazon Builders' Library: «мы больше смотрим на
 * возраст… информация из DLQ пришла бы слишком поздно».
 */

/** Порог D-f: старше этого неотправленная позиция — самостоятельный алерт. */
export const OLDEST_UNSENT_ALERT_SECONDS = 15 * 60;

/** Окно, за которое считаются подтверждённые доставки для сводки. */
export const DELIVERY_EVIDENCE_WINDOW_HOURS = 24;

export type DeliveryEvidence = {
  /** Подтверждённых доставок за `DELIVERY_EVIDENCE_WINDOW_HOURS` (строки со статусом `sent`). */
  confirmedDeliveries: number;
  /** ISO последней подтверждённой доставки — или `null`, если её не было никогда. */
  lastConfirmedDeliveryAt: string | null;
  /** Возраст самой старой неотправленной (due) позиции, сек. `null` — очередь пуста. */
  oldestUnsentAgeSeconds: number | null;
};

export function formatAgeRu(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч`;
  return `${Math.floor(hours / 24)} сут`;
}

/** Возраст самой старой неотправленной позиции перешёл порог алерта. */
export function isOldestUnsentOverThreshold(
  evidence: Pick<DeliveryEvidence, 'oldestUnsentAgeSeconds'>,
  thresholdSeconds: number = OLDEST_UNSENT_ALERT_SECONDS,
): boolean {
  const age = evidence.oldestUnsentAgeSeconds;
  return typeof age === 'number' && age > thresholdSeconds;
}

/**
 * Есть ли позитивное доказательство, что канал доставки жив.
 *
 * Ноль подтверждённых доставок сам по себе не отказ (бывает тихий день), но он ПЕРЕСТАЁТ
 * быть безобидным, как только в очереди есть что-то неотправленное: значит, работа была,
 * а подтверждений нет.
 */
export function hasPositiveDeliveryEvidence(evidence: DeliveryEvidence): boolean {
  if (evidence.confirmedDeliveries > 0) return true;
  return !isOldestUnsentOverThreshold(evidence);
}

/**
 * Строки сводки. Они печатаются ВСЕГДА, в том числе в зелёной сводке, — иначе «всё в порядке»
 * снова становится утверждением без доказательства.
 */
export function buildDeliveryEvidenceLines(evidence: DeliveryEvidence): string[] {
  const lines: string[] = [];
  lines.push(
    `Подтверждённых доставок за ${DELIVERY_EVIDENCE_WINDOW_HOURS} ч: ${evidence.confirmedDeliveries}`,
  );
  lines.push(
    evidence.lastConfirmedDeliveryAt
      ? `Последняя подтверждённая доставка: ${evidence.lastConfirmedDeliveryAt}`
      : 'Последняя подтверждённая доставка: НИКОГДА',
  );
  if (evidence.oldestUnsentAgeSeconds == null) {
    lines.push('Самая старая неотправленная позиция: нет');
  } else {
    const over = isOldestUnsentOverThreshold(evidence) ? ' (выше порога)' : '';
    lines.push(
      `Самая старая неотправленная позиция: ${formatAgeRu(evidence.oldestUnsentAgeSeconds)}${over}`,
    );
  }
  return lines;
}
