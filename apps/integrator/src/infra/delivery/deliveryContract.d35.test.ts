/**
 * D35 (docs/_TODO/runs/integrator-cleanup/D35_DELIVERY_FAILURE_POLICY_BRIEF.md), п.3: служебный
 * ответ на входящее должен уложиться «в минуты, а не в часы» — своя короткая лестница
 * (`inbound_reply`), а не общая `[60, 300, 900, 3600]` секунд напоминаний/рассылок/операторских
 * алертов. Тест доказывает ОБЕ стороны развилки: короткая лестница применяется РОВНО к
 * `inbound_reply` и НИЧЕГО не меняет для остальных видов очереди (граница брифа: «не менять
 * поведение доставки напоминаний и рассылок»).
 *
 * Второй блок ниже (находка Н1 слепого аудита D35, #987) закрывает п.1 брифа НА КОНТРАКТНОМ
 * СЛОЕ: воркер-тесты (outgoingDeliveryWorker.inboundReply.d35.test.ts) доказывают классификацию
 * только для telegram/max, потому что там её перехватывает более ранняя ветка
 * `handleDispatchFailure` (строки 536-552 outgoingDeliveryWorker.ts). Жёсткий отскок почты и
 * протухшая push-подписка идут мимо этой ранней ветки и судятся именно
 * `isOutgoingDeliveryDispatchErrorRetryable` — без прямого теста здесь удаление классификации
 * не красит НИ ОДИН тест из полного набора.
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D35_REPORT.md.
 */
import { describe, expect, it } from 'vitest';
import { isOutgoingDeliveryDispatchErrorRetryable, retryDelaySecondsAfterFailure } from './deliveryContract.js';
import { RecipientBlockedBotError } from './recipientBotBlocked.js';

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

describe('isOutgoingDeliveryDispatchErrorRetryable — постоянный отказ (бот заблокирован) не ретраится на КОНТРАКТНОМ слое', () => {
  it('дано: сообщение об ошибке классифицировано как RecipientBlockedBotError (постоянная блокировка) → когда контракт решает retryable → тогда false — на ЛЮБОМ канале, а не только telegram/max', () => {
    // АРБИТР: убрать `if (isRecipientBlockedBotDispatchError(m)) return false;` из
    // isOutgoingDeliveryDispatchErrorRetryable() (deliveryContract.ts:88) — сообщение дойдёт до
    // `return true` в конце функции, тест покраснеет. Это единственный тест, который вызывает
    // isOutgoingDeliveryDispatchErrorRetryable() напрямую: воркер-тесты для telegram/max никогда
    // не доходят до этой строки (их перехватывает более ранняя ветка handleDispatchFailure), а
    // для email/push такой ранней ветки нет вовсе.
    const blockedError = new RecipientBlockedBotError('telegram', 'bot was blocked by the user');
    expect(isOutgoingDeliveryDispatchErrorRetryable(blockedError.message)).toBe(false);
  });
});
