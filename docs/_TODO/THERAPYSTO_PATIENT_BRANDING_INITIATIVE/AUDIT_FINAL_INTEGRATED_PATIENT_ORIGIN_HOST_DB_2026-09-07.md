# Final integrated audit — patient origin / Host / DB (#787)

**Candidate:** `c415788f9`
**Scope:** bounded continuation audit after `bdd8f9ec4`; product code is read-only.

## Test/view classification — recorded before reading test bodies

| Acceptance item | Classification | Proof method / retained oracle |
| --- | --- | --- |
| One shared organization-to-patient-public-origin seam; active-only custom hostname; permanent slug fallback; staff remains Therapysto | `view` for one-seam architecture and producer wiring; `test` for repeatable K1–K4 origin selection | Inspect dependency/wiring once; reuse the prior F-1 payment-return oracle and shared-seam behavior tests. |
| Transitional DEV/TEST `PATIENT_APP_ORIGIN` contract; no inline route fallback | `view` for the single production composition and mock boundary; `test` for typed-config fallback behavior | Inspect route/dependency composition once; reuse K13 config oracle. |
| Reconcile every named patient-link call site and preserve staff/admin/operator/protocol list | `view` | Trace each producer and trusted organization provenance; do not duplicate origin tests per producer. |
| Payment return and Yandex callback patient-origin behavior | `test` | Re-run retained F-1 and F-2 acceptance oracles. |
| Reminder authority cannot be changed after delivery by browser query/cookie; legacy/unscoped behavior is honest | `test` | Exercise the real request path and inspect trusted resource/relationship provenance; retain or add only a behavior oracle if absent. |
| Touched-test quality under §§10a/10b | `view` | Inspect touched tests for harmful source/format/call-shape/UI-layout/count assertions. |
| B2 global uniqueness, immutable owner, quarantine, active-only resolution at DB boundary | `test` | Reuse an existing named-DEV rollback-only proof; if absent, add one opt-in `*.devDbProof.test.*`. |
| Candidate Host matrix through exported Next proxy/composition | `test` | Run isolated candidate on a free `5211..5219` port, then request real Host paths; absent named-DEV cases remain explicitly absent. |

## Result

**Verdict: FAIL — NOT FOR LAND.** Product code was not changed by this audit.

1. **MUST FIX — the shared origin seam violates the approved transitional deployment contract.**
   `patientPublicOriginFromProjection()` in
   `apps/webapp/src/modules/custom-domain-binding/service.ts` hardcodes
   `https://<slug>.therapygo.ru`. Its organization-bound callers therefore escape the current
   one-host DEV/TEST `PATIENT_APP_ORIGIN` surface before cutover. The active custom-host branch is
   correctly selected only after lifecycle eligibility, but the permanent-alias fallback must be
   derived from the typed deployment surface, not a production literal.

2. **MUST FIX — acquiring charge has an inline projection-to-origin fallback.**
   `apps/webapp/src/app/api/doctor/patients/[userId]/acquiring-charge/route.ts` first calls the
   shared service and then reimplements `readAnonymousPatientSurfaceProjection()` plus
   `patientPublicOriginFromProjection()`. This is expressly forbidden by the brief and would let a
   stale mock dictate a second production seam. The acceptance test double was corrected to expose
   `resolvePatientPublicOrigin()` itself.

3. **MUST FIX — the real signed reminder request path returns `500`.** A candidate request with a
   valid signed body for the only active DEV organization and hostile query/cookie organization ids
   reached `POST /api/integrator/patient-reminders/materialize-wake` and returned
   `{"ok":false,"error":"internal_error"}`. The route hides the underlying failure, so it cannot
   prove F-3's promised trusted delivery path. Snapshot filtering alone is not accepted as its
   substitute.

## Reconciled implementation view

- `buildAppDeps.ts` injects one `CustomDomainBindingService.resolvePatientPublicOrigin()` seam into
  payments, memberships, booking/ICS confirmation, broadcasts, replies, web push and reminder
  materialization. Yandex uses trusted `ResolvedSurface.publicOrigin` for patient redirects.
