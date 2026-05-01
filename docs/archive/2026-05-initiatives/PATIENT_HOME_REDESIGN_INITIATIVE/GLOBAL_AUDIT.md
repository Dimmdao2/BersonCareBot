# GLOBAL_AUDIT — Patient Home Redesign after Phase 9

## 1. Verdict: READY

Инициатива `PATIENT_HOME_REDESIGN_INITIATIVE` готова к release-проходу по проверенному scope.

Проверены `README.md`, `CONTENT_PLAN.md`, `LOG.md`, `AUDIT_PHASE_1.md` … `AUDIT_PHASE_9.md` (включая фактическую Phase 4.5), а также `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md`. Все phase-аудиты имеют verdict `PASS` / `PASS WITH MINOR NOTES`; mandatory fixes отсутствуют. Phase 9 зафиксировала финальный зелёный `pnpm run ci`.

## 2. Release blockers

None.

Не найдено блокеров по обязательным release-критериям:

- runtime-хардкод editorial slug-ов из `CONTENT_PLAN.md` в `apps/webapp/src` и `apps/integrator/src` отсутствует;
- новые настройки инициативы не добавлены в env и живут в `system_settings`;
- ключи `patient_home_daily_practice_target`, `patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time` есть в `ALLOWED_KEYS` и `ADMIN_SCOPE_KEYS`;
- главная пациента строится из `patient_home_blocks` / `patient_home_block_items`;
- DDL инициативы ограничен `0008` … `0011`, без изменений LFK-таблиц;
- `.github/workflows/ci.yml` не изменён относительно `origin/main` и текущего working tree;
- платежи, billing и subscription gating не добавлены.

## 3. Mandatory fixes

None.

Отдельно проверено:

- новые runtime-репозитории инициативы `pgPatientHomeBlocks.ts`, `pgPatientPracticeCompletions.ts`, `pgPatientDailyMood.ts` используют Drizzle ORM и не содержат `getPool`, `pool.query`, `client.query`;
- `pgContentSections.ts` переведён на Drizzle (`getDrizzle`, `content_sections` schema); публичный `ContentSectionsPort` и in-memory порты сохранены;
- legacy patient-home контент (новости / рассылки / цитаты) читается через `buildAppDeps().patientHomeLegacy` (`PatientHomeLegacyContentPort`, Drizzle в `pgPatientHomeLegacyContent.ts`);
- `pgContentPages.ts` переведён на Drizzle и поддерживает `linkedCourseId`;
- новые API routes для practice/mood тонкие: guard → parse/validate → DI service → response;
- Drizzle schema и migrations согласованы для `patient_home_blocks`, `patient_home_block_items`, `content_sections.cover_image_url`, `content_sections.icon_image_url`, `content_pages.linked_course_id`, `patient_practice_completions`, `patient_daily_mood`.

## 4. Minor notes

1. **Resolved (GLOBALFIX cleanup 2026-04-29):** module isolation для legacy patient-home (`repository.ts` / `newsMotivation.ts`) — только типы и pure-хелперы в модуле; Drizzle-реализация в `pgPatientHomeLegacyContent.ts`, in-memory порт для Vitest, DI `buildAppDeps().patientHomeLegacy`.

2. **Resolved (GLOBALFIX cleanup 2026-04-29):** `pgContentSections.ts` переведён на Drizzle.

3. Ручные release screenshots по-прежнему вне автоматического прогона; см. `RELEASE_SNAPSHOTS/README.md`.

4. Real DB gate cleanup выполняется через `pnpm --dir apps/webapp run test:with-db` (smoke + cleanup-targeted suite под `USE_REAL_DATABASE=1`) и на локальной dev/test БД проходит. Full `pnpm run ci` остаётся вне scope этого cleanup-прохода.

## 5. CI/test status

Последний финальный Phase 9 gate:

