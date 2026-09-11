FAIL

# S3 audit — invoice-check screen before the payment provider

Candidate: `355722b8c` + `57af870ec` on `wt/prepayment-s3-check-screen`.
Oracle: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S3, and
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, `PAY-APPT-11`.

## Classification before inspection

1. **Test**, plus a look at the actual `EXPLAIN`: anonymous response equivalence and the SQL execution shape are
   observable behavior, not properties that can be accepted from source reading.
2. **Test** for the route boundary, plus a **look** at the provider boundary: expiry, redirect and cache behavior
   need fault-sensitive probes; the paths that bypass our route must be traced to the provider's `expires_at`.
3. **Test/view**: query the live DEV catalogs as `app_pre_session`, then fault-inject a generated privilege artifact.
4. **Look**: this is an exhaustive source-to-sink search for provider hosts and checkout URLs.
5. **Test** for the `410`/`503` split, plus a **look** at dependency composition to decide production reachability.
6. **Look**: usefulness and timezone dependence are properties of the rendered information.

Blind kill set declared before the checks: live intent does not redirect; dead intent redirects or leaks its
provider URL; known/unknown/malformed dead identifiers are distinguishable; an internal outage is called a
cancellation; a normally evaluated dead intent yields `503`; any redirect/error branch is cacheable.

## 1. Minimal disclosure — FAIL

The public response distinguishes a real dead invoice from unknown and malformed input. A real dead invoice
contains its amount; the other two do not. This violates the audit's S3.3 equivalence requirement and discloses
that the probed UUID belongs to an invoice. The concrete failing input was the synthetic dead intent
`d3ad0000-0000-4000-8000-000000000011`; controls were `d3ad0000-0000-4000-8000-000000000012` and
`not-a-uuid`.

The real-DEV handler probe was run from `apps/webapp` with this exact command (the trap guarantees exact-row
cleanup even if the handler fails):

```bash
set -e
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "INSERT INTO public.be_payment_intents (id, organization_id, idempotency_key, provider_id, appointment_id, amount_minor, currency, status, purpose, checkout_url) SELECT 'd3ad0000-0000-4000-8000-000000000011'::uuid, organization_id, 'audit-s3-disclosure', 'yookassa', id, 12345, 'RUB', 'pending', 'appointment_prepayment', 'https://provider.invalid/audit' FROM public.be_appointments WHERE id = '0df2108c-03cf-47d1-9bdb-9cad4dc2def1'::uuid"
cleanup() { sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "DELETE FROM public.be_payment_intents WHERE id = 'd3ad0000-0000-4000-8000-000000000011'::uuid" >/dev/null; }
trap cleanup EXIT
set -a
source .env.dev
set +a
pnpm exec tsx -e '(async()=>{const {GET}=await import("./src/app/book/pay/[intentId]/route");const ids=["d3ad0000-0000-4000-8000-000000000011","d3ad0000-0000-4000-8000-000000000012","not-a-uuid"];const rows=[];for(const id of ids){const times=[];let sample=null;for(let i=0;i<25;i++){const started=performance.now();const response=await GET(new Request(`http://localhost/book/pay/${id}`),{params:Promise.resolve({intentId:id})});const body=await response.text();times.push(performance.now()-started);sample={status:response.status,cacheControl:response.headers.get("cache-control"),contentType:response.headers.get("content-type"),location:response.headers.get("location"),bodyBytes:Buffer.byteLength(body),hasAmount:body.includes("123,45"),hasProviderUrl:body.includes("provider.invalid")};}times.sort((a,b)=>a-b);rows.push({id,...sample,medianMs:Number(times[12].toFixed(3)),minMs:Number(times[0].toFixed(3)),maxMs:Number(times[24].toFixed(3))});}console.log(JSON.stringify(rows,null,2));})()'
cleanup
trap - EXIT
sudo -n -u postgres psql -d bcb_webapp_dev -Atc "SELECT count(*) FROM public.be_payment_intents WHERE id IN ('d3ad0000-0000-4000-8000-000000000011'::uuid, 'd3ad0000-0000-4000-8000-000000000012'::uuid) OR idempotency_key LIKE 'audit-s3-%'"
```

Observed: known dead = `410`, `Cache-Control: no-store`, no `Location`, body 1110 bytes, amount present,
median 2.761 ms; unknown = `410`, `no-store`, no `Location`, body 1077 bytes, amount absent, median 2.015 ms;
malformed = the same 1077-byte response as unknown, median 1.653 ms. The timing samples are too noisy to establish
a timing oracle; the deterministic body difference already establishes the leak. Cleanup was proved by:

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -Atc "SELECT count(*) FROM public.be_payment_intents WHERE id IN ('d3ad0000-0000-4000-8000-000000000011'::uuid, 'd3ad0000-0000-4000-8000-000000000012'::uuid) OR idempotency_key LIKE 'audit-s3-%'"
```

which returned `0`.

The persistent acceptance test uses the response tuple `{status, Cache-Control, Content-Type, Location, body}`
and does not pin wording or element counts:

```bash
pnpm --dir apps/webapp exec vitest run src/app/book/pay/'[intentId]'/route.route.test.ts
```

