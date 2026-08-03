# Trial and grace-discount — the data model and the access computation

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции» (temporary number in the clone, final one at merge),
§4a, §5, §6, §10/§10a/§10b, §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, section «Триал и льготный период —
решение владельца 03.08» (items **Т5–Т8**). Task `#1069`. Every rule below is the owner's, quoted there.

Источник оракула: тот же раздел плана — «не важно, мы назначили или человек выбрал — первый раз человек получает
триал. Все последующие — сразу оплата», и «закончился триал, применяется правило из блока "После триала", при
этом независимо от того что это — блокировка, только чтение или минимальный тариф который я назначил — у человека
есть например 3 дня на оплату со скидкой».

**This slice is the data model and the access computation only.** The admin UI and the notification triggers are
separate slices — do not build them here, but do not make them impossible either.

## What exists today (measured — do not re-derive)

- `saas_trial_policy`: `duration_days`, `grace_days`, `post_trial_behavior ∈ ('read_only','blocked','tariff')`,
  `post_trial_tariff_id`, and a `tariff_id` — the trial is bound to one specific tariff.
- `saas_organization_trials` mirrors it per organization with `started_at`, `ends_at`, `grace_ends_at`.
- `grace` today means **the trial keeps running**: in `0305_tariff_snapshot_access_doors_local.sql`, while
  `v_now <= trial.grace_ends_at` the organization still receives `trial.tariff_id` — full trial access — and only
  after that does `post_trial_behavior` apply.
- Provisioning (`deploy/postgres/c5a-platform-operations-runtime.sql`): an active trial policy wins over the
  registration-tariff setting; if there is no trial and no registration tariff, the organization gets no tariff and
  the person chooses.

## What the owner ruled

1. **The trial extension is removed.** Verbatim: «продление самого триала — бессмыслица». When the trial ends the
   post-trial rule applies **immediately**.
2. **The grace period is a discount window, orthogonal to access.** It runs in parallel with whatever the
   post-trial rule did — blocked, read-only or another tariff — and only affects the price the person can pay.
3. **The trial is a one-time period on the organization's first tariff, whatever it is** — assigned by us or
   chosen by the person. Every later tariff is paid immediately. So the trial stops being «a tariff».
4. **Giving the choice of tariff is a separate setting** from the trial duration.
5. **The discounted price is set per tariff, explicitly.** No global percent fallback — the owner closed that:
   «тарифов всё-таки 3-4, а не десятки». A tariff without a discounted price simply gives no discount.

## Work

- Model the four things above. Where a new column or table is genuinely needed, add it; where an existing one can
  carry the meaning **without changing what it already means**, reuse it. ⛔ `grace_days` / `grace_ends_at` must
  **not** be repurposed — the new concept has a different meaning and a different moment; remove the old behavior
  explicitly and introduce the discount window as its own thing.
- Remove the trial-extension branch from the access computation, so the post-trial rule applies at `ends_at`.
- **Before removing it, check the live DEV data**: report whether any organization currently sits inside an open
  `grace_ends_at` and would lose access the moment this lands. If any does, say so and stop — that is an owner
  decision, not yours.
- Make «first tariff gets the trial, later ones do not» a property of the organization, not of the tariff, and make
  it hold whether the tariff was auto-assigned or chosen.
- Keep the provisioning order intact otherwise (active trial wins over the registration tariff).

## Boundaries

- No admin UI in this slice, no notification triggers, no changes to payment or proration.
- Migration: take a **temporary** number in your clone and mark it `-- TEMPORARY LOCAL MIGRATION NUMBER NNNN`; the
  final number is assigned by whoever lands the branch. Do not reserve a number on the board — that rule was
  replaced on 2026-08-03.
- **PROD (`135.106.162.170`) is untouchable.** No deploy; DEV apply is the lead's step after land.
- No push, no merge into `feat`.

## Done means

- Behavioral tests over the access computation: trial end applies the post-trial rule immediately for all three
  behaviors; the discount window is live in parallel and does not change access; a second tariff gets no trial;
  a tariff without a discounted price gives no discount.
- The live DEV check on open `grace_ends_at` is reported before the removal.
- Typecheck, scoped ESLint, `git diff --check` clean; journal sync and migrator self-test pass.
- One commit on your branch. The report states what carries «first tariff only» and why that place is right.
