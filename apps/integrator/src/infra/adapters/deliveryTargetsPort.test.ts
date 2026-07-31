/**
 * УРОВЕНЬ 2, пункт 13 (D20_INTEGRATOR_MAP.md, `adapters/deliveryTargetsPort.ts` /
 * `adapters/deliveryTargets.ts` — карта сводит их в одну строку: «судьба и проверяемое поведение
 * у них общие»). Дословно из карты: «состав каналов человека — из вебаппа (D21) … дано: у
 * человека два канала, один выключен → резолв → выключенный отсутствует С ИМЕНОВАННОЙ причиной,
 * а не молча; дано: ни одной цели → явный пустой результат, и вызывающий не "отправляет в
 * никуда"».
 *
 * Именованная причина пропуска (`resolution.skippedChannels`) приходит из ОТВЕТА вебаппа — это
 * не собственная логика порта. Поэтому здесь доказано ИМЕННО то, за что отвечает порт сам:
 * • три РАЗНЫХ вида «нет результата» не схлопываются в один: `tenantDenied` (утечка между
 *   клиниками — сигнал безопасности) ≠ `null` (сеть/вебапп недоступны — мы не смогли спросить) ≠
 *   `{channelBindings:{}}` (спросили, ответ честный — каналов нет). Слияние любых двух из них —
 *   это именно то «молча» из карты: сбой запроса стал бы неотличим от «у человека нет каналов»;
 * • `resolution.skippedChannels` (причины из вебаппа) доезжает до вызывающего НЕТРОНУТЫМ;
 * • порт не уходит в сеть без смысла (нет секрета/baseUrl/телефона/id канала).
 *
 * Заглушка — только сеть (`fetch`) и конфиг секрета; предмет проверки — как порт классифицирует
 * ответ. У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { integratorWebhookSecretMock } = vi.hoisted(() => ({
  integratorWebhookSecretMock: vi.fn<() => string>(() => 'test-shared-secret'),
}));

vi.mock('../../config/env.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, integratorWebhookSecret: integratorWebhookSecretMock };
});

import { createDeliveryTargetsPort } from './deliveryTargetsPort.js';
import { channelBindingsToTargets, unwrapDeliveryTargets } from './deliveryTargets.js';
import type { ResolvedNotificationChannelsPayload } from '../../kernel/contracts/notificationChannels.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function resolution(overrides: Partial<ResolvedNotificationChannelsPayload> = {}): ResolvedNotificationChannelsPayload {
  return {
    userId: 'user-1',
    topicCode: 'appointment_reminders',
    selectedChannels: ['telegram'],
    skippedChannels: [{ channel: 'max', reason: 'disabled_by_user_topic_channel' }],
    availableChannels: ['telegram', 'max'],
    enabledChannels: ['telegram'],
    ...overrides,
  };
}

describe('createDeliveryTargetsPort — три разных «нет результата» не схлопываются в один', () => {
  beforeEach(() => {
    integratorWebhookSecretMock.mockReturnValue('test-shared-secret');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('дано: вебапп ответил 403 (чужая клиника) → когда резолв → тогда tenantDenied=true, а НЕ пустой результат неотличимый от «каналов нет»', async () => {
    // АРБИТР: убрать ветку `if (res.status === 403) return { channelBindings: {}, tenantDenied: true };`
    // — 403 провалится в `!res.ok` (403 не ok) и вернёт `null`, тест покраснеет: сигнал
    // межарендаторной утечки станет неотличим от «вебапп недоступен».
    vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { ok: false }));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001');

    expect(result).toEqual({ channelBindings: {}, tenantDenied: true });
  });

  it('дано: вебапп ответил 500 → когда резолв → тогда null (МЫ НЕ СМОГЛИ спросить), а не тихое «каналов нет»', async () => {
    // АРБИТР: заменить `if (!res.ok || data.ok !== true) return null;` на `if (data.ok !== true) return null;`
    // (убрать проверку res.ok) — 500 с телом `{ok:true}` (маловероятно, но именно так ловится
    // регрессия) пройдёт как успех; здесь конкретно: 500 без ok в теле всё равно должен дать null,
    // тест это уже покрывает базовым случаем — важна сама проверка res.ok.
    vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001');

    expect(result).toBeNull();
  });

  it('дано: вебапп ответил 200, но `ok` не true → когда резолв → тогда null, а не пустые каналы', async () => {
    // АРБИТР: заменить `data.ok !== true` на всегда `false` (никогда не считать не-ok) —
    // содержательный отказ вебаппа будет прочитан как «каналов нет», тест покраснеет.
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: false, error: 'internal' }));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001');

    expect(result).toBeNull();
  });

  it('дано: сеть недоступна (fetch кидает) → когда резолв → тогда null, а не необработанный reject', async () => {
    // АРБИТР: убрать `try { ... } catch { return null; }` вокруг fetch — вызов начнёт
    // реджектиться, `.resolves` в тесте упадёт.
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    await expect(port.getTargetsByPhone('+79180000001')).resolves.toBeNull();
  });

  it('дано: секрет подписи не настроен → когда резолв → тогда null И fetch НЕ вызывается (не уходим в сеть неподписанным запросом)', async () => {
    // АРБИТР: убрать `if (!baseUrl || !secret) return null;` — уйдёт неподписанный (пустая подпись)
    // запрос в вебапп, `fetch` будет вызван, тест покраснеет.
    integratorWebhookSecretMock.mockReturnValue('');
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001');

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('дано: у человека выключен один канал из двух (реальный ответ вебаппа с resolution) → когда резолв → тогда resolution.skippedChannels с ИМЕНОВАННОЙ причиной доезжает до вызывающего НЕТРОНУТЫМ', async () => {
    // Порт сам не решает, ПОЧЕМУ канал пропущен — решение и причина приходят из вебаппа. Предмет
    // проверки: порт не должен эту причину потерять или подменить по дороге.
    // АРБИТР: заменить `...(data.resolution ? { resolution: data.resolution } : {})` на пустой
    // объект (никогда не прокидывать resolution) — причина пропуска исчезнет ещё на границе
    // порта, тест покраснеет.
    const payloadResolution = resolution();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { ok: true, channelBindings: { telegramId: '42' }, resolution: payloadResolution }),
    );
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001', { topic: 'appointment_reminders' });

    expect(result?.resolution?.skippedChannels).toEqual([
      { channel: 'max', reason: 'disabled_by_user_topic_channel' },
    ]);
    expect(result?.channelBindings).toEqual({ telegramId: '42' });
  });

  it('дано: ни одной цели у человека вообще (вебапп ответил честно) → когда резолв → тогда явный пустой результат {channelBindings:{}}, отличимый от null', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, channelBindings: {} }));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('+79180000001');

    expect(result).not.toBeNull();
    expect(result?.channelBindings).toEqual({});
  });

  it('дано: телефон пустой/пробельный → когда getTargetsByPhone → тогда null И fetch не вызывается вовсе', async () => {
    // АРБИТР: убрать `if (!phoneNormalized || !phoneNormalized.trim()) return null;` — уйдёт
    // запрос с пустым `phone=` в query, fetch будет вызван, тест покраснеет.
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByPhone('   ');

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('дано: ни telegramId, ни maxId не заданы → когда getTargetsByChannelBinding → тогда null и fetch не вызывается (не резолвим «просто так»)', async () => {
    // АРБИТР: убрать финальный `return null;` (заменить на пустой fetch-запрос) — уйдёт нескопленный
    // запрос без единого идентификатора, тест покраснеет.
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    const result = await port.getTargetsByChannelBinding({});

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('дано: заданы И telegramId, И maxId → когда getTargetsByChannelBinding → тогда используется telegramId (приоритет канала-источника)', async () => {
    // АРБИТР: поменять порядок проверок местами (сначала maxId) — URL уйдёт с `maxId=`, тест
    // покраснеет на составе запрошенного query.
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, channelBindings: {} }));
    const port = createDeliveryTargetsPort({ getAppBaseUrl: async () => 'https://webapp.internal' });

    await port.getTargetsByChannelBinding({ telegramId: '111', maxId: '222' });

    const calledUrl = String(vi.mocked(fetch).mock.calls[0]![0]);
    expect(calledUrl).toContain('telegramId=111');
    expect(calledUrl).not.toContain('maxId=');
  });
});

describe('channelBindingsToTargets / unwrapDeliveryTargets — извлечение целей из привязок', () => {
  it('дано: обе привязки заданы → когда извлечение → тогда обе цели, telegram первым', () => {
    // АРБИТР: поменять порядок BINDING_KEYS (max перед telegram) — тест на порядок покраснеет.
    const targets = channelBindingsToTargets({ telegramId: '111', maxId: '222' });

    expect(targets).toEqual([
      { channel: 'telegram', externalId: '111' },
      { channel: 'max', externalId: '222' },
    ]);
  });

  it('дано: одна привязка — пустая строка → когда извлечение → тогда она НЕ становится целью с пустым externalId', () => {
    // АРБИТР: убрать `id.trim().length > 0` из условия — пустая строка станет «целью» с
    // externalId:'', downstream-отправка попытается уйти в никуда, тест покраснеет.
    const targets = channelBindingsToTargets({ telegramId: '', maxId: '222' });

    expect(targets).toEqual([{ channel: 'max', externalId: '222' }]);
  });

  it('дано: привязок нет вовсе → когда извлечение → тогда пустой список, а не исключение', () => {
    expect(channelBindingsToTargets(undefined)).toEqual([]);
  });

  it('дано: fetched — null → когда unwrapDeliveryTargets → тогда null (не {} — вызывающий должен отличить «не резолвили» от «резолвили пусто»)', () => {
    expect(unwrapDeliveryTargets(null)).toBeNull();
  });

  it('дано: fetched содержит bindings → когда unwrapDeliveryTargets → тогда именно они, без потерь', () => {
    expect(unwrapDeliveryTargets({ channelBindings: { telegramId: '9' } })).toEqual({ telegramId: '9' });
  });
});
