# Diary schema — statistics readiness

This document records the audit of diary tables (symptom + LFK) for future analytics. No analytics UI or aggregation is implemented in the MVP; the schema is designed so that common statistics do not require schema redesign.

## Checklist (audit)

- **user_id** — all diary tables have `user_id` for per-user aggregation.
- **Timestamps** — `recorded_at` (symptom_entries), `completed_at` (lfk_sessions), `created_at` / `updated_at` on all tables for time windows and ordering.
- **source** — symptom_entries have `source` (`bot` | `webapp` | `import`); lfk_sessions have `source` (`bot` | `webapp`) for filtering by origin.
- **Foreign keys** — symptom_entries → symptom_trackings(id); lfk_sessions → lfk_complexes(id). Supports joins and integrity.
- **Indexes** — time-desc indexes for recent-first listing and range queries:
  - symptom_entries: `(tracking_id, recorded_at DESC)`, `(user_id, entry_type, recorded_at DESC)`
  - lfk_sessions: `(user_id, completed_at DESC)`, `(complex_id, completed_at DESC)`
- **Append-only semantics** — diary entries and sessions are never overwritten; new rows are inserted. Safe for averages, peaks, counts, and trends.

## Intended analytics (future, not implemented)

- **Symptom diary**: per-user or per-tracking averages of `value_0_10` over time windows; frequency (entries per day); peaks (max value in window); breakdown by `entry_type` and `source`.
- **LFK diary**: sessions per user per day/week; adherence by complex; breakdown by `source`.

Queries can use existing indexes; no schema change required for these.
