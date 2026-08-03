# D15b/3 — one identity port in the webapp (03.08.2026)

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/3; scheme —
`IDENTITY_AND_MERGE_SCHEME.md` §2b (port as target architecture) / §2d (`packages/platform-merge` is
the write engine, not the port). Census baseline: `D15B1_IDENTITY_CENSUS_2026-08-03.md`.

Branch: `wt/d15b3-identity-port`. No migration, no DB change, no deploy — consolidation only.

---

## 1. What changed

New module `apps/webapp/src/modules/identity/`:

- **`ports.ts`** — `IdentityPort`, the aggregate type this module owns:
  `{ projection, session, channelResolution, clients }`, composed from four **existing** port
  interfaces (`UserProjectionPort`, `UserByPhonePort`, `IdentityResolutionPort`, `DoctorClientsPort`)
  rather than re-declaring their methods. `UserProjectionPort` itself moved here **from**
  `infra/repos/pgUserProjection.ts` — that file defined its own port type in the infra layer, a
  direct AGENTS.md §5.3 violation ("port types belong in modules, not infra"); it now imports the
  type from the module like every other port/impl pair in this codebase.
- **`service.ts`** — `assembleIdentityPort(deps)`, the one composition function `buildAppDeps.ts`
  calls. A later stage that swaps what implements `projection` (or any other field) changes only
  this call site; nothing that reads `deps.identity` has to change.

`buildAppDeps.ts` wires `identityPort = assembleIdentityPort({ projection: userProjectionPort,
session: userByPhonePort, channelResolution: identityResolutionPort, clients: doctorClientsPort })`
and returns it as `deps.identity`. The four underlying consts (`userProjectionPort`,
`userByPhonePort`, `identityResolutionPort`, `doctorClientsPort`) are unchanged — same repositories,
same `!inMemoryRepos ? pg... : inMemory...` swap idiom used everywhere else in that file.

**`pgUserByPhone.ts`** — collapsed the two independent `SessionUser`-assembly code paths the census
flagged (§5 of the census doc) into one function, `loadSessionIdentityUser(userId, options)`, now
used by `findByPhone`, `createOrBind`, and `findByUserId` alike. `options.includeSecurityFactor`
keeps the staff-MFA join that only `findByUserId` is allowed to attach; `options.onMissingRow`
preserves each original caller's own behavior for the (very rare, racy) case where the row vanishes
between canonical-resolve and select — `findByPhone`/`createOrBind` still throw, `findByUserId` still
returns `null`, exactly as before. No SQL text changed, no column added or removed, no schema in
`identityPhoneRowSchemas.ts` touched. Also dropped a `pool: Pool` parameter that was accepted but
never read (dead code predating this change).

**The third assembly path was found, not merged.** `pgIdentityResolution.ts`'s
`loadSessionUserForId` (used by messenger channel-binding login) is a genuinely different function,
not just a copy: it uses a narrower row schema (no `id`/`patronymic`/`session_epoch`), and — unlike
the two paths above — **it does not check `is_archived` at all**. Folding it into the shared loader
would either mask that gap silently (if I added the archived check) or start returning
`sessionEpoch`/`firstName`/`lastName`/`patronymic` to messenger-login callers that never had them
before (a real shape change reaching session-cookie encoding and revocation checks). Both are
observable behavior changes for a real person, forbidden by this task's boundary, so this path was
left untouched. **Flagging for the owner:** an archived platform user can still mint a session via
`findOrCreateByChannelBinding`/`findByChannelBinding` (messenger re-login) — the D2 (2026-07-26)
archive-kills-session guarantee that holds for phone/OTP and staff logins does not currently hold for
messenger channel-binding logins. This is a live gap in `apps/webapp/src/infra/repos/pgIdentityResolution.ts`,
not something introduced by this pass.

---

## 2. The corrected writer count — 14, not 16

The WORK_ORDER text (D15b/3) says "16 репозиториев". Living count of `apps/webapp/src/infra` files
with a literal `INSERT`/`UPDATE`/`DELETE` against `platform_users` (verified by reading each file,
not by name-grep): **14**. `pgPlatformUserMerge.ts` is a pure re-export of
`@bersoncare/platform-merge` and doesn't count as an infra writer of its own.

