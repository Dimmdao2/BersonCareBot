# Тест или взгляд: Track D D19a import boundary

Смешанный один pass. Канон: `AGENTS.md` §5, §10a–§10b, §24; authority — D19a в
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`; worker brief —
`TRACK_D_D19A_IMPORT_BOUNDARY_BRIEF.md`; product/evidence commit — `15febe16b`.

Источник оракула: D19a — «по каждой оставшейся записи доказать, что это composition-root/public port boundary,
либо удалить обход» и «structural gate … ловит direct/alias/dynamic import и re-export».

Провести один независимый аудит полного diff, не принимать worker evidence как доказательство.

- Взгляд/AST injection: exact production census действительно равен нулю; нет module/api import или re-export из
  `infra/db`/`infra/repos` через alias, relative path, barrel, literal/constant/computed dynamic import. Временно
  внести каждый named bypass-класс и доказать, что обычный webapp lint его отклоняет; изменения удалить.
- Взгляд: новые module-owned ports не копируют repository/business logic; concrete Postgres binding существует
  только в composition roots, без module-level singleton/late fallback и без вечного allowlist.
- Поведение: auth session lookup/revocation/OTP/dev-bypass, integrator reminder/support projections и DB-backed
  config adapter сохраняют прежний fail-closed/cache contract. Составить kill-set до чтения тестов, затем применить
  fault injection к каждому независимому изменённому пути; добавить acceptance-тест только для реально непокрытого
  повторяемого поведения.
- Проверить, что startup/instrumentation и request composition всегда устанавливают binding до первого caller, в
  production и тестовом runtime; отсутствие binding наблюдаемо, а не уходит в прямой infra fallback.
- CMS/tariffs/billing, D30, migrations и runtime environments не затронуты.

Запустить exact census, gate self-test и обычный lint, relevant tests, webapp typecheck и `git diff --check`.
Закоммитить только audit report и допустимые acceptance-тесты с бинарным PASS/MUST FIX, killed/not-killed поимённо.
Временные production-поломки удалить. DEV/TEST/PROD не трогать; продуктовый fix не делать.
