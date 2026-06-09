---
name: Operator health alerting wave 2
overview: "Wave 2: dispatchOperatorAlert, critical tick, digest 1x/day digestTime 09:00, per-block channels, account_conflicts one checkbox. PHASE E superseded."
status: draft
todos:
  - id: w0-dispatcher
    content: "0.1 dispatchOperatorAlert + operator_health_alert_sent dedup + integrator unified recipients"
    status: completed
  - id: w0-config-ui
    content: "0.2–0.3 operator_health_alert_config + UI 3 блока (свои каналы, digestTime 09:00, account_conflicts)"
    status: completed
  - id: w0-deploy
    content: "0.5 cron templates critical/digest/guard + HOST_DEPLOY INTERNAL_JOB_SECRET gate"
    status: completed
  - id: w1-critical
    content: "1.1–1.3 criticalHealthSignals + lightweight collect + critical tick */5 + 3-strike probe"
    status: completed
  - id: w2-digest
    content: "2.1–2.3 buildOperatorHealthDigest + hourly digest tick (send at digestTime) + UI time field"
    status: completed
  - id: w3-hooks
    content: "3.1–3.3 projection/media thresholds + recovery lines in digest only"
    status: completed
  - id: w4-integrations
    content: "4.1–4.3 PHASE B/C/F — probes TG/GCal, webhook last-status, UI integrations block"
    status: pending
  - id: w-final-ci
    content: "DoD Wave 2: api.md, LOG waves, pnpm run ci green"
    status: pending
isProject: false
---

# Operator Health Alerting — Wave 2

**Канон:** [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/SCOPE_DECISIONS.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/SCOPE_DECISIONS.md) → [`ROADMAP_WAVE2.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/ROADMAP_WAVE2.md)

**Журнал:** [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md)

---

## Перед стартом (агент)

1. Прочитать [`SCOPE_DECISIONS.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/SCOPE_DECISIONS.md).
2. Правила: `plan-authoring-execution-standard`, `000-critical-integration-config-in-db`, `clean-architecture-module-isolation`, `system-settings-integrator-mirror`, `test-execution-policy`.
3. Между волнами — targeted vitest/typecheck из ROADMAP; **полный `pnpm run ci`** — todo `w-final-ci` только.

---

## Волны

| ID | Волна | DoD |
|----|-------|-----|
| w0-* | 0 Фундамент | §8.0 ROADMAP |
| w1-critical | 1 Critical | §8.1 |
| w2-digest | 2 Digest ⚠️/✅ | §8.2 |
| w3-hooks | 3 Hooks + recovery в сводке | §8.3 |
| w4-integrations | 4 B/C/F | §8.4 |
| w-final-ci | Финал | §9 ROADMAP |

---

## Superseded

- [`PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) — отдельный recovery push отменён.

## Вне scope

ROADMAP §10 (email, любой degraded, blue/green, CI workflow).
