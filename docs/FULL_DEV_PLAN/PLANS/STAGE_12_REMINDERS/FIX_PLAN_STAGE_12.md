# FIX_PLAN — этап 12 (Reminders)

**Статус:** этап **не реализован** в требуемом объёме.

## Наблюдения по коду

- `apps/webapp/src/modules/reminders/service.ts` — по-прежнему **MVP stub**: `listReminderRules` возвращает пустой массив (комментарий в файле подтверждает).
- Нет экрана `apps/webapp/src/app/app/patient/reminders/` (маршрут `/app/patient/reminders` отсутствует).
- Нет миграции `032_reminder_seen_status.sql` и связанной логики «seen» из плана 12.5.
- Интеграция relay webapp → integrator после изменения правил (шаг 12.3) не доведена до критериев плана.

## Шаги (по `PLAN.md` этапа 12, по порядку)

1. **12.1:** `ports.ts`, `pgReminderRules.ts`, переработка `service.ts`, `buildAppDeps.ts`, тесты `service.test.ts`, интеграция репозитория, `reminders.md`.
2. **12.2:** `patient/reminders/page.tsx`, `patient/reminders/actions.ts`, `paths.ts`, `PatientHeader.tsx`, `patient.md`.
3. **12.3:** `modules/integrator/*`, API `integrator/reminders/rules/*`, синхронизация с контрактом событий, `webhooks.md`, `api.md`.
4. **12.4:** `PatientHeader.tsx` (колокольчик), `useReminderUnreadCount.ts`, `integrator/reminders/history/route.ts`.
5. **12.5:** миграция seen, `pgReminderProjection.ts`, страница reminders, actions, обновление history route и тестов.

---

После реализации — прогон `pnpm run ci` и e2e по требованиям шагов 12.2 / 12.5.
