# Аудит выбора тарифа клиникой — 20.08.2026

Аудируемый коммит: `37b0a73a637f11268befe511b3b4e6952c88bd9e` (`fix(billing): expose first tariff selection`).

ВЕРДИКТ: PASS

## 1. Пустой выбор виден

Команда запущена напрямую, без пайпа:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/settings/PayTariffButton.ui.test.tsx src/app/app/settings/BillingSection.ui.test.tsx
```

Вывод:

```text
RUN  v4.1.10 /home/dev/dev-projects/bcb-wt-appowner-20260820/apps/webapp

Test Files  2 passed (2)
     Tests  10 passed (10)
  Duration  1.27s (transform 108ms, setup 284ms, import 724ms, tests 501ms, environment 726ms)

EXIT_CODE=0
```

Перед итогом Vitest также пять раз напечатал одинаковое предупреждение Vite о `__dirname` в
`vitest.config.ts:9:25`; на результат тестов оно не повлияло.

Итог пункта: PASS — при `currentTariffId: null` триггер содержит `Выберите тариф`, а кнопка перехода
остаётся отключённой до выбора.

## 2. Тест ловит возвращённый дефект

В `PayTariffButton.tsx` временно восстановлен прежний продуктовый код: импорт `SelectValue` удалён, а
триггер возвращён к самозакрывающейся форме с
`displayLabel={tariffChange.choices.find((choice) => choice.id === selectedTariffId)?.name}`.

На этой временной поломке запущена та же команда, напрямую и без пайпа:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/settings/PayTariffButton.ui.test.tsx src/app/app/settings/BillingSection.ui.test.tsx
```

Вывод:

```text
FAIL  |ui| src/app/app/settings/PayTariffButton.ui.test.tsx > PayTariffButton > показывает выбор тарифа до первого выбора
Error: expect(element).toHaveTextContent()

Expected element to have text content:
  Выберите тариф
Received:
  ▼
 ❯ src/app/app/settings/PayTariffButton.ui.test.tsx:30:28

Test Files  1 failed | 1 passed (2)
     Tests  1 failed | 9 passed (10)
  Duration  1.23s (transform 80ms, setup 301ms, import 656ms, tests 413ms, environment 738ms)

EXIT_CODE=1
```

Временная поломка отменена обязательной командой:

```bash
git checkout -- apps/webapp/src/app/app/settings/PayTariffButton.tsx && git status --porcelain
```

Вывод:

```text
(no output)
EXIT_CODE=0
```

Итог пункта: PASS — тест краснеет именно на исходном пустом триггере; после `git checkout --` дерево
снова чистое.

## 3. Выбранное значение показывает имя тарифа

Команда:

```bash
nl -ba apps/webapp/src/shared/ui/primitives/select.tsx | sed -n '39,83p;96,103p;125,140p'
```

Существенный вывод:

```text
46 function collectItemLabels(children: React.ReactNode, out: DerivedItem[] = []): DerivedItem[] {
53   if (child.type === SelectItem && props.value !== undefined) {
54     out.push({ value: props.value, label: props.children });
66 const derivedItems = React.useMemo(() => {
68   const collected = collectItemLabels(children);
71   return collected.length > 0
72     ? (collected as SelectPrimitive.Root.Props<Value, Multiple>['items'])
77 <SelectPrimitive.Root
79   items={derivedItems}
96 function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
98   <SelectPrimitive.Value
135  {displayLabel !== undefined ? <SelectValue>{displayLabel}</SelectValue> : children}
```

`PayTariffButton` рендерит `SelectItem value={choice.id}` с `children={choice.name}`. Общий примитив
собирает эти пары в `items` корневого Base UI Select; поэтому после выбора `<SelectValue>` резолвит id
в `choice.name`. Пустой выбор показывает заданный placeholder, выбранный — имя тарифа, не id и не
placeholder.

Итог пункта: PASS.

## 4. Текст изменён локально

Все production-потребители общей функции найдены сначала через `code-search`, затем точным поиском.

```bash
node /home/dev/brain/tools/code-search.mjs "describeCommercialAccessState consumers calls platform administrator" --repo bcb -k 20
```

Существенный вывод поиска:

```text
bcb/apps/webapp/src/app/app/settings/BillingSection.tsx:41-90
bcb/apps/webapp/src/app/app/settings/page.tsx:441-453
bcb/apps/webapp/src/app/app/settings/billingCommercialState.ts:1-44
```

Точный поиск:

```bash
rg -n --glob '!**/*.test.*' "describeCommercialAccessState" apps/webapp/src
```

Вывод:

