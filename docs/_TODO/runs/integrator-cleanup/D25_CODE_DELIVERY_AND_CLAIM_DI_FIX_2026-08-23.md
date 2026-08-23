# D25 — code delivery and claim DI fix

Product SHA: `8349e222c853e907085eb70b0df7404ebe0c1bcf`.

## Fixed blockers

- `apps/integrator/src/kernel/domain/executor/executeAction.ts` extends the existing
  `buildPhoneMessengerBindMainMenuIntents` parameter with `vars` and passes
  `{ code: result.otpCode }` for the successful non-replay login path. Telegram/MAX
  login and first-registration templates now receive their existing `{{code}}` value.
- `apps/webapp/src/app/api/integrator/phone-messenger-bind/claim/route.ts` imports and
  calls `buildAppDeps()` in `POST` before `claimPhoneMessengerBindFromIntegrator`.
  This mirrors the sibling complete route's composition-root initialization before its
  domain operation: claim line 17 precedes claim line 38; complete invokes
  `buildAppDeps().phoneMessengerBind.completeFromIntegrator(...)` at line 46.

## Evidence

Red before, unchanged audit oracle:

```bash
pnpm --dir apps/integrator test -- src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts
```

Result: 3 of 5 cases failed: Telegram login, MAX login, and Telegram first-time
registration rendered the template without `482913`.

Green after:

```bash
pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts
```

Result: 1 file, 5 tests passed.

Additional targeted checks:

```bash
pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts src/kernel/domain/executor/executeActionHomeMiniAppRemoval.unit.test.ts
pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts
pnpm --dir apps/integrator typecheck
pnpm --dir apps/webapp typecheck
pnpm --dir apps/integrator exec eslint src/kernel/domain/executor/executeAction.ts
pnpm --dir apps/webapp exec eslint src/app/api/integrator/phone-messenger-bind/claim/route.ts
git diff --check
```

Results: 9 integrator tests passed; 14 webapp tests passed; both typechecks,
both scoped ESLint commands, and `git diff --check` passed. The webapp Vitest run
printed its existing Vite `__dirname` config-loader warning but passed.

Changed product files are exactly the two named above. No Therapysto or branding files changed.

## Out of scope

- No OTP replay/re-delivery after an attempt reaches `otp_ready`.
- No speculative concurrent-claim `unique_violation` handling.
- No schema, migration, privileges, content, generic contact/account flow, broadcasts, relay,
  Therapysto, or branding changes.
