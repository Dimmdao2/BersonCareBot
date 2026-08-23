# Кабинет глобального админа — неверные двери и `500` (2026-08-23)

Источник: `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`, строка «Сохранить оформление».
Граница: `Р-АДМИН` в `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2.3.

## Настоящие границы

1. Managed notification-template entries в `system_settings` с `organization_id IS NULL` — платформенные defaults. Их меняет
   `app_platform_settings` через `/api/admin/notification-templates`; клиника и её тариф в этом пути не участвуют.
   Шаблон с конкретным `organization_id` — арендный override клиники; только этот target требует mutation-clearance
   механики `branding`.
2. Web Push на `/app/admin/notifications` — личная подписка вошедшего человека. Это не платформенная операция,
   не медицинские данные и не отношение пациента с клиникой. Её дверь — `identity-self`: собственный user id и
   RLS «только своя строка». Поэтому API перенесён из `/api/doctor/web-push/*` в `/api/account/web-push/*`; роль
   глобального админа не получила ни одного права на пациентские или организационные отношения.

## Реализация

- Запись managed-шаблонов принимает обязательный discriminated target: `{ owner: 'platform' }` либо
  `{ owner: 'organization', organizationId }`. Первый включает только разрешённый глобальный write-path
  `system_settings`; второй физически требует `branding` clearance. Передать `organizationId: null` как обход
  арендной двери больше нельзя по типу.
- Админский и клинический routes переводят неожиданный `MechanicWriteClearanceRequiredError` в объяснённый `403`,
  не в необработанный `500`. Соседний клинический route исправлен тем же адаптером.
- Personal web-push routes используют `requireAccountWebPushSelfApiSession`. Отказы `401/403` содержат человеко-
  читаемую причину. Клиент различает отказ identity-self и отсутствие VAPID-конфигурации.
- Узкий `app.get_web_push_vapid_public_key()` разрешён identity-only patient principal до выбора клиники. Это
  публичный ключ, уже читаемый через объявленный SECURITY DEFINER root; новых DB-прав не потребовалось.

## Проверка соседних выбросов

Команда
`rg -n "MechanicWriteClearanceRequiredError|assertMechanicWriteClearance|requireMechanicWriteClearance" apps/webapp/src --glob '!**/*.test.*'`
показала сам класс, DI-инъекции и сервисные physical doors; route-level обработчика не было. Точный поиск
`rg -n -C 5 "saveManagedTemplate\\(|saveManagedPresentation\\(" apps/webapp/src` показал два живых HTTP caller:
admin и doctor notification-template routes. Оба теперь используют общий refusal adapter. Других callers этих
двух write-методов нет.

## Доказательства

- `pnpm --dir apps/webapp exec vitest run src/modules/notif-templates/notifTemplatesService.mechanicWriteClearance.test.ts src/app/api/admin/notification-templates/route.route.test.ts src/app/api/account/web-push/status/route.route.test.ts src/app-layer/guards/requireRole.platformOperations.unit.test.ts src/infra/db/portContextRuntime.test.ts src/shared/lib/webPush/staffWebPushApi.test.ts src/app/api/tariffMechanics.route.test.ts`
  — 7 файлов, 75 тестов, зелёные. Есть fault injection для обоих путей: выброс `branding` physical door и отказ
  установки identity-self principal; проверены новые account endpoints и затронутый clinic route.
- `pnpm --dir apps/webapp run typecheck` — зелёный (выполнен следом в той же финальной команде).
- `pnpm --dir apps/webapp run lint` — exit 0; две существующие warning в
  `app/app/doctor/calendar/AppointmentPaymentSection.tsx`, ошибок нет; все structural gates зелёные.

## Не выполнено в этом worktree

- TEST и PROD не трогались; `--execute`, deploy и push не выполнялись.
- Живую проверку двух кнопок на TEST выполняет ведущий после выкладки candidate.
- Миграций, `GRANT`, `REVOKE`, `CREATE POLICY` и изменений `declaration.ts` нет: существующих прав достаточно.
