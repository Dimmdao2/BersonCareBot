---
name: Wave3 Phase11 Webapp app layer auth
overview: "Wave 3 фаза 11 закрыта (2026-06-06): app-layer health/media metrics, auth Class C TX, мелкие infra ≤6 query, Zod на config/idempotency, post-audit RAW_SQL + unit-тесты."
status: completed
isProject: false
todos:
  - id: w3-p11-app-layer
    content: "collectAdminSystemHealthData, adminTranscodeHealthMetrics, videoHlsLegacyBackfill → runWebappSql/Drizzle."
    status: completed
  - id: w3-p11-auth-transport
    content: "channelLink.ts — документировать Class C BEGIN/COMMIT; shrink eslint allowlist если порты закрыты."
    status: completed
  - id: w3-p11-small-infra
    content: "Файлы ≤6 query: pgDiaryPurge, pgAdminPlatformUserStats, strictPlatformUserPurge, locks (verify P3), idempotency pgStore, loadPlatformUserChannelBindings, …"
    status: completed
  - id: w3-p11-verify
    content: "rg + vitest fast по health/media/auth."
    status: completed
---

# Wave 3 — фаза 11: Webapp app-layer + auth tail

## Размер

**S–M** (разогрев перед L-фазами 12–14).

## Порядок исполнения

1. **11.1** — app-layer health/media → `runWebappPgText` / `runPgPoolPgText`.
2. **11.2** — `channelLink.ts`: Class C TX + ESLint allowlist audit.
3. **11.3** — мелкие infra/repos (≤6 query) + `runPgPoolPgText` в `runWebappSql.ts`.
4. **11.4** — Zod на JSON-границах (`configAdapter`, `pgStore`) + verify + sync docs.

## Definition of Done

- [x] `app-layer/health/*`, `app-layer/media/*` — нет `pool.query`.
- [x] `channelLink.ts`: только Class C transport (`BEGIN`/`COMMIT`/`ROLLBACK`) + domain SQL через `runWebappPgText` / `getWebappSqlFromPgClient`.
- [x] ESLint allowlist auth: для каждого оставшегося файла — явная причина в [LOG §Wave 3 phase 11](../LOG.md); лишние записи не удалялись (infra/repos импорты сохранены).
- [x] Мелкие repos из scope мигрированы и помечены **Wave 3 P11 done** в [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md).
- [x] Zod на затронутых JSON-границах (`parseSettingValueJson`, `pgStore.response_body`); unit-тесты добавлены.

## Scope

**Разрешено:** `apps/webapp/src/app-layer/health/**`, `app-layer/media/**`, `modules/auth/channelLink.ts`, `infra/idempotency/pgStore.ts`, `infra/db/runWebappSql.ts` (`runPgPoolPgText`), `infra/repos/pgDiaryPurge.ts`, `pgAdminPlatformUserStats.ts`, `strictPlatformUserPurge.ts`, `pgRubitimeMapping.ts`, `pgPatientBroadcasts.ts`, `pgRecommendations.ts`, `pgTestSets.ts`, `pgCourses.ts`, `pgClinicalTests.ts`, `loadPlatformUserChannelBindings.ts`, `mergeAuditLabels.ts`, `manualMergeIntegratorGate.ts`, `platformUserNameMatchHints.ts`, `mergePreviewIntegratorUserPresence.ts`, `modules/reminders/disableReminderMessengerTopic.ts`, `loadWarmupsSectionSlugs.ts`, `modules/system-settings/configAdapter.ts`, `parseSettingValueJson.ts`.

**Вне scope:** крупные repos (фазы 12–14); `app-layer/doctor/*`, `app-layer/platform-user/*` (остатки `pool.query` — фаза 12+).

## Мигрированные файлы (итог)

