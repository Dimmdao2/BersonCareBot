# MUST FIX — #915 native tap route correction confirmation

Candidate product SHA: `fedf4c58e` (`88e9240df..fedf4c58e`).  The inspected product diff contains
exactly one file: `apps/integrator/src/integrations/web-push/deliveryAdapter.ts`.

## Verdict

**MUST FIX.** The new encoded-separator rejection is effective, but the closed route grammar still
accepts the raw traversal path `/app/patient/../patient`. `new URL()` normalizes that value to the
allowlisted `/app/patient`, so the adapter looks up the Therapy Go target and performs one RuStore
provider request with the original traversal-shaped route. A native recipient can therefore receive
a route that is not itself a canonical cabinet route, contrary to M6-09: “Tap ведёт внутрь правильной
поверхности приложения; внешние и обманные маршруты отклоняются.”

No product code is changed by this confirmation.

## Retained and extended public contract

`apps/integrator/src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts` observes
the native provider boundary, never `resolveNativeSurface()` or source text.

- The retained `/app/patient/%2F..%2Fadmin` case is green: no provider call and typed
  `skipped/no_active_target`.
- New green cases reject encoded dot traversal, raw backslash traversal, and a protocol-relative
  URL even when it supplies an otherwise valid `pushSurface: 'therapygo'`.
- New canonical patient and staff cases observe exactly one provider payload for their matching
  target (`therapygo` and `therapysto`, respectively).
- New red case: raw `/app/patient/../patient` invokes the provider once, rather than producing
  `skipped/no_active_target`.

## Fault injection

Temporary product mutation: moved the new route-grammar validation below explicit `pushSurface`
resolution in `apps/integrator/src/integrations/web-push/deliveryAdapter.ts`.

Command:

```bash
pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts -t 'protocol-relative URL with an otherwise valid explicit surface'
```

Result: **RED**, one selected test failed (11 skipped): the explicit `therapygo` surface caused one
provider request for `//therapygo.example.test/app/patient`. The mutation was reverted immediately;
`git diff -- apps/integrator/src/integrations/web-push/deliveryAdapter.ts` is empty.

## Validation

- `git diff --find-renames --find-copies 88e9240df..fedf4c58e -- apps/integrator/src/integrations/web-push/deliveryAdapter.ts` — inspected the exact one-file product fix.
- `pnpm --dir apps/integrator build` — PASS.
- `pnpm --dir apps/integrator typecheck` — PASS.
- `pnpm --dir apps/integrator exec eslint src/integrations/web-push/deliveryAdapter.ts src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts` — PASS.
- `pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts` — MUST FIX evidence: 12 tests, 11 passed and 1 failed only for raw traversal normalization.
- `git diff --check` — PASS.

The only persistent changes are this report and the acceptance-contract additions. Android/web runtime,
delivery architecture, migrations, settings, media, data, services and PROD were not touched.
