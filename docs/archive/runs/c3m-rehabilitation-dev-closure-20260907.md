# C3M-08 named-DEV closure (#1098)

Date: 2026-09-07

The independent audit had already accepted the behavior/static surface and found one reachable runtime blocker:
the patient application principal could not read the organization workspace composition. Product correction
`2b2f7bb42` extended the existing attested patient settings accessor; the accepted slice landed as `f87c2b8d1`.

After the external declaration dependency landed, the canonical named-DEV route completed:

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

Result: PASS; the owner-ordered migration ledger was current and declaration reconcile/catalog audit completed
without an error.

The exact patient application-principal oracle from the independent audit then passed:

```bash
set -a; . apps/webapp/.env.dev; set +a
USE_REAL_DATABASE=1 RUN_PATIENT_WORKSPACE_MODULES_DB=1 \
  pnpm --dir apps/webapp exec vitest run \
  src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts
```

Result: `1 file / 1 test` PASS.

Live DEV verification used the published owner doctor/patient accounts and the normal email/password route. The
doctor's current composition was read, only `rehabilitation` was changed, and the complete original composition
was restored in a `finally` cleanup path.

- OFF, desktop user agent: `/app/patient` → `200`; `/app/patient/treatment` → `404`; treatment link absent.
- OFF, mobile user agent: `/app/patient` → `200`; `/app/patient/treatment` → `404`; treatment link absent.
- ON restoration, mobile user agent: `/app/patient` → `200`; `/app/patient/treatment` → `200`; treatment link present.
- The earlier `permission denied for table system_settings` failure was absent in all three responses.
- Original `rehabilitation=true` was restored, and the isolated DEV server was stopped.

This closes only the previously required post-landing named-DEV gate. No product code or persistent test was added
in this closure pass.
