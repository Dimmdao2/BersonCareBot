# Приёмка: consolidation + conversation parity — 2026-09-08

## Кандидат

- Проверено на `HEAD=047ac667589ef7167f5abc51616244f37c357554` (`wt/patient-ui-acceptance-20260908`).
  Ветка `wt/patient-ui-system-audit-20260907` отличается от неё ровно одним docs-коммитом
  (`804b3051f`, удаление устаревшего brief-файла) — тот же продуктовый код.
- База сравнения: `feat/doctor-ui-rebuild` (`6102a732d`). Реальный уникальный diff кандидата —
  диапазон `100fe253b..HEAD` (после merge feat в патч-ветку): 28 файлов, +904/-414, только
  `apps/webapp/src/app/app/patient/**`, `apps/webapp/src/shared/ui/patient/**`,
  `apps/webapp/src/app/styles/patient.css` и `apps/webapp/src/modules/messaging/**`.

## Kill-set (owner requirement → что проверялось)

1. Одинаковые controls/cards/modal-chrome — через общие patient primitives/tokens, а не page-local классы.
2. Хардкоженные повторяемые цвета/радиусы/размеры — управляемы из одного места (token/variant), не hex/`!important`.
3. Doctor-отработанное поведение чата/комментариев перенесено пациенту: форма пузырей, нижний composer/send,
   новые сообщения добавляются без замены identity неизменившихся строк.
4. Patient/doctor UI деревья физически изолированы (нет новых cross-zone импортов).
5. Modal/dialog paths, изменённые кандидатом, ведут себя как `PatientModal`/`DoctorModal` контракт (header/body/
   footer, mobile drawer, focus/close/scroll), а не bypass `DialogContent`.

## Проверено и подтверждено

- **Card (S2 из прежнего аудита закрыт).** `shared/ui/patient/primitives/card.tsx` перестал быть реэкспортом:
  теперь настоящий adapter с `variant: default|compact|list|flush`. Все 4 cabinet-файла
  (`CabinetActiveBookings/BookingEntry/InfoLinksCard/PastBookings`) избавились от `ring-0`/`!px-3`/`!py-2`
  оверрайдов и локальных `patientListItemClass` рядом с `<Card>` — теперь просто `<Card>` /
  `<Card variant="list">`. Проверено diff'ом, не отчётом исполнителя.
- **Control chrome (S1 закрыт для journal).** `primitives/input.tsx`/`select.tsx`/`textarea.tsx` получили
  `variant="journal"` поверх одного токенового класса `patientJournalControlClassName` (40px, control-radius,
  control-border/bg, focus ring — все через `--patient-control-*` tokens). `LfkJournalClient.tsx` и
  `SymptomsJournalClient.tsx` заменили длинные локальные `className` на `variant="journal"`.
- **Field label (R7 закрыт для journal).** Новый `PatientField` + `primitives/label.tsx` variant="field"
  (`patientFieldLabelClassName`) заменили 8 дублирующихся `<label><span class="text-xs font-medium uppercase
  tracking-wide">` блоков в двух journal-клиентах на `<PatientField label=… htmlFor=…>`.
- **Confirm modal chrome (дубли устранены).** Новый `PatientConfirmModal` (поверх `PatientModal` +
  `PatientModalFooter`) заменил два independently собранных `footer={<>...</>}` в `ReminderRulesClient.tsx`
  (delete personal reminder, delete block reminder) — один компонент, один визуальный контракт.
- **Portal-safe theme tokens (S3/S4 частично закрыты).** `patient.css`: primary/success/warning/danger/badge/
  segmented/rating/control/action tokens подняты на `:root` (раньше половина жила только в
  `#app-shell-patient`, портальные модалки видели fallback hex). `patientVisual.ts` больше не содержит
  `var(--x,#hex)` fallback-паттернов для primary/success/danger/warning/badge classes — заменены на чистые
  `var(--patient-*)`. Проверено grep'ом по обоим файлам, значения токенов не потерялись (те же hex, просто
  подняты в общий scope и добавлены semantic-именами).
- **Organization surfaces (R-серия).** `PatientOrganizationContext.tsx`/`Relationships.tsx`: literal
  `border-blue-200 bg-blue-50`/`border-amber-200 bg-amber-50`/`rounded-xl border-[...] bg-white` заменены на
  `patientSurfaceInfoClass`/`patientSurfaceWarningClass`/`patientSurfaceNeutralClass`/`patientListItemClass`.
- **Chat/comment behavioral parity (owner ask, ядро проверки).**
  - `modules/messaging/reconcileMessages.ts` — новый shared-модуль; `reconcileMessagesById`/
    `sameSerializedSupportMessage`/`reconcileSupportMessages` — это **буквально вынесенная** логика doctor'а
    (`DoctorChatPanel.tsx` до правки), тело функции не изменилось при переносе (diff подтверждён построчно).
    `DoctorChatPanel.tsx` теперь тоже импортирует общий `reconcileSupportMessages` — не два дрейфующих
    дубля, один источник.
  - `PatientMessagesClient.tsx` и `ProgramItemDiscussionDialog.tsx` используют `reconcileMessagesById` при
    bootstrap/poll/send с `retainMissing` по месту (`false` на bootstrap/replace, `true` на poll и на
    "показать предыдущие"), что не роняет уже подгруженные старые страницы комментариев при обычном опросе.
  - `PatientChatComposer.tsx` — patient-адаптер общего `MessageComposer` (тот же компонент, что использует
    doctor), submit-in-input геометрия, авто-рост textarea — то же поведение, patient-токены снаружи.
  - `ChatView.tsx` — общий каркас группировки/скролла для patient и doctor variant; изменения не сломали
    doctor-ветку (её JSX-путь не тронут, только новый `patient`-путь и общий `reconcileMessages` импорт).
  - Doctor/clinic label — `PatientMessagesClient.tsx` берёт заголовок из
    `organizationContext.organization.title`, **plain text**, с явным комментарием в коде, почему имя врача
    не хардкодится (контракт `/api/patient/messages` не отдаёт assigned doctor). Не выдумано.
  - Regression test **добавлен и реально проверяет то, что раньше было дырой**: старый
    `ProgramItemDiscussionDialog.ui.test.tsx` проверял только обновление read-статуса при опросе; новый тест
    также проверяет, что **новый ответ врача действительно появляется в DOM** после poll-тика — раньше это
    было недоказанным (opll использовал `limit=1`, не подтягивал сообщения). Тест мокает `useMessagePolling`
    напрямую вместо приватного `setInterval(…, 15000)` — устойчивее к рефактору.
