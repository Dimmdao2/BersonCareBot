# Pre-production TODO — things that must happen BEFORE a prod cutover, not before a TEST change

Owner-created list (2026-07-26). The distinction this file exists to enforce: **TEST has no live users
except the owner** (see the `test-has-no-real-users-only-owner` note). Findings phrased as "users will be
affected" are almost never TEST blockers — they are entries here, executed against PROD at cutover time.

Anything added here needs: what, why it can only be done at cutover, and who/what it depends on.

---

## 0. Consolidate the owner's own account — FIRST STEP OF THE SEQUENCE, OWNER-ORDERED

**Owner, 2026-07-28:** «Смержим до конца и оставим одну каноническую запись. причем сделаем скриптом и теперь
уже не потеряем его. **Впишем в последовательность миграции в самом начале - первым шагом**» + «и чисти пустышки».

- Script: [`apps/webapp/scripts/consolidate-owner-identity.sql`](../../apps/webapp/scripts/consolidate-owner-identity.sql).
  Runbook: [`docs/OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md`](../OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md).
- Flat SQL with the ids written in, deliberately: the rows are identical on TEST and PROD (TEST is a prod dump),
  they have not changed since spring, and this runs exactly once per database. The owner rejected a
  catalog-driven generic tool for this reason — «НУЖЕН СКРИПТ БЕЗ УСЛОЖНЕНИЙ И ВЫЧИСЛЕНИЙ».
- Why it belongs at cutover: it deletes duplicate rows of the owner's own identity. Nothing created after
  spring is touched, and the live doctor row is the survivor — so it is safe to run early, and running it first
  means every later step operates on one canonical account instead of five.
- Survivor stays `role=doctor` + clinic owner. It must NOT become a global admin — standing owner constraint.
- Applied on TEST 2026-07-28 (see runbook for the measured numbers). PROD: pending cutover.
- Depends on: nothing.

## 1. ~~Notify the messenger-only users before the bot is removed~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 17.08.2026

**ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 17.08.2026:** «письмо тем у кого вход через мессенджер — бред, похоже не актуальные
задачи вообще». Основание: пункт существовал только под сценарий «бот вырезается из сборки», а решение
владельца 26.07 — «пока делаем гибко настраиваемыми через глобал админку все механизмы, ничего не вырезаем из
кода». Бот не удаляется, значит предупреждать некого. Более позднее решение заменяет более раннее; если
удаление бота вернётся в скоуп, пункт возвращается вместе с ним. Та же отмена — в
`NIGHT_PLAN_2026-07-26.md` E-3.

~~**Owner, 2026-07-26:** «11 человек живут только внутри бота — ничего, перед выкаткой на деплой мы сделаем
им рассылку. Там больше чем 11.»~~

- Telegram (and now MAX, also being cut) is the **only** identity and the **only** delivery channel for a
  set of accounts. Measured on the DEV copy of TEST: **22 platform accounts** hold a Telegram binding with
  no e-mail, no phone, no password/PIN/OAuth, no web-push, no MAX; plus **11 integrator users** that exist
  only as bot identities with no webapp account at all.
- The DEV numbers are the SHAPE, not the value. **Re-count on PROD** with the same queries before the
  campaign — the owner expects the real figure to be larger.
- The campaign must run **while the bot is still alive** — after removal there is no channel left to reach
  these people through. It collects a phone or an e-mail so the account survives the cutover.
- Depends on: nothing in TEST. It is purely a prod-cutover step.

## 2. Docker + blue/green deployment on PROD — OWNER-ORDERED, separate task

**Owner, 2026-07-26:** «На продакшене надо будет настраивать докер и блю/грин для быстрого обновления, так
что это будет отдельная задача.»

- Goal is fast, reversible releases: a new version starts alongside the old one and traffic switches only
  after it is healthy, instead of the current stop-migrate-build-restart window.
- Interacts with **A1** (host privilege): containerising the app is option 3 there, and would make the
  host runtime user largely irrelevant. Decide the two together so the work is not done twice.
- Note for the record: the `docker` group membership found on this dev box during the A1 audit is (per the
  owner) most likely there for wg-easy, not for the deploy path. On PROD, docker becomes load-bearing —
  which means the group's root-equivalence must be designed for, not inherited by accident.

