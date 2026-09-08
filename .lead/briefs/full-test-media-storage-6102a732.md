# Тест или взгляд

Это живая end-to-end приёмка файлов, patient submissions, media worker, HLS и external players на TEST. UI
проверяется взглядом и действиями; storage/job/playback outcome — Network, повторное открытие и штатные
operator-visible состояния. Product code/tests не меняются, дефекты не исправляются в discovery-pass.

# TEST acceptance: patient files, media storage and playback

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §15–§20 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, FILES-01..11 из
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`,
`docs/_TODO/EXTERNAL_VIDEO_PLAYER_APIS_2026-09-07.md`,
`docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md` и применимые пункты
`docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`. Проверяй TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`; standard doctor/patient accounts из §1a в разных profiles.
VK preview без `vk_video_service_token` — owner-blocked #1092, не finding. PROD/S3 console/env/secrets не трогать.

Используй только небольшие безопасные локальные sample files из репозитория либо сгенерированные browser blobs без
личных данных. Имена `ACCEPTANCE-c0690ddaa-*`. Каждый созданный file/submission/material удаляется штатным UI/API в
конце; заранее убедись, что delete path существует. Если cleanup не гарантирован — не создавай persistent fixture.

## Механический маршрут

1. Doctor Files desktop/mobile: baseline empty/list; upload small image и document через фактические actions,
   observe progress, Save/confirm, reload, preview, download. Internal list scrolls without page overflow. Delete
   through ordinary confirmation; if file-in-use guard reachable, verify second explicit confirmation without
   deleting valued existing content.
2. Upload short small video only when normal TEST limits and delete path allow cleanup. Observe media row,
   preview/processing state, media-worker completion and HLS playback after reload. Do not assume timeout; wait
   foreground within reasonable bound and report if stuck.
3. Patient program comment/submission: attach small image/video to an existing assignment only if temporary message
   and media can be deleted/cleaned. Verify patient sees upload state, doctor sees same submission, reopening works,
   and access from unrelated/public session denies. Clean up.
4. Storage routing outcome must follow the row: doctor library/file versus patient submission. Do not query secrets
   or S3 directly. Record public/admin IDs and correlate later via operator/DB pass; a wrong-bucket/permission error,
   lost target after transcode/delete or orphan after cleanup is a finding.
5. Existing free external video: YouTube and RUTUBE custom controls play/pause/seek/volume/focus/keyboard/touch;
   VK/Vimeo supported native controls. If normal UI permits reversible URL edit, switch between two providers,
   Save+reload and confirm provider re-detected from URL, then restore. Never put external video in paid content.
6. Test unauthorized/private media access in incognito via the same visible URL: must not expose object; capture
   status without recording bearer query values. Inspect console/network for full sensitive RUTUBE/VK/Vimeo URL
   leakage and redact reports.
7. Mobile 390×844: camera/library/document actions, preview/player controls and safe-area. Cleanup all created
   rows through product flows and reload proof.

Artifacts: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/media-storage/`.
Report each ID/state/job visible through product, screenshots, Network/console, elapsed wait, cleanup and
PASS/FAIL/UNPROVED. Сначала собрать все findings; ничего не исправлять. Не запускать tests/CI/migrations/deploy/
dev server, не читать env, не менять/коммить code.