- `pnpm install --frozen-lockfile` — pass;
- `pnpm run ci` — pass, final exit code `0`;
- integrator tests — `110 passed | 2 skipped`, `756 passed | 6 skipped`;
- webapp tests — `408 passed | 5 skipped`, `2034 passed | 8 skipped`;
- `build` / `build:webapp` — pass;
- `registry-prod-audit` — pass, `no known vulnerabilities`.

Global audit не перезапускал full CI повторно: после финального Phase 9 run текущая работа добавляет только этот audit-документ.

**GLOBALFIX cleanup (2026-04-29):** без повторного `pnpm run ci`; `pnpm test:webapp`, webapp `tsc`/`lint`, узкий real-DB Vitest gate — см. §4 п.4 и `LOG.md` секция «GLOBALFIX cleanup (implementation)».

## 6. Explicit no slug hardcode confirmation

Confirmed.

Проверен runtime scope:

- `apps/webapp/src`
- `apps/integrator/src`

Паттерн editorial slug-ов из `CONTENT_PLAN.md`:

```text
office-work|standing-work|young-mom|breathing-gymnastics|breathing-after-covid|antistress-sleep|deep-relax|face-self-massage|posture-exercises|longevity-gymnastics|home-gym|back-pain-rehab|neck-headache-rehab|tight-shoulders|breathing-foundation|healthy-feet-knees|strong-feet|diastasis-pelvic-floor|healthy-shoulders|beautiful-posture|eye-relax|balance-day|office-neck
```

Result: no matches in runtime `*.ts` / `*.tsx` / `*.js` / `*.jsx`.

Коды `daily_warmup`, `subscription_carousel`, `situations` и остальные `PatientHomeBlockCode` — schema-level коды блоков главной, а не editorial slug-и из `CONTENT_PLAN.md`.

## 7. Explicit no out-of-scope confirmation

Confirmed.

- Нет `home_slot`, `home_sort_order`, `access_type` в `content_sections` schema/migrations.
- Нет новых env vars для integration/config; patient-home настройки находятся в DB-backed `system_settings`.
- Нет изменений LFK-таблиц из запретного списка.
- Нет изменений GitHub CI workflow.
- Нет платежей, billing, checkout, paywall или subscription gating; бейдж `По подписке` остаётся presentation-only.
- Нет отдельного course engine; изменение курса ограничено `content_pages.linked_course_id`.
- Нет FK на polymorphic `patient_home_block_items.target_ref`.
- Нет расширения ролей/guards вне auth-on-drilldown scope Phase 4.5.
- Deploy и push в Phase 9 не выполнялись.

## 8. Global fix result

Mode: `GLOBALFIX` (initial audit) + **`GLOBALFIX cleanup` (2026-04-29)** — закрытие non-mandatory пунктов §4 (legacy isolation, `pgContentSections` Drizzle, документация), **без** full `pnpm run ci` и **без** release snapshots.

**Initial GLOBALFIX (audit-only):** no code fixes required. §2 Release blockers / §3 Mandatory fixes — `None`; обновлены только `LOG.md` и эта секция.

**Cleanup execution (2026-04-29):**

- Patient-home legacy DB: порт `PatientHomeLegacyContentPort`, `createPgPatientHomeLegacyContentPort`, `createInMemoryPatientHomeLegacyContentPort`, `buildAppDeps().patientHomeLegacy`; `repository.ts` / `newsMotivation.ts` без `@/infra/db` / raw SQL.
- `pgContentSections.ts`: только Drizzle + транзакция для `reorderSlugs`.
- Локальная БД (`apps/webapp/.env.dev`, host `127.0.0.1`): `pnpm run migrate`, `db:verify-public-table-count` — pass; `USE_REAL_DATABASE=1 pnpm --dir apps/webapp run test:with-db` — pass.

Validation (cleanup, **не** full monorepo CI):

- `pnpm --dir apps/webapp exec tsc --noEmit` — pass;
- `pnpm --dir apps/webapp lint` — pass;
- `pnpm test:webapp` — pass;
- `pnpm install --frozen-lockfile` — не требовался при неизменённом lockfile.

Deploy and push were not performed.