- **Изоляция patient/doctor.** Новые/изменённые файлы кандидата не добавили импортов patient-кода в doctor
  дерево и наоборот, кроме намеренного `apps/webapp/src/modules/messaging/**` (shared по архитектуре — не
  patient- и не doctor-only зона) и `reconcileMessages.ts`, который специально вынесен туда как общий модуль
  сообщений. `rg` по diff-файлам на `@/app/app/doctor` из patient-путей и наоборот — 0 совпадений.
- **PatientModal contract на изменённых путях.** `ProgramItemDiscussionDialog`, `PatientMessagesClient`,
  `PatientConfirmModal`, оба confirm-диалога в `ReminderRulesClient` — все идут через `PatientModal`/
  `PatientModalFooter` с `size`/`title`/`titleSubject` (существующий, не новый prop). Ни один не вызывает
  `DialogContent` напрямую. `LfkSessionForm.tsx`/`QuickAddPopup.tsx`/`ProgramItemCompleteDialog.tsx` (F6/R5 из
  прежнего аудита) были мигрированы раньше, в этом diff-диапазоне не менялись повторно — не перепроверялись.

## MUST FIX

### 1. `PatientMessagesClient.tsx:101` — код не проходит `tsc --noEmit`, полный build сломан

`poll()` собирает `fullData.messages` через `Array.isArray(fullData.messages)` guard на строке 100, но
использует его на строке 101 **внутри вложенной стрелочной функции** `setMessages((current) =>
reconcileSupportMessages(current, fullData.messages))`. TypeScript не переносит narrowing через границу
замыкания на property access (`fullData.messages`, не отдельная `const`), поэтому тип остаётся
`SerializedSupportMessage[] | undefined`, а `reconcileSupportMessages` требует `SerializedSupportMessage[]`.

Было раньше (до этого кандидата) `setMessages(fullData.messages)` — прямой вызов в той же области
видимости, где guard применяется, ошибки не было. Регрессию внесла именно правка reconcile-парности
(`git diff 100fe253b..HEAD` подтверждает: строка добавлена этим кандидатом).

Воспроизведено на чистом `tsc --noEmit` (не `.next/dev/types`, не dev-кэш):

```bash
cd apps/webapp && pnpm run typecheck
# src/app/app/patient/messages/PatientMessagesClient.tsx(101,66): error TS2345:
# Argument of type '...[] | undefined' is not assignable to parameter of type '...[]'.
```

Единственная ошибка во всём прогоне (`grep -c "error TS"` → 1). Это блокирует любой build/merge-gate;
не стилевое замечание. Исправление — тривиальное (например, присвоить `const messages = fullData.messages;`
до guard'а или до колбэка), но по брифу продуктовый код не трогается в рамках этой приёмки.

## Прогнанные команды и результаты

```bash
# workspace-пакеты не были собраны в этом worktree — не относится к кандидату, собраны для запуска тестов
(cd packages/db-principal && pnpm run build)
(cd packages/error-tracking && pnpm run build)
(cd packages/operator-db-schema && pnpm run build)
(cd packages/shared-contracts && pnpm run build)
(cd packages/platform-merge && pnpm run build)

cd apps/webapp
pnpm exec vitest run \
  src/app/app/patient/treatment/ProgramItemDiscussionDialog.ui.test.tsx \
  src/app/app/patient/messages src/modules/messaging src/app/app/patient/diary \
  src/app/app/patient/reminders src/app/app/patient/cabinet src/shared/ui/patient
# → 18 test files passed, 52 tests passed

pnpm exec eslint <28 changed files>
# → чисто, без предупреждений

pnpm run typecheck
# → 1 error (см. MUST FIX §1), воспроизводится детерминированно
```

Полный CI не запускался (не требуется по брифу). Live headless-проход не выполнялся отдельно в этой сессии —
геометрия/токены проверены diff'ом против уже live-верифицированного прежнего аудита
(`PATIENT_UI_SYSTEM_AUDIT.md`), новые визуальные значения — те же hex, только консолидированные в tokens/
variants, а не новый визуальный язык.

## Итог

**MUST FIX (1 пункт)** — `apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx:101`, `tsc
--noEmit` падает, что ломает build/merge-gate. Всё остальное в проверенном diff-диапазоне (`100fe253b..HEAD`)
подтверждено как настоящая консолидация (не косметика поверх старых дублей) и настоящий поведенческий перенос
chat/comment parity от доктора, с добавленным поведенческим тестом на ранее недоказанный случай (новое
сообщение при опросе). После исправления MUST FIX-1 и повторного `pnpm run typecheck` — можно принимать.

Worktree чист после коммита артефактов; ничего не запушено.
