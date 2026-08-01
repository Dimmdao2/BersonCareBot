# #1057 / #1069 — смена тарифа без потери оплаченного периода

Worker evidence; не заменяет независимый audit и DEV product oracle.

| Команда | Результат |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS — dependencies restored in this worktree. |
| `pnpm --filter @bersoncare/db-principal build && pnpm --filter @bersoncare/platform-merge build && pnpm --filter @bersoncare/operator-db-schema build && pnpm --filter @bersoncare/error-tracking build && pnpm --dir apps/webapp typecheck` | PASS. |
| `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/modules/org-entitlements/service.test.ts src/app/api/payments/saasWebhook.route.test.ts src/app/api/admin/organizations/route.route.test.ts` | PASS — 4 files, 65 tests. |
| `pnpm --dir apps/webapp exec vitest run src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx` | PASS — 1 file, 3 tests. |
| `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` | PASS. |
| `pnpm --dir apps/webapp exec drizzle-kit check` | BLOCKED before schema check: this worktree has no `DATABASE_URL`; no DEV/TEST/PROD DB was touched. |
| `node scripts/check-no-new-raw-sql.mjs && pnpm --dir apps/webapp lint && git diff --check` | PASS. |

Remaining for the lead: independent behavior/data/money audit; then the prescribed DEV preflight/execute and product oracle. The clinic checkout still does not create an upgrade invoice from a tariff choice: the owner money formula is not set.
