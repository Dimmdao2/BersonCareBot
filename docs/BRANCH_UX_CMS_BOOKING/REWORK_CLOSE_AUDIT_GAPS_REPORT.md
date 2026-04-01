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


