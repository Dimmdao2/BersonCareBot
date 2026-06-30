# Code Audit 1 — QW-E10/batch2
agentId: audit1-qw-e10-batch2
Commit: 4e1c24fc8b7502c10ac6dd849079b4f0f98f7616
Date: 2026-06-19

## Clause A1 — All 15 components use apiJson — PASS

Zero raw `await fetch(` calls found in any of the 15 files.
Verified via `grep -rn "await fetch("` across all 15 targets — no matches.

All files confirmed using `apiJson` from `@/shared/lib/apiJson` (or via `bookingSoloAdminApi`
for BookingEngineCatalogLists / BookingSoloFormFieldsSection / BookingSoloScheduleSection).

## Clause A2 — No apiJson duplication — PASS

No local `function apiJson` / `const apiJson` definitions found in any of the 15 files.
`grep -n "function apiJson\|const apiJson\|async function apiJson"` — zero matches.

Both local duplicates noted in commit 40c85726 message (BookingEngineSection had a full copy;
BookingEngineCatalogLists had a simplified copy) have been removed in favor of the shared import.

## Clause A3 — Error surfaces via setError — PASS

Spot-checked 5 complex files (RubitimeSection, BookingEngineSection, GoogleCalendarSection,
BookingEngineCatalogLists, SystemHealthSection) plus full catch-block survey across all 15.

All user-triggered catch blocks surface errors via a state setter:
- `setError`, `setLoadError`, `setActionError`, `setStartError`, `setCredsError`,
  `setConnectMsg`, `setCalError`, `setCalendarSaveError`, `setClearError`, `setErr`, `onError`.

Two intentional silent-catch patterns confirmed as non-issues:
1. `clientValidateIanaTimezone` in RubitimeSection.tsx — pure `Intl.DateTimeFormat` validation
   helper, no network; `catch { return false }` is correct.
2. `patchSetting` in GoogleCalendarSection.tsx — returns `boolean`; caller immediately checks
   `if (!ok) { setCredsError("Не удалось сохранить ...") }`, error does surface to user.

## Clause A4 — TypeScript clean — PASS

`cd apps/webapp && npx tsc --noEmit 2>&1 | grep -v node_modules | grep -v integrator | grep -v "\.test\."` produced no output (exit 0).

## Overall: PASS
