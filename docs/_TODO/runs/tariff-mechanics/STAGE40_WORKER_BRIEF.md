# MISSION: step 4.0 — one serialized pass over the shared registry files

This is the narrow step that unblocks parallel work: stages 4 and 5 both need new rows in the same two files, and if
they run in parallel they collide. You add **all** the new keys and all the protected-action rows in one pass. You do
**not** implement any mechanic's behaviour — that is the parallel work that follows you.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — item **4.0** only, plus scope §1 and
  verification policy §2. The mechanics you register come from stage 4 (4.4, 4.5) and stage 5 (5.1–5.9).
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §3 (classes), §4 (the full layout —
  this is your list), §8 (the three owner mechanics are disabled for everyone by default and enabled for him through
  the existing organization exception).

## What to add

**Class `запас` (number, no period):** число пациентов · число филиалов.

**Class `возможность` (toggle):** внешний календарь · дневники пациента · клинические тесты и наборы · онлайн-анкета ·
статистика кабинета (this single mechanic covers booking-source/UTM analytics too — do not create a second key) ·
проактивные подсказки · задачи специалиста · предоплата при записи.

**Class `возможность`, disabled by default for everyone (canon §8):** «Сегодня» (the administrator's block for
configuring the patient page) · разминки · промо. Use the same mechanism already applied to seats, courses and the
exercise catalog — `MECHANIC_DEFAULT_ENABLED` false, no data migration, no new tables, no new screens.

**Do NOT add:** поддержка (its ticket system does not exist yet — plan item 5.5 says it is registered when that system
is built), объём видео / участники курсов (future), карточка пациента и приложение пациента as controllable mechanics
(class `никогда`, already handled), шаблоны программ лечения, шаблоны комплексов ЛФК, переписка с пациентом, правила
отмены записи (they get no mechanic at all).

Also add the rows these mechanics need in `app-layer/entitlements/protectedActionRegistry.ts` for the write paths that
stages 4 and 5 will guard. Where you are not certain which handler a mechanic will guard, add the row you are certain
about and list the uncertain ones in your report instead of guessing.

## Hard constraints

- **Registration only.** No guard calls in domain routes, no UI, no migrations, no behaviour changes. A reviewer must be
  able to say «this commit only declares mechanics and their protected actions».
- New keys are JSONB-stored, so **no schema migration is needed** — do not create one.
- The two `запас` mechanics must inherit the fail-closed model that already exists for `объём`: a missing configured
  limit must never resolve to unlimited. If the existing code gives that for free, say which line proves it; if it does
  not, stop and report — do not invent a number.
- Russian labels are mandatory for every new key (the type makes a missing label a compile error). Use the wording from
  canon §4 and §7 — no machine keys on screen.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, the entitlements tests. **No full CI.**
- Never `git add -A`. Commit in this clone; no push, no merge. Do not touch migration `0275`.

## Acceptance

- Every new key exists with the correct class and a Russian label; the three owner mechanics resolve to disabled for a
  normal organization and enabled when the existing organization exception grants them. A test covers the default-off
  behaviour and would go red if the default flipped.
- `запас` keys resolve fail-closed with no configured limit — covered by a test.
- Typecheck and lint green; entitlements tests green.

## Report

`what you added (file:line) → class per key → what the tests now prove → which protected-action rows you could not
determine and why`. No softening of anything left open.
