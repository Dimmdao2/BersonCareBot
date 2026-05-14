# LOG — Patient shell `md` breakpoint

## 2026-05-10

### Сделано

- `AppShell` (`variant="patient"` / `patient-wide`): `lg:max-w-[min(1180px,calc(100vw-2rem))]` → `md:max-w-[…]`; JSDoc обновлён.
- `PatientTopNav`: `max-lg`/`lg` для fixed/sticky и mobile/desktop веток → `max-md`/`md`.
- `PatientRouteLoadingShell` (`PatientLoadingShimmer.tsx`): синхронизация ширины с `AppShell`.
- `PatientHomeTodayLayout`: сетка `md:grid-cols-12`, колонки/order на блоках; атрибуты `data-lg-*` → `data-md-*`; тесты обновлены.
- `patientHomeCardStyles.ts` и home-компоненты: пары `max-lg`/`lg`, завязанные на широкий shell и дашборд, переведены на `max-md`/`md`; точечные правки в TSX (carousel, progress, reminder, SOS, booking, greeting, situations heading, courses heading, useful post, daily warmup и др.).
- `PatientHomeAddItemDialog.test.tsx`: ожидание для блока `situations` приведено к фактическому `allowedTargetTypesForBlock` (только раздел CMS); убраны лишние импорты.

### Проверки

- `pnpm exec vitest run` (точечно) + `pnpm run ci:resume:after-test` после фикса теста — зелёный хвост от webapp tests через audit.

### Сознательно / риски

- В `patientHomeCardStyles.ts` остаются отдельные утилиты с префиксом **`lg:`** без пары `max-lg` (например трёхступенчатые высоты слотов `md` + `lg`) — не трогались без явной привязки к порогу shell.
- Ручной smoke по чек-листу плана (360px / 768px / 1024px / 1280px) — выполнить при приёмке UI.

## 2026-05-10 — аудит: хром карточек и `patientVisual`

### Сделано

- **Аудит:** на интервале 768–1023px после первого этапа часть «десктопного» оформления карточек главной оставалась на **`lg:`** при уже широком shell — визуальная рассинхронизация планшета.
- **`patientHomeCardStyles.ts`:** для базовой/plan/success/warning/danger/compact/useful post shell, gradient warm, ведущих иконок — переключение radius/shadow/padding с **`lg` на `md`** (ниже `md` без изменений: те же базовые классы и `sm`).
- **`patientVisual.ts`:** единый порог **`md`** для `patientCardSurfaceTokens`, `patientSemanticSurfaceCardChrome`, `patientCardClass`, list/compact surfaces, коллапсов целей этапа, `patientInnerPageStackClass`, `patientInnerCardGridClass`, `patientPageSectionGapClass`, inner-hero типографики (`patientInnerHeroTitleTypographyClass`, `patientProgramItemHeroTitleClass`, список программ), `patientHeroWarmupDoneCtaClass`, `patientModalPortalPrimaryCtaClass`; hero booking chrome уже был на `md` с первого этапа.
- **`patientHomeTodayLayoutOrder.ts`:** комментарий (`lg:order` → `md:order`).
- **Документация:** обновлены [`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) §1a и [`README.md`](README.md) инициативы.

### Проверки

- `pnpm exec vitest run` в `apps/webapp` — полный прогон, зелёный.

### Сознательно

- В `patientHomeCardStyles.ts` по-прежнему есть **вторая ступень** по высотам ряда слотов (`lg:min-h-*`, `lg:h-*` и т.п.) — вертикальная сетка дашборда, не порог shell.
