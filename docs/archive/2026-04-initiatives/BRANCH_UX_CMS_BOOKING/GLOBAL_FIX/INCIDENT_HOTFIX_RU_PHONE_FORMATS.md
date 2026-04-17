# INCIDENT HOTFIX: RU phone formats

- Date: 2026-04-03
- Status: done
- Agent/model: Cursor agent

## Problem

При вводе номера в формате `+7 ...` и других типовых форматах РФ часть сценариев могла давать ошибку валидации как "неверный формат".

## Fix

- Unified normalization contract for RU phones in webapp and integrator:
  - accepts `+7`, `7`, `8`, `00 7` prefixes
  - accepts any local 10-digit RU number and converts to `+7XXXXXXXXXX`
  - keeps canonical format `+7XXXXXXXXXX` for auth/storage lookup
- Removed local duplicate normalizer in in-memory auth repo to avoid drift from main logic.

## Files changed

- `apps/webapp/src/modules/auth/phoneNormalize.ts`
- `apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts`
- `apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts`
- `apps/webapp/src/infra/repos/inMemoryUserByPhone.ts`
- `apps/webapp/src/modules/auth/phoneNormalize.test.ts`
- `apps/webapp/src/shared/phone/normalizeRuPhoneE164.test.ts`
- `apps/integrator/src/infra/phone/normalizeRuPhoneE164.test.ts`

## Verification

- `pnpm --dir apps/webapp test src/modules/auth/phoneNormalize.test.ts src/shared/phone/normalizeRuPhoneE164.test.ts`
- `pnpm --dir apps/integrator test src/infra/phone/normalizeRuPhoneE164.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci` (green)
