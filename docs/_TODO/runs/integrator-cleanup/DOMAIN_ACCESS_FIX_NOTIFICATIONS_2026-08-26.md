# Worker brief — notifications / reminders / delivery coherence

Перед действием прочитать `AGENTS.md` (карта, §1 migrations, §2-5, §10a/10b, §24), `docs/OWNER_DECISIONS.md`, относящиеся строки `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, README затронутых notification/broadcast modules.

Authority: owner требует одну canonical delivery state machine; `notification_delivery_attempts` хранит только реальные ошибки provider-attempt, итог остаётся в canonical queue. Внешнее напоминание врачу не содержит медицинский/задачный текст и ФИО пациента. Клиника использует свои effective settings и SMTP, platform fallback остаётся допустимым. Public unsubscribe не может сообщать успех без выполненной записи.

Исходные аудиты: communications и reminders briefs/logs; сводка `DOMAIN_ACCESS_AUDIT_SYNTHESIS_2026-08-26.md`. В ветке `wt/domain-audit-communications-20260826` коммит `194536460` добавил audit artifact и красный acceptance oracle unsubscribe — перенести его смысл/тест, не продуктовый fix.

## Цельный scope

1. Починить public topic unsubscribe: корректный существующий patient/global context для реальной записи; не проглатывать DB failure как success; не раскрывать существование recipient. Переиспользовать существующий журнал/telemetry, не создавать новый.
2. Specialist-task reminder: убрать ФИО пациента и текст задачи из всех внешних каналов, добавить безопасную ссылку в кабинет; сохранить полезный минимум.
3. Передавать organizationId сквозь существующий channel-resolution path, чтобы materializer читал ту же effective настройку, что UI. Параметризовать существующую функцию, не делать второй resolver.
4. Email eligibility учитывать platform или clinic SMTP по существующему delivery-profile resolver; не читать секреты и не заводить зеркало настроек.
5. Signed relay записывает в `notification_delivery_attempts` только `failed` реальную provider-attempt; `success` и `skipped` остаются только в canonical outcome/queue state. Защитить это и на DB-root границе, если root принимает произвольный status.
6. Обновить tests по owner semantics; не сохранять регрессию ради старых tests.

## Проверка и готовность

- Тот же unsubscribe acceptance становится зелёным.
- Targeted webapp/integrator tests для reminder settings, safe payload, SMTP eligibility, relay failure-only ledger.
- Generated privilege/port-context checks и candidate migration preflight при изменении DB roots.
- Не full CI, не deploy, не live external delivery.
- Закоммитить весь task-scope; не push.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «реальные попытки записываются только при ошибке»; `docs/OWNER_DECISIONS.md` — clinic-effective branding/delivery settings.
