# Brief — `F2` + `F2b`: OAuth and passkey become values in the login-mechanics matrix

Repo canon: read `AGENTS.md` first (`grep -n "^## \|^### " AGENTS.md`, then your sections).
Plan file (owner's, the only source of "todo" and "done"):
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.

Источник оракула: `IMPLEMENTATION_PLAN.md`, пункты `F2` и `F2b`, дословно — «Выключить OAuth-вход на staff/admin surface значением в матрице механик. Ничего не удалять: UI, start/callback и provider config остаются в коде, но при выключенной механике путь недоступен на уровне резолвера, а не только скрыт в UI. Включение настройкой возвращает его в строй без правки кода.» и «Passkey НЕ удалять. Подключить его к матрице механик как переключаемую опцию, по умолчанию выключенную у докторов. Код и маршруты сохраняются; выключённая механика недоступна на входе, но включается настройкой без правки кода. PIN заново не вводить (вырезан 04.08.2026).» Полностью:

> `F2` Выключить OAuth-вход на staff/admin surface значением в матрице механик. Ничего не удалять: UI,
> start/callback и provider config остаются в коде, но при выключенной механике путь недоступен на уровне
> резолвера, а не только скрыт в UI. Включение настройкой возвращает его в строй без правки кода.
>
> `F2b` Passkey НЕ удалять. Подключить его к матрице механик как переключаемую опцию, по умолчанию
> выключенную у докторов. Код и маршруты сохраняются; выключённая механика недоступна на входе, но включается
> настройкой без правки кода. PIN заново не вводить (вырезан 04.08.2026).

## Ground truth already in the tree — do not rebuild it

- `F1` and `F4` are CLOSED and audited: the per-surface auth policy resolver and the split of login settings
  by surface already exist. Read `AUDIT2_NIGHT_F1_2026-08-23.md` and `AUDIT2_NIGHT_F4_2026-08-23.md` in
  `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` before writing a line.
- The single channel/mechanic chokepoint is `apps/webapp/src/modules/auth/authDeliveryGate.ts`. Extend it —
  do NOT create a second resolver, a second getter, or a parallel settings store.
- `passkey` is today a global independent method (`isIndependentAuthMethodEnabled('passkey')` →
  `auth_passkey_enabled`). Move it under the surface matrix without deleting the flag path.

## Scope (nothing else)

1. `F2`: OAuth on staff/`platform_admin` surfaces refuses at the RESOLVER, not by hiding UI. The start and
   callback routes must answer with a refusal when the mechanic is off for that surface. Turning it on in
   settings restores it with no code change.
2. `F2b`: passkey becomes a matrix mechanic, default OFF for doctors, code and routes untouched.
3. Tests that fail if the gate is removed (fault injection is the proof, not green tests).

## Hard prohibitions (owner decisions, not engineering forks)

- Do NOT touch `app.read_integrator_clinic_delivery_credential` or the migrations
  `20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql` /
  `20260823T043206_deliver_c4_mail_profile_tenant_binding.sql`. Never allow both roles in one list.
- Do NOT merge into `feat/doctor-ui-rebuild`.
- Migrations must never contain `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY`.
- A finding of yours that has no matching line in the owner's plan is a QUESTION, never new work.

## Deadline

Уложись в 25 минут: агенты на этом боксе принудительно обрываются примерно на 30-й минуте. Commit your work
in the worktree BEFORE you run out — an uncommitted tree is the only thing that actually gets lost.
Commit only files you changed, by name. `git add -A` is forbidden.

## Output

Commit in this worktree; final message = what you changed, which fault injections you ran and which of them
went red, and what you did NOT do.
