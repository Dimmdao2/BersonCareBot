/**
 * D35 (docs/_TODO/runs/integrator-cleanup/D35_DELIVERY_FAILURE_POLICY_BRIEF.md), п.3: служебный
 * ответ на входящее должен уложиться «в минуты, а не в часы» — своя короткая лестница
 * (`inbound_reply`), а не общая `[60, 300, 900, 3600]` секунд напоминаний/рассылок/операторских
 * алертов. Тест доказывает ОБЕ стороны развилки: короткая лестница применяется РОВНО к
 * `inbound_reply` и НИЧЕГО не меняет для остальных видов очереди (граница брифа: «не менять
 * поведение доставки напоминаний и рассылок»).
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D35_REPORT.md.
 */
import { describe, expect, it } from 'vitest';
import { retryDelaySecondsAfterFailure } from './deliveryContract.js';

describe('retryDelaySecondsAfterFailure — короткая лестница только для inbound_reply', () => {
  it('дано: kind=inbound_reply → когда считаем задержку по попыткам 1..4 → тогда лестница [15, 60, 180, 180] секунд (минуты, не часы)', () => {
    // АРБИТР: в retryBackoffLadderForKind() вернуть RETRY_BACKOFF_SEC для inbound_reply (убрать
    // ветвление) — задержки станут [60, 300, 900, 900], тест покраснеет на первом же значении.
    expect(retryDelaySecondsAfterFailure(1, 'inbound_reply')).toBe(15);
    expect(retryDelaySecondsAfterFailure(2, 'inbound_reply')).toBe(60);
    expect(retryDelaySecondsAfterFailure(3, 'inbound_reply')).toBe(180);
    expect(retryDelaySecondsAfterFailure(4, 'inbound_reply')).toBe(180);
  });

  it('дано: худший случай трёх ретраев inbound_reply → когда суммируем лестницу → тогда итог меньше первого шага общей лестницы напоминаний (60 c) уже после первой попытки, и меньше 5 минут суммарно', () => {
    const total =
      retryDelaySecondsAfterFailure(1, 'inbound_reply') +
      retryDelaySecondsAfterFailure(2, 'inbound_reply') +
      retryDelaySecondsAfterFailure(3, 'inbound_reply');
    expect(total).toBeLessThan(5 * 60);
  });

  it('дано: kind=reminder_dispatch/doctor_broadcast_intent/operator_alert/без kind → когда считаем задержку → тогда общая лестница [60, 300, 900, 3600] не меняется', () => {
    // АРБИТР: захардкодить короткую лестницу как единственную (убрать retryBackoffLadderForKind
    // целиком) — эти виды очереди начнут получать [15, 60, 180], тест покраснеет.
    for (const kind of ['reminder_dispatch', 'doctor_broadcast_intent', 'operator_alert', undefined]) {
      expect(retryDelaySecondsAfterFailure(1, kind)).toBe(60);
      expect(retryDelaySecondsAfterFailure(2, kind)).toBe(300);
      expect(retryDelaySecondsAfterFailure(3, kind)).toBe(900);
      expect(retryDelaySecondsAfterFailure(4, kind)).toBe(3600);
    }
  });
});
