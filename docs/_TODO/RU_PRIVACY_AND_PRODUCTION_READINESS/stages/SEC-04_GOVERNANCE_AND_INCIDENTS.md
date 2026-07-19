# SEC-04 — Access governance, vulnerability lifecycle and incidents

## Зависимости

SEC-03 принят; central log gate `G-09`; break-glass gate `G-10`; DR-02 recovery paths проверены.

## File scope gate

Allowed до exact manifest: только эта инициатива. Перед `doing` фиксируются конкретные ops/security log, alert,
access-review, incident runbook/test files. Out of scope: изменение clinical event contract SEC-03, auto-fix scanner
findings, реальные уведомления субъектам и production revoke/isolation без `G-11`.

## Slice A — access governance and vulnerability workflow

- [ ] Реестр SSH/Selectel/GitHub/DB/S3/global-admin доступов, owner и last review.
- [ ] Joiner/mover/leaver: issue/change/revoke с SLA/evidence; квартальная recertification.
- [ ] Break-glass: time-bound, reason, MFA, alert, after-action review.
- [ ] Findings из `#881`: severity, owner, remediation SLA, exception reason/expiry, retest.

## Slice B — protected logs and incident response

- [ ] Central security sink: least-privilege append/read, retention, alert delivery и redaction proof.
- [ ] Severity/triggers, incident role matrix и защищённый канал координации.
- [ ] Detect → contain → preserve evidence → scope subjects/data/tenants → eradicate → recover.
- [ ] Таймеры 24/72 и notification decision; адресата/текст утверждает ответственное лицо.
- [ ] Emergency secret rotation, account revoke, tenant isolation и delivery shutdown имеют safe runbooks.
- [ ] Tabletop + technical drill на synthetic scenario без реальных сообщений/ПДн; lessons становятся tasks.

## Checks и выход

- Access review и vulnerability SLA report приняты владельцем.
- Alert достигает ответственного; incident timeline/evidence воспроизводимы.
- Tabletop и technical drill имеют отдельные evidence/audit; открытые exceptions имеют owner/expiry.
