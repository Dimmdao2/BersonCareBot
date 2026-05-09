# STAGE_C — Deploy Guardrails (Codex)

## Цель

Исключить silent-schema-drift в production deploy за счет guardrails и явных post-migrate проверок.

## Шаги

1. Проверить текущий deploy-путь (`deploy-prod.sh`, `deploy-webapp-prod.sh`) на предмет пропусков миграций.
2. Добавить/расширить post-migrate schema checks на критичные для рантайма колонки.
3. Убедиться, что ошибка guardrail останавливает deploy до рестарта сервиса.
4. Обновить runbook (`deploy/HOST_DEPLOY_README.md`) по новому канону.
5. Зафиксировать в `LOG.md`, какие проверки добавлены.

## Выход этапа

- deploy не проходит при отсутствии критичных webapp колонок;
- runbook синхронизирован с фактическими скриптами.

## Gate закрытия

- guardrail сценарий верифицирован;
- документация обновлена;
- в `LOG.md` есть итог этапа C.
