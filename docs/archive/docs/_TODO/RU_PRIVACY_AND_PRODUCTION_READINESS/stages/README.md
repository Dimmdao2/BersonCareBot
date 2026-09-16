# Stage manifests

| Stage     | File                                                                                       | Mutations allowed now                                                                                                |
| --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| PR-00     | [`PR-00_SCOPE_LOCK.md`](PR-00_SCOPE_LOCK.md)                                               | docs + read-only discovery                                                                                           |
| PR-01     | [`PR-01_PROCESSING_REGISTER.md`](PR-01_PROCESSING_REGISTER.md)                             | docs only                                                                                                            |
| INFRA-SEC | [`../../INFRASTRUCTURE_SECURITY_PLAN.md`](../../INFRASTRUCTURE_SECURITY_PLAN.md)             | единственный план SEC-01/02, DR-01/02, CRYPTO-01, INFRA-01 и инфраструктурной части SEC-04                           |
| NTF-01    | [`NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md`](NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md) | N0 docs/read-only now; N1 only after exact dispatch scope; native provider waits MOB gates                           |
| LOG-01    | [`LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md`](LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md)               | L0 census and exact-scoped L1 logging guard can run now                                                              |
| PR-02     | [`PR-02_HEALTH_CONSENT.md`](PR-02_HEALTH_CONSENT.md)                                       | blocked by D4 + S5-7 + legal text                                                                                    |
| PR-03A/B  | [`PR-03_DATA_RIGHTS_AND_RETENTION.md`](PR-03_DATA_RIGHTS_AND_RETENTION.md)                 | A0 disables/gates current admin hard-delete now; rest of A after PR-02; B before purge; payment slice also #844/#845 |
| SEC-03    | [`SEC-03_CLINICAL_ACCESS_AUDIT.md`](SEC-03_CLINICAL_ACCESS_AUDIT.md)                       | design only until D4                                                                                                 |
| PR-04A/B  | [`PR-04_ISPDN_RELEASE_GATE.md`](PR-04_ISPDN_RELEASE_GATE.md)                               | A = pre-cutover GO; B = post-cutover closure                                                                         |

До exact manifest разрешены только файлы этой инициативы. Перед `doing` исполнитель фиксирует taskdb ID, exact
file list, dependency SHA и аудитора в `LOG.md`; без этого любые code/deploy mutations запрещены. Всегда вне scope:
active SaaS/Product UX plan/log files, чужие worktrees и production mutation без отдельного `G-11` task.
