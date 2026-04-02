# Master Plan: GLOBAL_FIX (Execution by stages with hard audit gates)

Дата: 2026-04-02  
Scope: закрытие findings `F-01..F-06` + финальный интеграционный аудит  
Источник приоритизации: `GLOBAL_AUDIT_2026-04-02.md` + решение владельца

---

## 1) Цель и границы

### Цель

Закрыть критичные и major разрывы между контрактами, кодом и документацией для блока
Booking/Online Intake/Doctor Inbox, затем провести формальный финальный аудит.

### In scope

- F-01: устойчивый ingest + user linking
- F-04: полная compat-синхронизация + provenance
- F-03: `attachmentFileIds` по прод-контракту
- F-02: patient identity в doctor API
- F-06: deep-link на конкретную заявку
- F-05: docs Stages 8-15 (вариант B)
- Финальный интеграционный аудит (CI + SQL + smoke)

### Out of scope

- Новые фичи вне перечисленных findings
- Расширение архитектуры без прямой связи с F-01..F-06
- Отдельный backlog/TODO-трек в этом цикле

---

## 2) Модель контроля

Для каждого этапа строго:

1. `EXEC` (auto-agent)
2. `AUDIT` (Composer 2)
3. при `rework`: `FIX` (auto-agent) -> повторный `AUDIT` (Composer 2)
4. переход к следующему этапу только при `pass`

Обязательная запись в `AGENT_EXECUTION_LOG.md` после каждого шага.

---

## 3) Последовательность этапов

1. `STAGE_1_F01_INGEST_AND_USER_LINKING.md`
2. `STAGE_2_F04_COMPAT_SYNC_AND_PROVENANCE.md`
3. `STAGE_3_F03_ATTACHMENT_FILE_IDS.md`
4. `STAGE_4_F02_DOCTOR_API_PATIENT_IDENTITY.md`
5. `STAGE_5_F06_NOTIFICATION_DEEP_LINK.md`
6. `STAGE_6_F05_DOCS_STAGES_8_15_SYNC.md`
7. `STAGE_7_FINAL_INTEGRATION_AUDIT.md`

---

## 4) Gate-матрица (Definition of Pass)

| Этап | Finding | Обязательный gate |
|---|---|---|
| Stage 1 | F-01 | Нет новых `dead` в outbox по причине `platform_user_id null`; ingest не падает на временных сбоях |
| Stage 2 | F-04 | Compat-строки не деградируют; branch_service lookup реален; provenance сохраняется |
| Stage 3 | F-03 | `attachmentFileIds` -> `media_files.id` -> `s3_key`; mixed URL+file проходит e2e |
| Stage 4 | F-02 | Doctor API возвращает `patientName/patientPhone` строго по контракту без fallback-заглушек |
| Stage 5 | F-06 | Клик из TG/MAX ведет на конкретную заявку (`requestId`) |
| Stage 6 | F-05 | README/checklist/execution log синхронизированы; 2 открытых checklist-пункта закрыты |
| Stage 7 | Final | `pnpm run ci` green + SQL-метрики + ручной smoke подтверждены в финальном отчете |

---

## 5) Артефакты по завершению цикла

- Обновленные кодовые и SQL-артефакты по этапам 1-5
- Синхронизированный docs-контур по этапу 6
- Финальный аудит-отчет по этапу 7
- Полностью заполненный `AGENT_EXECUTION_LOG.md` с SHA/CI traceability

---

## 6) Критерий завершения master-плана

Master-план считается завершенным, когда:

- все этапы `S1..S7` имеют статус `pass`;
- нет открытых critical/major по F-01..F-06;
- финальный вердикт этапа 7: `approve_for_release`.
