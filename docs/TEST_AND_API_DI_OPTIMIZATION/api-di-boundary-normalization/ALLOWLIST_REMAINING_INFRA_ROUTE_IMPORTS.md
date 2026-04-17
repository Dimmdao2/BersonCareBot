# ALLOWLIST — remaining `@/infra/*` imports in `app/api/**/route.ts`

**Дата снимка:** 2026-04-17  
**Источник:** `rg '@/infra/' apps/webapp/src/app/api --glob '**/route.ts' --files-with-matches`  
**Контекст:** post-Cluster G (integrator GET переведены на `assertIntegratorGetRequest`).

## Статусы

- `approved-exception` — оставляем как осознанное исключение из policy.
- `planned-cluster` — остаётся временно; нормализация запланирована в кластере трека B.
- `violation` — вне policy и без плана (в этом снимке **нет**).

## Owner / ETA

- **Owner:** webapp platform team (Track B owners).
- **ETA:** следующая волна трека B, по кластерам `H/L/O/R/I/M/D` (см. `PLAN.md` и `LOG.md`).

## Snapshot (48 routes)

| Route path | Status | Cluster / rationale |
|------------|--------|---------------------|
| `apps/webapp/src/app/api/auth/max-init/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/auth/telegram-init/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/menu/route.ts` | `approved-exception` | `L` — structured logging exception (`logServerRuntimeError`) |
| `apps/webapp/src/app/api/public/support/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/patient/support/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/patient/diary/purge/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/booking/catalog/cities/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/booking/catalog/services/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/booking/slots/route.ts` | `approved-exception` | `L` — structured logging exception (`logger`) |
| `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts` | `approved-exception` | `I` — webhook signature verify exception (policy-allowed) |
| `apps/webapp/src/app/api/health/projection/route.ts` | `planned-cluster` | `H` — health proxy port in app-layer |
| `apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts` | `planned-cluster` | `O` — OAuth callbacks (pg/in-memory wiring) |
| `apps/webapp/src/app/api/auth/oauth/callback/google/route.ts` | `planned-cluster` | `O` — OAuth callbacks (pg/in-memory wiring) |
| `apps/webapp/src/app/api/doctor/appointments/rubitime/cancel/route.ts` | `planned-cluster` | `R` — signed integrator POST facade |
| `apps/webapp/src/app/api/doctor/appointments/rubitime/update/route.ts` | `planned-cluster` | `R` — signed integrator POST facade |
| `apps/webapp/src/app/api/integrator/events/route.ts` | `planned-cluster` | `I` — high-risk integrator POST/idempotency/audit |
| `apps/webapp/src/app/api/integrator/messenger-phone/bind/route.ts` | `planned-cluster` | `I` — high-risk integrator POST/idempotency |
| `apps/webapp/src/app/api/integrator/reminders/dispatch/route.ts` | `planned-cluster` | `I` — high-risk integrator POST/idempotency |
| `apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.ts` | `planned-cluster` | `I` — integrator POST reminder ops |
| `apps/webapp/src/app/api/integrator/reminders/occurrences/snooze/route.ts` | `planned-cluster` | `I` — integrator POST reminder ops |
| `apps/webapp/src/app/api/media/upload/route.ts` | `planned-cluster` | `M` — media wiring cleanup |
| `apps/webapp/src/app/api/media/presign/route.ts` | `planned-cluster` | `M` — media + S3 + pool |
| `apps/webapp/src/app/api/media/confirm/route.ts` | `planned-cluster` | `M` — media repo + S3 |
| `apps/webapp/src/app/api/media/[id]/route.ts` | `planned-cluster` | `M` — media read/storage routing |
| `apps/webapp/src/app/api/media/[id]/preview/[size]/route.ts` | `planned-cluster` | `M` — media preview + S3 |
| `apps/webapp/src/app/api/media/multipart/init/route.ts` | `planned-cluster` | `M` — multipart orchestration |
| `apps/webapp/src/app/api/media/multipart/part-url/route.ts` | `planned-cluster` | `M` — multipart orchestration |
| `apps/webapp/src/app/api/media/multipart/abort/route.ts` | `planned-cluster` | `M` — multipart orchestration |
| `apps/webapp/src/app/api/media/multipart/complete/route.ts` | `planned-cluster` | `M` — multipart orchestration |
| `apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts` | `planned-cluster` | `M` — internal media cleanup job |
| `apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts` | `planned-cluster` | `M` — internal media cleanup job |
| `apps/webapp/src/app/api/internal/media-preview/process/route.ts` | `planned-cluster` | `M` — internal media preview job |
| `apps/webapp/src/app/api/admin/media/[id]/route.ts` | `planned-cluster` | `M` — admin media services |
| `apps/webapp/src/app/api/admin/media/folders/route.ts` | `planned-cluster` | `M` — admin media services |
| `apps/webapp/src/app/api/admin/media/folders/[id]/route.ts` | `planned-cluster` | `M` — admin media services |
| `apps/webapp/src/app/api/admin/media/exercise-usage/route.ts` | `planned-cluster` | `M` — admin media usage wiring |
| `apps/webapp/src/app/api/admin/media/delete-errors/route.ts` | `planned-cluster` | `M` — admin media cleanup wiring |
| `apps/webapp/src/app/api/admin/system-health/route.ts` | `planned-cluster` | `H` — system-health and health proxy |
| `apps/webapp/src/app/api/admin/audit-log/route.ts` | `planned-cluster` | `D` — admin audit service |
| `apps/webapp/src/app/api/admin/users/[userId]/profile/route.ts` | `planned-cluster` | `D` — admin user profile/audit wiring |
| `apps/webapp/src/app/api/doctor/clients/merge/route.ts` | `planned-cluster` | `D` — high-risk merge orchestration |
| `apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts` | `planned-cluster` | `D` — high-risk merge + integrator M2M |
| `apps/webapp/src/app/api/doctor/clients/merge-preview/route.ts` | `planned-cluster` | `D` — merge preview |
| `apps/webapp/src/app/api/doctor/clients/merge-user-search/route.ts` | `planned-cluster` | `D` — merge search/hints |
| `apps/webapp/src/app/api/doctor/clients/name-match-hints/route.ts` | `planned-cluster` | `D` — merge hints |
| `apps/webapp/src/app/api/doctor/clients/[userId]/merge-candidates/route.ts` | `planned-cluster` | `D` — merge candidates |
| `apps/webapp/src/app/api/doctor/clients/[userId]/permanent-delete/route.ts` | `planned-cluster` | `D` — strict purge |
| `apps/webapp/src/app/api/me/route.ts` | `planned-cluster` | `D` — session/user deps normalization |

## Summary

- `approved-exception`: **10**
- `planned-cluster`: **38**
- `violation`: **0**

This allowlist is the formal reference for residual `@/infra/*` imports until corresponding Track B clusters are executed.
