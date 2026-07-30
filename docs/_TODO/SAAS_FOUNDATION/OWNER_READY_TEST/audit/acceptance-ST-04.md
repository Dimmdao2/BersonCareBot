# Acceptance ST-04 — integration and owner handoff

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

- [x] Этапные code audits и re-audits имеют durable отчёты с authoritative execution traces.
- [x] Process-audit recovery documented; independent process re-audit PASS before commit/full CI.
- [ ] Full CI выполнен на неизменившемся итоговом SHA.
- [ ] Commit/push только в `feat/doctor-ui-rebuild`; worktree clean; worktree inventory проверен.
- [ ] Fresh TEST deploy завершил strict/FORCE assert, seed, units health и locked smoke.
- [x] Code contract — smoke имеет отдельный `global_admin` auth profile; System Health positive probe использует его с
      admin mode, а clinic-admin/doctor probes получают ожидаемый denial.
- [x] Code contract — System Health smoke проверяет `saasIsolation.schemaVersion`, status/coverage/trend, а не только общий DB health.
- [x] Code/scratch contract — strict closure идемпотентно provision/rotate отдельный diagnostic PostgreSQL LOGIN из защищённого URL,
      удаляет ambient app-role memberships и затем доказывает операторскую least-privilege role matrix.
- [x] Code/static contract — после operator overlay canonical TEST closure запускает normal E1 scenario, injected-failure cleanup proof и
      отдельный final-clean assertion; product smoke видит уже очищенное состояние.
- [x] Product-smoke contract checker вместе с mutation self-test и synthetic fixture preflight входит в root `audit`
      и тем самым в full CI, а не остаётся отдельной ручной командой.
- [x] Analytics smoke проверяет tenant-scoped историю выполнения программы специалистом через непустой `entries`;
      смешанная global/tenant IA страницы аналитики не расширяется и отдельно отложена в task #800.
- [ ] Public `/app`, clean login, specialist/clinic registration и `/book` пройдены в профиле без cookie.
- [ ] Live locked matrix исполнила A→B/B→A denials, shared-patient A/B context, global-admin clinical-write denial
      и org-scoped booking write; после неё post-matrix exact strict+FORCE повторно подтверждены.
- [ ] Seeder выполнен дважды подряд; double-seed convergence сохранила посторонний sentinel и оставила точную
      fixture shape без дублей.
- [ ] Product smoke доказал authenticated media playback exact fixture ID и public slots exact fixture mapping;
      response bodies/opaque refs не попали в evidence.
- [ ] Reversible diagnostics fixture доказала okay/incomplete/critical и exact +1 каждого из шести классов, затем очищена.
- [ ] Visual #1 прошёл каждый ST-02/ST-03 nuance и записал доказательства.
- [ ] Chief #2 независимо перепроверил и исключил ложные отказы из-за URL/data scenario.
- [ ] Screenshot manifest содержит commit, роли, URL templates, viewport/states; без secrets/opaque IDs/ПДн.
- [ ] Завершённые subagent sessions/processes проверены и очищены; результат записан в канонический план/лог.
- [ ] Owner handoff сообщает, куда войти и что увидеть по каждой роли.
