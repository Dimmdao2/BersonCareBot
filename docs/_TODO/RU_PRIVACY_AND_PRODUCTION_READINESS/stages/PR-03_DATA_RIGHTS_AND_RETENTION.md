# PR-03 — Data rights, retention and organization offboarding

## Зависимости

PR-02 принят; data ownership/retention matrix утверждены. Payment slice ждёт freeze billing contract `#751`.

## File scope gate

Allowed до exact manifest: только эта инициатива. Перед каждым domain slice в LOG фиксируются конкретные
schema/domain/service/API/job/S3/test/docs files. Out of scope: изменение billing contract #751, active SaaS plans,
unscoped delete scripts и production purge без dry-run/owner gate.

## Slice A — DSAR and correction

- [ ] Authenticated request workflow: status, SLA, assignee, identity verification и immutable audit trail.
- [ ] Экспортировать только данные субъекта в выбранном org context; чужой tenant/internal secrets исключены.
- [ ] Исправление проходит domain services и оставляет audit/event evidence.
- [ ] Отказ/частичное исполнение содержит причину и legal hold/retention basis.

## Slice B — retention, deletion and offboarding

- [ ] Матрица БД/files/messages/audit/backups/payments → trigger → срок → action → exception → owner.
- [ ] Идемпотентные jobs + dry-run/counts + operator health; голый unscoped delete запрещён.
- [ ] S3 orphan cleanup и backup expiry согласованы с recovery/retention, включая versioned objects.
- [ ] Tenant offboarding: suspend → export → retention/legal hold → purge/anonymize → integration revoke → evidence.
- [ ] Переиспользовать strict user purge как primitive и добавить отсутствующие domain paths.

## Checks и выход

- Для каждого domain slice: targeted tests + tenant-negative + retry/idempotency + отдельный audit.
- End-to-end synthetic TEST для access/export/correction/delete и org offboarding.
- Отчёт перечисляет исполненное, retained exceptions, сроки backup expiry и evidence references.
- Owner/legal acceptance закрывает data-rights stage отдельно от consent.
