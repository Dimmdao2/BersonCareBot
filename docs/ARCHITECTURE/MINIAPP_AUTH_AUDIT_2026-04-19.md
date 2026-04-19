# Miniapp Auth Audit (2026-04-19)

Аудит исполнения плана `лёгкий,_быстрый_и_стабильный_вход_на_всех_платформах_edb6e13c.plan.md` после remediation-пакета.

## Результат

- **Code scope:** закрыт.
- **Тестовый scope (локально):** закрыт.
- **Ops scope (prod matrix + метрики):** требует ручного прогона на окружениях.

## Проверка по пунктам плана

| Пункт | Статус | Факт |
|------|--------|------|
| MAX bugfix (`max_unavailable`, no fallback) | ✅ | `POST /api/auth/max-init` возвращает `max_unavailable`; `AuthBootstrap` не уводит MAX-ошибку в phone flow. |
| TG first-open stabilization | ✅ | В `PatientBindPhoneClient` удалён `ensureMessengerMiniAppWebappSession`; в gate убрано дублирование recovery внутри poll. |
| Server-first classification | ✅ | Добавлен `appEntryClassification`, ветка входа передаётся из `AppEntryPage` в `AuthBootstrap`. |
| Lazy SDK + prefetch dedup | ✅ | Client prefetch удалён из `AuthBootstrap`/`AuthFlowV2`; публичные auth-config приходят через RSC snapshot. |
| PlatformProvider quiet | ✅ | `router.refresh()` отсутствует в `PlatformProvider`, runtime не шумит лишними refresh. |
| Error isolation | ✅ | Присутствуют `app/error.tsx`, `app/app/error.tsx`, `app/app/patient/error.tsx`, `app/app/doctor/error.tsx`. |
| Scenario verification (10-case matrix, dev+prod metrics) | ⚠️ | Нужен ручной прогон на dev/prod с логами и метриками TTI/time-to-session. |

## Инварианты входа

| Инвариант | Статус | Комментарий |
|-----------|--------|-------------|
| Сессия только сервером (`httpOnly`) | ✅ | Сессия выставляется в auth service (`cookies().set`). |
| `/app` server redirect или login UI | ✅ | `AppEntryPage`: server redirect при сессии, иначе auth UI. |
| На входе одна auth-ветка | ✅ | `AuthBootstrap` работает по server `entryClassification`. |
| Нет `router.refresh()` до успеха auth | ✅ | В `AuthBootstrap` удалён stale-cookie refresh-path. |
| SDK не блокирует интерактивный вход | ✅ | Telegram SDK lazy, MAX bridge условный, UI не ждёт client prefetch. |
| Нет межканального fallback MAX->TG OTP | ✅ | MAX ошибки остаются в MAX-ветке (без phone fallback). |
| Redirect только через `getPostAuthRedirectTarget` | ✅ | В `AuthBootstrap` и public auth flow применяется единая policy. |
| Сегментная error isolation | ✅ | Локальные `error.tsx` подключены. |

## Верификация

- Локальные тесты (таргетный набор auth/gate) — зелёные.
- Lints по изменённым файлам — без ошибок.

## Открытый остаток (ops)

Для полного закрытия плана на уровне эксплуатации нужно:

1. Прогнать матрицу 10 сценариев на dev/prod.
2. Снять метрики:
   - `time-to-session`
   - `time-to-usable-login-ui`
   - число auth-запросов и отсутствие pre-success `router.refresh()`
3. Подтвердить конфиг `max_bot_api_key` в `system_settings` production.