```text
apps/webapp/src/app/app/settings/BillingSection.tsx:44:  /** Human sentence from `describeCommercialAccessState` — never the raw enum. */
apps/webapp/src/app/app/settings/page.tsx:34:import { describeCommercialAccessState } from './billingCommercialState';
apps/webapp/src/app/app/settings/page.tsx:444:        commercialStateLabel={describeCommercialAccessState(snapshot.access)}
apps/webapp/src/app/app/settings/billingCommercialState.ts:20:export function describeCommercialAccessState(access: EffectiveOrgCommercialAccess): string {
```

Проверка общего файла вместе с security-файлами:

```bash
git diff --exit-code 37b0a73a6^ 37b0a73a6 -- apps/webapp/src/app/app/settings/billingCommercialState.ts apps/webapp/src/app-layer/guards/cabinetAccessGate.ts apps/webapp/src/app-layer/guards/requireRole.ts
```

Вывод:

```text
(no output)
EXIT_CODE=0
```

Итог пункта: PASS — новая фраза находится только в локальной ветке `BillingSection`; общая функция не
изменена. Платформенный администратор не является потребителем этой функции и другой текст из-за коммита
не получил.

## 5. Дверь доступа не ослаблена

Команда:

```bash
git diff --name-only 37b0a73a6^ 37b0a73a6
```

Вывод:

```text
apps/webapp/src/app/app/settings/BillingSection.tsx
apps/webapp/src/app/app/settings/BillingSection.ui.test.tsx
apps/webapp/src/app/app/settings/PayTariffButton.tsx
apps/webapp/src/app/app/settings/PayTariffButton.ui.test.tsx
docs/REPORTS/CLINIC_TARIFF_PICKER_FIX_2026-08-20.md
EXIT_CODE=0
```

Точная проверка `cabinetAccessGate.ts` и `requireRole.ts` приведена в пункте 4: diff пуст, exit 0.
Полный список изменённых файлов также не содержит entitlement-, permission-, role- или иной резолюции
прав.

Итог пункта: PASS — исправление показывает путь выбора/оплаты, но не меняет условие доступа к кабинету.

## 6. Lint webapp

Команда запущена напрямую, без пайпа; итоговый код получен из foreground PTY-сессии:

```bash
pnpm --dir apps/webapp run lint
```

Вывод:

```text
> @bersoncare/webapp@0.1.0 lint /home/dev/dev-projects/bcb-wt-appowner-20260820/apps/webapp
> eslint . && node ../../scripts/check-no-new-raw-sql.mjs && node ../../scripts/check-webapp-infra-import-boundary.mjs && node ../../scripts/check-webapp-infra-import-boundary.mjs --self-test && node ../../scripts/check-media-delivery-chokepoint.mjs && node ../../scripts/check-transaction-quota-port-boundary.mjs && node ../../scripts/check-transaction-quota-port-boundary.mjs --self-test && node ../../scripts/check-migration-privileges.mjs && node ../../scripts/check-migration-privileges.mjs --self-test && node ../../scripts/check-seat-overage-single-door.mjs && node ../../scripts/check-seat-overage-single-door.mjs --self-test && bash scripts/check-legacy-migrations-frozen.sh && bash scripts/check-drizzle-migration-order.sh && node scripts/check-media-upload-door.mjs && node scripts/check-media-upload-door.mjs --self-test

check-no-new-raw-sql: OK (integrator low-level DB port: 4; integrator test-only PostgreSQL harness: 1; integrator migration/deploy SQL executor: 1; webapp low-level DB port: 5; package:db-principal low-level DB port: 2; package:platform-merge low-level DB port: 1; production debt: 0)
check-webapp-infra-import-boundary: OK
check-webapp-infra-import-boundary self-test: 7 bypass forms rejected; canonical port consumer accepted
check-transaction-quota-port-boundary: OK
check-transaction-quota-port-boundary self-test: 3 bypass forms rejected
check-transaction-quota-port-boundary self-test: canonical port writer accepted
check-migration-privileges: OK (9 migration files)
check-migration-privileges: self-test OK (7 red fixtures, 1 green fixture)
check-seat-overage-single-door: OK
check-seat-overage-single-door self-test: 5 bypass forms rejected
check-seat-overage-single-door self-test: canonical door writer accepted
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
media upload door: OK
media upload door self-test: OK (all structural bypass fixtures went red)
media upload door: OK

EXIT_CODE=0
```

Итог пункта: PASS.

Полный CI не запускался по прямому ограничению brief и `AGENTS.md` §9. TEST, PROD, базы, deploy,
права и политики не затрагивались. Замечаний вне предмета аудита нет.
