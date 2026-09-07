# C3M recovery worker — finish and commit interrupted communications slice

Read the `AGENTS.md` heading map before every action, then §1 migration/privilege rules, §4/§4a, §5, §9,
§10/§10a/§10b, §12, §16, §17, §21, §22 and §24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, the original and continuation C3M-09 briefs,
communications/chat/comments/media/mailings docs, the current branch diff and status before editing.

Taskdb workstream: `#1098`.

The previous continuation was killed by the runner's 50-minute system boundary while still working. Its product
changes are intentionally present as an uncommitted tree in this same clone. Preserve and complete them; do not
reset, discard or restart the slice. The last recorded unresolved bypass was that already queued mailing delivery
jobs could still dispatch after the organization switched `mailings` OFF.

Finish the whole roadmap C3M-09 contract in this one recovery pass:

1. Close the mailing worker/dispatch gate for already queued jobs using the organization of the audit/delivery
   record. Mailings remains independent from chat and support. OFF must stop delivery without deleting history.
2. Reinspect the current diff against every original C3M-09 chokepoint: Communications tab/default/data loading;
   chat ensure/list/read/write, snapshots, unread, payment-link and notifications; comments/media read/write/feed/
   count/upload and notifications with parent dependencies; mailings compose/send/history/read and queue/dispatch.
3. Complete any concrete omission found. Keep one organization-scoped policy resolver and existing ports/services;
   no second table/formula/group, no C3M-10/11 work, presets, tariffs, booking policy, terminology sweep or Today
   redesign.
4. Product worker writes no tests. Do not add or rewrite tests. Keep the intentional deletion of any in-scope
   implementation-form test already removed by the interrupted worker.
5. Run affected existing behavior checks, webapp typecheck, scoped ESLint, architecture checks, migration/privilege
   static checks and `git diff --check`; no full CI, shared server, live acceptance or blind fault injection.
6. Commit every completed product change explicitly (never `git add -A`) with `#1098`, why, exact evidence,
   `C3M-09`, and only independent audit/preflight remaining. Do not end with an uncommitted tree. Never push.

If a true external blocker remains, preserve the tree and report the exact path/scenario; otherwise completion means
one committed candidate covering the entire C3M-09 scope, ready for the independent auditor.
