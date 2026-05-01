# AUDIT_PHASE_3

## 1. Verdict: PASS WITH MINOR NOTES

Phase 3 implementation matches the initiative README (Phase 3 section) and the stated constraints:

- **`/app/patient/page.tsx`:** renders [`PatientHomeToday`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) inside `AppShell` title «Сегодня» + [`LegalFooterLinks`](apps/webapp/src/shared/ui/LegalFooterLinks.tsx); uses [`patientRscPersonalDataGate`](apps/webapp/src/app-layer/guards/requireRole.ts) and [`resolvePatientCanViewAuthOnlyContent`](apps/webapp/src/modules/platform-access/resolvePatientCanViewAuthOnlyContent.ts) (see §3).
- **Runtime source for blocks:** [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) calls `deps.patientHomeBlocks.listBlocksWithItems()`; порядок и видимость блоков — [`filterAndSortPatientHomeBlocks`](apps/webapp/src/modules/patient-home/patientHomeBlockPolicy.ts) поверх `patient_home_blocks` / `patient_home_block_items`. Контент ситуаций / карусели / SOS / курсов — из items через [`patientHomeResolvers.ts`](apps/webapp/src/modules/patient-home/patientHomeResolvers.ts) + порты CMS/курсов.
- **Разминка дня:** один вызов [`getPatientHomeTodayConfig`](apps/webapp/src/modules/patient-home/todayConfig.ts) (Phase 2), первый видимый `content_page` в блоке `daily_warmup`, учёт видимости блока в `todayConfig`.
- **Progress / Mood:** [`PatientHomeProgressBlock.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx) и [`PatientHomeMoodCheckin.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx) — статические заглушки с комментариями Phase 5 / Phase 6; поиск по `apps/webapp/db` на `patient_practice_completions` / `patient_daily_mood`: **совпадений нет** (новые таблицы не добавлялись).
- **Старые компоненты:** поиск по `apps/webapp` на `PatientMiniAppPatientHome`, `PatientHomeBrowserHero`, `PatientHomeExtraBlocks`: **совпадений нет**; файлы удалены (см. [`LOG.md`](docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md) Phase 3).
- **`/app/patient/sections/[slug]`:** в рамках Phase 3 не менялись (проверка: отсутствие затрагивания вне scope аудита; явных импортов новой главной в этих страницах не требовалось).

## 2. Mandatory fixes

None.

## 3. Minor notes

1. **Неиспользуемый импорт в `page.tsx`:** в [`apps/webapp/src/app/app/patient/page.tsx`](apps/webapp/src/app/app/patient/page.tsx) объявлен `buildAppDeps`, но не вызывается — стоит удалить импорт для гигиены (ESLint в текущей конфигурации не ругается).

2. **«Гость» vs layout:** [`patient/layout.tsx`](apps/webapp/src/app/app/patient/layout.tsx) редиректит отсутствие сессии на `/app`; [`page.tsx`](apps/webapp/src/app/app/patient/page.tsx) дублирует страховочный редирект. Режим README «гость без персональных данных» на практике для главной совпадает с **`personalTierOk === false`** (`patientRscPersonalDataGate !== "allow"`, в т.ч. onboarding без tier **patient**): персональные блоки отфильтрованы в [`patientHomeBlockPolicy.ts`](apps/webapp/src/modules/patient-home/patientHomeBlockPolicy.ts); имя в приветствии не подставляется без `personalTierOk`.

3. **Покрытие тестами vs README §3.5:** README предлагал snapshot/`PatientHomeToday.test.tsx` для трёх состояний сессии; в репозитории есть политика + resolvers + RTL по дочерним компонентам, **без** интеграционного теста всего `PatientHomeToday` — приемлемо для Phase 3, при желании усилить в follow-up.

4. **Напоминание:** выбор правила — упрощённый [`pickNextReminderRuleForHome`](apps/webapp/src/modules/patient-home/patientHomeReminderPick.ts) (README §9.1); ожидаемо для Phase 3.

## 4. Tests reviewed/run

### Reviewed test files (Phase 3 scope)

- `apps/webapp/src/modules/patient-home/patientHomeBlockPolicy.test.ts`
- `apps/webapp/src/modules/patient-home/patientHomeReminderPick.test.ts`
- `apps/webapp/src/modules/patient-home/patientHomeResolvers.test.ts`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.test.tsx`
- `apps/webapp/src/modules/patient-home/todayConfig.test.ts` (регрессия разминки)

### Executed during audit

- Command:

  `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeBlockPolicy.test.ts src/modules/patient-home/patientHomeReminderPick.test.ts src/modules/patient-home/patientHomeResolvers.test.ts src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/modules/patient-home/todayConfig.test.ts`

- Result:

  - `Test Files 8 passed (8)`
  - `Tests 26 passed (26)`

*(Полный `pnpm test:webapp` не перезапускался в этом аудите; в [`LOG.md`](docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md) Phase 3 зафиксирован зелёный прогон.)*

## 5. Explicit confirmation — no `CONTENT_PLAN.md` slug hardcode

- Поиск по `apps/webapp/src` по иллюстративным slug из [`CONTENT_PLAN.md`](docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md) (`office-work`, `office-neck`, `face-self-massage`, `standing-work`, `young-mom`, `breathing-gymnastics`, `antistress-sleep`, `posture-exercises`, `longevity-gymnastics`, `home-gym`, `breathing-after-covid`, `deep-relax`, `beautiful-posture`, `tight-shoulders`, `strong-feet`, `eye-relax`, `balance-day`, `back-pain-rehab`, `neck-headache-rehab`, `healthy-feet-knees`, `diastasis-pelvic-floor`, `healthy-shoulders`): **совпадений нет**.

**Conclusion:** в `apps/webapp/src` для Phase 3 не обнаружено runtime-хардкода редакционных slug-ов из `CONTENT_PLAN.md`; блоковые коды (`daily_warmup`, `booking`, …) — канон из [`ports.ts`](apps/webapp/src/modules/patient-home/ports.ts) / seed, не из контент-плана.
