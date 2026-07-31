/**
 * УРОВЕНЬ 2, пункт 9 (D20_INTEGRATOR_MAP.md, «Шлюз входящих событий», `eventGateway/dedup.ts`):
 * «Строит dedup-key из канонического fingerprint нормализованного события». Карта дословно:
 * • тот же fingerprint с полями в другом порядке → ключ ИДЕНТИЧЕН (иначе дубль проходит);
 * • два разных сообщения от одного человека → ключи РАЗНЫЕ (самый тихий и злой отказ — второе
 *   сообщение молча пропадает, если ключи совпали);
 * • значения содержат `:`/`=` → кодирование не даёт склейки двух разных событий в один ключ;
 * • fingerprint отсутствует → фолбэк на `source:type:eventId`.
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D20_TESTS_LEVEL2_REPORT.md.
 */
import { describe, expect, it } from 'vitest';
import type { IncomingEvent } from '../contracts/index.js';
import { buildDedupKey } from './dedup.js';

function event(overrides: Partial<IncomingEvent> = {}): IncomingEvent {
  return {
    type: 'message.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: 'telegram',
      ...overrides.meta,
    },
    payload: {},
    ...overrides,
  } as IncomingEvent;
}

describe('buildDedupKey — ключ дедупликации входящего события', () => {
  it('дано: тот же fingerprint с полями в другом порядке → когда ключ → тогда ключ ИДЕНТИЧЕН', () => {
    // АРБИТР: в buildCanonicalFingerprint() убрать .sort(...) — при разном порядке ключей во
    // входном объекте (движки JS сохраняют порядок вставки для нечисловых ключей) итоговая
    // строка меняется, тест покраснеет.
    const a = event({ meta: { eventId: 'e1', occurredAt: 'x', source: 'telegram', dedupFingerprint: { chatId: 42, messageId: 7 } } });
    const b = event({ meta: { eventId: 'e2', occurredAt: 'y', source: 'telegram', dedupFingerprint: { messageId: 7, chatId: 42 } } });

    expect(buildDedupKey(a)).toBe(buildDedupKey(b));
  });

  it('дано: два разных сообщения от одного человека → когда ключи → тогда ключи РАЗНЫЕ', () => {
    // Самый тихий и злой отказ из карты: если ключи совпадут, второе сообщение будет
    // воспринято как дубль первого и pipeline его не обработает вовсе.
    // АРБИТР: в serializeFingerprintValue() всегда возвращать константу (игнорировать value) —
    // оба сообщения получат одинаковый ключ, тест покраснеет.
    const a = event({ meta: { eventId: 'e1', occurredAt: 'x', source: 'telegram', dedupFingerprint: { chatId: 42, messageId: 7 } } });
    const b = event({ meta: { eventId: 'e2', occurredAt: 'y', source: 'telegram', dedupFingerprint: { chatId: 42, messageId: 8 } } });

    expect(buildDedupKey(a)).not.toBe(buildDedupKey(b));
  });

  it('дано: значения содержат «:»/«=» → когда ключ → тогда кодирование не даёт склейки двух РАЗНЫХ событий в один ключ', () => {
    // Без encodeURIComponent пара {a:'1', b:'2'} сериализуется в "a=1:b=2", и ОДНОКЛЮЧЕВОЙ
    // fingerprint {a:'1:b=2'} даёт БУКВАЛЬНО ТУ ЖЕ строку "a=1:b=2" — два разных события
    // схлопнутся в один dedup-ключ, и второе будет молча отброшено как дубль первого.
    // АРБИТР: в buildCanonicalFingerprint() убрать encodeURIComponent(key)/encodeURIComponent(value)
    // (использовать key/value как есть) — тест покраснеет: ключи совпадут.
    const twoKeys = event({
      meta: { eventId: 'e1', occurredAt: 'x', source: 'telegram', dedupFingerprint: { a: '1', b: '2' } },
    });
    const oneKeyWithSeparators = event({
      meta: { eventId: 'e2', occurredAt: 'y', source: 'telegram', dedupFingerprint: { a: '1:b=2' } },
    });

    expect(buildDedupKey(twoKeys)).not.toBe(buildDedupKey(oneKeyWithSeparators));
  });

  it('дано: fingerprint отсутствует → когда ключ → тогда фолбэк на `source:type:eventId`', () => {
    // АРБИТР: в buildDedupKey() заменить фолбэк на `${event.meta.eventId}` (без source/type) —
    // тест покраснеет на конкретном ожидаемом значении.
    const e = event({
      type: 'callback.received',
      meta: { eventId: 'evt-42', occurredAt: 'x', source: 'max' },
    });

    expect(buildDedupKey(e)).toBe('max:callback.received:evt-42');
  });

  it('дано: fingerprint — пустой объект → когда ключ → тогда тот же фолбэк, что и при отсутствии fingerprint', () => {
    // Пустой объект не должен породить «канонический» ключ вида "source:type:" без полезной
    // нагрузки — иначе ЛЮБЫЕ два события с пустым fingerprint схлопнутся в один ключ.
    // АРБИТР: убрать проверку `if (entries.length === 0) return null;` — тест покраснеет,
    // т.к. ключ перестанет совпадать с ключом события без fingerprint вовсе.
    const withEmptyFingerprint = event({
      meta: { eventId: 'evt-7', occurredAt: 'x', source: 'max', dedupFingerprint: {} },
    });
    const withoutFingerprint = event({
      meta: { eventId: 'evt-7', occurredAt: 'x', source: 'max' },
    });

    expect(buildDedupKey(withEmptyFingerprint)).toBe(buildDedupKey(withoutFingerprint));
  });
});
