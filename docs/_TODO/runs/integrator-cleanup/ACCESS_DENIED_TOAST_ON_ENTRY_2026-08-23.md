# Access-denied toast on role-login entry — 2026-08-23

## Result

An already signed-in person who opens any other role's login door is still redirected to
their own hub, but without `app_access_denied=1` and therefore without the access-denied
toast. A direct attempt to open another role's content route still receives the existing
flag and toast.

`AppEntryRsc` now calls the existing `getPostAuthRedirectTarget` policy with
`showAccessDeniedToast: false`. The policy's default stays `true`, so no new query flag,
toast, or redirect mechanism was introduced.

## Inventory of flag producers

Source query:

```bash
rg -n --glob '!docs/**' --glob '!**/*.snap' 'buildOwnHubUrlWithAccessDeniedToast|app_access_denied' apps/webapp
```

| Location | Case | Result |
| --- | --- | --- |
| `shared/lib/appAccessDeniedToast.ts` | Shared existing flag/toast implementation | Unchanged. |
| `app-layer/guards/requireRole.ts` | (b) Role guards for patient, staff-account/install, and organization-workspace content | Keeps the flag. |
| `proxy.ts` | (b) Authenticated request to a foreign content path; it explicitly excludes role-login paths | Keeps the flag. |
| `app/app/patient/layout.tsx` | (b) Patient content subtree reached by a non-patient | Keeps the flag. |
| `modules/auth/redirectPolicy.ts` | (b) Default post-auth rejection for a foreign portal/deep link | Keeps the flag by default. |
| `app/app/AppEntryRsc.tsx` | (a) Already signed-in person opening a role-login page | Changed: same hub redirect, `showAccessDeniedToast: false`. |

No additional runtime producers were found; the remaining search matches are tests and
the toast consumer.

## Behaviour evidence

```bash
pnpm --dir apps/webapp exec vitest run --project unit src/app/app/AppEntryRsc.unit.test.ts src/modules/auth/redirectPolicy.unit.test.ts
pnpm --dir apps/webapp exec vitest run --project route src/proxy.route.test.ts
```

Passed: 5 unit tests and 13 proxy-route tests. The `AppEntryRsc` test covers an already
signed-in doctor at both the patient and admin login doors: the actual redirect target is
`/app/doctor` with no toast flag. The proxy-route test covers a doctor opening
`/app/patient/profile`: target remains `/app/doctor?app_access_denied=1`.

Fault injection: temporarily changed the `showAccessDeniedToast: false` branch back to
`/app/doctor?app_access_denied=1`. The `AppEntryRsc` command failed exactly the patient
and admin login-door assertions (2 failed of 2), then the intended code was restored.

Additional validation:

```bash
pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

Both passed. Lint emitted two pre-existing warnings in
`src/app/app/doctor/calendar/AppointmentPaymentSection.tsx`; this change does not touch
that file.

`pnpm run ci`, deployment, TEST, and push were not run, per scope.
