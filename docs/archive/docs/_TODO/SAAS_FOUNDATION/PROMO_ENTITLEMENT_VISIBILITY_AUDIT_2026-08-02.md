# Одноразовый аудит тарифной видимости промо

Кандидат: `0108f250d` (`wt/promo-entitlement-visibility`). Authority:
`TARIFFS_PAYMENTS_ADMIN_PLAN.md` §4.9 и owner-уточнение 2026-08-02 о допустимом временном empty-state
консультации/онлайн-анкеты.

## Классификация до чтения тестов кандидата

- P1–P6 ниже — повторяемое продуктовое поведение: проверяется поведенческим тестом и одноразовой fault injection.
- Соответствие diff заявленному scope, отсутствие новых сущностей и сохранение принятого owner-исключения для
  empty-state — разовое состояние: проверяется взглядом на production diff; тест на текст/форму исходника не нужен.
- Архитектурные границы и отсутствие обходного direct route — взгляд на все достижимые поверхности плюс
  поведенческий тест прямого входа.

## Blind kill-set

Составлен до чтения тестов кандидата.

- **P1 — disabled, кабинет клиники:** настройка промо или действие её изменения остаются видимыми специалисту.
- **P2 — disabled, пациент:** промо остаётся в списке программ либо создаётся/материализуется для пациента.
- **P3 — disabled, прямой вход:** legacy/deep link, detail или item промо открывается в обход скрытого списка.
- **P4 — disabled, обычная программа:** запрет промо ошибочно скрывает или блокирует обычную врачебную программу.
- **P5 — read_only:** существующий промо-инстанс либо статистика исчезают, или mutation save/refresh проходит.
- **P6 — enabled:** разрешённая материализация промо перестаёт создавать/возвращать пациентскую программу.

## Результат

**PASS. Реальных findings нет.** Принятый владельцем временный empty-state консультации/онлайн-анкеты не
изменён и не переоткрывался.

- **P1 → PASS.** `doctor/layout.tsx` получает общую `promo`-видимость, меню скрывает promo-entry; прямой doctor GET
  использует read-gate, страница — page-gate. Инъекция инверсии menu visibility покраснила
  `doctorNavLinks.unit.test.ts`; обход GET read-gate покраснил `tariffMechanics.route.test.ts`.
- **P2 → PASS.** При `visible: false` обе patient entry-функции отбрасывают сохранённые promo-инстансы и не вызывают
  materialization. Инъекция удаления фильтра покраснила тест существующего promo; инъекция инверсии
  `canMaterialize` покраснила запрет создания.
- **P3 → PASS.** Добавленный acceptance-тест выполняет четыре direct entry: два legacy promo URL и materialized
  detail/item. Все отвечают как скрытая поверхность; инъекция обхода detail-gate покраснила тест.
- **P4 → PASS.** Фильтр касается только `assignmentSource === 'promo'`; обычная `doctor`-программа остаётся active
  entry и её detail page не вызывает promo-gate. Оба поведения покрыты тестами.
- **P5 → PASS.** `read_only` имеет `visible: true`, `canMaterialize: false`: существующий promo и doctor statistics
  читаются, mutation controls скрыты, patient/doctor writes остаются за mutation-gate. Инъекция инверсии
  `canMutate` покраснила UI-тест; обход patient mutation-gate покраснил route-тест.
- **P6 → PASS.** `full_access` сохраняет ensure/materialization. Инъекция инверсии `canMaterialize` покраснила
  full-access тест.

### Проверки

- `pnpm --dir apps/webapp exec vitest run --project=fast
  src/modules/treatment-program/patientTreatmentProgramEntry.test.ts` → 5 passed.
- `pnpm --dir apps/webapp exec vitest run --project=route src/app/api/tariffMechanics.route.test.ts` → 21 passed.
- `pnpm --dir apps/webapp exec vitest run --project=ui
  src/app/api/tariffMechanicsRefusals.ui.test.tsx` → 11 passed.
- `pnpm --dir apps/webapp exec vitest run --project=unit
  src/shared/ui/doctor/doctorNavLinks.unit.test.ts` → 4 passed.
- `pnpm --dir apps/webapp exec vitest run --project=ui
  src/app/app/patient/treatment/promoVisibility.audit.ui.test.tsx` → 3 passed.
- `pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp typecheck` → exit 0. Отдельный первый
  `pnpm --dir apps/webapp typecheck` обнаружил только отсутствующий локальный `packages/error-tracking/dist` в этом
  worktree; после штатной сборки workspace-пакета тот же webapp typecheck зелёный.
- Scoped ESLint всех изменённых production/test путей → exit 0.
- `git diff --check` → без вывода.

Все временные fault injections откатились; постоянны только этот отчёт и один acceptance-файл прямых поверхностей.
