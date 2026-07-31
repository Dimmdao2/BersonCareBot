/**
 * УРОВЕНЬ 2, пункт 9 (D20_INTEGRATOR_MAP.md, «Шлюз входящих событий», `eventGateway/index.ts`) —
 * карта называет этот модуль «самой дорогой ошибкой во всём интеграторе»: сердце «не потерять и
 * не задвоить». Дословно из карты:
 * • два вебхука с ОДНИМ fingerprint (повтор доставки провайдером) → pipeline выполнен РОВНО ОДИН
 *   раз, второй `dropped/DUPLICATE`;
 * • pipeline упал на середине → dedup-ключ ОСВОБОЖДЁН и повторная доставка провайдером
 *   обработается (иначе сообщение потеряно НАВСЕГДА);
 * • `release` сам упал → возвращается `rejected`, а не тихий `accepted`;
 * • битый конверт → `rejected/INVALID_ENVELOPE`, pipeline не запускался;
 * • dedup-ключ протух (TTL 900с) → то же событие спустя сутки обработается заново — это
 *   зафиксировано как ОСОЗНАННОЕ РЕШЕНИЕ (значение TTL, передаваемое в порт), а не случайность.
 *
 * Предмет проверки — dedup как ХРАНИЛИЩЕ СОСТОЯНИЯ (acquire/release), а не «вызвана ли функция»:
 * идемпотентный порт в тесте — работающая in-memory реализация контракта `IdempotencyPort`
 * (реально хранит какие ключи заняты), а не запись фактов вызова. Так «второй раз пришло то же
 * событие» проверяется настоящим повторным проходом через шлюз, а не утверждением о моках.
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте D20_TESTS_LEVEL2_REPORT.md.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IdempotencyPort, IncomingEvent } from '../contracts/index.js';
import { createEventGateway } from './index.js';
import { buildDedupKey } from './dedup.js';
import { checkGatewayRateLimit } from './rateLimit.js';

vi.mock('./rateLimit.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, checkGatewayRateLimit: vi.fn(actual.checkGatewayRateLimit as never) };
});

function event(overrides: Partial<IncomingEvent['meta']> = {}, payload: Record<string, unknown> = {}): IncomingEvent {
  return {
    type: 'message.received',
    meta: {
      eventId: 'evt-1',
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: 'telegram',
      ...overrides,
    },
    payload,
  };
}

/** Настоящая (упрощённая) реализация контракта: реально хранит занятые ключи, а не факт вызова. */
function inMemoryIdempotencyPort(): IdempotencyPort & { acquired: Set<string> } {
  const acquired = new Set<string>();
  return {
    acquired,
    async tryAcquire(key: string) {
      if (acquired.has(key)) return false;
      acquired.add(key);
      return true;
    },
    async release(key: string) {
      acquired.delete(key);
    },
  };
}

