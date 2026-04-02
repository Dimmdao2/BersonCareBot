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
| AUDIT-BACKLOG-025 | `apps/integrator/src/config/appTimezone.ts` | open | **Расширение / мульти-регион:** `utcOffsetMinutesFromLongOffset` и связанные вызовы при недоступном `longOffset` или невалидной зоне возвращают фолбэк **+180 мин** (типичный MSK). Сейчас безопасно при одном бизнес-поясе; при нескольких зонах или не-MSK — явный offset из конфигурации, логирование или fail-fast вместо тихого фолбэка. |
| AUDIT-BACKLOG-026 | `apps/webapp/src/infra/repos/pgPatientBookings.ts` | open | **Расширение compat-sync:** `upsertFromRubitime` UPDATE с большим числом параметров и `CASE` по `source` — корректен, но при росте полей проекции рассмотреть рефакторинг (разбиение запроса, CTE, явная типизация аргументов в одном месте) для снижения риска регрессий. |
| AUDIT-BACKLOG-027 | integrator env vs webapp `system_settings` | open | **Единый источник бизнес-таймзоны:** create-record в integrator использует `getAppDisplayTimezoneSync()` (env `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE`), кабинет — `getAppDisplayTimeZone()` из БД. При расширении или смене IANA-зоны исключить расхождение (выравнивание с `system_settings` / документированный контракт, см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`). |

## Закрыто в рамках remediation

- **AUDIT-BACKLOG-028 (backup обеих prod БД):** канонический скрипт `deploy/postgres/postgres-backup.sh` (integrator + webapp из `api.prod` / `webapp.prod`); установка на хост — `deploy/postgres/README.md`.
- Логирование в `apps/integrator/.../resolver.ts`: `console.log` заменён на `logger.debug`.
- Ссылка поддержки: ключ `support_contact_url` в `system_settings`, `getSupportContactUrl()`, формы OTP; дефолт вынесен в [`supportContactConstants.ts`](../../apps/webapp/src/modules/system-settings/supportContactConstants.ts) (client-safe, без тянущего `pg` импорта).
- Страницы help/install/references и копирайт «Карта пациента» без формулировок «в разработке» / «заглушка» в пользовательском тексте.
