# Deploy the night's batch to TEST and check it by hand

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §9, §24. Language: internal work is English.

Authority: this brief (bounded deploy + live verification, `ORCH_OPS`). Everything below is already landed on
`feat/doctor-ui-rebuild` and accepted in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

Источник оракула: `AGENTS.md` — «Полный `pnpm run ci` — только перед deploy/merge/repo-level изменением; между
коммитами — step/phase». Полный CI на этом коде зелёный (`exit 0`, прогон фиксера `bdcaae0f9`); коммиты лида
поверх — только документные.

## What is going out

Landed tonight and not yet on TEST: the trial/discount model (`0346`), the settings-keys seed (`0347`), the paid
tariff apply accessor (`0348`), the reconciles (`0349`, `0355`), the trial-ending grant (`0350`), FORCE RLS on
`platform_users` (`0353`), the mailing templates column (`0358`), plus VK ID login, the identity port, the
notification conditions, the Т1 exception list and the Т3 mailings tab.

## Work

1. `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` — must end with **all closure gates green**, not just
   "units healthy". Record the log path and the exit code.
2. If a gate goes red, read its own output and fix the narrow cause the way tonight's fixes did — a missing
   registration in the exact privilege inventory, a stale count, a ledger hash. Do **not** disable a gate, do not
   widen a role.
3. **Then check by hand, under real sessions**, and report a status code for each:
   - `/app/admin/commercial` — the four tabs plus the new «Рассылки» tab; the mechanic list shows exceptions only,
     not 23 editors; the trial tab states that an active trial rule overrides the starting tariff;
   - `/app/account?tab=notifications` and `/app/admin/app-settings` — both still `200` after the RLS change;
   - a patient session still sees only their own data (the RLS wall did not break the cabinet);
   - the login screen: the code screen after entering a phone, and the VK button among the providers.
4. Anything that renders wrong or 500s: capture the digest and the log line, fix or report precisely.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST only.
- No product code change beyond a narrow gate fix; if a real defect appears, describe it and stop.
- No push.

## Done means

- TEST deployed with all gates green, log path recorded.
- Every surface above checked live with its status code in the report.
- One commit with the evidence on your branch.
