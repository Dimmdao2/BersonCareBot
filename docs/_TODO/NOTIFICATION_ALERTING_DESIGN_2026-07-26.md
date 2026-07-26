# Operator alerting and notification routing — design decisions, 2026-07-26

Authority: `docs/_TODO/NIGHT_PLAN_2026-07-26.md` items **D-1, D-2, C-4**. Owner rulings: recipients derive
from roles rather than a hand-kept allowlist; a settings matrix picks the channel per event type; SMS is
mechanism-only for now; **he is the only administrator and specialists are not on support duty**.

Every decision below is taken from published practice, with the source named. Nothing here is invented.

## The failure we are designing against

July 2026: the mail provider's quota ran out, deliveries silently failed, and the daily digest kept reporting
green for over a day. The same class is documented in the field:

- **GitLab.com, 2017-01-31** — backup-failure e-mails were configured, but DMARC was never enabled so the
  receiving server rejected them. Nobody saw the alerts; there were no backups when they were needed. *The
  alerting channel and the failing channel were the same channel.*
- **GitHub, 2022-09-28** — "our alerts were monitoring error rates but did not alert for lack of overall
  traffic". Same shape, full SRE org.
- **Open Build Service, 2023-02** — ~100 000 failed notification jobs; the correct absence-alert *did* fire
  and went unacted for 62 hours.

## Decisions

### D-a. Three concepts, three stores. No overloading.

1. **Authorization** — explicit user↔role assignment (ANSI INCITS 359 RBAC). Never an e-mail string.
   Today's `admin_emails` grants admin by address, which is CWE-266/269 by construction and means "CC someone
   on alerts" silently makes them an administrator.
2. **Operator alert destinations** — an explicit, *verified* endpoint list (channel, address, `verified_at`),
   double opt-in on the AWS SNS / Azure action-group model.
3. **User notification preferences** — category × channel, resolved at send time.

Roles may *populate* the destination list; they must never *be* the list. Azure's own docs warn a role-derived
audience takes up to 24 hours to propagate and silently supports only five roles.

### D-b. An empty audience must be structurally impossible — and alarming when it happens anyway.

