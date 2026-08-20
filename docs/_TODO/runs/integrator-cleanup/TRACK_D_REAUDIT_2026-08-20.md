# Track D — re-audit against later decisions (2026-08-20)

Triggered by the owner (20.08): suspicion that Track D (`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`,
dated 22.07) had gone stale/self-contradictory relative to later decisions, specifically citing (1) a wrongly-framed
question about wiring an RLS test into CI via a disposable database, and (2) integrator resolving identity by phone.
Two independent read-only research passes plus direct verification by the lead. Corrections have been applied
in-place in `WORK_ORDER.md` (search `УСТАРЕЛО 20.08` / `⚠️`); this document is the evidence trail behind them.

## 0. Root cause

`WORK_ORDER.md` never references `docs/OWNER_DECISIONS.md` or `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/` anywhere
(`grep -c` = 0 for both). That workstream is explicitly the higher authority for exactly the DB-privilege/RLS
subject matter Track D's rules 5.1.4/5.1.5 and D15b/D17 touch, and it has kept moving (edited through 20.08) while
Track D's text on the same topics froze at 22.07–09.08 wording. A standing pointer was added to WORK_ORDER.md §2.2
so this doesn't silently drift again.

## 1. D20/CI question — resolved, no plan defect

The lead's own earlier question ("wire the RLS regression test into CI, needs a disposable Postgres?") was based on
a false premise. Verified directly: `deploy/postgres/privileges/*.devDbProof.test.mjs` (14+ files) and
`apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts` already follow the
established repo convention — opt-in via explicit env var, `describe.skipIf` when unset, skipped by default in CI,
running only against the named persistent `bcb_webapp_dev`/`bersoncarebot_test` inside a rolled-back transaction,
never a disposable database. Nothing needed wiring; the D20 test already complies. Separately, `AGENTS.md` §10b and
its Dev-DB opt-in note still described the pre-owner-go freeze on this mechanism as active — fixed in `eb41cb25e`
(canon correction, independent of Track D).

## 2. Integrator identity-by-phone — verified TRUE in current code

`apps/integrator/src/content/telegram/user/scripts.json:546-561` (`telegram.contact.link.confirm`) →
`apps/integrator/src/infra/db/writePort.ts:295-374` (`user.phone.link`) →
`packages/platform-merge/src/messengerPhonePublicBind.ts`: on an incoming contact-share, integrator itself looks up
whether another `platform_users` row already has the same phone (`findOtherPlatformUserWithSamePhone`), and if so
unconditionally merges the two accounts (`mergePairIfDistinct` → `pickMergeTargetId`, a pure heuristic: booking
count → phone presence → `created_at` → `integrator_user_id` → UUID tiebreak, no manual/support gate) and sets
`patient_phone_trust_at = now()` — a real, autonomous identity decision inside integrator's own transaction, not a
relay of a webapp decision.

