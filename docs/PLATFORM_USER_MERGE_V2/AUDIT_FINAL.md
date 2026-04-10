# Audit — Final (Platform User Merge v2)

**Дата аудита:** 2026-04-10  
**Источник требований:** `MASTER_PLAN.md`, `CHECKLISTS.md`, `CUTOVER_RUNBOOK.md`, `AGENT_EXECUTION_LOG.md`, все `AUDIT_STAGE_*.md`, все `AUDIT_PRE_DEPLOY_*.md`, `git diff main...HEAD`, `git status --short --branch`

**Независимо перепроверено на audited repository tree:**

- `git diff main...HEAD` — **пусто**
- `git status --short --branch` — baseline для audited working tree зафиксирован
- targeted webapp: **9 files / 124 tests / OK**
- targeted integrator: **4 files / 26 tests / OK**
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK**
  - integrator: **649 passed**, **6 skipped**
  - webapp: **1410 passed**, **5 skipped**

---

## 1) Сводный verdict

| Область | Вердикт | Комментарий |
|---------|---------|-------------|
| Stage A | **PASS** | v1 blocker и ingestion/audit-контур сохранены |
| Stage 1 | **PASS** | DDL `users.merged_into_user_id` на месте |
| Stage 2 | **PASS** | canonical write path реализован |
| Stage 3 | **PASS** | transactional merge + outbox rewrite/dedup реализованы |
| Stage 4 | **PASS** | webapp realignment SQL/job/gate реализованы |
| Stage 5 | **PASS** | feature flag, integrator-first flow, rollback через Settings подтверждены |
| Stage C (repo closeout) | **PASS** | closeout docs, runbook и regression evidence на уровне репозитория присутствуют |
| Финальная merge-ready / closeout-ready оценка | **PASS** | final audit привязан к audited tree, входной audit trail полный |

---

## 2) Follow-up к первичному прогону

Исправления после первичного прогона:

1. `PROMPTS_EXEC_AUDIT_FIX.md` обновлён: final audit теперь явно допускает два режима evidence-baseline:
   - branch diff (`git diff main...HEAD` непустой);
   - audited working tree (`git diff main...HEAD` пустой, но baseline фиксируется через `git status --short --branch`).
2. Добавлены `AUDIT_PRE_DEPLOY_1.md` … `AUDIT_PRE_DEPLOY_4.md` как retrospective repo audits по Deploy 1..4.
3. `STAGE_C_CLOSEOUT.md` и `MASTER_PLAN.md` уточняют, что closeout относится к **audited repository tree**, а не автоматически к любому будущему dirty working tree.

**Итог:** первичные major-findings закрыты; открытых `critical` / `major` / `minor` в этом финальном прогоне нет.

---

## 3) Проверка по пунктам запроса

### 3.1 Реализованы Stage A, 1, 2, 3, 4, 5, C

| Stage | Evidence | Вердикт |
|-------|----------|---------|
| A | `platformUserMergePreview.ts`, `pgPlatformUserMerge.ts`, `events.ts`, stage audit и targeted tests | **PASS** |
| 1 | `apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql` | **PASS** |
| 2 | `canonicalUserId.ts`, `writePort.ts`, canonicalization before enqueue/write | **PASS** |
| 3 | `mergeIntegratorUsers.ts`, `projectionOutboxMergePolicy.ts`, `projectionHealth.ts` | **PASS** |
| 4 | `sql/realign_webapp_integrator_user_id.sql`, `sql/diagnostics_webapp_integrator_user_id.sql`, `webappIntegratorUserProjectionRealignment.ts`, job script | **PASS** |
| 5 | `platform_user_merge_v2_enabled` in `system_settings`, `manualMergeIntegratorGate.ts`, `integrator-merge` route, integrator M2M routes | **PASS** |
| C | `STAGE_C_CLOSEOUT.md`, `AUDIT_STAGE_C.md`, `docs/README.md`, rerun CI and targeted checks | **PASS** |

### 3.2 Нет gap между docs и кодом

- **Функционально:** **PASS**
- **По release evidence:** **PASS**

### 3.3 Readiness gates реально закрыты

