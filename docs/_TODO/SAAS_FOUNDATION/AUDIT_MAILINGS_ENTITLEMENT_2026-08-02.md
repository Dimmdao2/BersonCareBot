# Независимый аудит рассылок по тарифной лестнице — 2026-08-02

## Вердикт

**PASS.** Продуктовый коммит `1f1e30d8e` («feat(webapp): gate mailings by entitlement») закрывает исполнимый пункт
6 консолидации: выключение и режим «только чтение» запрещают создание/отправку новой рассылки на серверной
границе, история отправленного остаётся доступна на чтение в любом состоянии тарифа, полный доступ сохраняет
прежнее поведение, слайс использует существующий общий тарифный порт (`resolveMechanicAccess` /
`requireEntitlementForMutationAction` / `getMechanicMutationAvailability`) и не содержит поведения подписок или
новой модели каналов.

Источник требований: `TARIFFS_PAYMENTS_ADMIN_PLAN.md`, исполнимый пункт консолидации 6 («Рассылки»): «Из
`wt/mailings-subscriptions-entitlements` переносится только mailings-срез. Выключение запрещает создание и
отправку новой рассылки; история отправленного остаётся на чтение. Абонементы этим переносом не затрагиваются.»

## Слепой kill-set (выведен из требования до чтения существующих тестов)

1. `disabled`/`read_only` → прямой вызов `executeBroadcastAction` должен отказать ДО `deps.doctorBroadcasts.execute`.
2. `disabled`/`read_only` → прямой вызов `saveDraftAction` (создание/сохранение черновика) должен отказать ДО
   `deps.doctorBroadcastComposer.saveDraft`.
3. `disabled` → `listBroadcastAuditAction` (история отправленного) обязана продолжать отдавать данные.
4. UI-таб «Рассылки» не должен рендерить форму создания/`onCreateFrom` при `mailingsMutationAvailable=false`, но
   обязан показывать журнал.
5. `full_access` (дефолт `mailingsMutationAvailable=true`) не должен менять существующее поведение формы/create-from.
6. Диапазон изменений не должен трогать `subscriptions`, миграции, Track D или заводить новый механизм проверки
   помимо уже существующего общего тарифного порта.

Все шесть пунктов покрыты и подтверждены — см. «Проверки» ниже.

## Проверка по коду

- `apps/webapp/src/app/app/doctor/broadcasts/actions.ts`: `executeBroadcastAction` и `saveDraftAction` вызывают
  `requireEntitlementForMutationAction(workspace, 'mailings')` и бросают понятную ошибку до обращения к
  `deps.doctorBroadcasts.execute` / `deps.doctorBroadcastComposer.saveDraft` — старый путь через
  `reserveAudienceGrowth` (проверка только при подсчёте аудитории) удалён, проверка теперь безусловна на входе.
  `listBroadcastAuditAction` (история) и `loadDraftAction`/`previewBroadcastAction` (предпросмотр без записи)
  остаются негейтированными — корректно для «истории на чтение».
- `apps/webapp/src/app/app/doctor/communications/page.tsx`: страница коммуникаций НЕ вызывает
  `requireEntitlementForPage`/`notFound()` для `mailings` целиком (другие табы не зависят от состояния рассылок),
  а прокидывает `getMechanicMutationAvailability(workspace, 'mailings').available` в shell как булев флаг.
- `apps/webapp/src/app/app/doctor/communications/tabs/BroadcastsTab.tsx`: при `mailingsMutationAvailable=false`
  рендерится только правая панель (журнал), левая панель (форма новой рассылки) не монтируется вовсе;
  `onCreateFrom` в детали записи передаётся `undefined` вместо `createFromEntry`.
