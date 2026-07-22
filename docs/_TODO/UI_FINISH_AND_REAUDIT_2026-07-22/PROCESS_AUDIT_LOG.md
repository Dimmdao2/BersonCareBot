# Process audit log

## 2026-07-22 — `ui-finish-process-audit-1`

- Auditor: external read-only process auditor, Claude Opus 4.8.
- Verdict: `WARN` (conditional pass; no hard stop).
- Verified: Tracks A/B/C use separate worktrees and branches; every current track commit is pushed; `main` and `test` are untouched; commits are scoped; no track is falsely marked complete; destructive TEST work is still gated.
- Evidence boundary: the auditor could inspect repository and git metadata, but its sandbox could not read taskdb, `/home/dev/brain`, or transient live PNG evidence.
- Required correction: persist checkbox-by-checkbox evidence matrices in this initiative directory; keep all tracks `doing` until code, test, runtime/live and owner gates are genuinely satisfied; run one full CI on the integrated SHA before acceptance.
- Orchestrator action: accepted. Track A round 2 was already commissioned to produce the complete durable denominator/matrix. Track B and C remain gated by independent audits. No TEST reset/drop has run. The four unrelated registered worktrees are not removed because their ownership/activity is outside this work order and was not verifiable by the auditor.
- Process status after audit: continue; no hard stop.

## 2026-07-22 — owner correction on batch sizing

- Decision: a full plan denominator may be inventoried mechanically, but implementation and substantive audit briefs must be sized to one coherent page/block or one tightly coupled contract boundary.
- Action: the 167-row Track A matrix was retained as an evidence-only census; its implementation batch is limited to the Today/Clients/Messages list contract. The broad Track B fix and Track C audit were interrupted before commit and split into bounded sequential substages.
- Track B split: email-role/fail-closed setting read; atomic OTP consume; U9A mirror whitelist; narrow PWA/push identity guard and owner handoff.
- Track C split: canonical booking code/caller/test audit; separate R5–R7 provenance/runtime/owner-gate audit.

## 2026-07-22 — owner decision on DEV/TEST cadence

- PROD is a separate server and remains outside this work order.
- Normal verification uses DEV where fast local feedback is material, then an incremental TEST deployment of a coherent integrated milestone. TEST keeps its current database and receives only required forward migrations.
- Do not pull a fresh PROD dump or repeat a full SaaS reset, cutover, or backfill for routine verification.
- Do not deploy every small commit mechanically: use targeted checks per bounded substage, one accumulated full CI gate, then TEST where environment-specific proof is required (DB grants/migrations, OTP, PWA/push, runtime boundaries).
