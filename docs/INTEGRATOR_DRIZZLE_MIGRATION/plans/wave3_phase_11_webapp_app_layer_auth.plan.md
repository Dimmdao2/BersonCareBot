---
name: Wave3 Phase11 Webapp app layer auth
overview: Низкий риск — app-layer health/media metrics, остатки auth TX, мелкие infra с <10 query.
status: pending
isProject: false
todos:
  - id: w3-p11-app-layer
    content: "collectAdminSystemHealthData, adminTranscodeHealthMetrics, videoHlsLegacyBackfill → runWebappSql/Drizzle."
    status: pending
  - id: w3-p11-auth-transport
    content: "channelLink.ts — документировать Class C BEGIN/COMMIT; shrink eslint allowlist если порты закрыты."
    status: pending
  - id: w3-p11-small-infra
    content: "Файлы ≤6 query: pgDiaryPurge, pgAdminPlatformUserStats, strictPlatformUserPurge, locks (verify P3), idempotency pgStore, loadPlatformUserChannelBindings, …"
    status: pending
  - id: w3-p11-verify
    content: "rg + vitest fast по health/media/auth."
    status: pending
---

# Wave 3 — фаза 11: Webapp app-layer + auth tail

## Размер

**S–M** (разогрев перед L-фазами).

## Definition of Done

- [ ] `app-layer/health/*`, `app-layer/media/*` — нет `pool.query`.
- [ ] `channelLink.ts`: либо только Class C transport, либо TX через `runWebappTransaction` helper.
- [ ] ESLint allowlist auth: для каждого файла из allowlist есть явная причина в LOG; лишние записи удалены.
- [ ] Мелкие repos из списка ниже мигрированы или помечены Class B/C в RAW_SQL.
- [ ] Для затронутых app-layer/auth JSON/input границ добавлены Zod-схемы (без unsafe cast).

## Scope

**Разрешено:** `apps/webapp/src/app-layer/health/**`, `app-layer/media/**`, `modules/auth/channelLink.ts`, `infra/idempotency/pgStore.ts`, `infra/repos/pgDiaryPurge.ts`, `pgAdminPlatformUserStats.ts`, `strictPlatformUserPurge.ts`, `pgRubitimeMapping.ts`, `pgPatientBroadcasts.ts`, `pgRecommendations.ts`, `pgTestSets.ts`, `pgCourses.ts`, `pgClinicalTests.ts`, `loadPlatformUserChannelBindings.ts`, `mergeAuditLabels.ts`, `manualMergeIntegratorGate.ts`, `platformUserNameMatchHints.ts`, `mergePreviewIntegratorUserPresence.ts`, `modules/reminders/disableReminderMessengerTopic.ts`, `loadWarmupsSectionSlugs.ts`, `modules/system-settings/configAdapter.ts`.

**Вне scope:** крупные repos (фазы 12–14).

## Файлы (query count ≤ 6, 2026-06-05)

Перенос пакетом в начале фазы 11 — снижает шум в `rg` перед purge/intake.

## Проверки

```bash
rg 'pool\.query|client\.query' apps/webapp/src/app-layer --glob '*.ts'
rg 'pool\.query' apps/webapp/src/modules/auth/channelLink.ts
pnpm --dir apps/webapp exec vitest run --project fast e2e/admin-health 2>/dev/null || true
```

## Примечание

`oauthWebSession`, `service.ts`, `yandexOAuthCallbackHandler` — в этой фазе обязательна проверка `rg`; если нет infra/db/repo импортов, remove из allowlist отдельным micro-commit внутри PR.