| Gate из `MASTER_PLAN.md` | Статус | Комментарий |
|--------------------------|--------|-------------|
| Нет loser `integrator_user_id` в webapp projection | **PASS (repo)** | SQL/job/gate есть; production evidence остаётся операторским per-merge шагом по runbook |
| `projection_outbox` согласован после merge | **PASS (repo)** | merge + rewrite/dedup + `cancelledCount` подтверждены кодом и тестами |
| E2E сценарий двух integrator id | **PASS (repo contract)** | подтверждён stub-flow + route/API tests; full browser + two live DB не входит в обязательный контракт |
| Regression / CI / targeted checks | **PASS** | перепроверено в этом аудите |

**Вывод:** readiness gates закрыты **на уровне audited repository tree и принятого Stage C контракта**.

### 3.4 Feature flag и rollback подтверждены

- Флаг хранится в `system_settings` (`platform_user_merge_v2_enabled`), включён в `ALLOWED_KEYS`, PATCH-ится через `/api/admin/settings`, читается через `getConfigBool(...)`.
- При `flag=off` сохраняется поведение v1.
- При `flag=on` включается integrator-first flow: `canonical-pair` / `integrator-merge` / `allowDistinctIntegratorUserIds`.
- Rollback подтверждён: выключение флага в Settings без redeploy.

**Вердикт:** **PASS**

### 3.5 CI и targeted checks подтверждены

**В этом прогоне:**

- `pnpm --dir apps/webapp exec vitest run ...` — **9 files / 124 passed**
- `pnpm --dir apps/integrator exec vitest run ...` — **4 files / 26 passed**
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK**

**Вердикт:** **PASS**

---

## 4) Итог

**Implementation verdict:** **PASS** — инициатива `Platform User Merge v2` реализована в audited repository tree и подтверждена независимым прогоном targeted checks + полного CI.

**Final closeout verdict:** **PASS** — Stage A/1/2/3/4/5/C реализованы, docs и код согласованы, readiness gates/feature flag/rollback/CI/targeted checks подтверждены, входной audit trail полный.

---

## MANDATORY FIX INSTRUCTIONS

### MANDATORY FIX §1 — Не терять evidence baseline в будущих финальных аудитах

- **severity:** **major**
- **Триггер:** запускается новый final audit по v2-like инициативе.
- **files:** `PROMPTS_EXEC_AUDIT_FIX.md`, `AUDIT_FINAL.md`, `STAGE_C_CLOSEOUT.md`
- **Действия:**
1. Явно фиксировать baseline: branch diff или audited working tree.
2. Если `git diff main...HEAD` пустой, обязательно прикладывать `git status --short --branch` как часть evidence.
- **Критерий done:** финальный audit однозначно привязан к конкретному состоянию дерева.

### MANDATORY FIX §2 — Поддерживать полный pre-deploy audit trail

- **severity:** **major**
- **Триггер:** добавляется новый deploy-slice или переписывается существующий flow Deploy 1..4.
- **files:** `docs/PLATFORM_USER_MERGE_V2/AUDIT_PRE_DEPLOY_*.md`, `README.md`, `AGENT_EXECUTION_LOG.md`
- **Действия:**
1. Обновить соответствующий `AUDIT_PRE_DEPLOY_<N>.md`.
2. Не оставлять final audit со ссылками на отсутствующие pre-deploy артефакты.
- **Критерий done:** все audit-файлы, на которые ссылается пакет v2, реально существуют и актуальны.

### MANDATORY FIX §3 — При изменении merge/outbox/flag путей повторять финальный proof set

- **severity:** **major**
- **Триггер:** меняются `mergeIntegratorUsers`, Stage 4 SQL/job, Stage 5 flag/M2M flow или closeout docs.
- **files:** соответствующий код + `STAGE_C_CLOSEOUT.md` + `AUDIT_FINAL.md` + `AGENT_EXECUTION_LOG.md`
- **Действия:**
1. Повторить targeted tests.
2. Повторить `pnpm install --frozen-lockfile && pnpm run ci`.
3. Обновить test counts / gate verdict в docs.
- **Критерий done:** docs и фактические проверки снова совпадают.

---

## Связанные документы

- `MASTER_PLAN.md`
- `CHECKLISTS.md`
- `CUTOVER_RUNBOOK.md`
- `AGENT_EXECUTION_LOG.md`
- `AUDIT_STAGE_A.md`
- `AUDIT_STAGE_1.md`
- `AUDIT_STAGE_2.md`
- `AUDIT_STAGE_3.md`
- `AUDIT_STAGE_4.md`
- `AUDIT_STAGE_5.md`
- `AUDIT_STAGE_C.md`
- `STAGE_C_CLOSEOUT.md`
