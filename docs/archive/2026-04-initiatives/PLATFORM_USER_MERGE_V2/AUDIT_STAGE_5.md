# Audit — Stage 5 (feature flag + integrator-first manual merge flow)

**Дата аудита:** 2026-04-10  
**Follow-up (закрытие оговорки §2 + GAP §3 e2e):** 2026-04-10 — см. [§9](#9-follow-up-2026-04-10--аудит-замечания).  
**Источник требований:** [`STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md`](STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md), [`MASTER_PLAN.md`](MASTER_PLAN.md)

**Проверяемые артефакты:**

- Флаг и whitelist: [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts), [`apps/webapp/src/app/api/admin/settings/route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts)
- Чтение флага: [`apps/webapp/src/modules/system-settings/configAdapter.ts`](../../apps/webapp/src/modules/system-settings/configAdapter.ts) (`getConfigBool` + `invalidateConfigKey` на PATCH)
- Preview: [`apps/webapp/src/infra/platformUserMergePreview.ts`](../../apps/webapp/src/infra/platformUserMergePreview.ts)
- Gate перед webapp merge: [`apps/webapp/src/infra/manualMergeIntegratorGate.ts`](../../apps/webapp/src/infra/manualMergeIntegratorGate.ts)
- Движок merge: [`apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`](../../apps/webapp/src/infra/repos/pgPlatformUserMerge.ts)
- Proxy integrator merge: [`apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts`](../../apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts)
- M2M клиент: [`apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts`](../../apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts)
- Integrator routes: [`apps/integrator/src/integrations/bersoncare/userMergeM2mRoute.ts`](../../apps/integrator/src/integrations/bersoncare/userMergeM2mRoute.ts), регистрация в [`apps/integrator/src/app/routes.ts`](../../apps/integrator/src/app/routes.ts)
- UI / настройки: [`apps/webapp/src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx`](../../apps/webapp/src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx), [`AdminSettingsSection.tsx`](../../apps/webapp/src/app/app/settings/AdminSettingsSection.tsx)

---

## 1) Флаг в `system_settings` реально управляет поведением

| Проверка | Факт | Вердикт |
|----------|------|---------|
| Ключ в whitelist | `platform_user_merge_v2_enabled` в `ALLOWED_KEYS` | **PASS** |
| Запись через админку | `PATCH /api/admin/settings` с `key` в `ADMIN_SCOPE_KEYS`; UI — переключатель в `AdminSettingsSection` | **PASS** |
| Чтение в runtime | `getConfigBool("platform_user_merge_v2_enabled", false)` читает `system_settings` (scope `admin`) через `fetchFromDb` | **PASS** |
| Ветвление логики | `buildMergePreview`: при `v2Enabled &&` двух разных id вызывается `checkIntegratorCanonicalPair`; иначе используется `inferIntegratorPairPreview` → `v1_both_different_non_null` | **PASS** |
| Инвалидация кэша | После успешного PATCH вызывается `invalidateConfigKey(parsed.data.key)` — сброс TTL-кэша 60s для изменённого ключа | **PASS** |
| Зеркало в integrator | Строка синхронизируется в БД integrator как и прочие `system_settings` (webapp `updateSetting`); integrator для этого ключа не обязан иметь потребителя | **OK** (не мешает) |

**Вердикт §1:** **PASS** — отсутствие строки в БД или `value: false` даёт поведение «как v1» для ветки integrator id; `true` включает canonical-pair и отдельный маршрут integrator merge.

---

## 2) При `flag=off` поведение как v1

| Проверка | Факт | Вердикт |
|----------|------|---------|
| Preview, два разных non-null `integrator_user_id` | `v2Enabled === false` → не вызывается M2M; `integratorPairPreview` остаётся `v1_both_different_non_null` → hard blocker `different_non_null_integrator_user_id` | **PASS** |
| `POST …/merge` | При `!v2` и двух разных id gate **пропускает** в merge tx; `MergeConflictError` → `409 merge_failed`, `message` как у движка (`merge: two different non-null integrator_user_id`), audit на фазе `merge_transaction` | **PASS** (после follow-up §9) |
| Движок `mergePlatformUsersInTransaction` | Без `allowDistinctIntegratorUserIds` при двух разных id по-прежнему `MergeConflictError` (авто-пути `projection` / `phone_bind` не передают relax) | **PASS** |
| Поле preview `platformUserMergeV2Enabled` | В JSON всегда `false` при выключенном флаге — расширение контракта, обратно совместимо | **PASS** |

**Вердикт §2:** **PASS** — поведение v1 совпадает с до–Stage-5 по точке отказа и тексту ошибки merge.

---

## 3) При `flag=on` сценарий двух non-null `integrator_user_id` проходит через integrator merge

| Шаг | Реализация | Вердикт |
|-----|------------|---------|
| Блок до canonical merge | Preview: `integrator_canonical_merge_required`, если `sameCanonical === false` | **PASS** |
| Вызов merge в integrator | `POST /api/doctor/clients/integrator-merge` требует `getConfigBool === true`; проксирует HMAC на `/api/integrator/users/merge` (`mergeIntegratorUsers`) | **PASS** |
| Порядок winner/loser | Winner = `integrator_user_id` **целевого** (`targetId`) platform user, loser = **дубликата** (`duplicateId`) — совпадает с контрактом ручного merge | **PASS** |
| После integrator merge | `canonical-pair` даёт `sameCanonical`; preview снимает integrator-hard-blocker; gate даёт `allowDistinctIntegratorUserIds: true` | **PASS** (по коду) |
| Покрытие тестами | Unit: `platformUserMergePreview.test.ts`, `manualMergeIntegratorGate.test.ts`, `pgPlatformUserMerge.test.ts`, `userMergeM2mRoute.test.ts` (integrator). Интеграция без живого integrator: `integratorUserMergeM2mClient.flow.test.ts` (stub `fetch` + цепочка canonical → merge), `integrator-merge/route.test.ts` (прокси winner/loser) | **PASS** (после follow-up §9) |
| E2E двух БД + UI | Полный браузерный сценарий и две живые PostgreSQL в CI **не** обязателен; риск снижен stub-flow тестами | **OK** (остаточный риск — см. MANDATORY §5 как опциональный hardening) |

**Вердикт §3:** **PASS** по реализации и CI-тестам (unit + stubbed M2M flow + route proxy).

---

## 4) Нет новых env vars для этого флага

| Проверка | Факт | Вердикт |
|----------|------|---------|
| `apps/webapp/src/config/env.ts` (и `.env.example`) | Нет переменной вида `PLATFORM_USER_MERGE*` / `*_V2_*` для флага | **PASS** |
| `grep` по репозиторию для `.env*` | Нет совпадений с `platform_user_merge` | **PASS** |
| Fallback `getConfigBool(..., false)` | Второй аргумент — литерал `false`, не `process.env` | **PASS** |
| Инфра M2M | Используются существующие `INTEGRATOR_API_URL` и webhook secret (как у прочих Bersoncare M2M); это **не** env для флага | **PASS** |

**Вердикт §4:** **PASS**.

---

## 5) CI evidence

**Воспроизведение (аудит 2026-04-10):**

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

| Проверка | Результат |
|----------|-----------|
| Полный pipeline из корня | `pnpm run ci` — **exit 0** |
| Integrator tests | **649 passed**, 6 skipped |
| Webapp tests | **1417 passed**, 5 skipped |
| Сборки | `apps/integrator` + `apps/webapp` production build — **OK** |
| Audit prod dependencies | `pnpm audit --prod` — **No known vulnerabilities found** |

Журнал репозитория: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — записи «Stage 5: feature flag и смена flow» и «Stage 5 follow-up: замечания AUDIT_STAGE_5» (актуальные числа тестов webapp после follow-up).

**Вердикт §5:** **PASS**.

---

## 6) Сводный вердикт

| # | Вопрос | Вердикт |
|---|--------|---------|
| 1 | Флаг в `system_settings` управляет поведением | **PASS** |
| 2 | При `flag=off` как v1 (preview-блок + merge-ошибка из движка) | **PASS** |
| 3 | При `flag=on` цепочка integrator merge → canonical check → webapp merge | **PASS** (unit + stub flow) |
| 4 | Нет новых env для флага | **PASS** |
| 5 | CI evidence | **PASS** |

**Общий вердикт Stage 5 (репозиторий):** **PASS** (после follow-up §9 — без открытых GAP по чеклисту аудита).

---

## 7) MANDATORY FIX INSTRUCTIONS

Обязательные действия при срабатывании триггера или для hardening.

### MANDATORY FIX §1 — Preview показывает `integrator_merge_status_unavailable`

**Триггер:** включён `platform_user_merge_v2_enabled`, у пары два разных non-null `integrator_user_id`, в preview блокер `integrator_merge_status_unavailable`.

**Действия:**

1. На стороне webapp: задать **`INTEGRATOR_API_URL`** и секрет webhook (`INTEGRATOR_WEBHOOK_SECRET` или совместимый fallback из конвенций деплоя) — см. [`apps/webapp/INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md).
2. На стороне integrator: тот же секрет в env, процесс слушает M2M-маршруты (`userMergeM2mRoute`).
3. Проверить сеть/firewall между webapp и integrator (loopback или internal URL).
4. После правки конфигурации повторить `GET …/merge-preview` и зафиксировать отсутствие `integrator_merge_status_unavailable` при доступном integrator.

### MANDATORY FIX §2 — `integrator_canonical_merge_required` не снимается после «успешного» merge

**Триггер:** оператор считает merge в integrator выполненным, preview всё ещё требует canonical merge.

**Действия:**

1. В БД integrator: убедиться, что loser имеет `merged_into_user_id` = winner (или пара уже в одной canonical цепочке) — см. [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts).
2. Проверить, что webapp вызывает **тот же** порядок `targetId`/`duplicateId`, что и при merge (winner integrator = целевой platform user из preview).
3. Выполнить **Stage 4** realignment проекций webapp при необходимости ([`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)); иначе ingestion может продолжать нести старые id в колонках.
4. Повторить `canonical-pair` вручную (curl с HMAC) для изоляции: integrator vs webapp.

### MANDATORY FIX §3 — Флаг в БД изменён в обход Settings API

**Триггер:** прямой `UPDATE system_settings` / seed без вызова `invalidateConfigKey`.

**Действия:**

1. До истечения TTL (60s) webapp может отдавать старое значение из кэша `configAdapter`.
2. Операционно: перезапуск процесса webapp **или** вызвать любой успешный `PATCH /api/admin/settings` по этому ключу **или** подождать TTL.
3. Для повторяемости: предпочитать админский UI / `PATCH`, не сырой SQL в проде без процедуры инвалидации.

### MANDATORY FIX §4 — `POST …/merge` возвращает 409 `integrator_canonical_merge_required` при включённом v2

**Триггер:** integrator merge не выполнялся или выполнен с другой парой id.

**Действия:**

1. Выполнить `POST /api/doctor/clients/integrator-merge` (или прямой M2M к integrator) с корректными `targetId`/`duplicateId`.
2. Убедиться по integrator DB, что canonical для обоих numeric id совпадает.
3. Повторить webapp merge.

### MANDATORY FIX §5 — Регрессия без живых двух БД (опциональный hardening)

**Триггер:** крупный рефакторинг M2M или смена контракта HMAC / путей integrator.

**Действия:**

1. Поддерживать **`integratorUserMergeM2mClient.flow.test.ts`** и **`integrator-merge/route.test.ts`** в зелёном состоянии; при изменении URL/тел подписи обновить ожидания.
2. При появлении стабильного staging с двумя БД — рассмотреть узкий e2e (отдельный job), не блокируя основной CI.
3. Прогнать **`pnpm run ci`**.

---

## 8) Ссылки

- Спека этапа: [`STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md`](STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md)
- Архитектура manual merge: [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)
- API summary: [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md)
- Журнал: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)

---

## 9) Follow-up 2026-04-10 — аудит-замечания

| Замечание (первичный аудит) | Сделано |
|-----------------------------|---------|
| §2 Оговорка: ранний `409` на `POST …/merge` при v1 и иной текст ошибки | Gate при `!v2` и двух разных `integrator_user_id` **не** возвращает ответ — выполняется `runManualPlatformUserMerge`; ошибка и audit как до Stage 5 ([`manualMergeIntegratorGate.ts`](../../apps/webapp/src/infra/manualMergeIntegratorGate.ts)). |
| §3 GAP: нет сквозного теста цепочки M2M | Добавлены [`integratorUserMergeM2mClient.flow.test.ts`](../../apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.flow.test.ts) (stub `fetch`: canonical-pair + merge + двухшаговая последовательность) и [`integrator-merge/route.test.ts`](../../apps/webapp/src/app/api/doctor/clients/integrator-merge/route.test.ts) (winner/loser, флаг). |
| Документация расхождения с кодом | Обновлены [`api.md`](../../apps/webapp/src/app/api/api.md) и [`PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md). |
| Post-closeout hardening | Gate/apply race закрыт snapshot-проверкой пары integrator id; `integrator-merge` route читает `platform_users` под `FOR UPDATE`; M2M client ограничен timeout; docs синхронизированы с `integrator_timeout` / `integrator_ids_changed_since_gate`. |

**CI:** см. актуальные числа в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) (запись follow-up Stage 5 audit fix).
