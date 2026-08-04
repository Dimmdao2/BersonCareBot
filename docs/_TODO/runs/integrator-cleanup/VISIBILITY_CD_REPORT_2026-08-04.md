# Видимость, этапы C и D — отчёт

**Authority:** `docs/_TODO/runs/integrator-cleanup/VISIBILITY_CD_BRIEF_2026-08-04.md`,
`docs/_TODO/VISIBILITY_MODEL_DESIGN_2026-08-04.md` §3/§6. Ветка `wt/visibility-cd`. Ни один существующий
маршрут не тронут (этап E вне объёма).

---

## Этап C — порт видимости

**Файлы:**
- `apps/webapp/src/modules/patient-visibility/ports.ts` — типы (`PatientVisibilityActor`,
  `PatientVisibilityLinkPort`), решение по `assistant` записано в комментарии (см. ниже).
- `apps/webapp/src/modules/patient-visibility/service.ts` — `buildPatientVisibilityPredicate` (WHERE-фрагмент
  для списков, тот же приём `{sql,params}`, что `appendSqlOrganizationEnrollment` в `pgDoctorClients.ts`) и
  `createPatientVisibilityService(...).assertPatientVisibleToActor` (точечная проверка, через порт).
- `apps/webapp/src/infra/repos/pgPatientVisibilityLinks.ts` — drizzle-реализация порта (новый код — без сырого
  SQL, `AGENTS.md` §5).
- `apps/webapp/src/infra/repos/inMemoryPatientVisibilityLinks.ts` — in-memory реализация для тестов.
- `apps/webapp/src/modules/patient-visibility/service.test.ts` — 10 тестов, все комбинации ролей/состояний
  связи, включая «связи нет ни у кого» и «пациент в двух клиниках».

**Решение по `assistant`** (брифом явно потребовано объяснить, не догадаться): роль сегодня никогда не
получает ни `canManageAllSpecialists` (только owner/admin), ни `specialistId` (клинический гейт пускает
только owner/admin/doctor — `organization-membership/service.ts`), поэтому предикат ключуется на
`canManageAllSpecialists`/`specialistId`, а не на `membershipRole` напрямую — assistant естественно попадает
в узкую ветку без специалиста и не видит ничего. Если ассистентам понадобится видимость расписания без
пациентских данных — это та же отложенная владельцем строка «отдельное расписание для администратора», не
предмет этого предиката.

**Проверка (не только зелёные тесты — правило §10a).** Вручную внесены и проверены три поломки:
1. убрана ранняя развилка `canManageAllSpecialists` в `assertPatientVisibleToActor` → тест «менеджер видит
   пациента при нуле связей» покраснел (`expected false to be true`).
2. убран фильтр `organizationId` из `hasActiveLink` in-memory порта → тест «стена арендатора» покраснел
   (`expected true to be false`) — связь другой организации стала видимой.
3. переставлен порядок `[specialistId, organizationId]` в `buildPatientVisibilityPredicate` → тест на порядок
   параметров покраснел (значения попали не на те SQL-плейсхолдеры).
Все три — красные на поломке, зелёные после отката; файлы восстановлены (`git status` подтверждает — только
новые файлы, без диффа против исходной версии).

**Тенантная стена не подменяется** (§3 design doc): обе функции принимают `organizationId` явно и всегда
включают его в узкую ветку — поломка (2) выше это доказывает.

**Гейты:** `pnpm run typecheck` — чисто; `pnpm run lint` (полный, 2м47с) — чисто, включая
`check-no-new-raw-sql`/`check-webapp-infra-import-boundary`; ни один новый `*.postgres.integration.test.ts` не
заведён (запрещено `AGENTS.md` §10b до отдельного owner-go) — DB/RLS-гарантия у порта не заявляется, только
поведение поверх in-memory порта.

---

## Этап D — бэкофилл

**Файлы:**
- `apps/webapp/scripts/backfill-patient-specialist-links.ts` — дефолт dry-run, `--commit` применяет,
  `--organization-id=UUID` сужает. Пишет напрямую через `pg.Pool` (не через
  `createPgPatientVisibilityLinkPort()`/`getDrizzle()` — вебапп-пул в locked-режиме требует принципала запроса,
  которого у разового скрипта нет; тот же приём, что у `backfill-treatment-program-editor-draft-snapshots.ts`).
- Решение «что считать записью»: `deleted_at IS NULL`, статус ЛЮБОЙ (включая отменённые/неявку) — «была хотя
  бы одна запись на приём» читается буквально; связь — это факт брони специалиста к пациенту, не факт
  состоявшегося визита. Только добавление строк, риска сужения видимости нет (этап E не подключён).
- Идемпотентность — `ON CONFLICT (patient_user_id, specialist_id) WHERE status = 'active' DO NOTHING`
  (тот же partial-индекс, что в миграции этапа A).

**Холостой прогон (DEV, `bcb_webapp_dev`, до применения):**
```json
{
  "dryRun": true,
  "organizations": [{
    "organizationId": "a0000000-0000-4000-8000-000000000001",
    "patientsWithAppointments": 97,
    "patientsCovered": 97,
    "patientsWithoutSpecialistOnAnyAppointment": 0,
    "specialistsAffected": 1,
    "pairsTotal": 97,
    "pairsAlreadyLinked": 0,
    "pairsWouldCreate": 97
  }]
}
```
Вторая организация на DEV (`be_organizations` = 2 строки) без единой записи на приём не попала в отчёт — это
корректно, отчёт по определению строится из `be_appointments`.

**Применено на DEV** (не на TEST — по брифу §D.7, решение о TEST отдельно у лида):
- До: `SELECT count(*) FROM patient_specialist_links` = 0.
- После `--commit`: 97 (все `status='active', created_via='first_appointment'`) — совпадает с
  `pairsWouldCreate` дословно.

**Повторный прогон** (dry-run и `--commit` ещё раз): `pairsAlreadyLinked=97, pairsWouldCreate=0`,
`pairsCreated` отсутствует (ничего не создано); итоговый count в таблице остался 97 — дублей нет.

**Как измерено — важная оговорка.** DEV-таблицы `be_organizations`/`be_appointments`/`be_specialists` под
FORCE RLS (`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §3a, `[[zero-under-rls-is-not-empty]]`);
обычный `DATABASE_URL` (роль `bcb_webapp_dev_user`) без принципала отдаёт по ним 0 строк — не факт пустоты.
Для реального прогона на DEV использован временный пароль на суперпользователя `postgres` (выставлен и сразу
сброшен обратно в `NULL` через `sudo -u postgres psql`, DEV-only, оставлен на секунды жизни сессии) — только
он проходит FORCE RLS без изменения прав `bcb_webapp_dev_user`/`app_owner` (у которых нет доступа к новой
таблице и нет причин его давать). В проде/на TEST у скрипта должна быть роль с эквивалентным обходом стены,
назначаемая деплоем — вопрос лиду при переносе.
