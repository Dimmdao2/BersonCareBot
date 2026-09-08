Тест или взгляд: постановка подтверждённого видео в очередь и переход preview из pending — повторяемое поведение;
выбор существующего playback-компонента и отсутствие параллельного pipeline — разовая инспекция diff без UI-теста.

# Independent blind behavior audit — TEST c069 media fixes

Role: `auditor-live`. Audit exact committed candidate `c70d784e4f41d278281f443b99140f7b496857c6` in the
supplied `test-media-triage-c069` worktree against base `e5fb19c71`. Start with the `AGENTS.md` heading map, then
read §10a, §10b, §15, §17, §19 and §24 completely before inspecting tests. Read
`.lead/briefs/fix-test-health-media-runtime-batch-20260908.md`, `docs/MEDIA_PREVIEW_PIPELINE.md` and
`docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`. Do not deploy, push, use shared DEV/TEST servers, mutate
named databases, create a disposable database, or touch PROD/secrets.

Источник оракула: `docs/MEDIA_PREVIEW_PIPELINE.md` — «Поддерживаемые входы: `image/jpeg`, `image/png`,
`image/webp`, `image/avif`, `image/heic`, `image/heif`, `video/mp4`, `video/webm`.»

Before reading retained tests, write a blind kill-set from the authority and confirmed TEST incidents. It must at
least distinguish:

1. a valid confirmed patient-file `video/webm` is stored but never enqueued into the existing video pipeline;
2. invalid/failed confirmation or a non-video object is incorrectly enqueued, or the same media receives duplicate
   active work;
3. an enqueue/config failure turns an already successful upload confirmation into a false HTTP failure;
4. a discussion image whose preview is pending is fetched once and remains pending forever instead of being
   refreshed until ready/error;
5. polling continues after terminal state, media change, or unmount and can overwrite newer playback state;
6. an existing patient-file video is rendered through a non-video preview path and remains unplayable.

Then inspect candidate diff and production wiring, then retained tests. Classify each item under §24.4. Add only
missing tests for costly silent upload/job/playback behavior at the cheapest public route/hook layer; never pin UI
wording, DOM layout, source text, internal call order, timer implementation, or element counts. Boundary assertions
on enqueue and fetch are allowed only where the side effect itself is the contract. Perform one temporary production
fault injection for every already-green independent behavioral class and record the assertion that turns red. Revert
all temporary production mutations. A failing acceptance test on the untouched candidate is a finding; do not fix
product code.

Run only targeted media route/hook tests and `git diff --check`, no full CI. If tests or an audit artifact are added,
stage explicit files and commit them on the candidate branch; otherwise leave it unchanged. Report binary
PASS/MUST FIX, exact SHA, kill-set mapping, fault-injection evidence, commands/results, and any item deliberately
accepted only by inspection/live rerun.