- The retained staff/admin/operator/protocol list remains staff-bound: doctor-facing message links,
  support/operator routes, SaaS billing, clinic invites, Google Calendar callback and VAPID/protocol
  URLs were not moved to a patient origin.
- The active-host eligibility branch rejects non-eligible custom bindings before selecting a custom
  host. This does not remedy the two defects above.

## Retained-oracle and test-policy result

`pnpm --dir apps/webapp exec vitest run --project route src/app/api/payments/patientAcquiring.route.test.ts src/app/api/integrator/patient-reminders/materialize-wake/route.route.test.ts`
→ **2 files / 22 tests PASS**.

`pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts`
→ **2 files / 5 tests PASS**.

`pnpm --dir apps/webapp exec vitest run --project unit src/config/envDatabaseRuntime.unit.test.ts src/modules/custom-domain-binding/service.unit.test.ts`
→ **2 files / 21 tests PASS**.

`pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/handlers/scheduledMaterialization.test.ts src/infra/adapters/webappEventsClient.materializeWake.test.ts`
→ **2 files / 3 tests PASS**.

The audit changed no product test oracle and added no test: new fault-injection count is **0** and
new uncaught count is **0**. It removed one harmful internal call-shape assertion from the signed
reminder route test, and corrected the payment route fake to implement the production public seam
rather than forcing the route's forbidden fallback.

## Named-DEV B2 proof

Existing proof search:

`node /home/dev/brain/tools/code-search.mjs "custom domain binding database rollback proof immutable organization active quarantine" --repo bcb -k 40`
and exact `rg` over `*.devDbProof.test.*` found no B2 binding-lifecycle proof. The nearby
`clinic-domain-write-constraints.devDbProof.test.mjs` proves the retired
`system_settings.org_custom_domain_hostname` constraint, not the binding table.

The rollback-only catalog check

`sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At -F $'\t' -c "BEGIN READ ONLY; SELECT 'organizations', count(*) FROM public.be_organizations; SELECT 'bindings', count(*) FROM public.org_custom_domain_bindings; SELECT 'published_brands', count(*) FROM public.org_brand_revisions WHERE status = 'published'; SELECT 'active_orgs', count(*) FROM public.be_organizations WHERE is_active; SELECT 'active_bindings', count(*) FROM public.org_custom_domain_bindings WHERE status = 'active'; ROLLBACK;"`
returned **organizations=1, bindings=0, published_brands=0, active_orgs=1, active_bindings=0**.

**BLOCKED:** a compact rollback-only proof cannot attempt cross-organization duplicate claim/reclaim,
immutable-owner rewrite or quarantine reuse without inventing a second organization or persistent fixture.
Neither was created.

## Candidate Host gate and cleanup

After `ss -ltn '( sport >= :5211 and sport <= :5219 )'` returned no listener, candidate `c415788f9`
was started from the prescribed `.env.dev` on `127.0.0.1:5211`, with only local host identity and
port overridden. Real Next proxy results after warmup:

| Host case | `/` | `/app` | `/book/audit-787?next=%2Fapp%3Ftab%3Dcare` |
| --- | --- | --- | --- |
| staff | 200 | 200 | 404 |
| patient-default | 200 | 200 | 404 |
| unknown | not applicable | 404 | 404 |

The same named-DEV query returned `directory_rows=0` and `bindings=0`; consequently no known
`<slug>.therapygo.ru`, active custom Host or custom 308 path/query case existed and none was
fabricated. The signed F-3 POST described above returned 500. Candidate process group `3585058`
was terminated; `ss -ltnp '( sport = :5211 )'` then returned header only.

## Validation

`pnpm --dir apps/webapp typecheck && pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp exec eslint <16 product paths + 2 touched tests>` → **exit 0**.

`git diff --check` → **PASS**.

## External owner-authorized gates (not repository PASS)

- PROD deploy;
- real DNS delegation and edge reachability;
- REG.RU credentials / allow-list;
- first certificate issuance and renewal;
- cutover and rollback.
