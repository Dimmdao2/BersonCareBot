# Независимый аудит сведения понижения тарифа — 02.08.2026

## Вердикт

**FAIL.** Ветка `wt/tariff-downgrade` (`7e2e3aca1`) не готова к сведению без одного fixer-прохода.
Проверка выполнена против актуального `feat/doctor-ui-rebuild` `81270b0aa`; четыре текстовых merge-конфликта
(`buildAppDeps.ts`, billing route + test, `saas-billing/service.ts`) сами по себе finding не являются, но fixer
должен переносить поведение в актуальные версии этих файлов.

## Kill-set

1. Более дешёвый тариф не применяется внутри уже оплаченного периода.
2. Перед понижением лишние места специалистов, филиалы и пациенты блокируют переход.
3. Уже занятый объём файлов переход не блокирует; ограничивается только дальнейший рост.
4. Ограничения проверяются не только при постановке понижения, но и перед фактическим выставлением счёта/переходом
   на границе периода, потому что использование клиники может вырасти после постановки.
5. Отмена pending-понижения сохраняет текущий оплаченный период и пишет audit trail.
6. Повышение не получает выдуманной денежной формулы.
7. Активация pending-тарифа на оплаченной границе пишет audit trail.

## MUST FIX 1 — направление смены тарифа определяется не ценой

Достижимый сценарий: текущий тариф стоит `20 000`, целевой — `10 000`, но набор механик и лимитов совпадает.
`resolveOwnTariffTransition` возвращает `appliesNextPeriod: false`; clinic billing трактует это как повышение и
отказывает с `saas_billing_upgrade_charge_policy_unresolved`. Клиника не может запланировать реальное понижение на
следующий оплачиваемый период.

Причина: `evaluateTariffTransition` выводит направление только из уменьшения seats/quotas/mechanics и не учитывает
`priceMinor`/платёжный период тарифа.

Падающее доказательство: `apps/webapp/src/modules/org-entitlements/service.test.ts`, тест
`classifies a cheaper tariff as a next-period downgrade even when its entitlement shape is unchanged`.

## MUST FIX 2 — фоновое продление обходит повторную проверку лимитов

Достижимый сценарий: клиника поставила понижение, пока укладывалась в новый тариф, затем до конца текущего периода
добавила пациентов/филиал/место специалиста. Ручной checkout повторно вызывает transition guard, но фоновый
`runDueSaasBillingRenewals` сразу создаёт renewal invoice по `pendingTariffId` и вызывает платёжного провайдера.
В результате клинику можно списать и перевести на меньший тариф при превышении обязательных лимитов.

Падающее доказательство: `apps/webapp/src/modules/saas-billing/service.test.ts`, тест
`rechecks a pending downgrade before the background renewal creates its invoice`.

## Что подтверждено

- существующая постановка понижения сохраняет границы оплаченного периода и не создаёт payment intent сразу;
- места специалистов, филиалы и пациенты возвращаются структурированным списком блокировок при политике `block`;
- объём уже сохранённых файлов не входит в self-service blockers;
- ручная отмена очищает `pendingTariffId`, сохраняет period snapshot и пишет `saas_tariff_change_cancelled`;
- неопределённая формула повышения не изобретена: такой self-service путь получает
  `saas_billing_upgrade_charge_policy_unresolved`;
- оплата pending invoice на границе пишет `saas_tariff_change_activated`.

## Команды и фактический результат

```text
git fetch origin feat/doctor-ui-rebuild
```

Актуальный интеграционный ref: `81270b0aa`.

```text
git merge-tree --write-tree origin/feat/doctor-ui-rebuild HEAD
```

Обнаружены четыре текстовых merge-конфликта, перечисленные в вердикте; рабочее дерево не изменено.

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/org-entitlements/service.test.ts src/modules/saas-billing/service.test.ts"
```

Результат: `2 failed | 74 passed`; оба падения — acceptance-тесты из этого аудита, по одному на каждый finding.

