# AGENT EXECUTION LOG: GLOBAL_FIX

Статусы:

- task: `pending | in_progress | done | blocked | skipped`
- audit verdict: `pass | rework`
- stage verdict: `pass | fail`

---

## Формат записи задачи

```markdown
### Sx.Tyy - <task title>
- Status:
- Agent/model:
- Started at:
- Finished at:
- Files changed:
  - `path` - short note
- Tests:
- CI:
- Evidence:
- Notes:
```

## Формат записи аудита этапа

```markdown
### Stage x - AUDIT
- Auditor/model: Composer 2
- Verdict: pass | rework
- Findings:
  - [severity] <id> <summary>
- Required fixes:
  - <item>
- Evidence checked:
  - <tests/sql/logs>
- Approved at:
```

---

## Stage 1 - F-01

### S1.T01 - Baseline и критерии ingest/user-linking
- Status: pending

### S1.T02 - User linking по телефону + fallback policy
- Status: pending

### S1.T03 - Очередь/worker/retry/backoff
- Status: pending

### S1.T04 - Dead-letter policy + безопасный requeue
- Status: pending

### S1.T05 - Тесты + CI + gate evidence
- Status: pending

### Stage 1 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 2 - F-04

### S2.T01 - Контракт полного compat enrichment
- Status: pending

### S2.T02 - Реальный lookup branch_service_id
- Status: pending

### S2.T03 - Provenance (createdBy/updatedBy/sourceActor)
- Status: pending

### S2.T04 - UI маркер происхождения
- Status: pending

### S2.T05 - Backfill + CI + gate evidence
- Status: pending

### Stage 2 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 3 - F-03

### S3.T01 - Зафиксировать контракт attachmentFileIds
- Status: pending

### S3.T02 - Resolver media_files.id -> s3_key
- Status: pending

### S3.T03 - Persist mixed attachments (url + file)
- Status: pending

### S3.T04 - Doctor visibility + e2e tests
- Status: pending

### Stage 3 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 4 - F-02

### S4.T01 - Join patient identity для doctor list/details
- Status: pending

### S4.T02 - Контрактный ответ API без fallback
- Status: pending

### S4.T03 - UI doctor inbox alignment
- Status: pending

### S4.T04 - Тесты + gate evidence
- Status: pending

### Stage 4 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 5 - F-06

### S5.T01 - Генерация deep-link с requestId
- Status: pending

### S5.T02 - Шаблоны TG/MAX + маршрутизация
- Status: pending

### S5.T03 - e2e click-through проверка
- Status: pending

### Stage 5 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 6 - F-05

### S6.T01 - README index к фактической структуре
- Status: pending

### S6.T02 - Stage-summary из EXECUTION_LOG/CHECKLISTS
- Status: pending

### S6.T03 - Закрыть online-safe gate и SHA+CI traceability
- Status: pending

### S6.T04 - Финальная синхронизация docs
- Status: pending

### Stage 6 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 7 - Final integration audit

### S7.T01 - Full CI (`pnpm run ci`)
- Status: pending

### S7.T02 - SQL metrics (compat/inbox/outbox)
- Status: pending

### S7.T03 - Ручной smoke (booking/intake/doctor)
- Status: pending

### S7.T04 - Финальный аудит-вердикт
- Status: pending

### Stage 7 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Итоговый релизный блок

- Final verdict: pending
- Final SHA: pending
- Final CI date: pending
- Release decision: pending
