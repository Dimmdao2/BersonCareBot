/**
 * Одно правило на все вызовы интегратора в вебапп: внутренний адрес, если он задан.
 *
 * Что ловится. На новом проде публичное имя вебаппа внутри docker-сети — алиас САМОГО его
 * контейнера, а TLS заканчивается на nginx и до контейнера не доходит. Замер 12.09.2026 на
 * `135.106.187.95`: из контейнера `https://<имя>/api/health` → `ECONNREFUSED …:443`, тот же путь по
 * `http` → `200`. Пока правила не было, интегратор звал вебапп публичным `https`, и шов
 * интегратор→вебапп молча умирал целиком: планировщик 12 часов ронял `operator_health_digest_wake`
 * (8906 раз подряд), а вместе с ним не работали ни пробуждения, ни канонические записи, ни выборка
 * получателей доставки.
 *
 * Обратная сторона так же важна: пустая переменная обязана оставлять публичный адрес — на DEV,
 * TEST и в тестах он один и тот же, и вторая строка в env там не нужна.
 */
import { describe, expect, it } from 'vitest';
import { webappCallBaseUrl } from './env.js';

describe('адрес вебаппа для вызовов сервер-сервер', () => {
  it('берёт внутренний адрес, когда он задан', () => {
    expect(
      webappCallBaseUrl({
        WEBAPP_INTERNAL_BASE_URL: 'http://therapysto.ru',
        APP_BASE_URL: 'https://therapysto.ru',
      }),
    ).toBe('http://therapysto.ru');
  });

  it('падает обратно на публичный, когда внутренний не задан или пуст', () => {
    expect(webappCallBaseUrl({ APP_BASE_URL: 'https://therapysto.ru' })).toBe(
      'https://therapysto.ru',
    );
    expect(
      webappCallBaseUrl({ WEBAPP_INTERNAL_BASE_URL: '   ', APP_BASE_URL: 'https://therapysto.ru' }),
    ).toBe('https://therapysto.ru');
  });
});