- A root route that matches everything, with a fallback destination the UI cannot delete
  (Alertmanager's mandatory top-level route; Grafana's "The Default Policy can't be deleted"; Google
  Workspace's Operations alert whose recipient cannot be removed).
- **Never early-return on an empty recipient set.** Resolve → if empty and severity is operational, deliver to
  the fallback, increment a counter, and let that counter itself alert. Our July bug is literally this
  early-return; PagerDuty documents the same semantics as intended behaviour — *"If no one is on call on the
  entire escalation policy, an incident will not be created."*
- A destination that is unverified or bounce-suppressed counts as ABSENT for that check. SNS suppresses a
  bounced address for 7 days; Azure's SMS `STOP` disables every action group at once.

### D-c. The alert path must not share fate with the business path.

Different transport and different credentials for operator alerts than for patient mail — ideally a different
provider. Where that is not affordable, the external heartbeat below is the substitute, because it lives off
our infrastructure entirely.

### D-d. A dead man's switch is the centrepiece, not an extra.

The mechanism: something that is always supposed to arrive, and an **external** service that alerts when it
stops. kube-prometheus ships exactly this as the `Watchdog` alert (`vector(1)`, always firing) — *"This alert
is always firing… There are integrations that send a notification when this alert is **not** firing."*
Healthchecks.io states the semantics plainly: *"It keeps silent as long as pings arrive on time. It raises an
alert as soon as a ping does not arrive on time."*

Two heartbeats:
1. **Pipeline heartbeat** — the sender pings only after a *confirmed* successful send (or a periodic canary at
   low volume).
2. **Digest heartbeat** — the digest job pings. A digest that fails to run looks exactly like a quiet day.

And the digest must report **evidence**: count of confirmed deliveries, timestamp of the last one, age of the
oldest unsent item. "Green" means positive evidence, never "no errors logged".

### D-e. Two severities, and escalation *within one person*.

- **Immediate** — user-visible breakage, or the pipeline being dead. Staggered channels to one human, on
  PagerDuty's own per-user pattern: push at 0 min, e-mail at +3, SMS at +5 once wired.
- **Digest** — everything else.

**Deliberately dropped because they assume staff we do not have:** on-call rotations; escalation policies with
a second level; acknowledge-or-escalate timeouts (there is nobody to escalate to, so an unacknowledged alert
must never be what keeps us safe); multiwindow multi-burn-rate SLO alerting; inhibition trees; anomaly
detection. Also dropped: Google SRE's *"prefer a dashboard over e-mail alerts"* — that presumes someone is
watching the dashboard.

Silences are allowed but capped in hours and listed in the digest; the forgotten-silence failure is real and
still an open request against Alertmanager.

### D-f. The system must degrade correctly with nobody watching.

- When outbound delivery is confirmed dead, show a persistent in-app banner to clinic staff — the humans
  already inside the product learn what the operator has not yet.
- Never drop on failure: retain and retry, and alert on the **age of the oldest unsent item**, not queue
  depth. AWS's Builders' Library is explicit: *"we focus more on measuring the age… DLQ information would
  arrive too late."*
- Classify provider quota/credit responses as their own page-on-first-occurrence class. They are traps:
  SES answers `454 Throttling failure: Daily message quota exceeded` — a **4xx**, which conforming clients
  retry silently for days — and SendGrid credit exhaustion arrives as **HTTP 401**, which application code
  routinely buckets as "credential problem, log it".

### D-g. Preference matrix: categories × channel, tri-state, with a critical tier.

- Rows are **categories**, not individual events (Linear, GitHub and Customer.io all converge here;
  per-event granularity belongs to an admin-side scheme like Jira's notification schemes).
- Stored sparsely as unset / on / off so org defaults and user overrides merge (Knock's model; Braze keeps
  `subscribed` distinct from `opted_in` for the same reason).
- **Precedence is user-wins, written down and shown in the UI.** Publisher-wins products document the failure
  mode: Novu — *"If the email channel is disabled in workflow channel preferences, global and subscriber
  preferences are ignored"* — a user switches e-mail on and receives nothing.
- A **critical class** where the channel is choosable but delivery is not, and the toggle is *absent* rather
  than present-and-ignored (Novu `critical`, Courier `REQUIRED`). Minimum members: account/security,
  delivery-failure, anything with a clinical or legal deadline. Quiet hours never apply to it.
- **Saving must fail if the critical class would be left with no live channel.** Chrome revokes push on its
  own — *"Less than 1% of all notifications receive any interaction from users"* — and Web Push has no
  equivalent of iOS Critical Alerts.

### D-h. Content: a content-free nudge for anything patient-linked.

Neutral sender; no condition, procedure, specialty, provider or patient name in a subject line or push
payload; the body says an item exists and links to sign-in. This is the MyChart pattern, and it is practice
that **exceeds** the rule — HIPAA's encryption spec (45 CFR §164.312(e)(2)(ii)) is *Addressable*, and
minimum-necessary (§164.502(b)) does not apply to disclosures to the individual at all.

Do not oversell it. UR Medicine's own MyChart terms admit *"any person with access to a patient's e-mail will
be able to see this notification"* and that its mere existence *"may be information that a patient would not
want others to know."* Under 323-ФЗ Art. 13 that residual disclosure is exactly what to minimise.

Operator alerts are content-free about patients too: "delivery queue stuck, 47 items", never a name. Scrub PHI
from bounce handling and from notification logs — a bounce body echoes the original message.

**Before either the SMTP relay or a future SMS provider carries anything patient-linked, confirm its BAA/DPA
position** (45 CFR §164.502(e)(1)(i)). If the relay is not covered, the content-free nudge is not merely good
practice — it is what keeps the relay out of scope.

### D-i. What proves it works — the acceptance test

Revoke the mail provider's credentials on TEST. With **no human acting**:

1. the first send fails and is classified as a provider auth/quota error;
2. within ≤15 min an absence alert fires **over a non-e-mail channel**;
3. within ≤15 min the external heartbeat expires and alerts independently;
4. the oldest-unsent-age alert fires;
5. staff see an in-app banner;
6. the next digest reports **red**, with the timestamp of the last confirmed delivery;
7. nothing is dropped.

If any step depends on someone noticing, it is not done.

## Ranked build order (cost from the research, cheapest first)

1. Absence alert on confirmed sends, delivered over a non-e-mail channel — ~1 h. Signature-independent.
2. External dead-man's-switch ping after each successful send — ~30 min. Highest value per minute; survives
   the box dying.
3. Classify provider quota/credit errors and page on first occurrence — ~2 h. Signature-dependent, so it is an
   addition to 1 and 2, never a replacement.
4. Poll the provider's quota endpoint where one exists — ~1 h. The only one that fires *before* failure.
5. Age of oldest unsent item > 15 min — ~2 h. One signal covers quota exhaustion, worker death and a stuck
   consumer.
6. Ingest delivery/bounce webhooks and reconcile — ~1 day.
7. Synthetic canary (send → IMAP verify) — ~1 day. Real end-to-end proof, ranked last only because 1+2 catch
   this incident for a twentieth of the effort. Build it on the `check_email_loop` model — an SMTP banner
   check would NOT have caught the quota outage, because the port answers `220` normally and rejects at DATA.

**Not delivery evidence, do not use as such:** read receipts/MDNs (RFC 8098: *"cannot be relied upon"*, and
forgeable), open-tracking pixels, DMARC aggregate reports (daily), Google Postmaster Tools (daily, and blank
at low volume). And note RFC 5321 §6.1: a `250` is one hop accepting responsibility, not delivery — while
§6.2 permits dropping mail without notifying anyone.