## 3. PWA + push for the global admin — OWNER-ORDERED

**Owner, 2026-07-26:** «надо сделать будет отдельно pwa для глобал админа с пуш-сервисом.»

- Comes out of the D5 notification rework: once alert recipients are derived from roles rather than from a
  list of e-mails/Telegram ids, the global admin needs a surface that can actually receive them.
- The settings matrix the owner specified (which notification/error type goes to push / SMS / e-mail) is
  the app-side half; SMS is deliberately deferred — build the mechanism, wire SMS later.

## 4. Session cutover forced sign-out — ALREADY APPROVED

The owner approved a one-time global sign-out when the session-revocation work lands (staff 12 h idle /
patient 30 d idle; the absolute ceiling numbers are still an open owner question — 7 d/90 d is what the
2026-07-25 ruling records, and the implementation follows the ruling). On PROD this logs everyone out once.

## 5. Separate OS users for runtime, deploy and the database host — OWNER-ORDERED

**Owner, 2026-07-26:** «делай. Ты можешь настроить юзеров сам под правами деплоя (на сервере разработки для
этого ему права и давались)» — authorisation applies to THIS box only. Everything below must be repeated on
PROD deliberately, and PROD is not touched by any agent.

What has to be reproduced on the production host, in this order:

1. **A runtime service account with no sudo and no `docker` group** for all five units
   (`bersoncarebot-{webapp,api,worker,scheduler,media-worker}-prod`, whose unit files today all carry
   `User=deploy`). On the dev box `deploy` reaches root by four independent paths — three sudo entries plus
   `docker` group membership with a live daemon — and the `docker` path survives any sudo change.
2. **A separate deploy identity**, as is already the de-facto case here (the deploy script runs as `dev`).
   Remove the runtime account's sudo residue once nothing invokes it, and delete the dormant old deploy path
   rather than leaving it in place.
3. **Re-own `/opt/env/bersoncarebot/*` and the release trees** to the right accounts, so the runtime account
   cannot read deploy-only secrets and vice versa. Today one group-readable file holds five secrets.
4. **The database's own account separation.** PROD `pg_hba` must not carry blanket `local all all peer`, and
   the postgres superuser must be reachable only through an audited break-glass path.
5. If the database moves to its own host (the A2 option), the connection becomes private-network + TLS with
   certificate verification, not `127.0.0.1` and not an SSH tunnel. At that point splitting secrets across
   files stops being enough and a secret store becomes load-bearing — the owner already noted the link.

Restarts must not come back as unrestricted `sudo systemctl`; use a polkit rule for the named units or a
fixed-command wrapper.

## 6. Anonymous booking: contact ownership must be proven — OWNER-ORDERED

**Owner ruling, 2026-07-26:** «давай возьмем "всегда просить код или вход"». Every anonymous booking proves
ownership of the phone/e-mail by one-time code, or comes from a logged-in session, BEFORE the booking is
confirmed. This is the Zocdoc/Doctolib shape, chosen over the weaker verify-on-collision variant.

Prod-specific consequences: the current code links a booking to an existing person on a bare phone match,
globally across all clinics, with no possession proof — so the fix changes behaviour for real patients. Plan a
cutover note and re-count how many production bookings currently arrive by the anonymous path before changing
it. Tracked as taskdb #1004.

## 7. External monitoring and two settings the alerting work needs before it is real

Built and committed (`f5ecb6e78`), but inert until configured. Recording rather than guessing, because one of
them means creating an account somewhere.

1. **`OPERATOR_HEARTBEAT_PIPELINE_URL` / `OPERATOR_HEARTBEAT_DIGEST_URL` — owner decision.** The dead man's
   switch only proves anything if the thing that notices the silence lives **off this box**; a heartbeat our
   own dead server checks itself is theatre. That means a third-party endpoint (healthchecks.io or
   equivalent, self-hostable). Signing up somewhere is the owner's call, not an agent's. Until then the
   emitter runs and the check runs, both locally.
2. **`operator_alert_fallback_email`** — the global restricted DB setting used when an operational alert has
   an empty audience. Configure it in the platform admin technical settings; it is required by that form and
   is not organization-scoped.
