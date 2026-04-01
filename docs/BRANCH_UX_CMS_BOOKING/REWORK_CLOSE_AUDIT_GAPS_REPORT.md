# Rework: Close Remaining Audit Gaps (отчёт)

**Дата:** 2026-04-01  
**Цель:** закрыть недоделки из плана «Close Remaining Audit Gaps» и синхронизировать доки с кодом.

## Done (код)

- **Разделы CMS:** плоский список как у страниц контента — DnD reorder, глаз (видимость), меню «⋯» → редактировать. Файлы: `ContentSectionsListClient.tsx`, `reorderContentSections.ts`, `sectionVisibilityActions.ts`, порт `reorderSlugs` в `pgContentSections.ts`, страница `sections/page.tsx`.
- **Страницы контента:** в `ContentLifecycleDropdown` убраны дубли «Опубликовать / Снять с публикации» из dropdown; переключение публикации только кнопкой-глазом.
- **Медиа:** `accept` на desktop file input в `MediaLibraryClient.tsx`; тесты upload для PNG и `video/quicktime` (MOV) в `upload/route.test.ts`.
- **Регрессионные тесты:** `PinInput` (нет повторного auto-submit при toggle `disabled`), `AuthFlowV2` (3 неверных PIN → recovery; OTP recovery → `profile#patient-profile-pin`; несовпадение PIN при установке → шаг 1), `cabinetPastBookingsMerge`, порядок дней в overview `lfk-stats`, logout redirect с моком `APP_BASE_URL` (`redirect-base.test.ts`), `reorderContentSections`, `reorderSlugs` in-memory.
- **AuthFlowV2:** исправлен stale state после `setPhone`: авто-отправка OTP для существующего пользователя без PIN вызывает `startPhoneOtp(..., normalized)`, иначе в том же тике `phone` в closure ещё `null` и UI уходил на выбор канала.

## Partially done / manual-prod

- **nginx 413:** в репозитории только документация; на production-хосте оператор должен выставить `client_max_body_size` в vhost webapp и перезагрузить nginx (см. `deploy/HOST_DEPLOY_README.md`).

## Tests run

- Targeted: vitest по новым/изменённым файлам.
- Полный цикл: `pnpm run ci` — **green** (2026-04-01, локально).

## Smoke verified

- **Локально в этом прогоне:** не выполнялся полный ручной браузерный smoke; полагаемся на CI и unit-тесты. При деплое проверить вручную: `/app/doctor/content`, `/content/sections`, библиотеку файлов.

## Residual risks

- Некоторые варианты `.mov` с нестандартным контейнером могут не пройти magic-byte проверку `ftyp`.

## Self-check матрица


| Требование плана                                  | Статус      |
| ------------------------------------------------- | ----------- |
| Плоский список разделов                           | done        |
| Publish только глаз                               | done        |
| accept + PNG/MOV тесты                            | done        |
| Регрессии PIN / merge / LFK / logout / AuthFlowV2 | done        |
| Доки FINAL_AUDIT + AGENT_LOG 1.13                 | done        |
| nginx на хосте                                    | manual-prod |


## Audit follow-up remediation (2026-04-01)

- Закрыт риск логирования секретов в `PATCH /api/admin/settings`: значения secret-like ключей редактируются в БД, но в audit-логе пишутся как `[REDACTED]`.
- Нормализован формат PATCH value: сервер приводит вход к `{ value: ... }`, что устраняет рассинхрон с `configAdapter` чтением.
- В booking create-flow добавлен best-effort rollback внешней записи Rubitime, если локальное подтверждение падает по `slot_overlap`.
- Добавлен unit-тест rollback-сценария (`patient-booking/service.test.ts`).
- Устранены lint `no-secrets` блокеры для ошибок отсутствующего ключа в integrator (`MAX/SMSC` runtime path).

## Deploy hotfix (2026-04-01)

- GitHub Actions CI `23831622923` упал на `Deploy to host`: PostgreSQL не мог определить тип `$2` в `jsonb_build_object('value', $2)` в `seed-system-settings-from-env.mjs`.
- Исправлено: `$2::text`. Коммит `fa2111b` (push в `origin/main`).
- Повторный CI `23831771310` — **green** (lint + typecheck + build + deploy).
- Хост задеплоен успешно; `system_settings` засеяны.
