# INVENTORY — API DI / import-boundary track

> **Архивный снимок (2026-04-16):** таблица описывает состояние **до** волны нормализации boundary (см. `LOG.md`). После 2026-04-17 прямых `@/infra/*` в `apps/webapp/src/app/api/**/route.ts` нет; см. также `ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md`.

Ниже **все 58** `route.ts`, где встречается `@/infra/` (**confirmed** 2026-04-16). Детали импортов — по файлу; краткий ярлык в колонке «Infra».

**Условные обозначения:** `sig+` = `verifyIntegratorSignature` (POST), `sigGet` = `verifyIntegratorGetSignature`, `pool` = `getPool`, `idem` = idempotency helpers, `S3` = s3 client/repos, `audit` = adminAuditLog / merge audit.

| Path (от `apps/webapp/src/app/api/`) | Infra (кратко) | Security-sensitive | Refactor complexity | Candidate composition | Priority |
|----------------------------------------|----------------|-------------------|---------------------|----------------------|----------|
| `admin/audit-log/route.ts` | pool, audit list | admin | Medium | extend `buildAppDeps` admin audit port | P1 |
| `admin/media/[id]/route.ts` | `pgFolderExists` | admin | Low | media service / deps | P2 |
| `admin/media/delete-errors/route.ts` | logger, s3 repo | admin | Low | media service | P2 |
| `admin/media/folders/[id]/route.ts` | `pgFolderExists` | admin | Low | media service | P2 |
| `admin/media/folders/route.ts` | `pgFolderExists` | admin | Low | media service | P2 |
| `admin/users/[userId]/profile/route.ts` | pool, audit, canonical | admin | Medium | user admin service | P1 |
| `auth/max-init/route.ts` | logger | auth | Low | logging helper / deps | P3 |
| `auth/oauth/callback/apple/route.ts` | pg + inMemory OAuth | OAuth | Medium | auth module ports via deps | P1 |
| `auth/oauth/callback/google/route.ts` | pg + inMemory OAuth | OAuth | Medium | same | P1 |
| `auth/telegram-init/route.ts` | logger | auth | Low | P3 | P3 |
| `booking/catalog/cities/route.ts` | logger | session | Low | P3 | P3 |
| `booking/catalog/services/route.ts` | logger | session | Low | P3 | P3 |
| `booking/slots/route.ts` | logger | session | Low | P3 | P3 |
| `doctor/appointments/rubitime/cancel/route.ts` | integratorSignedPost | doctor + integrator | Medium | small integrator client facade in deps | P1 |
| `doctor/appointments/rubitime/update/route.ts` | integratorSignedPost | same | Medium | same | P1 |
| `doctor/clients/[userId]/merge-candidates/route.ts` | pool, merge preview | admin | Medium | doctor-clients / merge service | P1 |
| `doctor/clients/[userId]/permanent-delete/route.ts` | pool, strictPurge | admin + destructive | **High** | dedicated purge use-case | P0 |
| `doctor/clients/integrator-merge/route.ts` | M2M client, audit, pool, logger, labels | admin + integrator | **High** | integrator merge orchestration in deps | P0 |
| `doctor/clients/merge-preview/route.ts` | pool, merge preview | admin | Medium | merge preview service | P1 |
| `doctor/clients/merge-user-search/route.ts` | pool, logger, preview | admin | Medium | merge search service | P1 |
| `doctor/clients/merge/route.ts` | pool, manual merge, gate | admin | **High** | merge orchestration | P0 |
| `doctor/clients/name-match-hints/route.ts` | pool, logger, hints | admin | Medium | hints service | P2 |
| `health/projection/route.ts` | proxyIntegratorHealth | internal | Medium | health port on deps | P2 |
| `integrator/appointments/active-by-user/route.ts` | sigGet | integrator HMAC | Low–Med | app-layer verify wrapper | P2 |
| `integrator/appointments/record/route.ts` | sigGet | same | Low–Med | same | P2 |
| `integrator/channel-link/complete/route.ts` | sig+ | integrator | Medium | integrator ingress service | P1 |
| `integrator/communication/conversations/[id]/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/communication/conversations/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/communication/questions/by-conversation/[conversationId]/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/communication/questions/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/delivery-targets/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/diary/lfk-complexes/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/diary/symptom-trackings/route.ts` | sigGet | integrator | Low–Med | same | P2 |
| `integrator/events/route.ts` | pool, idem, sig+, audit, canonical | integrator + merge | **High** | `integratorEvents` use-case from deps | P0 |
| `integrator/messenger-phone/bind/route.ts` | pool, idem, sig+, logger | integrator | **High** | bind use-case | P0 |
| `integrator/reminders/dispatch/route.ts` | idem, sig+ | integrator | **High** | reminder dispatch service | P0 |
| `integrator/reminders/history/route.ts` | sigGet | integrator | Low–Med | wrapper | P2 |
| `integrator/reminders/occurrences/skip/route.ts` | sig+, pool, canonical | integrator | Medium | reminder ops | P1 |
| `integrator/reminders/occurrences/snooze/route.ts` | sig+, pool, canonical | integrator | Medium | reminder ops | P1 |
| `integrator/reminders/rules/by-category/route.ts` | sigGet | integrator | Low–Med | wrapper | P2 |
| `integrator/reminders/rules/route.ts` | sigGet | integrator | Low–Med | wrapper | P2 |
| `integrator/subscriptions/for-user/route.ts` | sigGet | integrator | Low–Med | wrapper | P2 |
| `integrator/subscriptions/topics/route.ts` | sigGet | integrator | Low–Med | wrapper | P2 |
| `internal/media-multipart/cleanup/route.ts` | pool, lock, repos, S3 | Bearer internal | **High** | job runner service | P1 |
| `internal/media-pending-delete/purge/route.ts` | logger, s3 purge | Bearer internal | Medium | media maintenance | P1 |
| `me/route.ts` | pool | session | Medium | users/session via deps (partially there) | P2 |
| `media/[id]/route.ts` | logger, mock/s3, presign | session | **High** | media read use-case | P1 |
| `media/confirm/route.ts` | s3 repo + head | session | Medium | media service | P1 |
| `media/multipart/abort/route.ts` | logger, pool, lock, repos, S3 | session | **High** | multipart service | P0 |
| `media/multipart/complete/route.ts` | pool, logger, lock, repos, S3 | session | **High** | multipart service | P0 |
| `media/multipart/init/route.ts` | pool, logger, folders, repos, S3, user lock | session | **High** | multipart service | P0 |
| `media/multipart/part-url/route.ts` | repos, S3 presign | session | Medium | multipart service | P1 |
| `media/presign/route.ts` | logger, folders, s3, pool, user lock | session | **High** | media service | P0 |
| `media/upload/route.ts` | logger | session | Low | P3 | P3 |
| `menu/route.ts` | serverRuntimeLog | session | Low | P3 | P3 |
| `patient/diary/purge/route.ts` | logger | patient | Low | P3 | P3 |
| `patient/support/route.ts` | logger | patient | Low | P3 | P3 |
| `public/support/route.ts` | logger | public | Low | P3 | P3 |

**Приоритет:** P0 — после checkpoint трека A; максимальный регрессионный риск. P2 cluster «только sigGet» — возможный batch после выбора общего wrapper.

**Candidate composition:** все пути с `buildAppDeps` уже частично покрыты — уточнение, *какие* методы добавить на объект deps vs отдельные фабрики (**needs verification** по циклам импорта).