Result: 4 tests executed, 3 passed and the equivalence test failed because only the known-dead body contains
`<p class="amount">125,00 ₽</p>`.

The SQL root is one top-level `RETURN QUERY`, but its runtime work is not constant. The live DEV transaction used
the function's exact join shape under `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` for a known synthetic UUID and an
unknown UUID, then rolled back:

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO public.be_payment_intents (id, organization_id, idempotency_key, provider_id, appointment_id, amount_minor, currency, status, purpose, checkout_url)
SELECT 'd3ad0000-0000-4000-8000-000000000001'::uuid, organization_id, 'audit-s3-plan', 'yookassa', id, 12345, 'RUB', 'pending', 'appointment_prepayment', 'https://provider.invalid/audit'
FROM public.be_appointments
WHERE id = '0df2108c-03cf-47d1-9bdb-9cad4dc2def1'::uuid;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT intent.amount_minor, appointment.status
FROM (VALUES (true)) AS one_row(always_one)
LEFT JOIN public.be_payment_intents AS intent
  ON intent.id = 'd3ad0000-0000-4000-8000-000000000001'::uuid
 AND intent.purpose = 'appointment_prepayment'
LEFT JOIN public.be_appointments AS appointment
  ON appointment.id = intent.appointment_id;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)
SELECT intent.amount_minor, appointment.status
FROM (VALUES (true)) AS one_row(always_one)
LEFT JOIN public.be_payment_intents AS intent
  ON intent.id = 'd3ad0000-0000-4000-8000-000000000002'::uuid
 AND intent.purpose = 'appointment_prepayment'
LEFT JOIN public.be_appointments AS appointment
  ON appointment.id = intent.appointment_id;
ROLLBACK;
SQL
```

The known plan executed the appointment primary-key scan and reported five shared-buffer hits; the unknown plan
reported that scan as `never executed` and one shared-buffer hit. Therefore “one statement” is true; “constant
execution shape for every UUID” is false.

No patient name, phone, service, clinic name or provider URL appeared in the known-dead HTML. The amount itself is
the distinguishing field.

The shared HTTP process on port 5200 serves `/home/dev/dev-projects/BersonCareBot` at `a3697f72b`, not this
candidate, and its `/book/pay/<uuid>` returns the old Next.js `404`. Repository rules prohibit starting a second
candidate server. Consequently the candidate's network-level headers/status/timing are **NOT CHECKED**; the
candidate handler and live DEV database root were exercised directly.

## 2. Expired invoice must not be payable — PASS for S3/S2 boundaries

A live synthetic appointment/intent on DEV returned `307`, `Cache-Control: no-store`, and the provider URL. After
changing that same appointment to `cancelled_by_specialist`, the handler returned `410`, `no-store`, no
`Location`, and no provider URL. Exact cleanup used the count query above and left zero audit rows.

Fault injection changed the dead branch to redirect whenever a checkout URL exists. This command then failed
with expected `410`, received `307`; the production edit was reverted:

```bash
pnpm --dir apps/webapp exec vitest run src/app/book/pay/'[intentId]'/route.route.test.ts -t 'does not expose a provider URL once the invoice is dead'
```

The screen stops only a request that reaches `/book/pay/<uuid>` at or after expiry: the root requires
`payment_deadline_at > clock_timestamp()`. It cannot revoke a provider page opened from a redirect obtained one
second earlier, browser Back to that page, or a previously copied provider URL. A cached `307` is stopped by
`Cache-Control: no-store`; the same header is present on `410` and `503`. Removing it from `respond` made the dead
and outage cache assertions fail, and the edit was reverted.

The bypass cases are delegated to S2's provider-side expiry. The appointment deadline is passed as
`invoice.expiresAt`; YooKassa declares `supportsInvoice: true` and sends that exact value as `expires_at`.
Providers without invoice support fail closed with `payment_provider_cannot_expire_invoice`. The external-payload
oracle was fault-sensitive: removing `expires_at` made it fail, and the edit was reverted.

```bash
pnpm --dir apps/webapp exec vitest run src/infra/payments/paymentProviderIdentity.unit.test.ts -t 'sends the same required values inside the real YooKassa invoice payment payload'
pnpm --dir apps/webapp exec vitest run src/modules/payments/service.test.ts -t 'hands the appointment payment deadline|refuses a deadline'
```

Results: the provider command passed its selected test; the service command passed both selected tests.

## 3. Least privilege — PASS

Live DEV catalog inspection as PostgreSQL administrator showed:

- `app.read_booking_payment_check(uuid)` is `SECURITY DEFINER`, owned by
  `app_seam_payment_webhook_owner`, executable by `app_pre_session`, and not executable by `PUBLIC`;
- `app_pre_session` has `rolinherit=false`, `rolsuper=false`, `rolbypassrls=false`, and no inherited role;
- `has_table_privilege` was false for `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on both
  `be_payment_intents` and `be_appointments`;
- `information_schema.role_table_grants` returned zero direct grants for those two relations.

Those figures came from:

