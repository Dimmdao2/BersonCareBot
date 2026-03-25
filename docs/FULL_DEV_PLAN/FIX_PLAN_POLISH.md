# FIX_PLAN_POLISH

## Проверка выполнения предыдущего агента

Проверен отчет `docs/FULL_DEV_PLAN/finsl_fix_report.md` и фактическое состояние кода.

- Критичные фиксы `SEC-01`, `SEC-02`, `PERF-01`, `PERF-02`, `PERF-03`, `TEST-03` из `FINAL_FIX_RECOMMENDATIONS` действительно присутствуют в коде.
- Фактический прогон `pnpm run ci` выполнен повторно после полировки и прошел успешно.
- Подтверждено, что отчет предыдущего агента корректно отражал частичную готовность, но оставлял ряд незакрытых пунктов.

## Что исправлено в рамках полировки

### 1) `SEC-05` (уменьшение attack surface login token)
- Файл: `apps/webapp/src/app/api/auth/messenger/start/route.ts`
- Убрано поле `token` из JSON-ответа `messenger/start`; остается `deepLink`.
- Обновлены тесты под новый контракт:
  - `apps/webapp/src/app/api/auth/messenger/start/route.test.ts` (добавлен);
  - `apps/webapp/src/app/api/auth/messenger/poll/route.test.ts` (токен извлекается из deepLink);
  - `apps/webapp/e2e/auth-stage5-inprocess.test.ts` (токен извлекается из deepLink).

### 2) `SEC-04` (валидация content signature)
- Файл: `apps/webapp/src/app/api/media/upload/route.ts`
- Добавлена проверка magic-bytes для разрешенных MIME:
  - JPEG, PNG, GIF, WEBP, MP4, MP3, WAV, PDF.
- При несовпадении MIME и подписи возвращается `415` с `file_signature_mismatch`.
- Тесты:
  - `apps/webapp/src/app/api/media/upload/route.test.ts` обновлен (валидная JPEG сигнатура + новый тест mismatch).

### 3) `ARCH-04` (прозрачность relay-заглушки)
- Файл: `apps/webapp/src/modules/messaging/relayOutbound.ts`
- Добавлен явный warning, если `INTEGRATOR_API_URL` задан, но outbound relay не реализован.

### 4) `QA-06` (защита от невалидного UUID в `selected`)
- Файл: `apps/webapp/src/app/app/doctor/clients/page.tsx`
- Добавлена валидация `selected` через `z.string().uuid()`, при невалидном значении выполняется `redirect("/app/doctor/clients")`.

### 5) `QA-04` (UX-подсказка в поиске клиентов)
- Файл: `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx`
- Добавлена подсказка "Введите еще N симв." при длине запроса 1-2 символа.

### 6) `PERF-05` (оптимизация выборки цитаты дня)
- Файл: `apps/webapp/src/modules/patient-home/newsMotivation.ts`
- Вместо загрузки всей таблицы:
  - сначала `COUNT(*)`;
  - затем `LIMIT 1 OFFSET idx` для детерминированной записи дня.

### 7) `TEST-02` (реальные поведенческие тесты polling hook)
- Файл: `apps/webapp/src/modules/messaging/hooks/useMessagePolling.test.ts`
- Добавлены тесты поведения:
  - немедленный тик;
  - пауза при `document.visibilityState = hidden`;
  - возобновление при `visible`;
  - отсутствие polling при `enabled = false`.

## Проверки

Запущено и успешно:

- таргетные тесты по измененным зонам;
- полный pipeline: `pnpm run ci`.

Итог CI: PASS (lint, typecheck, integrator tests, webapp tests, build, audit).

## Что осталось нерешенным

Ниже пункты, которые не являются "полировкой" и требуют больших отдельных этапов/реализаций:

- Stage 11: LFK (новые модули/миграции);
- Stage 12: Reminders (полный контур);
- Stage 13: Integrations (полный контур);
- Stage 15: Settings/Admin (в `ROADMAP` этапы 14/15 поменяны местами);
- STUB-03 OAuth callback полноценная реализация;
- STUB-02 полноценный relay outbound (не warning, а рабочий контракт);
- Stage 10 e2e сценарий `upload -> saveContentPage` в полном виде.

Эти пункты зафиксированы как крупные оставшиеся блоки, не блокирующие завершение текущей полировки точечных дефектов.

## Уточнения владельца (после полировки)

Решения владельца зафиксированы в `docs/FULL_DEV_PLAN/USER_TODO_STAGE.md` и должны считаться source of truth для следующих этапов реализации.

### Подтвержденные решения по интеграциям и auth
- SMTP provider для production: оставить `reg.ru`.
- Max-канал: считать рабочим и поддерживаемым (для пользователя канал остается опциональным).
- Конфликт email auto-bind: блокировать автопривязку, уведомлять пользователя, уведомлять администратора.
- Инвалидация сессии: только при смене телефона.

### Подтвержденные решения по relay контракту (STUB-02)
- Выбран `Вариант B`.
- Один endpoint для outbound relay.
- HMAC-подпись.
- Idempotency key: принят.
- Dedup TTL: 24 часа.
- Retry: `0s`, `10s`, `60s` + дополнительная последняя попытка через `5 минут`.
- SLA: принять целевое `95% < 30 сек`.

### Подтвержденные решения по reminders/fallback
- Запись на прием: fallback включен.
- Reminders ЛФК: fallback включен.
- Чат: fallback включен.
- Важные сообщения: специальная логика `B`:
  - отправка сразу во все мессенджеры + email;
  - при отсутствии confirmed read — SMS fallback;
  - время до SMS fallback настраивается админом в settings.
- Остальные рассылки/уведомления по темам: только выбранные пользователем каналы, без fallback.
- Лимит отправок: `20/день` на пользователя (количество каналов не влияет).

### Подтвержденные решения по Settings/Admin
- `debug_forward_to_admin`: включается админом.
- Audit log изменений флагов/ключей: обязателен.
- Авто-таймаут admin-mode: не нужен.
- Bulk-операции: считать массовыми рассылки, массовую архивацию/разархивацию пользователей, массовое включение/отключение каналов/флагов; выполнять как `admin-only` + подтверждение + audit.