| # | File | Sits behind |
|---|---|---|
| 1 | `pgUserProjection.ts` | **`IdentityPort.projection`** (this pass) |
| 2 | `pgUserByPhone.ts` | **`IdentityPort.session`** (this pass) |
| 3 | `pgDoctorClients.ts` | **`IdentityPort.clients`** (this pass) |
| 4 | `pgIdentityResolution.ts` | **`IdentityPort.channelResolution`** (this pass) |
| 5 | `pgOAuthUserResolve.ts` | `modules/auth/oauthUserResolvePort.ts` (own bound port, pre-existing) |
| 6 | `pgPhoneMessengerBind.ts` | `modules/auth/phoneMessengerBind.ports.ts` (own bound port, pre-existing) |
| 7 | `pgChannelLinkClaim.ts` | `modules/auth/channelLinkPort.ts` (own bound port, pre-existing) |
| 8 | `pgEmailSetupFlowPort.ts` | `modules/auth/emailSetupFlow/ports.ts` (own port, pre-existing) |
| 9 | `pgDoctorClientCreate.ts` | no module port — called only by infra peers (`pgPatientOrganization.ts`, `pgBookingEngine.ts`); infra→infra, not a layer violation |
| 10 | `platformUserFullPurge.ts` | no module port — reached via `app-layer/merge/strictPlatformUserPurge.ts`, a thin 1-line re-export; app-layer wrapping infra is the same pattern as `buildAppDeps.ts` itself |
| 11 | `pgPublicBookingUserResolve.ts` | no module port — reached via `app-layer/platform-user/resolveOrCreateUserByPhone.ts`, same thin-wrapper pattern as #10 |
| 12 | `pgPatientCalendarTimezone.ts` | no module port — wired as bare functions directly in `buildAppDeps.ts` (the one file allowed to import infra directly) |
| 13 | `pgPlatformUserCalendarTimezone.ts` | same as #12 |
| 14 | `integratorPlatformUserMerge.ts` | **no port, no wrapper — see §3.4, a real finding** |

Items 1–4 are the four that match this task's literal scope (“who this person is, contacts, what may
authenticate them, entity assembly”) and are now behind the one `IdentityPort`. Items 5–8 already had
their own dedicated ports before this pass — folding them into the same flat `IdentityPort` type was
considered and rejected for this pass: they're bound through `bindAuthModulePorts.ts`'s
`ensureAuthModulePortsBound()`, which runs **inside** `_buildAppDeps()` per request, while
`identityPort` is composed **at module scope** (once, at import time) like its four siblings.
Reaching into the bound singletons from module scope would silently depend on call order across the
whole file; moving the composition inside the function to accommodate that has a much larger blast
radius (every other per-request service in that ~1900-line file) for no behavior gain — this pass
adds type references over existing objects, it does not restructure the composition root. Items 9–13
are legitimately outside any module port today (infra-internal or already routed through the one
allowed direct-import site) and weren't touched. Item 14 is the one real, unclosed gap — see §3.4.

---

## 3. Out-of-infra call sites — verdicts

The WORK_ORDER text estimates "~12" files reaching `platform_users` from outside
`apps/webapp/src/infra`. The census's own §2.2 risk-list (`D15B1_IDENTITY_CENSUS_2026-08-03.md`)
actually named 34 lines across four categories; every one is verdicted below by category, plus one
finding neither list named.

### 3.1 The 26 `apps/webapp` app/module files from the census risk-list — all clean