- `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — редирект на `/app/doctor/communications?tab=broadcasts`,
  второго входа в форму в обход таба нет.
- `apps/webapp/src/app-layer/guards/requireEntitlement.ts` не менялся этим коммитом — общий тарифный порт
  (`checkEntitlement`/`resolveMechanicAccess`/`entitlementMutationRefusalMessage`) переиспользован как есть, новой
  сущности проверки не заведено.
- `git diff --name-only 9b66b5814..1f1e30d8e` (родитель `wt/mailings-entitlement` до слияния фикс-докстрок) —
  8 файлов, все в `broadcasts/`/`communications/`; ни `subscriptions`, ни `migrations/*.sql`, ни Track D
  (`reminder_rules`/scheduler) не затронуты; `grep -rn subscription` по изменённым файлам — пусто.
- `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts` уже содержал записи `mailings.execute` и
  `mailings.draft.save` до этого коммита (не изменён) — коммит не меняет и не обходит существующий реестр
  защищённых точек.

## Проверки (команды и результат)

- Существующие пакеты собраны как предпосылка (отсутствовали в рабочем дереве до аудита, не связано с этим
  коммитом): `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/error-tracking run build && pnpm --dir packages/platform-merge run build` → все четыре успешно.
- Точечные тесты слайса: `cd apps/webapp && npx vitest run
  src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts
  src/app/app/doctor/communications/tabs/BroadcastsTab.entitlement.ui.test.tsx` →
  **2 файла / 6 тестов PASS**. Покрывают kill-set пункты 1–4.
- Контроль чувствительности (не ложнозелёный тест): при удалении вызова
  `requireEntitlementForMutationAction` из `executeBroadcastAction` тест
  `refuses a direct disabled-tariff mailing send before it reaches broadcast delivery` красный (проверено чтением
  теста — он утверждает и текст отказа, и `expect(execute).not.toHaveBeenCalled()`, не проходит молча при
  отсутствии гейта).
- Scoped ESLint по изменённым файлам (8 продуктовых/тестовых файлов коммита): `npx eslint <8 файлов>` → без
  предупреждений и ошибок.
- Webapp typecheck (`npx tsc --noEmit` из `apps/webapp`) — репозиторий даёт ~600 строк ошибок, ни одна не
  указывает на изменённые этим коммитом файлы (`broadcasts/BroadcastForm.tsx`, `broadcasts/actions.ts`,
  `communications/DoctorCommunicationsShell.tsx`, `communications/communicationsTabRegistry.ts`,
  `communications/page.tsx`, `communications/tabs/BroadcastsTab.tsx`); ошибки — repo-wide preexisting drift
  (`drizzle-orm`/`@aws-sdk/s3-request-presigner` типы, `pgTreatmentProgram*`, `pgTestSets.ts` и т.д.), не связаны с
  entitlement-слайсом рассылок и не введены этим коммитом.
- Ранее выявленные и вне скоупа: `src/app/api/tariffMechanics.route.test.ts` (CMS/warmups) и
  `src/app/api/patient/courses/route.route.test.ts` — 2 теста красные из-за формата сообщения отказа; не
  относятся к изменённым файлам этого коммита (courses/CMS), воспроизводятся независимо от diff.
- `pnpm --dir apps/webapp typecheck` (обёртка `tsc --noEmit`) — та же repo-wide картина, что выше; отдельно не
  повторялась (см. Strong reuse rule).
- Полный CI не запускался — не merge/deploy/integration checkpoint, репо-уровневый риск не задет (правило §10).

## Итог по человеческому пути приёмки

- История отправленного читается в любом состоянии тарифа — `listBroadcastAuditAction` негейтирован,
  UI-журнал рендерится независимо от `mailingsMutationAvailable`.
- `disabled` и `read_only` запрещают создание/сохранение черновика и отправку новой рассылки на серверной границе
  (Server Action бросает ошибку до вызова доменного порта).
- UI не предлагает форму новой рассылки и `onCreateFrom` при запрете; предлагает при полном доступе — как раньше.
- Слайс использует только существующий общий тарифный порт; поведения подписок или нового канала нет.

Продуктовый код в аудите не исправлялся. Коммит в этот отчёт включает только настоящий отчёт (продуктовые и
тестовые файлы коммита `1f1e30d8e` аудитом не менялись).
