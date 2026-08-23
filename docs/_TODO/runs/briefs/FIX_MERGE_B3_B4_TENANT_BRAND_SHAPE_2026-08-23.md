# Бриф: свести форму `effectivePatientBrand` после слияния `B3` и `B4`

**Источник оракула:** `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, пункт `B4` —
«Расширить существующий org branding service: optional patient app name и один accent token; anonymous
branded projection отдаёт только published/entitled safe fields. Public card/contacts читаются через
существующий clinic-public-card port.»

**Канон репозитория:** перед действием выполни `grep -n "^## \|^### " AGENTS.md`, найди раздел по своей теме
и прочитай его целиком.

**Клон:** `/home/dev/dev-projects/bcb-wt-merge-fix-b3b4-20260823`, ветка `wt/merge-fix-b3b4-20260823`
(отведена от головы интеграционной ветки `wt/therapysto-night-20260823`, коммит `4c64f97f4`).

## Что случилось

`B3` и `B4` по отдельности зелёные, их слияние — красное. `B4` расширил тип бренда, который несёт
`ResolvedSurface`: теперь `effectivePatientBrand` обязан содержать `effectiveDisplayName`, `patientAppName`,
`accentToken` и опциональный `logoUrl` (см. `apps/webapp/src/shared/lib/surface/requestSurface.ts:86-110`).
Фикстура теста `B3` в `apps/webapp/src/proxy.route.test.ts:36-45` осталась в старой форме
(`organizationId`, `core`, `paid`, `resolution`) и в неё не входят `patientAppName` и `accentToken`.

Полный CI интеграционной ветки падает на `apps/webapp typecheck`:
`src/proxy.route.test.ts(37,22): error TS2322: … is missing the following properties … patientAppName, accentToken`.

## Что сделать

- привести фикстуры `proxy.route.test.ts` к действующему типу `TenantSurfaceLookupResult`;
- **не ослаблять тест ради зелёного**: значения фикстуры обязаны остаться содержательными (разные бренды у
  разных организаций), а сами проверки — теми же по смыслу, что и до правки. Если действующий тип
  требует убрать проверку — это находка, а не повод её удалить: напиши об этом в отчёт;
- проверить, нет ли той же рассинхронизации в других местах после слияния: `grep -rn "effectivePatientBrand"`
  по `apps/webapp/src` и по тестам.

## Доказательства в отчёте

- `pnpm --dir apps/webapp typecheck` — до и после (было красное, стало зелёное, с выводом);
- затронутые тесты: `apps/webapp/src/proxy.route.test.ts` и всё, что тронул, — прогон с числами;
- scoped lint по изменённым файлам;
- **не гоняй полный CI сам** — он идёт у ведущего через хостовый замок.

## Границы

- ничего, кроме сведения формы, не трогать: ни резолвер, ни слой пациента, ни бренд-сервис;
- не менять `apps/webapp/src/shared/lib/surface/requestSurface.ts` — тип `B4` принят аудитом и является
  правильной стороной; двигать нужно фикстуру, а не тип;
- новых файлов не заводить.
