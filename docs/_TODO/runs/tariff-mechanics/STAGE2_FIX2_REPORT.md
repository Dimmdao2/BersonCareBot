# ИТОГ

Исправления 2–6 готовы и закоммичены: `7c4bdbb7f`. Fix 1 остаётся архитектурным блокером.

1. Fix 1 — integrator lifecycle resolver

- Было: [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:167) самостоятельно вычисляет lifecycle и не читает owner policy.
- Изменение: не вносилось. Integrator сейчас **не вызывает единый resolver**.
- Причина: [ARCHITECTURE.md](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/ARCHITECTURE.md:40) прямо запрещает импорты `apps/integrator ↔ apps/webapp`; это разные Node-процессы. Общего entitlement package, DB function или authenticated HTTP-порта сейчас нет.
- Тест/мутация: неприменимы, дефект не закрыт. Lead должен выбрать seam: общий domain package, канонический DB-port/function либо authenticated межпроцессный API.

2. Fix 2 — payments и branding

- Было: отсутствовало доказательство, запрещающее вернуть специальный обход лестницы.
- Изменение: добавлен параметризованный тест для `payments` и `branding` в [service.test.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:405).
- Тест: оба проходят `grace → read_only → disabled` по своим четырём полям; `19/19`.
- Ручная мутация: временный `full_access` special case дал `2 failed` — отдельно для payments и branding.
- В финальной фразе brief есть противоречие: согласно основному owner ruling, обе механики **в лестнице**, не вне неё. За пределами остался только ранее названный критичный набор; классификации не менялись.

3. Fix 3 — реальный SQL output

- Было: мок PG-порта возвращал готовые policy-поля независимо от SQL.
- Изменение: [rehearsal](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-e1-c5a-entitlement-closure.mjs:194) теперь поднимает приватный PostgreSQL 16, применяет настоящую 0276, проверяет обе policy-колонки под `app_patient`, затем применяет deploy-overlay и повторяет проверку.
- Тест: `pnpm run rehearse:e1-c5a-entitlement-closure` → `PASS`.
- Ручные мутации:
  - удаление колонок из 0276 → `column "tariff_system_access_policy" does not exist`;
  - удаление из overlay → его signature gate завершился `division by zero`.

4. Fix 4 — write/read persistence

- Было: UI-мок сохранял request напрямую и обходил route/service/PG mapper.
- Изменение: [route.route.test.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:99) выполняет настоящий POST route → service normalization → `tariffValues()` → отдельный GET.
- Тест: `1/1`.
- Ручные мутации:
  - поле удалено из route schema → POST вернул `400` вместо `200`;
  - поле потеряно service → read-back `{}` вместо policies;
  - поле потеряно `tariffValues()` → read-back `{}` вместо policies.

5. Fix 5 — compatibility organization

- Было: `limit=null` выбрасывал исключение и давал 500.
- Изменение: [clinic-seats/service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/clinic-seats/service.ts:25) возвращает явное `configured:false`; [TeamSection.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:68) показывает отказ с требованием настроить места в тарифе или исключении организации, без придуманного числа.
- Тест: [TeamSection.ui.test.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:15) → `1/1`.
- Ручная мутация: возврат старого `throw` дал `clinic_seat_limit_unconfigured` и красный тест.

6. Fix 6 — invite RLS

- Было: accept проверял устаревший `mechanics->>'clinic_team'`.
- Изменение: [organization-member-invites-rls.sql](/home/dev/dev-projects/bcb-wt-tariff/deploy/postgres/organization-member-invites-rls.sql:283) проверяет `included_seats IS NOT NULL`; [PG-proof](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs:598) принимает приглашение по тарифу без override.
- Тест: реальный приватный PostgreSQL → `OK`.
- Ручная мутация: возврат старого JSON-чтения дал `entitlement_disabled`.
- Owner/signature/ACL не менялись. Exact-count остаётся `110`: функция заменена 1:1, новая `SECURITY DEFINER` не появилась. Увеличение до 111 сломало бы deploy-contract.

Дополнительно зелёные: webapp typecheck, lint, Drizzle journal sync. Full CI не запускался. Push/merge не выполнялись. План, canon, billing и mock-payment routes не менялись. В дереве остались только десять предсуществующих env-файлов.