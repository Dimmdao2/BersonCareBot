# D10 closure evidence final correction brief (2026-08-21)

## Источник оракула
«A number without the command that produced it is not a number» — root `AGENTS.md`; accepted independent-audit finding and first correction `de9edb25f` on `wt/d10-current-closure-20260821`.

The first correction has the right facts but is not yet acceptable:

1. Rename `D10_CLOSURE_EVIDENCE_REPORT_2026-08-21.md` to the already authorized scope path
   `D10_CURRENT_CLOSURE_EVIDENCE_2026-08-21.md`; update the WORK_ORDER link.
2. Replace the pseudo-command in each DB block with the exact form actually run by lead:
   `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d <DB> -v ON_ERROR_STOP=1 -Atqc`
   followed by one quoted SQL string containing `BEGIN READ ONLY;` three SELECTs and `ROLLBACK;`. Exact output is
   `1`, `t`, `t` for each named DB. Do not show a command that would wait interactively for SQL input.
3. Record both exact health commands and outputs:
   `curl -fsS --max-time 10 http://127.0.0.1:6300/api/health | jq -c '{ok,db}'` and the same on
   `http://127.0.0.1:3300/health`; both returned `{"ok":true,"db":"up"}`.
4. Keep the honest statement that the historical full-CI raw log was not preserved. Do not claim the evidence
   report author re-ran or personally measured anything; say the lead ran/recorded the commands.
5. Remove trailing whitespace and make `git diff --check` pass. Do not change any D10 product fact, old historical
   report, handoff text, product code or tests.

Commit the exact two-path correction. Existing audit is reused; no re-audit, DB action, full CI, deploy or push.

