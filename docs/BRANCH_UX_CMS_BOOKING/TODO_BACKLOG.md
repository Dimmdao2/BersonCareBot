# TODO / техдолг (трекинг AUDIT-BACKLOG)

Идентификаторы вида `AUDIT-BACKLOG-NNN` используются в комментариях кода и в [FINAL_AUDIT.md](./FINAL_AUDIT.md). При появлении тикета в GitHub добавьте ссылку в колонку «Issue».

| ID | Область | Статус | Описание |
|----|---------|--------|----------|
| AUDIT-BACKLOG-010 | `buildAppDeps` / рассылки | open | Фильтр `inactive`: точный подсчёт через `lastEventBefore` в `DoctorClientsPort`. |
| AUDIT-BACKLOG-011 | `buildAppDeps` / рассылки | open | Фильтр `sms_only`: признак канала SMS в порту клиентов. |
| AUDIT-BACKLOG-020 | `modules/integrator/events.ts` | open | Подключение к admin/user notifications pipeline. |
| AUDIT-BACKLOG-021 | `modules/appointments/service.ts` | open | Мост Rubitime / integrator вместо заглушки. |
| AUDIT-BACKLOG-022 | `app/app/doctor/layout.tsx` | open | Отдельный десктоп-layout с sidebar (STAGE_02). |
| AUDIT-BACKLOG-023 | `modules/auth/channelLink.ts` | open | Уведомления при конфликте привязки канала. |
| AUDIT-BACKLOG-024 | `infra/repos/pgUserProjection.ts` | open | Доработки autobind email из Rubitime (invalid/verified/conflict). |
| AUDIT-BACKLOG-025 | integrator / Rubitime API2 | open | Хранить маппинг числовых статусов Rubitime (`status` в create-record / вебхуках) в нормальном виде: справочник id → человекочитаемая метка (подтверждено: **0 = «записан»**). Сейчас в `recordM2mRoute` захардкожен `RUBITIME_CREATE_RECORD_DEFAULT_STATUS = 0`; при смене кабинета/статусов в Rubitime нужна конфигурация в `system_settings` (scope admin) или таблица + админка, не env. |

## Закрыто в рамках remediation

- Логирование в `apps/integrator/.../resolver.ts`: `console.log` заменён на `logger.debug`.
- Ссылка поддержки: ключ `support_contact_url` в `system_settings`, `getSupportContactUrl()`, формы OTP; дефолт вынесен в [`supportContactConstants.ts`](../../apps/webapp/src/modules/system-settings/supportContactConstants.ts) (client-safe, без тянущего `pg` импорта).
- Страницы help/install/references и копирайт «Карта пациента» без формулировок «в разработке» / «заглушка» в пользовательском тексте.