This is real but not an undiscovered gap: `WORK_ORDER.md` D25/D26 and `IDENTITY_AND_MERGE_SCHEME.md` §2b/§2d name
exactly this function and leave it open. The owner explicitly deferred D26 on 04.08 ("не надо делать сейчас,
остальное напрямую влияет на работу системы") — a real, valid decision at the time, with a stated reason: finish
what's operationally load-bearing first (D25, D27–D30). The code being unfixed as of 04.08 was a known deferral, not
an oversight.

**Two things the lead is responsible for, not the document:** (1) `WORK_ORDER.md`'s quoted merge-conflict rule
("auto-merge only for an account with NO history") is the OLD wording — the owner refined it further today
(`IDENTITY_AND_MERGE_SCHEME.md` §5.2b, commit `e2b43625f`, 15:17 20.08): block only when qualifying medical data
exists on BOTH sides simultaneously. The lead had not gone back and updated the D26 bullet after that refinement —
fixed in-place now, but this was the lead's omission, not the plan document failing to "catch up" on its own.
(2) The 04.08 deferral's own stated reason ("finish what affects live operation first") is, as of 20.08, largely
satisfied: D27/D28/D29 are closed, D25 is down to one owed live two-webhook verification, D30 is blocked by an
external data-drain timer (~29.08), not by unfinished priority work. A "не сейчас" from 04.08 is not evergreen —
its expiry condition has been met, and D26 is flagged in §2.3/checklist as ripe for the owner to actually schedule
now, not still deferred by default.

## 3. Five findings from the systematic sweep (DB-privilege/RLS assumptions vs. current authority)

All verified independently by the lead (declaration.ts read directly, OWNER_DECISIONS.md quotes grepped and
read in context) before being applied — not accepted from the agent report at face value.

1. **Rule 5.1.5 ("no role grants to integrator, fail-open in code") — stale.** `deploy/postgres/privileges/declaration.ts`
   already declares `bcb_dev_integrator`/`bcb_test_integrator` as a distinct login,
   `canonicalRole: 'app_integrator_request'`, explicit membership in six roles, passing deploy asserts today. The
   rule described the pre-generator ad hoc GRANT attempt. Fixed in-place (§2.2 rule 5.1.5).
2. **"Fail-open in code" contradicts the later loud-failure acceptance criterion.** `docs/OWNER_DECISIONS.md`:
   "любой запрос к базе данных без контекста и точного совпадения разрешений выдаёт 0 строк и пишет ошибку в
   журнал" — silent degrade is explicitly the anti-pattern the owner's criterion rules out. D1's fail-open reads
   (`max/webhook.ts`, `handleIncomingEvent.ts`) are flagged as a reconciliation debt, not a closed correct answer.
   Folded into the same 5.1.5 correction.
3. **D15b/4's migration hand-writes `CREATE POLICY`/`CREATE ROLE`.** Forbidden since 12.08
   (`docs/OWNER_DECISIONS.md`: "в новой миграции GRANT/REVOKE/CREATE POLICY/CREATE ROLE запрещены"; same rule
   verbatim in `AGENTS.md` "⛔ Миграция не выдаёт и не отзывает права. Никогда"). D15b/4 itself predates the rule
   and is not rewritten retroactively, but it was being used as an implicit precedent for D15b/6, D15b/7, D17.
   Fixed in-place: those must go through `declaration.ts`/`relation-access.ts` + generator only.
4. **D17's stated fact ("today integrator has the same role as webapp") is currently false.** Per the same
   `declaration.ts` entries as finding 1, integrator already has its own distinct login/canonical role, separate
   from `bcb_dev_webapp_staff`/etc. D17's real remaining gate is "confirm no canon writers remain before the
   declaration narrows further" — the role-creation mechanism itself is owned and already substantially built by
   `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`. Fixed in-place.
5. **`apps/webapp/ARCHITECTURE.md:50`** still says "same DATABASE_URL and DB role for both services" (dated 30.07,
   before the 08–09.08 decisions establishing four separate runtime logins,
   `docs/OWNER_DECISIONS.md`: "Портов два, runtime-логинов четыре… integrator — своим пулом/сертификатом"). Not
   harmful to Track D's own text (D17 already assumed separation), but it is exactly the kind of drift D19's own
   "сверить целевую схему" step exists to catch — added an explicit pointer to D19 so it isn't missed when D19 runs.

Rule 5.1.4 (direct `public.*` writes under an explicit org principal, underlying D5/D40) was checked against
`relation-access.ts`/`declaration.ts` — still the currently-declared, sanctioned pattern. **No finding — current.**

## NOT DONE

- No code changed. No migration, no privilege-declaration edit, no product fix.
- D26's underlying code (`messengerPhonePublicBind.ts`) was NOT touched — still owner-deferred per 04.08, only the
  plan's quoted rule text was corrected to match the owner's 20.08 refinement.
- This pass did not re-verify D21–D24 (closed) or the full D15b/1-6 sub-chain beyond what's cited above.
