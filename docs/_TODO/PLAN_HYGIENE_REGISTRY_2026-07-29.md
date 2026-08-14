# E1 — реестр гигиены планов · 2026-07-29

> **ИСТОРИЧЕСКИЙ CENSUS, НЕ ТЕКУЩАЯ AUTHORITY.** Строки, где `CRYPTO_INFRA_SEC_WORK_SPLIT`,
> `SECURITY_CI_STACK_PLAN`, `TOOLING_AND_HOST_PACKAGES`, `INFRA-01`, `CRYPTO-01`, `DR-01`, `SEC-02` или `SEC-04`
> названы `ЖИВОЙ/оставить на месте`, заменены консолидацией 2026-08-13. Карта переноса:
> [`docs/archive/2026-08-infrastructure-security-consolidation/README.md`](../archive/2026-08-infrastructure-security-consolidation/README.md);
> текущий канон: [`INFRASTRUCTURE_SECURITY_PLAN.md`](INFRASTRUCTURE_SECURITY_PLAN.md).

> Канон классификации: `DOCS_PLAN_HYGIENE_2026-07-29.md` (E1), `BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3 и `docs/_TODO/README.md`. Для спорного вердикта применена обязательная процедура владельца: сначала ссылка на преемника внутри файла, затем поиск преемника по репозиторию, затем сверка с кодом; если подтверждения нет — `ЖИВОЙ` с явной пометкой.

Снимок: **315** `.md` под `docs/_TODO/**` (фактическое число, не 291), включая этот реестр. `open` = `- [ ]`, `closed` = `- [x]`; `- [-]` показаны в отдельной колонке «мёртвых» как контекст и не входят ни в один счёт.

## 1.1–1.3. Полный реестр

| path | open | closed | [-] | verdict | grounds (quote/link) | destination |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `B1_B2_IDENTITY_SPLIT_RUNBOOK.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `BACKLOG_CONSOLIDATION_2026-07-26.md` | 0 | 0 | 0 | **ЖИВОЙ** (исправлено 29.07) | Смешанная судьба: замер §6/§6.1 действительно устарел («цифры устарели за сутки», §6.2), НО в этом же файле лежит **действующий канон разметки §6.4** (решения владельца 29.07) — единственный источник разметки для всего репозитория. Архивировать нельзя: канон уедет вместе с замером. Устаревшая часть помечается внутри файла, файл остаётся на месте. | остаётся |
| `BACKLOG_HYGIENE_HANDOVER_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `BCB2_OWNER_PUNCHLIST_2026-07-18.md` | 0 | 61 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `BCB2_PUNCHLIST_TRIAGE_2026-07-18.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `BOOKING_ACTOR_ATTENDEE_DESIGN.md` | 0 | 0 | 9 | ОТМЕНЁН | «⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 27.07.2026 — К РЕАЛИЗАЦИИ НЕ БРАТЬ»; «Если кого то другого надо записать, напишут в комментарии». | архив |
| `BOOKING_MULTISLOT_DESIGN.md` | 1 | 11 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `BUILT_BUT_INVISIBLE_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `C4_ADMIN_ALLOWLISTS_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` | 0 | 8 | 0 | ЗАКРЫТ | Шапка: «STATUS (verified 2026-07-23, code-reconciled)»; все 8 checklist-строк [x]. | архив |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/RAW_SQL_RULING.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/REQUIREMENTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/S2_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/db-access-map.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/log.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `DOCS_PLAN_HYGIENE_2026-07-29.md` | 37 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается; 8 строк коррекции 1.8–1.15 добавлены после первого census (`DOCS_PLAN_HYGIENE_2026-07-29.md:149-170`). | оставить на месте |
| `DOCTOR_DNA_MIGRATION/PLAN.md` | 0 | 4 | 1 | ОТМЕНЁН | «⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ — ТОЛЬКО ИСТОРИЧЕСКАЯ ЗАПИСЬ»; решение 27.07 «закрывай. я сказал». | архив |
| `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` | 66 | 69 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `EDITOR_TIPTAP_MIGRATION_PLAN.md` | 1 | 12 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `HANDOFF_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `HANDOFF_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `INVENTED_SCOPE_FOR_OWNER_REVIEW_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/FINAL_ACCEPTANCE.md` | 0 | 0 | 19 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/LOG.md` | 0 | 0 | 0 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` | 0 | 0 | 41 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/OWNER_ACTIONS.md` | 0 | 0 | 0 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/README.md` | 0 | 0 | 0 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/REQUIREMENTS.md` | 0 | 0 | 0 | ОТЛОЖЕН | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». | оставить на месте |
| `NIGHT_2026-07-17_OWNER_DIGEST.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «НЕ АКТУАЛЬНО / ЧАСТИЧНО УСТАРЕЛО»; «Актуально: PRODUCTION_READINESS_LEDGER… и …IMPLEMENTATION_ROADMAP» (`NIGHT_2026-07-17_OWNER_DIGEST.md:3-10`). | архив |
| `NIGHT_PLAN_2026-07-26.md` | 13 | 31 | 5 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `NOTIFICATION_ALERTING_DESIGN_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `OUTBOUND_DELIVERY_ALERTING_PLAN.md` | 2 | 4 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `OWNER_PUNCHLIST_2026-07-28.md` | 26 | 41 | 3 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `OWNER_QUESTIONS_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `OWNER_WALKTHROUGHS/2026-07-27_global-admin.md` | 9 | 33 | 0 | ЖИВОЙ | «Это РАБОТА, а не вопрос к владельцу»; 9 пунктов остаются `[ ]`, включая распоряжения и вопросы (`OWNER_WALKTHROUGHS/2026-07-27_global-admin.md:13-20,46-55,71-73,94-95,180-181,196,250`). | оставить на месте |
| `OWNER_WALKTHROUGHS/2026-07-27_ОТВЕТЫ.md` | 0 | 0 | 0 | ЖИВОЙ | Это связанный ответ к живому проходу: «Ответы владельцу на вопросы из этого прохода» (`OWNER_WALKTHROUGHS/2026-07-27_global-admin.md:9`); папка — «единственное место» для проходов (`OWNER_WALKTHROUGHS/README.md:3-5`). | оставить на месте |
| `OWNER_WALKTHROUGHS/README.md` | 0 | 0 | 0 | ЖИВОЙ | «Теперь единственное место — здесь»; открытый пункт должен иметь `[ ]`, а решение «уходит в план, не в код» (`OWNER_WALKTHROUGHS/README.md:3-5,13-20`). | оставить на месте |
| `PLAN_HYGIENE_REGISTRY_2026-07-29.md` | 0 | 0 | 0 | ЖИВОЙ | Текущий результат Э1, который проходит коррекцию после FAIL: «Коррекция Э1 (закрывать по одному, каждый со своим доказательством)» (`DOCS_PLAN_HYGIENE_2026-07-29.md:142-170`). | оставить на месте |
| `PRE_PRODUCTION_TODO.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `PROD_VS_TEST_DIVERGENCE_2026-07-26.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `PROGRAM_INDIVIDUAL_ITEM_DESIGN.md` | 0 | 8 | 0 | ВЫТЕСНЕН | «Но 27.07 владелец ОТМЕНИЛ это решение §1.c и потребовал подпапку всё-таки завести; эта новая работа перенесена в `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` §C2» (`PROGRAM_INDIVIDUAL_ITEM_DESIGN.md:10-13`). | архив |
| `README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/CURRENT_PROD_BASELINE_2026-07-19.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/FINAL_ACCEPTANCE.md` | 35 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` | 12 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md` | 26 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_AND_LEGAL_GATES.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/PII_MEDICAL_STORE_SEPARATION_RECON_2026-07-24.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/REQUIREMENTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/TOOLING_AND_HOST_PACKAGES.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` | 31 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/DR-01_BACKUP_AND_RECOVERY.md` | 14 | 4 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` | 38 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md` | 22 | 9 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md` | 26 | 19 | 12 | ЖИВОЙ | **ЧАСТИЧНАЯ отмена, не вытеснение.** Шапка файла дословно: «🔴 **ЧАСТИЧНО** ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-27» и отдельным блоком «**Что НЕ отменено и продолжает действовать полностью:** default-deny для всего неперечисленного; запрет на generic relay как лазейку; привязка каждого потока к КОНКРЕТНОМУ template/class; вся матрица §4; запрет на raw chat preview» (`…/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md:5,19`). Умер только push-only target и жёсткая форма channel matrix; **26 живых `[ ]` остаются работой**. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md` | 6 | 1 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md` | 6 | 4 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-02_HEALTH_CONSENT.md` | 8 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md` | 21 | 6 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-04_ISPDN_RELEASE_GATE.md` | 7 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-02_HOST_AND_SECRETS.md` | 23 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-03_CLINICAL_ACCESS_AUDIT.md` | 5 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md` | 13 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/01_MASTER_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/02_PHASED_BRIEF.md` | 0 | 0 | 0 | ЗАКРЫТ | Историческая запись: тот же Phase 0 объём уже выполнен и закрыт. Исправлено 29.07 по аудиту `audit-e2b-0729`. | архив |
| `SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md` | 22 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md` | 2 | 34 | 0 | ЖИВОЙ | «P0.7.6 … is not done»; работа разнесена по восьми названным трекерам с итогами 17/17, 9/9, 15/15, 20/20, 12/12, 17/17 (`SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md:14-22`); живой P0.7.6 действительно `[ ]` (`SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md:79`). | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/C1_WALLS_TEST_CHECKLIST.md` | 1 | 13 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/CORRECTED_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md` | 2 | 10 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/DORMANT_DEPLOY_TEST_RUNBOOK.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/FOUNDATION_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/GATES_WHAT_THEY_GUARD.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/HANDOFF_2026-07-12.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/ISOLATION_PROVISIONING_REMEDIATION_PLAN_2026-07-24.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/LANDING_AND_ENTRIES_DESIGN.md` | 7 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/ORCHESTRATOR_BRIEF.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/ORCHESTRATOR_CHECKLIST.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_DECISIONS_FOR_REVIEW.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/REQUIREMENTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/ROADMAP.md` | 20 | 30 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/ST-02_WALKTHROUGH.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-01-final-PASS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-02-final-PASS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-curated-system-health-closure.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-final-PASS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-04-integration-PASS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-01.md` | 1 | 8 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-02.md` | 1 | 18 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md` | 1 | 8 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md` | 13 | 8 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/owner-intent-reconciliation.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/process-audit-status.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/log.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-18.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «УСТАРЕЛ / SUPERSEDED»; решения «консолидированы без конкурирующей копии» в `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` (`SAAS_FOUNDATION/OWNER_RULINGS_2026-07-18.md:1-8`). | архив |
| `SAAS_FOUNDATION/P0_10_CI_INVARIANTS_CHECKLIST.md` | 0 | 15 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». | архив |
| `SAAS_FOUNDATION/P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` | 0 | 20 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». | архив |
| `SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md` | 0 | 12 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». | архив |
| `SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md` | 0 | 17 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». | архив |
| `SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md` | 0 | 42 | 0 | ЗАКРЫТ | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. | архив |
| `SAAS_FOUNDATION/P0_4_BATCHES.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_5B_GRANTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_6_DORMANT_CONTEXT_CHECKLIST.md` | 0 | 12 | 0 | ЗАКРЫТ | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. | архив |
| `SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md` | 8 | 20 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_8_CODE_FACTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/P0_8_RLS_DESCRIPTOR_CHECKLIST.md` | 0 | 17 | 0 | ЗАКРЫТ | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. | архив |
| `SAAS_FOUNDATION/P0_9_DEFAULT_DENY_CHECKLIST.md` | 0 | 9 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». | архив |
| `SAAS_FOUNDATION/P0_UNPRINCIPLED_READ_INVENTORY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` | 18 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md` | 1 | 14 | 0 | ЖИВОЙ | «Phase 0 design-lock delivered»; 3 follow-on пункта «ВЫТЕСНЕНО — the follow-on work moved into `SAAS_ENFORCE_ROADMAP.md`» (`SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md:5-11`). | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/PHASE3_ORCHESTRATION.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md (часть I)` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md (часть II)` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md` | 8 | 3 | 0 | ЖИВОЙ | «НЕ АКТУАЛЬНО»; все 8 строк «ВЫТЕСНЕНО» в `SAAS_ENFORCE_ROADMAP.md`/`R2_MVP_MASTER_CHECKLIST.md`, «часть — уже закрыта там, часть — всё ещё открыта» (`SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md:3-15`). | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/R2_MVP_MASTER_CHECKLIST.md` | 13 | 12 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/R2_READINESS_CLOSURE.md` | 0 | 0 | 0 | ЗАКРЫТ | Историческая запись завершённого readiness/closure; текущая R2 enforcement-работа её не продолжает. Исправлено 29.07 по аудиту `audit-e2b-0729`. | архив |
| `SAAS_FOUNDATION/RAW_SQL_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/REQUIREMENTS.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «НЕ АКТУАЛЬНО»; актуальны `01_MASTER_PLAN.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`, `SAAS_ENFORCE_ROADMAP.md` (`SAAS_FOUNDATION/REQUIREMENTS.md:3-7`). | архив |
| `SAAS_FOUNDATION/REVIEW_2026-06-17_FRESH.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/RLS_UNPRINCIPLED_READ_FIX_PLAN.md` | 6 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/ROADMAP_TO_SAAS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` | 63 | 115 | 0 | АРХИВ | 63 открытых бокса — исторический снимок, не live queue: Rubitime выведено 2026-07-27, owner archive decision 2026-07-29. Архивный plan не исполнять. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_ORCHESTRATION_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R0_FREEZE_REPORT.md` | 0 | 9 | 0 | ЗАКРЫТ | Основание: R0 freeze report — исторический отчёт заморозки, не живой исполнительный план. | архив |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_FALLBACK_IMPORT_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_FALLBACK_SPECIALIST_IMPORT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_NON_CONFIRMED_CLEANUP.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_SOL_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R2_DOCTOR_READ_SOURCE_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_BRANCH_SERVICE_ID_REMOVAL_PREP.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_SLOTS_CREATE_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_TENANT_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «SUPERSEDED ACCEPTANCE»; файл сохраняет историческое source evidence (`archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md:8-13`). | уже находился в archive/2026-07-plans; не копировался |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «SUPERSEDED 2026-07-15. The former template was for an external operation and must not be executed» (`archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md:3-4`). | уже находился в archive/2026-07-plans; не копировался |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «SUPERSEDED / HISTORICAL REFERENCE»; команды «none … is executable» (`archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md:8-12`). | уже находился в archive/2026-07-plans; не копировался |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.template.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_LIFECYCLE_ROUTE_SPLIT_PROOF.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_R7_STATIC_INVENTORY.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.template.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_RR_PROOF_INDEX.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_TEST_R6_R7_PROGRESS_2026-07-24.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `SAAS_FOUNDATION/S4_0_S4_1_CONTRACT_INVENTORY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_B1_DOCTOR_ADMIN_IDENTITY.md` | 0 | 10 | 0 | ЗАКРЫТ | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)»; это закрытый доказательный чек-лист. | архив |
| `SAAS_FOUNDATION/SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C1_WEBAPP_DUAL_POOL_FANOUT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_D1_664_WITH_CHECK_REVERIFY.md` | 1 | 7 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md` | 1 | 7 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_E1_REMINDER_M2M_ORG_CONTEXT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` | 29 | 29 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md` | 0 | 9 | 0 | ЗАКРЫТ | Основание: собственная шапка/строки фиксируют закрытый smoke A1; нет открытых пунктов. | архив |
| `SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` | 3 | 1 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md` | 5 | 4 | 0 | ЖИВОЙ | «ИСТОРИЧЕСКАЯ ЗАПИСЬ (frozen)… не текущий план»; продолжение в `SAAS_ENFORCE_ROADMAP.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md` (`SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md:3-6`). | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` | 4 | 2 | 0 | ЖИВОЙ | «ИСТОРИЧЕСКАЯ ЗАПИСЬ (frozen)… не текущий план»; продолжение в `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`, `SAAS_ENFORCE_ROADMAP.md` (`SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md:3-6`). | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/SAAS_R3_CUT_INVENTED_SCOPE.md` | 14 | 82 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md` | 31 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` | 59 | 31 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS_LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md` | 32 | 21 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` | 36 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/SEQUENCE.md` | 17 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md` | 1 | 18 | 0 | ЖИВОЙ | «УСТАРЕЛ / SUPERSEDED»; актуальная декомпозиция: `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`. | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md` | 1 | 13 | 0 | ЖИВОЙ | «historical P0 checklist, не текущий product plan»; заменён `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`. | гейт 29.07: держит живую работу, в архив не идёт |
| `SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; архивировано по решению владельца 2026-07-29. | перенесено в Rubitime archive |
| `SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` | 0 | 29 | 0 | ЗАКРЫТ | Шапка: «RE-VERIFIED 2026-07-23 (all [x] audited vs code)»; все 29 строк [x]. | архив |
| `SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` | 26 | 20 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md` | 7 | 18 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/TASK_FOR_SOL_multitenant_flip.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «НЕ АКТУАЛЬНО»; актуальны `OWNER_RULINGS_2026-07-15.md`, `SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md` (`SAAS_FOUNDATION/TASK_FOR_SOL_multitenant_flip.md:3-7`). | архив |
| `SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md` | 7 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_FOUNDATION/UPSTREAM_SYNC_POLICY.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/UPSTREAM_SYNC_REGRESSION_CHECKLIST.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/method-code.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/method-fk.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_FOUNDATION/spike/PROOF.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/BRANDING_CAPABILITY_MATRIX.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/CURRENT_STATE_BASELINE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` | 13 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/LOG.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OPERATING_MODEL.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` | 0 | 6 | 0 | ЖИВОЙ | Шапка называет его «Единственный канонический документ всей диктовки владельца»; 0 open не отменяет его authority. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/README.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/REQUIREMENTS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ROADMAP.md` | 0 | 8 | 0 | ВЫТЕСНЕН | Шапка: «discovery history и provenance»; исполнимый порядок — `IMPLEMENTATION_ROADMAP.md` §7.3, product authority — `OWNER_REVIEW_2026-07-18.md`. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_COMPOSITION.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_PATIENT_PUBLIC.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_SPECIALIST.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_ACCEPTANCE.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_EVIDENCE_MANIFEST.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_FRESH_AUDIT_2026-07-15.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_RECONCILIATION_REVIEW.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_VISUAL_ATTEMPT_LEDGER.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_PRODUCT_PATTERNS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_RESEARCH_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_TECHNICAL_PATTERNS.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_OPERATING_MODEL_DRAFT.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX04_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX04_SCREEN_STATE_LIST.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX05_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX06_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_PROTOTYPE_INDEX.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_USABILITY_FINDINGS.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX09_INDEPENDENT_AUDIT.md` | 0 | 0 | 0 | ЗАКРЫТ | исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение. | архив |
| `SECURITY_AUDIT_2026-07-25/FINDINGS.md` | 0 | 0 | 0 | ЖИВОЙ | «S4/S5/S6 not started. NOTHING here has been fixed yet» (`SECURITY_AUDIT_2026-07-25/FINDINGS.md:16-18`). | оставить на месте |
| `SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md` | 0 | 0 | 0 | ЖИВОЙ | «Some findings are already fixed …; the rest are open»; следующий этап — «a full deep security re-audit» (`SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md:3-6`). | оставить на месте |
| `SECURITY_CI_STACK_PLAN.md` | 4 | 16 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `SLUG_RENAME_POLICY_RESEARCH_2026-07-27.md` | 0 | 0 | 0 | ВЫТЕСНЕН | «SUPERSEDED — 2026-07-27»; policy replaced by `OWNER_PRODUCT_RULES.md` §12, implemented by `d4d9a2771` (`SLUG_RENAME_POLICY_RESEARCH_2026-07-27.md:3-7`). | архив |
| `STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` | 29 | 45 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `STATE_2026-07-28_EVENING.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `TEST_SUITE_AUDIT_2026-07-29.md` | 5 | 0 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | 0 | 0 | 0 | ЗАКРЫТ | Датированный snapshot сохранён на исходном пути; его прежнее «Track C NOT done» superseded текущим `WORK_ORDER.md`: Track C завершён 2026-07-27 и архивирован по решению владельца 2026-07-29. Не является authority. | оставить на месте как историю |
| `UI_FINISH_AND_REAUDIT_2026-07-22/NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` | 0 | 0 | 0 | ЗАКРЫТ | Датированный snapshot сохранён на исходном пути; его Rubitime/Track C состояние superseded текущим `WORK_ORDER.md`. Не является очередью действий. | оставить на месте как историю |
| `UI_FINISH_AND_REAUDIT_2026-07-22/ORCHESTRATOR_PROMPT.md` | 0 | 0 | 0 | ЖИВОЙ | Track C явно закрыт; оставшиеся Track A/B и общая orchestration discipline сохраняют силу. | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/PROCESS_AUDIT_LOG.md` | 0 | 0 | 0 | ЖИВОЙ | Собственный вердикт: «WARN; operational completion is not done» (`UI_FINISH_AND_REAUDIT_2026-07-22/PROCESS_AUDIT_LOG.md:30`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` | 0 | 0 | 0 | ЗАКРЫТ | Датированный snapshot сохранён для provenance; его старые `REMAINING-BACKEND`/Track C формулировки не определяют текущую очередь и superseded `WORK_ORDER.md`. | оставить на месте как историю |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md` | 0 | 0 | 0 | ЖИВОЙ | «remaining open items are hardening»; отдельные пункты имеют статус `OWNER-TRIAGE` (`UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md:26,93-100`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` | 0 | 0 | 0 | ВЫТЕСНЕН | Tombstone `SUPERSEDED 2026-07-29`; исполняемых Git/deploy/DB-команд нет. | архивный move-pass |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` | 0 | 0 | 0 | ЗАКРЫТ | Датированный execution snapshot сохранён на исходном пути; его старые `REMAINING` и Track C evidence не являются текущим authority после retirement safety в `WORK_ORDER.md`. | оставить на месте как историю |
| `UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | 0 | 0 | 0 | ВЫТЕСНЕН | Tombstone `SUPERSEDED 2026-07-29`; текущий старт — taskdb + authority map. | архивный move-pass |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md` | 0 | 0 | 0 | ЖИВОЙ | Собственные разделы `NOT DONE`: «Owner visual/click acceptance remains open» (`UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md:58-67,89-91`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_DNA_LIVE_EVIDENCE.md` | 0 | 0 | 0 | ЖИВОЙ | Track A evidence; Rubitime retirement не определяет его статус. | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md` | 0 | 0 | 0 | ЖИВОЙ | Матрица прямо оставляет owner/dependency gates open (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md:52,68-70`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_ROADMAP_DAG_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | «full U3B stage cannot close», U6B и U10 blocked/open (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_ROADMAP_DAG_REALITY_AUDIT.md:60,65-66,72`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: formal owner acceptance и отдельный дефект messages остаются открыты (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md:217-220`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI0_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: «Owner live recheck remains explicitly open and owner-only» (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI0_REALITY_AUDIT.md:53-59`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI1_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: populated/mobile evidence missing; owner interaction acceptance remains open (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI1_REALITY_AUDIT.md:123-126`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI2_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: positive Online-on states still missing (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI2_REALITY_AUDIT.md:116-118`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI3_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | «owner-closed remains `0/8`: owner acceptance is still open» (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI3_REALITY_AUDIT.md:119-123`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_LIVE_EVIDENCE.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: «Owner PNG/click acceptance remains open» (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_LIVE_EVIDENCE.md:94-96`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: UI-4 cannot be marked done; acceptance contract incomplete (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_REALITY_AUDIT.md:41-43`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI5A_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | Собственный раздел `NOT DONE` фиксирует незакрытый остаток (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI5A_REALITY_AUDIT.md:46-50`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI6_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | Собственный раздел `NOT DONE` фиксирует незакрытый остаток (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI6_REALITY_AUDIT.md:154-159`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI8_UI9_CLIENT_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | Собственный раздел `NOT DONE` фиксирует незакрытый остаток (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI8_UI9_CLIENT_REALITY_AUDIT.md:83-87`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UIP_REALITY_AUDIT.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: populated Messages live state remains (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UIP_REALITY_AUDIT.md:122-125`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_B_B4_OWNER_HANDOFF.md` | 0 | 0 | 0 | ЖИВОЙ | «Status: UNVERIFIED»; «Track B remains open» (`UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_B_B4_OWNER_HANDOFF.md:3-4`). | оставить на месте |
| `archive/2026-07-rubitime-retirement/TRACK_C_R5_R7_EVIDENCE_MATRIX.md` | 0 | 0 | 0 | АРХИВ | Rubitime выведено 2026-07-27; владелец 2026-07-29 потребовал явно архивировать исторические документы. | перенесено в Rubitime archive |
| `UI_FINISH_AND_REAUDIT_2026-07-22/U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md` | 0 | 0 | 0 | ЖИВОЙ | `NOT DONE`: manual TEST click и live `.ics`/settings proofs remain open (`UI_FINISH_AND_REAUDIT_2026-07-22/U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md:18-19,42-46`). | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` | 8 | 3 | 0 | ЖИВОЙ | Track C закрыт/архивирован; текущая provider-neutral Track D и другие открытые tracks остаются в этом authority. | оставить на месте |
| `UI_WALKTHROUGH_2026-07-25.md` | 0 | 0 | 0 | ЖИВОЙ | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. | оставить на месте |
| `UNSUPPORTED_CLIENT_FALLBACK_PLAN.md` | 3 | 2 | 0 | ЖИВОЙ | Открытые [ ] остаются: без прямого архивного основания файл не закрывается. | оставить на месте |

## 1.4. Файлы с 0 открытых чекбоксов

> Различены не только «0 open», но и судьба: `[x]` — действительно закрытые доказанные строки; `[-]` — отменённые/вытесненные/замороженные, а не выполненные.

| path | [x] | [-] | fate | grounds |
| --- | ---: | ---: | --- | --- |
| `BCB2_OWNER_PUNCHLIST_2026-07-18.md` | 61 | 0 | не классифицирован для архива | 0 открытых, но нет достаточного основания для архивного вердикта; требует решения лида. |
| `BOOKING_ACTOR_ATTENDEE_DESIGN.md` | 0 | 9 | отменён владельцем | «⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 27.07.2026 — К РЕАЛИЗАЦИИ НЕ БРАТЬ»; «Если кого то другого надо записать, напишут в комментарии». |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` | 8 | 0 | закрыт по [x] | Шапка: «STATUS (verified 2026-07-23, code-reconciled)»; все 8 checklist-строк [x]. |
| `DOCTOR_DNA_MIGRATION/PLAN.md` | 4 | 1 | отменён владельцем | «⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ — ТОЛЬКО ИСТОРИЧЕСКАЯ ЗАПИСЬ»; решение 27.07 «закрывай. я сказал». |
| `NATIVE_MOBILE_APP_INITIATIVE/FINAL_ACCEPTANCE.md` | 0 | 19 | отложен | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». |
| `NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` | 0 | 41 | отложен | Владелец 27.07: «инициатива нативного мобильного приложения не выдумана — просто не сейчас. Пока pwa». |
| `PROGRAM_INDIVIDUAL_ITEM_DESIGN.md` | 8 | 0 | вытеснен | «Но 27.07 владелец ОТМЕНИЛ это решение §1.c и потребовал подпапку всё-таки завести; эта новая работа перенесена в `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` §C2» (`PROGRAM_INDIVIDUAL_ITEM_DESIGN.md:10-13`). |
| `SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md` | 0 | 51 | вытеснен; 44 строки живут в преемниках, 7 — frozen template | «P0.7.6 … is not done»; per-group successors и их итоги перечислены в самом файле (`SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md:14-22`), живой P0.7.6 подтверждён `[ ]` (`SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md:73-80`). |
| `SAAS_FOUNDATION/P0_10_CI_INVARIANTS_CHECKLIST.md` | 15 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». |
| `SAAS_FOUNDATION/P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` | 20 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». |
| `SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md` | 12 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». |
| `SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md` | 17 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». |
| `SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md` | 42 | 0 | закрыт по [x] | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. |
| `SAAS_FOUNDATION/P0_6_DORMANT_CONTEXT_CHECKLIST.md` | 12 | 0 | закрыт по [x] | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. |
| `SAAS_FOUNDATION/P0_8_RLS_DESCRIPTOR_CHECKLIST.md` | 17 | 0 | закрыт по [x] | «STATUS (verified 2026-07-23, code-reconciled)»; все строки [x]. |
| `SAAS_FOUNDATION/P0_9_DEFAULT_DENY_CHECKLIST.md` | 9 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)». |
| `SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md` | 12 | 3 | 12 сделано + 3 вытеснено | «Phase 0 design-lock delivered»; три follow-on строки moved into `SAAS_ENFORCE_ROADMAP.md`, включая G6, который «NOT fully resolved» (`SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md:5-11,327-349`). |
| `SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md` | 3 | 8 | 3 сделано + 8 вытеснено | Все 8 moved в `SAAS_ENFORCE_ROADMAP.md`/`R2_MVP_MASTER_CHECKLIST.md`; «часть — уже закрыта там, часть — всё ещё открыта» (`SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md:11-15`). |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R0_FREEZE_REPORT.md` | 9 | 0 | закрыт по [x] | Основание: R0 freeze report — исторический отчёт заморозки, не живой исполнительный план. |
| `SAAS_FOUNDATION/SAAS_B1_DOCTOR_ADMIN_IDENTITY.md` | 10 | 0 | закрыт по [x] | «RE-VERIFIED 2026-07-23 (all [x] audited vs code)»; это закрытый доказательный чек-лист. |
| `SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md` | 9 | 0 | закрыт по [x] | Основание: собственная шапка/строки фиксируют закрытый smoke A1; нет открытых пунктов. |
| `SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md` | 4 | 5 | 4 PASS + 5 🧊 frozen FAIL; вытеснен текущими планами | «Independent audit verdict (frozen): 4/9. PASS: … FAIL: …»; «must not retick this historical stage record» (`SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md:3-6,17-19`). |
| `SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` | 2 | 4 | 2 PASS + 4 🧊 frozen FAIL; вытеснен текущими планами | «Independent audit verdict (frozen): 2/6. PASS: … FAIL: …»; запись не перетикивать (`SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md:3-6,22-24`). |
| `SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md` | 5 | 19 | вытеснен | «УСТАРЕЛ / SUPERSEDED»; актуальная декомпозиция: `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`. |
| `SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md` | 0 | 14 | вытеснен | «historical P0 checklist, не текущий product plan»; заменён `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`. |
| `SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` | 29 | 0 | закрыт по [x] | Шапка: «RE-VERIFIED 2026-07-23 (all [x] audited vs code)»; все 29 строк [x]. |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` | 6 | 0 | живой authority без [ ] | Шапка: «Единственный канонический документ всей диктовки владельца». |
| `SAAS_PRODUCT_UX_INITIATIVE/ROADMAP.md` | 8 | 0 | вытеснен | Шапка: «discovery history и provenance»; successor — `IMPLEMENTATION_ROADMAP.md` §7.3. |

## 1.5. Вердикты папок-волн

| folder | files | open | closed | [-] | verdict | grounds | destination |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| `UI_FINISH_AND_REAUDIT_2026-07-22/` | 28 | 8 | 3 | 0 | ЖИВОЙ | Track C закрыт; папка остаётся живой из-за независимых открытых Track A/B/D. Четыре dated snapshots сохранены на исходных путях как неавторитетная история; отдельного UI archive move нет. | оставить на месте |
| `SECURITY_AUDIT_2026-07-25/` | 2 | 0 | 0 | 0 | ЖИВОЙ | `FINDINGS.md`: «S4/S5/S6 not started. NOTHING here has been fixed yet» (`SECURITY_AUDIT_2026-07-25/FINDINGS.md:16-18`). | оставить на месте |
| `OWNER_WALKTHROUGHS/` | 3 | 9 | 33 | 0 | ЖИВОЙ | `README.md`: «Теперь единственное место — здесь»; открытые маркеры `[ ]` и owner decisions остаются работой (`OWNER_WALKTHROUGHS/README.md:3-5,13-20`). | оставить на месте |
| `DOCTOR_DNA_MIGRATION/` | 1 | 0 | 4 | 1 | ОТМЕНЁН | PLAN.md: «⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ — ТОЛЬКО ИСТОРИЧЕСКАЯ ЗАПИСЬ». | архив |

## 1.6. Файлы без чекбоксов

> Это не backlog. В колонке отмечено, какие входят в уже классифицированную волну и должны ехать вместе с ней; остальные остаются до отдельного решения, даже если являются отчётами.

| path | relation to closed/stale wave | destination |
| --- | --- | --- |
| `B1_B2_IDENTITY_SPLIT_RUNBOOK.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `BACKLOG_CONSOLIDATION_2026-07-26.md` | держит действующий канон разметки §6.4 (исправлено 29.07) | оставить на месте |
| `BACKLOG_HYGIENE_HANDOVER_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `BCB2_PUNCHLIST_TRIAGE_2026-07-18.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `BUILT_BUT_INVISIBLE_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `C4_ADMIN_ALLOWLISTS_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/RAW_SQL_RULING.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/REQUIREMENTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/S2_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/db-access-map.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/log.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `HANDOFF_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `HANDOFF_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `INVENTED_SCOPE_FOR_OWNER_REVIEW_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/OWNER_ACTIONS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NATIVE_MOBILE_APP_INITIATIVE/REQUIREMENTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NIGHT_2026-07-17_OWNER_DIGEST.md` | индивидуальный кандидат `ВЫТЕСНЕН`; текущие ledger/roadmap названы в шапке | архив |
| `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NOTIFICATION_ALERTING_DESIGN_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `OWNER_QUESTIONS_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `OWNER_WALKTHROUGHS/2026-07-27_ОТВЕТЫ.md` | относится к живой папке-волне `OWNER_WALKTHROUGHS/` | оставить на месте |
| `OWNER_WALKTHROUGHS/README.md` | относится к живой папке-волне `OWNER_WALKTHROUGHS/` | оставить на месте |
| `PLAN_HYGIENE_REGISTRY_2026-07-29.md` | текущий результат Э1, не архивная волна | оставить на месте |
| `PRE_PRODUCTION_TODO.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `PROD_VS_TEST_DIVERGENCE_2026-07-26.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/CURRENT_PROD_BASELINE_2026-07-19.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_AND_LEGAL_GATES.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/PII_MEDICAL_STORE_SEPARATION_RECON_2026-07-24.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/REQUIREMENTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/TOOLING_AND_HOST_PACKAGES.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/01_MASTER_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/02_PHASED_BRIEF.md` | индивидуальный кандидат `ВЫТЕСНЕН`; преемники названы в шапке | архив |
| `SAAS_FOUNDATION/CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/CORRECTED_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/DORMANT_DEPLOY_TEST_RUNBOOK.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/FOUNDATION_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/GATES_WHAT_THEY_GUARD.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/HANDOFF_2026-07-12.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/ISOLATION_PROVISIONING_REMEDIATION_PLAN_2026-07-24.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/ORCHESTRATOR_BRIEF.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/ORCHESTRATOR_CHECKLIST.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_DECISIONS_FOR_REVIEW.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/REQUIREMENTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/ST-02_WALKTHROUGH.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-01-final-PASS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-02-final-PASS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-curated-system-health-closure.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-final-PASS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-04-integration-PASS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/owner-intent-reconciliation.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/audit/process-audit-status.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_READY_TEST/log.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-18.md` | индивидуальный кандидат `ВЫТЕСНЕН`; преемник назван в шапке | архив |
| `SAAS_FOUNDATION/P0_4_BATCHES.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_5B_GRANTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_8_CODE_FACTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/P0_UNPRINCIPLED_READ_INVENTORY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/PHASE3_ORCHESTRATION.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md (часть I)` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md (часть II)` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/R2_READINESS_CLOSURE.md` | индивидуальный кандидат `ВЫТЕСНЕН`; преемники названы в шапке | архив |
| `SAAS_FOUNDATION/RAW_SQL_AUDIT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/REQUIREMENTS.md` | индивидуальный кандидат `ВЫТЕСНЕН`; преемники названы в шапке | архив |
| `SAAS_FOUNDATION/REVIEW_2026-06-17_FRESH.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/ROADMAP_TO_SAAS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_ORCHESTRATION_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_FALLBACK_IMPORT_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_FALLBACK_SPECIALIST_IMPORT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_NON_CONFIRMED_CLEANUP.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_SOL_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R2_DOCTOR_READ_SOURCE_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_BRANCH_SERVICE_ID_REMOVAL_PREP.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_SLOTS_CREATE_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R3_TENANT_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md` | индивидуальный кандидат `ВЫТЕСНЕН`; historical evidence, already archived | оставить на месте |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md` | индивидуальный кандидат `ВЫТЕСНЕН`; former template must not be executed | оставить на месте |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md` | индивидуальный кандидат `ВЫТЕСНЕН`; non-executable historical runbook | оставить на месте |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.template.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_LIFECYCLE_ROUTE_SPLIT_PROOF.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_R7_STATIC_INVENTORY.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.template.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_RR_PROOF_INDEX.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_TEST_R6_R7_PROGRESS_2026-07-24.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `SAAS_FOUNDATION/S4_0_S4_1_CONTRACT_INVENTORY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C1_WEBAPP_DUAL_POOL_FANOUT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_E1_REMINDER_M2M_ORG_CONTEXT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS_LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md` | не относится к волне с архивным вердиктом | перенесено в Rubitime archive |
| `SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/TASK_FOR_SOL_multitenant_flip.md` | индивидуальный кандидат `ВЫТЕСНЕН`; преемники названы в шапке | архив |
| `SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/UPSTREAM_SYNC_POLICY.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/UPSTREAM_SYNC_REGRESSION_CHECKLIST.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/method-code.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/scope-derivation/method-fk.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_FOUNDATION/spike/PROOF.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/BRANDING_CAPABILITY_MATRIX.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/CURRENT_STATE_BASELINE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/LOG.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OPERATING_MODEL.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/README.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/REQUIREMENTS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_COMPOSITION.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_PATIENT_PUBLIC.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_SPECIALIST.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_ACCEPTANCE.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_EVIDENCE_MANIFEST.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_FRESH_AUDIT_2026-07-15.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_INDEPENDENT_AUDIT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_RECONCILIATION_REVIEW.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX01_VISUAL_ATTEMPT_LEDGER.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_PRODUCT_PATTERNS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_RESEARCH_AUDIT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX02_TECHNICAL_PATTERNS.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_OPERATING_MODEL_DRAFT.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX04_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX04_SCREEN_STATE_LIST.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `SAAS_PRODUCT_UX_INITIATIVE/UX05_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX06_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_PROTOTYPE_INDEX.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_USABILITY_FINDINGS.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SAAS_PRODUCT_UX_INITIATIVE/UX09_INDEPENDENT_AUDIT.md` | индивидуальный кандидат `ЗАКРЫТ`; исправлено 29.07 по аудиту `audit-e2a-0729`: завершённый аудит — закрытая история, не вытеснение | архив |
| `SECURITY_AUDIT_2026-07-25/FINDINGS.md` | относится к живой папке-волне `SECURITY_AUDIT_2026-07-25/` | оставить на месте |
| `SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md` | относится к живой папке-волне `SECURITY_AUDIT_2026-07-25/` | оставить на месте |
| `SLUG_RENAME_POLICY_RESEARCH_2026-07-27.md` | индивидуальный кандидат `ВЫТЕСНЕН`; policy в `OWNER_PRODUCT_RULES.md` §12 | архив |
| `STATE_2026-07-28_EVENING.md` | не относится к волне с архивным вердиктом | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | закрытый historical snapshot; текущий Track C authority — retirement safety в `WORK_ORDER.md` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` | закрытый historical snapshot; не текущая очередь | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/ORCHESTRATOR_PROMPT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/PROCESS_AUDIT_LOG.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` | закрытый historical snapshot; старые `REMAINING` не текущий authority | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` | закрытый historical snapshot; старые `REMAINING` не текущий authority | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_DNA_LIVE_EVIDENCE.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_ROADMAP_DAG_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI0_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI1_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI2_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI3_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_LIVE_EVIDENCE.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI5A_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI6_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI8_UI9_CLIENT_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UIP_REALITY_AUDIT.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_B_B4_OWNER_HANDOFF.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `archive/2026-07-rubitime-retirement/TRACK_C_R5_R7_EVIDENCE_MATRIX.md` | Rubitime retirement завершён 2026-07-27 | архивировано по решению владельца 2026-07-29 |
| `UI_FINISH_AND_REAUDIT_2026-07-22/U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md` | относится к живой папке-волне `UI_FINISH_AND_REAUDIT_2026-07-22/` | оставить на месте |
| `UI_WALKTHROUGH_2026-07-25.md` | не относится к волне с архивным вердиктом | оставить на месте |

## 1.7. Карта входящих ссылок для кандидатов на перенос

Разобраны **44** кандидата из итогового §1.1. Учитываются только реальные Markdown-ссылки из `docs/**`, `AGENTS.md`, `README.md`, `.cursor/rules/**`: относительная цель разрешена от каталога файла-источника и подтверждена существующим полным путём. Совпадение basename или обычное текстовое упоминание ссылкой не считается. Строка источника дана для перелинковки Э4.

| target | real inbound Markdown links |
| --- | --- |
| `BACKLOG_CONSOLIDATION_2026-07-26.md` | не найдено |
| `BOOKING_ACTOR_ATTENDEE_DESIGN.md` | не найдено |
| `DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` | не найдено |
| `DOCTOR_DNA_MIGRATION/PLAN.md` | `docs/_TODO/README.md:24` |
| `NIGHT_2026-07-17_OWNER_DIGEST.md` | не найдено |
| `PROGRAM_INDIVIDUAL_ITEM_DESIGN.md` | не найдено |
| `RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md` | `docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md:15`<br>`docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md:135`<br>`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md:119`<br>`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/README.md:22`<br>`docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md:192`<br>`docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/README.md:11`<br>`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md:862` |
| `SAAS_FOUNDATION/02_PHASED_BRIEF.md` | не найдено |
| `SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md` | не найдено |
| `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-18.md` | не найдено |
| `SAAS_FOUNDATION/P0_10_CI_INVARIANTS_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md` | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md:20` |
| `SAAS_FOUNDATION/P0_6_DORMANT_CONTEXT_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_8_RLS_DESCRIPTOR_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/P0_9_DEFAULT_DENY_CHECKLIST.md` | не найдено |
| `SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md` | не найдено |
| `SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md` | не найдено |
| `SAAS_FOUNDATION/R2_READINESS_CLOSURE.md` | не найдено |
| `SAAS_FOUNDATION/REQUIREMENTS.md` | не найдено |
| `archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R0_FREEZE_REPORT.md` | не найдено |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md` | не найдено |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md` | не найдено |
| `archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md` | не найдено |
| `SAAS_FOUNDATION/SAAS_B1_DOCTOR_ADMIN_IDENTITY.md` | не найдено |
| `SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md` | не найдено |
| `SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md` | не найдено |
| `SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` | не найдено |
| `SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md` | `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:45` |
| `SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md` | не найдено |
| `SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` | `docs/INITIATIVES.md:16`<br>`docs/README.md:8`<br>`docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md:7`<br>`docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md:171`<br>`docs/_TODO/SAAS_FOUNDATION/R2_READINESS_CLOSURE.md:6` |
| `SAAS_FOUNDATION/TASK_FOR_SOL_multitenant_flip.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/ROADMAP.md` | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_TECHNICAL_PATTERNS.md:13`<br>`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md:14` |
| `SAAS_PRODUCT_UX_INITIATIVE/UX03_INDEPENDENT_AUDIT.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/UX04_INDEPENDENT_AUDIT.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/UX05_INDEPENDENT_AUDIT.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/UX06_INDEPENDENT_AUDIT.md` | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md:5` |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_INDEPENDENT_AUDIT.md` | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX07_PROTOTYPE_INDEX.md:125` |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_PROTOTYPE_INDEX.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/UX07_USABILITY_FINDINGS.md` | не найдено |
| `SAAS_PRODUCT_UX_INITIATIVE/UX09_INDEPENDENT_AUDIT.md` | не найдено |
| `SLUG_RENAME_POLICY_RESEARCH_2026-07-27.md` | `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md:294` |

## Сводка

- ВЫТЕСНЕН: 27
- ЖИВОЙ: 265
- ЗАКРЫТ: 14
- ЗАМЕР (устарел): 1
- ОТЛОЖЕН: 6
- ОТМЕНЁН: 2
- zero-open files with checkboxes: 28
- files with no checkboxes: 230

## Требует решения лида

- Ряды с вердиктом `ЖИВОЙ` и 0 открытых строк не отправлены в архив без direct header-ground или преемника; для исправленных спорных волн основание приведено дословно с `file:line`.
- Найдено 315 файлов, включая этот реестр: 315 строк, пропусков и дублей нет. До старта в worktree уже были изменены 10 env-примеров вне scope; они не менялись этой работой и не входят в коммит #1075.

## НАЙДЕНО ПОПУТНО

- У taskdb-порта нет `SECONDBRAIN_DB_URL`, поэтому состояние карточки #1075 не записано; это не обходилось прямым SQL.
- `RU_PRIVACY_AND_PRODUCTION_READINESS/{README.md,MASTER_PLAN.md,FINAL_ACCEPTANCE.md}` оставлены `ЖИВОЙ`: их шапки вытесняют только прежний push-only notification target, тогда как privacy/legal/host/acceptance scope в самих файлах остаётся. **ПОПРАВКА лида 29.07 после повторного аудита:** утверждение «полностью вытеснён только stage `NTF-01…`» БЫЛО НЕВЕРНЫМ и отозвано. Его шапка говорит «**ЧАСТИЧНО** ОТМЕНЕНО» и прямо перечисляет, что продолжает действовать; 26 живых `[ ]` — работа. Вердикт исправлен на `ЖИВОЙ`. Это второе за ночь срабатывание одного класса: архивный вердикт поставлен по первой подходящей фразе в шапке, без чтения дальше.
- **ЧАСТИЧНАЯ отмена — отдельный случай, и в шести вердиктах его нет.** Файл может умереть в части и жить в остальном. Правило (лид, 29.07): частичная отмена НИКОГДА не даёт файлу архивный вердикт; умирают отдельные боксы, файл остаётся `ЖИВОЙ`.
- В `AUTONOMOUS_NIGHTLY_RUNBOOK.md:19` сохранён указатель `P0_7_WRITER_CENSUS_CHECKLIST.md:72`, но в текущем файле строка 72 пустая, а живой `[ ]` P0.7.6 находится на строке 79. Реестр использует фактическую строку 79; исходный указатель не исправлялся из-за запрета менять другие документы.
