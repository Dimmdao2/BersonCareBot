# Acceptance ST-02 — rich TEST fixture pack

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

## Данные и инварианты

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Code/static — manifest version и reserved IDs детерминированы; double-run contract pins counts/ledger effects.
- [x] Code/static — Clinic A staff=3, patients=5; Clinic B staff=1, patients=3; ownership/FKs согласованы.
- [x] Code/static — есть отдельные staff и representative patient `.test` logins без новых secret packet keys.
- [x] Code/static — обе клиники имеют service-labelled past/future appointments.
- [x] Code/static — representative patient каждой клиники имеет package balance/history и assigned program.
- [x] Code/static — A rich history содержит sets/reps/weight, bodyweight, weight-only и no-quantity варианты.
- [x] Code/static — action logs/events и diary snapshots дают непустые doctor/patient graphs.
- [x] Code/static — cleanup ограничен reserved fixture roots/IDs; ручные строки тех же клиник сохраняются.
- [x] Code/static — rolling diary cleanup совпадает только с reserved `(organization_id, platform_user_id, plan_instance_id)`;
      ручные rows с другим/null plan не удаляются, а collision на target date останавливает transaction.
- [x] Code/static — один deterministic shared patient enrolled в A и B; org-owned программа остаётся только у representative patient своей клиники.
- [x] Code/static — shared patient имеет отдельный `.test` login и manifest A/B refs.
- [x] Code/static — есть deterministic global-admin `.test` login для System Health без вывода секрета.
- [x] Code/static — public booking имеет org-owned branch/service/location/specialist availability, working hours и
      deterministic `availability` external mapping с `metadata.legacy_branch_service_id`; resolved context даёт непустые slots.
- [x] Code/static — store/payment fixture использует только `fixture_noop`, неактивную доставку и collision-guard для reserved package numbers.
- [x] Code/static — fake/local media имеет `s3_key IS NULL`, fixed TEST path и exercise ref; committed artifact
      копируется standalone asset sync, а actual `/api/media/[id]` и playback payload проверены без S3.
      Exact local TEST fixture доступен даже при absent global video flag; non-fixture по-прежнему fail-closed.
- [x] Code/static — messaging/notification fixture является send-safe: каналы не включены и никаких outbox/send jobs не создаётся.
- [x] Code/static — нет внешней доставки, реального S3/ПДн; script refuses non-TEST DB.
- [x] Targeted checks, deep audit, correction rounds and final independent code re-audit PASS.
- [ ] Live TEST — double seed, sentinel/count convergence, public slots/media, shared A/B selection and locked matrix proven.

## Визуальный сценарий

- TEST login: внешний protected fixture packet; значения не записывать.
- Clinic A owner: `/app/doctor/patients`, representative patient card, records/package, program detail.
- Clinic A added doctor: тот же clinic A roster; нет clinic B rows.
- Clinic B solo owner: только три B patients и B appointments.
- Patient A representative: `/app/patient`, treatment/program, booking, membership/history.
- Patient B representative: только B equivalents.
- Shared patient: вход отдельной учёткой, переключение A/B, видимы только данные выбранной клиники.
- Public без cookie: `/app`, чистый login, specialist/clinic registration и `/book`; проверить desktop/mobile.
- Locked executable matrix: A→B и B→A read/write denied; shared patient разрешён только в выбранном A/B контексте;
  global admin может читать System Health, но не получает неявное право clinical write; booking write scoped к выбранной клинике.
- Seeder запускается дважды на одном TEST state: counts, ledger effects и reserved rows совпадают, ручной sentinel сохранён.
- Каждый экран: normal state + refresh/deep-link; ключевые doctor/patient экраны desktop и mobile.
- Точный ID-dependent URL извлекается из versioned fixture manifest/operator packet, не ищется ревьюером вручную.

## Code-ready evidence after shared/public recovery

- `SAAS_TEST_FIXTURE_MANIFEST.operatorRefs` carries the shared-patient login ref, A/B organization and enrollment
  refs, exact public/dev-helper routes and `1440x900` / `390x844` viewports without secret values.
- The shared patient has its own reserved `.test` email and credential while reusing the protected Clinic A
  password key; fixture credential assertion is now eight and A=5/B=3 enrollment counts are unchanged.
- `deploy/postgres/test-settings-override.sql` writes and locks mirrored TEST-only
  `specialist_signup_enabled=true`; production's default-off auth policy is unchanged.
- `ST-02_WALKTHROUGH.md` makes explicit that specialist registration and clinic creation are one canonical flow on
  `/app`; `/api/auth/dev-public` aliases are DEV-only and cannot serve as TEST evidence.
- These are code/static claims only. Final code-stage PASS is recorded in `ST-02-final-PASS.md`; live acceptance remains open until canonical double-run, real TEST routes,
  shared-patient A/B selection, locked matrix and desktop/mobile walkthrough are executed downstream.
