# Stage manifests

| Stage | File | Mutations allowed now |
|---|---|---|
| PR-00 | [`PR-00_SCOPE_LOCK.md`](PR-00_SCOPE_LOCK.md) | docs + read-only discovery |
| PR-01 | [`PR-01_PROCESSING_REGISTER.md`](PR-01_PROCESSING_REGISTER.md) | docs only |
| SEC-01 | [`../../SECURITY_CI_STACK_PLAN.md`](../../SECURITY_CI_STACK_PLAN.md) | separate taskdb `#881` scope |
| SEC-02 | [`SEC-02_HOST_AND_SECRETS.md`](SEC-02_HOST_AND_SECRETS.md) | read-only preflight only until gates |
| DR-01/02 | [`DR-01_BACKUP_AND_RECOVERY.md`](DR-01_BACKUP_AND_RECOVERY.md) | design/preflight only until gates |
| CRYPTO-01 | [`CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md`](CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md) | ADR/design now; application mutations only after D4/S5-7/legal gates |
| INFRA-01 | [`INFRA-01_ENCRYPTED_PROD_MIGRATION.md`](INFRA-01_ENCRYPTED_PROD_MIGRATION.md) | repo design now; disposable/TEST then owner-gated target/cutover |
| PR-02 | [`PR-02_HEALTH_CONSENT.md`](PR-02_HEALTH_CONSENT.md) | blocked by D4 + S5-7 + legal text |
| PR-03A/B | [`PR-03_DATA_RIGHTS_AND_RETENTION.md`](PR-03_DATA_RIGHTS_AND_RETENTION.md) | A after PR-02 and before launch; B before purge; payment slice also #751 |
| SEC-03 | [`SEC-03_CLINICAL_ACCESS_AUDIT.md`](SEC-03_CLINICAL_ACCESS_AUDIT.md) | design only until D4 |
| SEC-04 | [`SEC-04_GOVERNANCE_AND_INCIDENTS.md`](SEC-04_GOVERNANCE_AND_INCIDENTS.md) | after SEC-03 + owner gates |
| PR-04A/B | [`PR-04_ISPDN_RELEASE_GATE.md`](PR-04_ISPDN_RELEASE_GATE.md) | A = pre-cutover GO; B = post-cutover closure |

До exact manifest разрешены только файлы этой инициативы. Перед `doing` исполнитель фиксирует taskdb ID, exact
file list, dependency SHA и аудитора в `LOG.md`; без этого любые code/deploy mutations запрещены. Всегда вне scope:
active SaaS/Product UX plan/log files, чужие worktrees и production mutation без отдельного `G-11` task.