| Область | Файл | Transport |
|---------|------|-----------|
| app-layer | `collectAdminSystemHealthData.ts` | `runWebappPgText` (preview probe) |
| app-layer | `adminTranscodeHealthMetrics.ts` | `runWebappPgText` (legacy media counts) |
| app-layer | `videoHlsLegacyBackfill.ts` | `runPgPoolPgText` |
| infra | `runWebappSql.ts` | + `runPgPoolPgText` (Class B) |
| infra | `pgDiaryPurge.ts` | `runWebappPgText` на `PoolClient` |
| infra | `pgAdminPlatformUserStats.ts` | `runPgPoolPgText` (6×) |
| infra | `strictPlatformUserPurge.ts` | domain → `runPgPoolPgText`; TX → Class C |
| infra | `pgRubitimeMapping.ts` | legacy load → `runPgPoolPgText` |
| infra | `pgPatientBroadcasts.ts` | `runPgPoolPgText` |
| infra | usage summaries ×4 | `runPgPoolPgText` |
| infra | `loadPlatformUserChannelBindings.ts` | `runWebappPgText` |
| infra | merge/purge helpers ×4 | `runPgPoolPgText` |
| reminders | `loadWarmupsSectionSlugs.ts`, `disableReminderMessengerTopic.ts` | `runPgPoolPgText` |
| settings | `configAdapter.ts` | `runWebappPgText` + Zod |
| idempotency | `pgStore.ts` | `runWebappPgText` + Zod |

**Class C (без изменений семантики):** `channelLink.ts` (6× TX), `strictPlatformUserPurge.ts` (3× TX + advisory).

## Проверки (step / phase)

```bash
rg 'pool\.query|client\.query' apps/webapp/src/app-layer/health apps/webapp/src/app-layer/media --glob '*.ts'
rg 'pool\.query' apps/webapp/src/modules/auth/channelLink.ts
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec vitest run --project fast \
  src/app-layer/media/adminTranscodeHealthMetrics.test.ts \
  src/app-layer/media/videoHlsLegacyBackfill.test.ts \
  src/app/api/admin/system-health/route.test.ts \
  src/modules/system-settings/configAdapter.test.ts \
  src/modules/system-settings/parseSettingValueJson.test.ts \
  src/infra/idempotency/pgStore.test.ts \
  src/infra/mergePreviewIntegratorUserPresence.test.ts
```

Полный `pnpm run ci` — барьер перед merge/PR (см. `.cursor/rules/pre-push-ci.mdc`), не обязателен после каждого micro-fix.

## ESLint allowlist (auth)

Проверка `rg '@/infra/repos|@/infra/db' apps/webapp/src/modules/auth/` — снятие с allowlist **не выполнялось**:

| Файл | Причина |
|------|---------|
| `channelLink.ts` | `@/infra/db/client`, `@/infra/repos/pgChannelLinkClaim`, … |
| `oauthWebSession.ts` | `@/infra/repos/pgUserByPhone` |
| `yandexOAuthCallbackHandler.ts` | `pgUserByPhone`, `pgOAuthBindings`, `pgPatientCalendarTimezone` |
| `service.ts` | dynamic `pgUserByPhone`, `pgUserProjection` |
| `configAdapter.ts` | `@/infra/db/runWebappSql` (module-layer adapter) |

## Закрытие (2026-06-06)

- **Код:** см. таблицу «Мигрированные файлы»; post-audit — доп. unit-тесты `parseSettingValueJson.test.ts`, `pgStore.test.ts`.
- **Verify:** targeted vitest **48 passed**; typecheck green; post-audit **`pnpm run ci`** green (2026-06-06).
- **Документация:** [LOG.md §Wave 3 phase 11](../LOG.md), [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md), [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md), [wave3_INDEX.md](./wave3_INDEX.md), [plans/README.md](./README.md).
- **Следующая фаза (на момент закрытия 11):** [wave3_phase_12_webapp_intake_purge_identity.plan.md](./wave3_phase_12_webapp_intake_purge_identity.plan.md) — **закрыта** 2026-06-06. Актуальная следующая: [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md).
