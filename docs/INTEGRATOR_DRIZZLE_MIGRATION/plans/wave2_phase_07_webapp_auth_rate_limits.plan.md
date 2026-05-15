---
name: Wave2 Phase07 Webapp auth rate limits
overview: Миграция сырого SQL в auth и rate-limit модулях на Drizzle через infra где уже есть pool.query; сохранить семантику OTP/email/channel link.
status: pending
isProject: false
todos:
  - id: p07-inventory
    content: "Сверить список файлов с RAW_SQL_INVENTORY §2.2 (channelLink, channelLinkClaim, service, rate limits, phoneOtpLimits, emailAuth)."
    status: pending
  - id: p07-rate-limits
    content: "Вынести повторяющиеся паттерны rate limit в узкий infra helper или расширить существующий repos-слой без дублирования SQL строк."
    status: pending
  - id: p07-channel-link
    content: "channelLink.ts / channelLinkClaim.ts: Drizzle + транзакции; классификация владельца — тесты на граничные счётчики."
    status: pending
  - id: p07-auth-service
    content: "service.ts: точечная замена pool.query на вызовы repo/Drizzle без изменения публичного поведения API."
    status: pending
  - id: p07-verify
    content: "Запуск существующих auth-тестов + typecheck; без поднятия глобальных таймаутов vitest (политика webapp-тестов)."
    status: pending
---

# Wave 2 — этап 7: webapp auth и rate limits

## Размер

**M** (много файлов, но узкие запросы; высокая чувствительность к безопасности).

## Definition of Done

- [ ] Нет необоснованного `pool.query` в перечисленных auth/rate-limit путях.
- [ ] Ключевые тесты auth зелёные; новые edge-case добавлены только где была найдена дыра.

## Scope

**Разрешено:** `apps/webapp/src/modules/auth/*.ts` при переносе SQL в `apps/webapp/src/infra/repos/*` + вызовы из модулей через существующие абстракции (не нарушать ESLint modules→infra).

**Вне scope:** смена провайдеров OAuth/SMS; новые env для секретов.

## Примечание

Интеграторный путь `messengerPhoneHttpBindExecute.ts` может остаться на отдельном пуле до отдельной задачи унификации — не раздувать этап без постановки.
