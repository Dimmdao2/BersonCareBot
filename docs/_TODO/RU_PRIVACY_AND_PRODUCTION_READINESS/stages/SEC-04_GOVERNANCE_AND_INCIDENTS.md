# SEC-04 — Access governance, vulnerability lifecycle and incidents

## Зависимости

SEC-03 принят; runtime detection verdict `G-06B`; central log gate `G-09`; break-glass gate `G-10`; DR-02 recovery
paths проверены.

## File scope gate

Allowed до exact manifest: только эта инициатива. Перед `doing` фиксируются конкретные ops/security log, alert,
access-review, incident runbook/test files. Out of scope: изменение clinical event contract SEC-03, auto-fix scanner
findings, реальные уведомления субъектам и production revoke/isolation без `G-11`.

## Slice A — access governance and vulnerability workflow

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Реестр SSH/Selectel/GitHub/DB/S3/global-admin доступов, owner и last review.
- [ ] Joiner/mover/leaver: issue/change/revoke с SLA/evidence; квартальная recertification.
- [ ] Break-glass: time-bound, reason, MFA, alert, after-action review.
- [ ] Findings из `#881`: severity, owner, remediation SLA, exception reason/expiry, retest.

## Slice B — protected logs and incident response

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Central security sink: least-privilege append/read, retention, alert delivery и redaction proof.
- [ ] Принятые EDR/HIDS либо compensating signals имеют severity mapping, dedup/suppression, дежурного owner,
      acknowledgement/remediation SLA и тест доставки; «логи собираются» не считается реагированием.
- [ ] Severity/triggers, incident role matrix и защищённый канал координации.
- [ ] Detect → contain → preserve evidence → scope subjects/data/tenants → eradicate → recover.
- [ ] Классифицировать событие: обычный security event либо установленная неправомерная/случайная передача/доступ,
      повлекшие нарушение прав субъектов. Только применимый второй класс запускает workflow 24/72.
- [ ] Таймеры 24/72 и notification decision; адресата/текст утверждает ответственное лицо.
- [ ] Утвердить и проверить процедуру взаимодействия с ГосСОПКА для применимого компьютерного инцидента.
- [ ] Emergency secret rotation, account revoke, tenant isolation и delivery shutdown имеют safe runbooks.
- [ ] Tabletop + technical drill на synthetic scenario без реальных сообщений/ПДн; lessons становятся tasks.

## Checks и выход

- Access review и vulnerability SLA report приняты владельцем.
- Alert достигает ответственного; incident timeline/evidence воспроизводимы.
- Tabletop и technical drill имеют отдельные evidence/audit; открытые exceptions имеют owner/expiry.
