# Тест или взгляд — independent behavior audit #915 mobile active-call lifecycle

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Пока звонок активен, начало другого звонка через обычный UI недоступно».

## Role and authority

You are the first independent auditor of the combined committed Android + web candidate for taskdb #915. Work in one turn and do not end while a foreground command is still running. Before every action obey the heading-map gate in `AGENTS.md`. Read `README.md`; `AGENTS.md` §10, §10a, §10b, §11, §15, §16, §17, §24 completely; both UI style guides; `apps/mobile-shell/README.md`; the exact owner authority §1.8/§1.9 and M4-01…M4-06 in the mobile master plan. Use code-search before blind grep.

Audit is a gate, not a source of scope. A finding exists only for a reachable owner-requirement/repo-rule failure or build/runtime regression. Do not make product fixes. Do not run root full CI; the owner deferred it because package updates are happening in parallel.

## Candidate and permitted writes

- Record the exact candidate SHA before inspection and do not merge newer `feat` into it.
- Production code is read-only. Temporary fault injections are permitted only if fully reverted.
- Permanent writes are limited to justified behavioral acceptance tests under the existing relevant Android/webapp test files (prefer extending existing files) and `.lead/runs/mobile-active-call-combined-audit-20260909/90-final-audit-report.md`.
- Do not write source-text/format/button-count/copy/layout tests. Visual position, safe-area use, pulse quality, and desktop non-redesign are one-time source/live-view checks.

## Mandatory protocol

1. Before reading any existing tests, derive and write the blind kill-set from M4-01…M4-06 in the report draft. Classify every requirement as `behavioral test` or `view/build inspection` under §24.4.
2. Inspect the production diff and existing tests. Reuse the retained late A → replacement B red oracle rather than duplicating it.
3. Add only missing tests justified by an expensive and silent failure. For each behavioral class, prove the test by one temporary fault injection, or retain a failing acceptance test on the current product. Revert every production mutation.
4. Run only targeted Android/Jitsi and web video/live/shell tests, relevant scoped lint/typecheck, and the cheapest Android compile/build check. Do not run app-wide or root full CI unless the lead explicitly changes this brief.

## Required kill classes

- Android: leaving/backgrounding enters the SDK-supported system PiP path without emitting terminal; Activity destruction/background does not synthesize hangup; explicit Jitsi termination emits exactly one terminal; a delayed A event cannot be attributed to replacement B; permission/retry and exact self-hosted endpoint/origin restrictions remain intact.
- Web/native coordinator: internal mobile route navigation keeps exactly one conference instance; route unmount never calls native hangup or browser dispose; returning attaches the same call to its exact route; direct navigation/ordinary controls cannot replace it with a second call; explicit terminal clears state and runs callback once even if origin page unmounted; guest standalone behavior remains operational.
- UI/view: patient and doctor indicators are physically separate zonal UI, visible only off the active call route on mobile, bottom-right above navigation, accessible, safe-area aware, camera + soft pulse; desktop has no new floating UI; all actual production start surfaces are gated.
- Architecture/security: one provider-neutral coordinator/renderer path, no token/session persistence outside in-memory client state, no patient/doctor cross-import, no second meeting page or provider-specific product fork.

## Result

- Report one line per M4-01…M4-06: `PASS|FAIL|BLOCKED` with exact evidence.
- Include candidate/base SHA, files inspected, exact commands/results, retained/new tests, fault-injection tally `убито N / непойманных M`, and real external blockers (KVM/physical device/RuStore) separately from repository failures.
- Commit only tests/report with explicit staging; message includes `#915`, evidence, M4 IDs, and what remains unverified. Do not push, update taskdb, plan checkboxes, or product code.
