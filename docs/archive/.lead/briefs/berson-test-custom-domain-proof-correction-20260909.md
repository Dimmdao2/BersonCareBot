# Тест или взгляд — correction существующего custom-domain DEV proof #787

Ты аудитор теста, продолжающий verdict `5e03f74cb`; product candidate остаётся `7e8a32b32` и его менять нельзя.
Сначала прочитай карту `AGENTS.md`, затем целиком §1/миграции/права, §1b, §5, §10a, §10b и §24. Authority:
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B2/B8/C5a/TPB-14 и отчёты
`AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md`, `AUDIT_BERSON_TEST_CUSTOM_DOMAIN_SECURITY_REAUDIT_2026-09-09.md`.

Предыдущий audit blocker возник из тестовой предпосылки: helper требует существующую вторую организацию до запуска
обоих случаев. Для проверки новой двери это лишнее. Исправь только уже существующий auditor-owned
`apps/webapp/src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts`:

- same-org save использует существующее активное staff membership и принудительный rollback;
- cross-org spoof сохраняет тот же проверенный principal/context собственной организации, но вызывает публичный
  `createPgCustomDomainBindingPort().setCustomDomainIntent` с другим случайным UUID. Никакая вторая организация или
  запись не нужна: наблюдаемый контракт — переданный organizationId не совпадает с DB-authenticated current_org и
  операция получает `42501` до записи;
- не превращай тест в raw SQL/проверку текста функции, не создавай фикстуру/организацию и не меняй product.

Независимый oracle: owner B2/TPB-14. Дорогая молчаливая поломка: staff одной клиники подменяет UUID и создаёт intent
для другого tenant. Наблюдаемое последствие: реальный Drizzle public port под именованной DEV ролью отказывает и не
оставляет строку; собственный intent успешно формируется внутри rollback.

Установи зависимости в worktree через `pnpm install --frozen-lockfile`, если локальных links нет. Запусти только этот
opt-in DEV proof через host test lock с canonical DEV env, затем privilege generated check, migration privilege check,
owner-aware rollback-only preflight, webapp typecheck/scoped lint и diff-check. Старый duplicate-host proof с
предсуществующей второй организацией не является новым door oracle и его data blocker не должен отменять результат
этого теста; неизменённые anti-squatting constraints принимаются по уже существующему evidence и view.

Если оба случая зелёные, замени ложный FAIL queue/result на PASS FOR LAND с точными командами; иначе назови реальный
product finding. Закоммить только test/audit/queue artifacts. Не запускать Next/full CI/TEST/PROD/DNS/TLS/nginx.