Read individually (not name-grepped): every one either imports `SessionUser`/`ChannelBindings`/
`ClientIdentity`/`ClientListItem`/`PatientCardHeader` as a **type only**, or calls an already-bound
port (`requireOAuthUserResolvePort()`, `getAdminNotificationTargetsPort()`, `buildAppDeps()`). None
issues raw SQL/Drizzle against `platform_users`. Full per-file findings are in the research transcript
for this branch; the one soft spot is `modules/doctor-clients/clientArchiveChange.ts`, which is
currently a stub that always returns `409` rather than a live bypass. **Verdict: legitimate, no
change — this fan-out is exactly the "two contracts" shape the census predicted (`SessionUser`,
`DoctorClientsPort`'s exported types), not independent DB access.**

### 3.2 `packages/platform-merge/*` (4 files) — legitimate, by design

`pgPlatformUserMerge.ts`, `mergeContactFallback.ts`, `messengerBindAuditEnrichment.ts`,
`messengerPhonePublicBind.ts` sit outside `apps/webapp/src/infra` entirely, in the shared workspace
package. **Verdict: legitimate — this is the write engine both apps call directly per §2d ("не
дублируется и не переносится внутрь вебаппа целиком — он остаётся общим для обоих приложений"). It
is a peer dependency the identity port wraps (four of the 14 writers above call into it for merges),
not something D15b/3 folds inward.**

### 3.3 8 dev/ops scripts under `apps/webapp/scripts/**` — real bypass, deliberately not routed

`fio-backfill/*.ts` (3 files), `migrate-fio-dev.ts`, `purge-placeholder-bookings.ts`,
`user-phone-admin.ts`, `seed-saas-test-walkthrough-fixtures.ts`,
`integrator-schema-cleanup/01_audit.ts` all issue raw SQL against `platform_users` outside any port —
confirmed real, not a false positive. **Verdict: legitimately outside this port's scope, not "fixed
by rewriting one port implementation."** These are one-off bulk/admin CLI tools (backfill, purge,
seed, audit) whose whole purpose is bulk raw access a narrow application port wouldn't sensibly
expose — the census reached the same conclusion independently ("их нельзя перенаправить переписыванием
одной реализации порта, их нужно чинить по отдельности"). Routing them through `IdentityPort` would
either strip the bulk operations they need or require adding bulk methods to the port that no runtime
caller would ever use. They remain a named, tracked risk for the day a table/DB split actually
happens — that's a separate follow-up, not this pass's job per the task's own boundary (no migration,
no redesign).

### 3.4 New finding, not in either list: one real route-level bypass

`apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts` imports
`executeIntegratorPlatformUserMerge` from `@/infra/integratorPlatformUserMerge` **directly** and calls
it with `pool: getPool()` — no `buildAppDeps()`, no port, no service, in violation of AGENTS.md §5.4
("Route handlers MUST NOT contain... direct infra calls"). This was not named in the D15b/1 census's
file list (which only covered app/module files matching FIO/contacts/account column reads) and was
found by re-reading every remaining infra writer's callers for this report. **Verdict: real, not
legitimate — not fixed in this pass.** `executeIntegratorPlatformUserMerge` takes a raw `pool: Pool`
parameter rather than a port interface, so closing this cleanly means designing a small port around an
admin-only, cross-app (webapp↔integrator M2M) merge-confirmation flow, not just changing an import —
a change to a sensitive account-merge path deserves its own reviewed slice rather than being folded
silently into this one. Flagging it here so it doesn't get lost.

---

## 4. The one seam later stages swap

Per §2c (RLS on `platform_users`, then separate tables, then separate databases — each a change
**inside** the port): the function every later stage needs to swap without touching callers is
**`assembleIdentityPort` in `apps/webapp/src/modules/identity/service.ts`**, together with the four
port implementations it composes (`pgUserProjectionPort`, `pgUserByPhonePort`,
`pgIdentityResolutionPort`, `pgDoctorClientsPort` in `infra/repos/*`). A stage that, say, moves FIO
into a separate `user_identity` table (D15b/5) only has to change `pgUserProjectionPort`'s SQL and,
if the shape of `UserProjectionPort` itself needs new fields, `modules/identity/ports.ts` — every
caller of `deps.identity.projection` and every existing caller of the standalone
`userProjectionPort`/`userByPhonePort`/etc. locals keeps compiling and keeps working, because the
port type is what they depend on, not the query behind it.

The collapsed `loadSessionIdentityUser` in `pgUserByPhone.ts` is the equivalent seam one level down,
specifically for how a `platform_users` row becomes a `SessionUser` — one function, one place, for
two of the three code paths that build that object (the third, messenger channel-binding, is
`pgIdentityResolution.ts`'s `loadSessionUserForId`, deliberately left separate per §1 above).

---

## 5. Verification

- **Typecheck** — `pnpm --dir apps/webapp run typecheck` (tsc --noEmit) and
  `pnpm --dir apps/integrator run typecheck`: both clean.
- **Scoped ESLint** — `npx eslint` on all 5 changed/added files: clean, no errors, no warnings.
- **Scoped tests** — 21 test files / 117 tests covering the touched surface, all green:
  every `src/modules/auth/*.test.ts` (12 files — OAuth, password, phone, passkey, session-cookie,
  redirect-policy, public-auth-snapshot/policy), `app-layer/di/importBoundaryBindings.unit.test.ts`,
  three `app-layer/guards/*` entitlement/access-ladder tests, `modules/integrator/deliveryTargetsApi.d21.test.ts`,
  and four route tests exercising identity-adjacent paths (`patientCardNeverGated`, `patientAcquiring`,
  `integrator/events`, `check-phone` enumeration).
- **Postgres integration** — attempted `pnpm --dir apps/webapp run test:postgres -- pgUserProjection.postgres.integration.test.ts`
  (the only existing `.postgres.integration.test.ts` in this area); the disposable-DB migration chain
  failed with `sqlstate=2BP01` (object-in-use lock), consistent with another parallel worktree on this
  shared box holding a DDL lock rather than anything in this diff — this change makes zero migration
  or schema edits. **No dedicated Postgres integration test exists for `pgUserByPhone.ts` today** (the
  file this pass changes most); that gap predates this pass and isn't closed by it.
- `git diff --check`: clean.

## 6. What is NOT done (named, not hidden)

- Items 5–8 in §2 (`pgOAuthUserResolve.ts`, `pgPhoneMessengerBind.ts`, `pgChannelLinkClaim.ts`,
  `pgEmailSetupFlowPort.ts`) keep their own separate bound ports rather than joining `IdentityPort` —
  reasoned scope boundary in §2, not an oversight.
- Item 14 (§3.4) — the integrator-merge route's direct infra import — is real and unfixed.
- The dev/ops script bypasses (§3.3) are real and, per the census's own conclusion, intentionally not
  addressed by a port change.
- `pgIdentityResolution.ts`'s missing archived-session check (§1) is a live finding, not a fix.
- D15b/4 (RLS on `platform_users`) still needs items 5–14 accounted for before the policy shape can be
  written — this pass only clears items 1–4.
