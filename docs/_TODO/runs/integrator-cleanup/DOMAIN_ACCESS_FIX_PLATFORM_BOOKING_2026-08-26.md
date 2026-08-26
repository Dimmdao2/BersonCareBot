# Worker brief — platform support and public-booking DB doors

Перед действием прочитать `AGENTS.md` (карта, §1 migrations, §4a, §5, §10a/10b, §24), `docs/OWNER_DECISIONS.md:190-210`, module docs для doctor clients и patient booking.

Authority: blocked — глобальная блокировка identity с немедленным прекращением сессии и новой записи; archive — только clinic enrollment. Repo rule §5: runtime DB access идёт через application port + Drizzle named root с accepted context, без raw pool/route DML. Existing public booking must record merge candidates or expose failure; silent loss forbidden.

Исходный audit: `DOMAIN_ACCESS_AUDIT_CLINICAL_2026-08-26.md`; сводка `DOMAIN_ACCESS_AUDIT_SYNTHESIS_2026-08-26.md`.

## Цельный scope

1. Перевести `/api/doctor/clients/support-account` с route-level direct DML на существующий/расширенный application port и один cohesive named DB root для block/unblock/revoke contact/revoke binding. Global block обязан bump `session_epoch`; unblock не должен оживлять старую cookie. Не менять выбранную owner semantics global blocked.
2. Перевести `pgPublicBookingMergeCandidates` с raw pool на нормальный booking application port/context и named root (или расширить уже существующий booking root, если это сохраняет атомарный бизнес-путь). Убрать silent catch: booking path не заявляет полный success зависимой операции при потере merge candidate; выбрать уже существующую error/telemetry семантику.
3. Не добавлять delete visit и не переделывать archive/blocked UX — вне подтверждённого fix scope.
4. Добавить behavioral tests для support rights/session epoch и merge candidate persistence/failure. Без source-text tests.
5. Forward migration + declaration/generated artifacts по §1; миграция не содержит GRANT/REVOKE.

## Проверка и готовность

- Targeted route/service tests.
- Rollback-only candidate DB proofs под `app_platform_settings` и public-booking runtime role, включая missing context и cross-tenant denial.
- `generate-cli.mjs --check`, port-context check, migration preflight.
- Письменный разбор прав migration.
- Не full CI, не deploy, не применять миграции живой DEV/TEST.
- Закоммитить task-scope; не push.

Источник оракула: `docs/OWNER_DECISIONS.md` — «Blocked — глобальная блокировка учётки» и «Действующая сессия должна перестать давать доступ»; `AGENTS.md` §5 — «К базе — только через порт своего приложения на drizzle».
