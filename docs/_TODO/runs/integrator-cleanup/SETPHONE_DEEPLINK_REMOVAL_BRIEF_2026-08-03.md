# Remove the `setphone_` start-link path

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §24.
Language: internal work is English.

Authority: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §1 and the fork-8 entry at the end of
that document (closed by the owner on 2026-08-03).

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md`, развилка 8 — «Если номер приходит через "start?phone=" то это не
подтверждённый номер, этот запрос надо удалить. Он был нужен для прошлой системы записи на приём которую вырезали
из кода.»

## What to remove

The phone-carrying `/start` deep-link payload — measured entry points:

- `apps/integrator/src/integrations/common/messengerStartParse.ts` — `normalizePhoneFromSetphoneStartPayload` and
  the `setphone_` branch of `parseMessengerStartCommand`, plus the `phone` field of `MessengerStartParseResult`
  if nothing else fills it;
- its callers: `apps/integrator/src/integrations/telegram/webhook.ts` and
  `apps/integrator/src/integrations/max/mapIn.ts`;
- anything downstream that consumed that phone — follow the value, do not guess. If it fed phone trust anywhere,
  that write goes too.
- keep the related constants/config honest: `messengerStartConstants.ts`, `excludeActions` in `scripts.json` and
  the dedup in `incomingEventPipeline` are documented as needing to stay in sync — update them consistently.

## Explicitly NOT required

The owner ruled out the usual consequence trace: «он не должен был ставить доверенность, а если ставил то зря. И
никто больше ничего не получит раз не будет им пользоваться». So do **not** research what a person who arrived via
such a link loses. If that path was setting phone trust, that was the defect, not a feature.

## What must keep working — the only real risk

Removing one branch must not break the parsing of the other `/start` actions. Prove that the remaining actions
(link secret, auth secret, plain start, the special actions listed in `MESSENGER_START_SPECIAL_ACTIONS`) still parse
exactly as before, for both Telegram and MAX.

## Boundaries

- Integrator only; no webapp change unless a call site there provably breaks.
- No DB migration, no data cleanup of already-stored values in this slice.
- No push, no merge into `feat`.

## Done means

- The `setphone_` path is gone, and any phone-trust write it fed is gone with it.
- Behavioral tests show the remaining `/start` actions parse unchanged for Telegram and MAX; a test that pinned the
  removed behavior is deleted rather than weakened, and you say so in the report.
- `pnpm --dir apps/integrator typecheck` (or the repo's integrator typecheck script), scoped ESLint and
  `git diff --check` clean; the touched integrator test files pass.
- One commit on your branch. Report: what was removed, what consumed it, and the exact commands with counts.
