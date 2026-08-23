# Brief — `C3`: branded patient Telegram/MAX intents go only through the clinic bot

Repo canon: read `AGENTS.md` first (`grep -n "^## \|^### " AGENTS.md`, then your sections).
Plan file (owner's, the only source of "todo" and "done"):
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.

Источник оракула: `IMPLEMENTATION_PLAN.md`, пункт `C3`, дословно:

> `C3` Провести все branded patient Telegram/MAX confirmation/recovery/security/notification intents через
> существующий dispatch port как `clinic_required`; удалить любой достижимый platform fallback для них.

Supporting owner decision, `IMPLEMENTATION_PLAN.md` §1.5 and `TPB-12`:

> `TPB-12` Branded Telegram/MAX confirmations, codes и notifications идут только через clinic bot; SMS не
> используется.

## Scope (nothing else)

1. Census first, code second: list EVERY intent that today can reach a platform bot for a branded patient
   surface. Name file and line for each. An empty result must be proven by naming where you looked.
2. Route them through the EXISTING dispatch port as `clinic_required`. One chokepoint — do not add a second
   resolver or a parallel sender. If two call sites do the same thing, ask in your report whether they should
   collapse into one function with a parameter; do not silently duplicate.
3. Remove the reachable platform fallback for those intents. "Reachable" means: prove it with a test that goes
   red when the fallback comes back, not by reading the code.
4. Unbranded/standard patient surface behaviour must not change. Staff and admin delivery must not change.

## Facts about this box you must respect

- TEST/PROD `system_settings` carries the REAL production `telegram_bot_token`. Never set
  `telegram_mode=long_polling` anywhere — it would steal live updates from the production bot.
- Do not send anything to real recipients. Delivery on DEV is redirected by the send-safety seam; keep it that way.

## Hard prohibitions (owner decisions, not engineering forks)

- Do NOT touch `app.read_integrator_clinic_delivery_credential` or the migrations
  `20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql` /
  `20260823T043206_deliver_c4_mail_profile_tenant_binding.sql`. Never allow both roles in one list.
- Do NOT touch `apps/webapp/src/modules/auth/authDeliveryGate.ts` — another worker owns it right now.
- Do NOT merge into `feat/doctor-ui-rebuild`.
- Migrations must never contain `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY`.
- A finding of yours that has no matching line in the owner's plan is a QUESTION, never new work.

## Deadline

Уложись в 25 минут: агенты на этом боксе принудительно обрываются примерно на 30-й минуте. Commit in the
worktree BEFORE you run out. Commit only files you changed, by name. `git add -A` is forbidden.

## Output

Commit in this worktree; final message = the census table (intent → file:line → before/after), which fault
injections you ran and which went red, and what you did NOT do.