```sql
SELECT p.oid::regprocedure, r.rolname, p.prosecdef, p.provolatile, p.proparallel,
       has_function_privilege('app_pre_session', p.oid, 'EXECUTE'),
       has_function_privilege('public', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.oid = 'app.read_booking_payment_check(uuid)'::regprocedure;
SELECT rolname, rolinherit, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = 'app_pre_session';
WITH RECURSIVE memberships(roleid) AS (
  SELECT oid FROM pg_roles WHERE rolname = 'app_pre_session'
  UNION
  SELECT m.roleid FROM pg_auth_members m JOIN memberships x ON m.member = x.roleid
)
SELECT r.rolname FROM memberships m JOIN pg_roles r ON r.oid = m.roleid ORDER BY r.rolname;
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'app_pre_session' AND table_schema = 'public'
  AND table_name IN ('be_payment_intents', 'be_appointments');
SELECT rel,
       has_table_privilege('app_pre_session', rel, 'SELECT'),
       has_table_privilege('app_pre_session', rel, 'INSERT'),
       has_table_privilege('app_pre_session', rel, 'UPDATE'),
       has_table_privilege('app_pre_session', rel, 'DELETE')
FROM unnest(ARRAY['public.be_payment_intents','public.be_appointments']) AS rel;
```

The block was executed with `sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off`.

The root's owner necessarily has the named column privileges used by the fixed function body. No direct relation
grant was added to `app_pre_session`; the migration itself contains no relation `GRANT`.

```bash
pnpm run check:db-privileges-generated
```

passed byte-for-byte for the generated DEV, TEST, PROD, allowlist and port-context artifacts. I then appended a
temporary comment to `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` and reran the same command. It
exited 1 and named that artifact as the sole mismatch; the comment was reverted. Final restoration was checked by:

```bash
git diff --exit-code -- deploy/postgres/generated/privileges.bcb_webapp_dev.sql apps/webapp/src/app/book/pay/'[intentId]'/route.ts apps/webapp/src/infra/payments/yookassaPaymentProvider.ts
```

which exited 0.

## 4. Single-link rule — PASS for appointment prepayment; owner question outside S3

Search was not limited to the call-site list:

```bash
node /home/dev/brain/tools/code-search.mjs "provider checkout URL appointment payment patient doctor notification QR" --repo bcb -k 30
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'https://(api\.yookassa\.ru|securepay\.tinkoff\.ru|api\.cloudpayments\.ru|pay\.alfabank\.ru)' apps packages deploy
rg -n 'providerCheckoutUrl|checkout_url|checkoutUrl' apps/webapp/src
```

For appointment prepayment, every read boundary wraps the stored provider URL: existing and newly created intents
through `exposeIntentCheckoutUrl`, summary reads through the same function, and list reads through
`buildAppointmentPaymentCheckUrl`. The S5 notification consumes the already-wrapped return from
`createAppointmentPaymentIntent`. No raw appointment provider URL was found reaching a patient screen, doctor
screen, email, messenger message, or QR.

Raw provider URLs intentionally remain in package/membership checkout (including patient and doctor UI/QR) and
SaaS billing UI. Those are separate payment products, outside the S3 appointment-prepayment checkbox. If the
lead's phrase “provider URL never reaches a human” was intended repo-wide rather than for appointment prepayment,
this is an owner question, not an S3 finding.

## 5. Fail-closed versus fail-silent — PASS

The split is real: a successful root result that is dead goes to `410`; a thrown root/dependency failure goes to
`503`. Changing the outage branch to `410` made the exact-status test fail; changing dead handling to redirect
made the dead test fail. Both edits were reverted. A genuinely dead row cannot reach `503` after a successful root
call. If the database check itself is unavailable, the route cannot establish that the row is dead and correctly
returns `503` instead of claiming cancellation.

`resolvePatientPublicOrigin` is injected for database-backed composition. Production startup refuses missing
runtime database configuration, so the service's `!resolvePatientPublicOrigin => checkoutUrl: null` branch is
reachable in in-memory/build/test composition, not the configured production runtime. A tenant whose public
origin cannot be resolved gets a loud creation failure (`503` at the booking boundary) and no payment link; it
does not receive a raw provider URL.

## 6. Removed deadline — PASS

The dead screen remains actionable without a deadline: it states the unambiguous cancelled/expired outcome and
directs the patient to book again. It renders no date or time at all, so no other value is presented in a timezone
the pre-session root cannot know. Currency/amount formatting is locale-dependent, not timezone-dependent. The
amount should nevertheless be removed or normalized to satisfy item 1's response-equivalence requirement.

## NOT CHECKED

- Candidate behavior through a real network request to the running DEV Next.js process: port 5200 runs a different
  worktree/commit and returns `404` for this route; a second candidate server is forbidden by repository rules.
- Actual YooKassa acceptance or rejection after `expires_at`: no external payment was created, and PROD was not
  read or touched. Only the exact outbound DEV adapter payload and service propagation were verified.
- Pixel-level/browser rendering of the standalone failure page; its returned HTML and semantic content were
  inspected instead.
- Statistical timing resistance over a real HTTP stack. Handler samples and `EXPLAIN` establish non-constant work,
  but the deterministic response-body leak already fails the required equivalence.
