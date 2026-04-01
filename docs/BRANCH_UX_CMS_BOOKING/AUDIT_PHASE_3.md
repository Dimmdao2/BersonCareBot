# Аудит Фазы 3 (UX кабинета врача)

Проверено по спеку: `docs/BRANCH_UX_CMS_BOOKING/PHASE_3_TASKS.md`  
Проверенный diff: `origin/main...HEAD` (локальный `git diff` пустой, т.к. изменения уже закоммичены).

## Результат

- **Статус:** pass
- **Итог:** rework по findings #1–#4 выполнен (код + автотесты + запись в `AGENT_LOG.md`).

## Findings (по severity) — закрыто

### 1) [major] Потеря контекста `scope` в ссылке «назад» из master-detail списка клиентов — **closed**

- **Было:** `listBasePath` без `scope` в master-detail.
- **Сделано:** в `clients/page.tsx` передаётся `listBasePath` с `?scope=all|appointments`; в `ClientProfileCard` метка «назад» учитывает `scope=all` как режим подписчиков.
- **Тесты:** `ClientProfileCard.backLink.test.tsx`.

### 2) [major] Фильтр журнала по `clientId` может привести к 500 при невалидном UUID — **closed**

- **Было:** произвольная строка уходила в SQL.
- **Сделано:** `parseMessagesLogClientId` + redirect с сохранением прочих query; в `doctor-messaging/service.ts` — `sanitizeMessageLogFilters` (strip невалидного `userId`).
- **Тесты:** `parseMessagesLogClientId.test.ts`, расширен `service.test.ts`.

### 3) [minor] Кнопка «Сбросить область» в фильтре упражнений — **closed**

- **Сделано:** после `flushSync` очистки state вызывается `form.requestSubmit()`.
- **Тесты:** `ExercisesFiltersForm.test.tsx`.

### 4) [minor] Недостаточное автоматическое покрытие — **closed**

- **Сделано:** `pgMessageLog.test.ts`; `e2e/doctor-clients-scope-redirects.test.ts` (редиректы `/subscribers` + query).

## Проверка требований из запроса

- **Объединение списков и ссылки:** back-link сохраняет `scope`; legacy `/subscribers` покрыт тестами редиректа.
- **Пагинация / фильтры журнала:** устойчивый `clientId`; контракт SQL зафиксирован в `pgMessageLog.test.ts`.
- **Фильтры упражнений:** reset области немедленно обновляет выдачу через submit.

## Рекомендованное решение

- Выполнено в рамках Phase 3 rework (см. `AGENT_LOG.md`, блок «Phase 3 rework»).