describe('createEventGateway — validate → rateLimit → dedup → pipeline', () => {
  it('дано: два вебхука с ОДНИМ fingerprint (повтор доставки провайдером) → когда оба через шлюз → тогда pipeline выполнен ровно один раз, второй dropped/DUPLICATE, а наружу уходит ИМЕННО тот dedupKey, что занимался в порту', async () => {
    // АРБИТР: убрать блок `if (idempotencyPort) { ... }` целиком — pipeline будет вызван дважды,
    // runCount станет 2, тест покраснеет.
    const idempotencyPort = inMemoryIdempotencyPort();
    let runCount = 0;
    const gateway = createEventGateway({
      idempotencyPort,
      pipeline: { run: async () => { runCount++; } },
    });
    const fp = { chatId: 42, messageId: 7 };
    const firstEvent = event({ eventId: 'evt-a', dedupFingerprint: fp });
    const secondEvent = event({ eventId: 'evt-b', dedupFingerprint: fp });

    const first = await gateway.handleIncomingEvent(firstEvent);
    const second = await gateway.handleIncomingEvent(secondEvent);

    expect(first.status).toBe('accepted');
    expect(second).toMatchObject({ status: 'dropped', reason: 'DUPLICATE' });
    expect(runCount).toBe(1);

    // N8 (D20_LEVEL2_REAUDIT.md): наружу может уйти НЕ ТОТ dedupKey, что реально занимался в
    // idempotencyPort — этот ключ попадает в логи вебхуков обоих мессенджеров (telegram/webhook.ts,
    // max/webhook.ts), и подмена ломает сцепку «лог ↔ занятый ключ» при разборе инцидента.
    // АРБИТР: в handleIncomingEvent() вернуть из `accepted`/`dropped` константу вместо реального
    // dedupKey — тест покраснеет: возвращённое значение перестанет совпадать с ключом, реально
    // переданным в idempotencyPort.tryAcquire (единственный ключ в acquired) и с buildDedupKey(event).
    const realKeyAcquiredInPort = [...idempotencyPort.acquired][0];
    expect(first.dedupKey).toBe(realKeyAcquiredInPort);
    expect(second.dedupKey).toBe(realKeyAcquiredInPort);
    expect(first.dedupKey).toBe(buildDedupKey(firstEvent));
  });

  it('дано: pipeline упал на середине → когда обработка → тогда dedup-ключ ОСВОБОЖДЁН и повторная доставка провайдером обработается', async () => {
    // Ровно требование карты: без освобождения ключа сообщение теряется НАВСЕГДА — провайдер
    // повторит доставку с тем же fingerprint, а шлюз тихо дропнет её как «дубль».
    // АРБИТР: в catch-блоке pipeline закомментировать вызов `await release(dedupKey)` — второй
    // проход вернёт dropped/DUPLICATE вместо accepted, тест покраснеет.
    const idempotencyPort = inMemoryIdempotencyPort();
    let attempt = 0;
    const gateway = createEventGateway({
      idempotencyPort,
      pipeline: {
        run: async () => {
          attempt++;
          if (attempt === 1) throw new Error('pipeline exploded mid-flight');
        },
      },
    });
    const fp = { chatId: 42, messageId: 7 };

    const failed = await gateway.handleIncomingEvent(event({ eventId: 'evt-a', dedupFingerprint: fp }));
    expect(failed).toMatchObject({ status: 'rejected', reason: 'PIPELINE_FAILED' });

    // Провайдер повторяет доставку того же события (тот же fingerprint, другой eventId — как
    // это реально бывает у Telegram/MAX при retry вебхука).
    const retried = await gateway.handleIncomingEvent(event({ eventId: 'evt-b', dedupFingerprint: fp }));
    expect(retried.status).toBe('accepted');
    expect(attempt).toBe(2);
  });

  it('дано: release сам упал → когда обработка → тогда возвращается rejected, а не тихий accepted и не необработанный reject промиса', async () => {
    // АРБИТР: убрать `try { await release(dedupKey) } catch (releaseErr) { ... }` вокруг release
    // (вызывать release() без защиты) — промис handleIncomingEvent начнёт реджектиться вместо
    // резолва с {status:'rejected'}, `.resolves.toMatchObject` в тесте упадёт.
    const idempotencyPort: IdempotencyPort = {
      tryAcquire: async () => true,
      release: async () => {
        throw new Error('release transport down');
      },
    };
    const gateway = createEventGateway({
      idempotencyPort,
      pipeline: { run: async () => { throw new Error('pipeline exploded'); } },
    });

    await expect(gateway.handleIncomingEvent(event({ eventId: 'evt-a' }))).resolves.toMatchObject({
      status: 'rejected',
      reason: 'PIPELINE_FAILED',
    });
  });

  it('дано: битый конверт (нет meta.eventId) → когда шлюз → тогда rejected/INVALID_ENVELOPE и pipeline НЕ запускался', async () => {
    // АРБИТР: убрать `incomingEventSchema.parse(event)` (или обернуть в try без throw) —
    // невалидный конверт пройдёт до pipeline, runCount станет 1, тест покраснеет.
    let runCount = 0;
    const gateway = createEventGateway({
      idempotencyPort: inMemoryIdempotencyPort(),
      pipeline: { run: async () => { runCount++; } },
    });
    const broken = { type: 'message.received', meta: { occurredAt: 'x', source: 'telegram' }, payload: {} } as unknown as IncomingEvent;

    const result = await gateway.handleIncomingEvent(broken);

    expect(result).toMatchObject({ status: 'rejected', reason: 'INVALID_ENVELOPE' });
    expect(runCount).toBe(0);
  });

  it('дано: dedup TTL не задан явно → когда шлюз резолвит дедуп → тогда в порт передаётся ОСОЗНАННЫЙ дефолт 900 секунд', async () => {
    // Карта: «протухание ключа через 900с — зафиксировать это как осознанное решение, а не
    // случайность». Сам eventGateway не хранит TTL-стейт (это ответственность порта), но обязан
    // передать в него именно это значение — тест закрепляет решение как контракт вызова границы,
    // что разрешено правилом (п.7): предмет проверки — сам факт обращения к границе с конкретным
    // аргументом, а не «функция вызвана».
    // АРБИТР: сменить дефолт `dedupTtlSec = 900` на любое другое число — тест покраснеет.
    const seenTtl: number[] = [];
    const idempotencyPort: IdempotencyPort = {
      tryAcquire: async (_key, ttlSec) => {
        seenTtl.push(ttlSec);
        return true;
      },
    };
    const gateway = createEventGateway({ idempotencyPort, pipeline: { run: async () => {} } });

    await gateway.handleIncomingEvent(event({ eventId: 'evt-a' }));

    expect(seenTtl).toEqual([900]);
  });

  it('дано: dedup TTL задан явно (настройка развёртывания) → когда шлюз резолвит дедуп → тогда используется именно он', async () => {
    // АРБИТР: в createEventGateway() игнорировать `deps.dedupTtlSec` (всегда использовать 900) —
    // тест покраснеет.
    const seenTtl: number[] = [];
    const idempotencyPort: IdempotencyPort = {
      tryAcquire: async (_key, ttlSec) => {
        seenTtl.push(ttlSec);
        return true;
      },
    };
    const gateway = createEventGateway({ idempotencyPort, dedupTtlSec: 42, pipeline: { run: async () => {} } });

    await gateway.handleIncomingEvent(event({ eventId: 'evt-a' }));

    expect(seenTtl).toEqual([42]);
  });

  it('дано: вызывающий передаёт options.runPipeline (как единственный продовый вызов — организационный принципал арендатора, см. organizationTicks.ts) → когда обработка → тогда обёртка ОБЯЗАНА быть вызвана и реально обернуть исполнение pipeline, а не быть проигнорирована', async () => {
    // Все шесть тестов выше зовут handleIncomingEvent БЕЗ options. Продовых вызовов handleIncomingEvent
    // три: telegram/webhook.ts:382 и max/webhook.ts:329 зовут его БЕЗ options (принципал ставится
    // снаружи, вокруг всего вызова); scheduler:handle-tick-event (organizationTicks.ts:30,43-45) —
    // единственный, что передаёт `options.runPipeline`, оборачивая исполнение в
    // runWithOrganizationPrincipal — без этого пропуск в проде побежит без принципала арендатора.
    // Предмет проверки — не просто «функция вызвана», а что pipeline.run реально выполнился
    // ВНУТРИ переданной обёртки (флаг ставится обёрткой ДО запуска pipeline).
    // АРБИТР: заменить `options?.runPipeline ? options.runPipeline(runPipeline) : runPipeline()`
    // на голый `runPipeline()` (игнорировать options) — обёртка не будет вызвана вовсе,
    // `wrapperInvoked`/`ranInsideWrapper` останутся false, тест покраснеет.
    let wrapperInvoked = false;
    let ranInsideWrapper = false;
    const gateway = createEventGateway({
      idempotencyPort: inMemoryIdempotencyPort(),
      pipeline: {
        run: async () => {
          ranInsideWrapper = wrapperInvoked;
        },
      },
    });

    const result = await gateway.handleIncomingEvent(event({ eventId: 'evt-a' }), {
      runPipeline: async (run) => {
        wrapperInvoked = true;
        await run();
      },
    });

    expect(result.status).toBe('accepted');
    expect(wrapperInvoked).toBe(true);
    expect(ranInsideWrapper).toBe(true);
  });

  it('дано: rate-limit шлюза отверг событие → когда обработка → тогда rejected с причиной лимита, dedup-ключ НЕ занят и pipeline НЕ запущен', async () => {
    // N7 (D20_LEVEL2_REAUDIT.md): договор модуля («Gateway не содержит бизнес-логики: только
    // validate/rate-limit/dedup», index.ts:14) на треть не был закреплён ни одним тестом — ветку
    // `if (!rate.allowed)` можно было отключить целиком без единого красного теста в наборе.
    // Предмет проверки — не сама реализация rate-limit (сегодня заглушка, всегда allowed), а то,
    // КАК шлюз реагирует на её отказ: это законная проверка обращения к границе (правило п.7),
    // т.к. решение "пускать/не пускать" здесь принимается именно этой границей, а не gateway.
    // АРБИТР: в createEventGateway() убрать блок `if (!rate.allowed) { return {...} }` целиком —
    // событие пройдёт до dedup/pipeline, runCount станет 1, тест покраснеет.
    vi.mocked(checkGatewayRateLimit).mockResolvedValueOnce({
      allowed: false,
      reason: 'RATE_LIMITED_TEST',
    });
    const idempotencyPort = inMemoryIdempotencyPort();
    let runCount = 0;
    const gateway = createEventGateway({
      idempotencyPort,
      pipeline: { run: async () => { runCount++; } },
    });

    const result = await gateway.handleIncomingEvent(event({ eventId: 'evt-a' }));

    expect(result).toMatchObject({ status: 'rejected', reason: 'RATE_LIMITED_TEST' });
    expect(idempotencyPort.acquired.size).toBe(0);
    expect(runCount).toBe(0);
  });
});