3. `INTERNAL_JOB_SECRET` is unset on DEV, which is why the local heartbeat receiver answers 503 there. TEST
   and PROD already have it — no action, noted so nobody "fixes" it.

4. **External uptime monitor — required for the initial PROD cutover.** Owner direction 2026-08-15: include
   Uptime Kuma in the production rollout plan for the first operating period. The monitor itself must run
   **outside the PROD host** (a separate monitoring/DEV host or an independent provider); co-locating it with
   PROD cannot detect host, network or power loss. Before opening PROD to users, configure public web/API and
   certificate-expiry probes against the reviewed production health endpoints, connect an alert destination
   independent of the monitored application, and prove both failure and recovery notifications. Record the
   monitor owner, admin location, probe inventory and backup/restore procedure without storing notification
   secrets in the repository. Uptime Kuma is the initial implementation, not a permanent vendor lock-in;
   Healthchecks.io or an equivalent independent service satisfies the same gate.

5. **Четыре недостающие проверки живости — ПЕРЕНЕСЕНО 17.08 из `NIGHT_PLAN_2026-07-26.md` D-1, владелец 17.08:
   «надо сделать, в чём проблема».** Сегодня планировщик проверяет ровно три канала: `max`, `telegram`,
   `google_calendar` (`apps/webapp/src/modules/system-settings/operatorHealthProbeConfig.ts:28`, зеркало
   `apps/integrator/src/app/operatorHealthProbeSettings.ts`). Отсутствуют:
   - [ ] почтовый сервер: соединение + вход (поля почтового ящика уже заведены в настройках — адрес, логин,
         пароль в защищённом виде, `email`-блок в дефолте реестра; самой проверки нет);
   - [ ] ежедневная реальная тестовая отправка письма с проверкой доставки в пределах `roundTripDeadlineMs`;
   - [ ] остаток на счету SMS-провайдера;
   - [ ] доставка уведомлений в браузере.
   **Почему это первое по важности в разделе:** июльский суточный простой почты остался незамеченным именно
   потому, что живость почты никто не проверяет. Владелец 17.08: адрес для почтовой проверки настроит сам на
   TEST и PROD после того, как закончится DEV.
6. **Окно тишины проверок — РЕШЕНИЕ ВЛАДЕЛЬЦА 17.08.2026, дословно:** «максимум сутки, по умолчанию 2 часа».
   Про действовавшие значения (по умолчанию сутки, потолок неделя) — «это бред и вредительство… я три раза
   заставлял агента переделать». Значения живут в трёх местах и правятся вместе:
   `operatorHealthProbeConfig.ts` (`OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS`), дефолт
   `operator_health_probe_config` в реестре настроек и зеркало интегратора. Решение записано здесь, потому
   что оно уже трижды терялось между агентами.
7. **Тишина на время выкладки — ЗАКРЫТО 17.08 как неактуальное, инженерное решение.** Требование
   «выкладка выпускает собственную короткую самоистекающую тишину» появилось под сценарий
   stop-migrate-build-restart с многоминутным окном. При blue/green (§2) переключение занимает секунды, а
   тревога поднимается только после `consecutiveFailures` подряд неудачных проверок при интервале от пяти
   минут — окно переключения физически не набирает порог. Ручной механизм тишины остаётся и после правки
   пункта 6 ограничен сутками. Если blue/green не состоится и вернётся длинное окно выкладки — пункт
   возвращается вместе с ним.

Also carried forward from the same work, deliberately deferred: the operator alert path currently shares
transport and credentials with patient mail. Decision **D-c** in `NOTIFICATION_ALERTING_DESIGN_2026-07-26.md`
says it must not — GitLab's 2017 outage is the precedent, where the alert about broken mail travelled over
the broken mail. Splitting it needs a second provider or the external heartbeat above.

## 8. Re-count every "affected users" figure against PROD

Standing rule rather than a task: every number in the security and Telegram-removal work was measured on a
DEV/TEST copy. Before any cutover step that touches people, re-run the same query against PROD and record
both numbers. No cutover decision should rest on a TEST-derived count.
