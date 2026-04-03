# GLOBAL FIX: F-01..F-06 + Final Audit

Цель папки: единый исполнимый контур устранения findings из
`docs/BRANCH_UX_CMS_BOOKING/GLOBAL_AUDIT_2026-04-02.md`
и `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/AUDIT_STAGE_8_15.md`.

Формат исполнения:

- один мастер-план;
- выполнение строго по этапам;
- жесткий gate после каждого этапа:
  - `EXEC` делает auto-agent;
  - `AUDIT` делает Composer 2;
  - переход к следующему этапу только при `verdict: pass`.

## Порядок документов

1. `MASTER_PLAN_GLOBAL_FIX.md`
2. `AGENT_EXECUTION_LOG.md`
3. `STAGE_1_F01_INGEST_AND_USER_LINKING.md`
4. `STAGE_2_F04_COMPAT_SYNC_AND_PROVENANCE.md`
5. `STAGE_3_F03_ATTACHMENT_FILE_IDS.md`
6. `STAGE_4_F02_DOCTOR_API_PATIENT_IDENTITY.md`
7. `STAGE_5_F06_NOTIFICATION_DEEP_LINK.md`
8. `STAGE_6_F05_DOCS_STAGES_8_15_SYNC.md`
9. `STAGE_7_FINAL_INTEGRATION_AUDIT.md`
10. `PROMPTS_EXEC_AUDIT_FIX.md`

Инцидентные hotfix-записи (вне нумерации этапов, но с перекрёстными ссылками в `AGENT_EXECUTION_LOG.md`):

- `INCIDENT_HOTFIX_RU_PHONE_FORMATS.md` — нормализация телефонов РФ для auth/поиска (`+7`, `8`, `00 7`, 10-значный локальный).

## Исполнительская политика

- Не добавлять новый product-scope вне F-01..F-06.
- Не открывать раздел TODO/техдолга в рамках этого цикла.
- Любой rework закрывается внутри текущего этапа.
- После этапа 7 итоговый вердикт фиксируется в `AGENT_EXECUTION_LOG.md`.
