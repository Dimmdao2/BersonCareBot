## ИТОГ

Построчная разметка внесена в [SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md:318).

| Вердикт | Количество |
|---|---:|
| ✅ СДЕЛАНО | 2 |
| ⛔ ОТМЕНЕНО | 6 |
| ⏳ ОТЛОЖЕНО — магазин | 11 |
| ➡️ ЖИВО | 64 |
| **Всего** | **83** |

Из 64 живых пунктов 53 не имеют достаточного пункта в §5a.

Проверено: 83 добавления, 0 удалений; у каждого исходного чекбокса ровно один вердикт; `git diff --check` прошёл. Коммит: `08ac9cc87`. Push/merge не выполнялись. Остальные файлы не изменял; существующие изменения env-файлов оставлены нетронутыми.

### Полный список «в §5a пункта НЕТ, нужен»

#### C4D / библиотеки

1. `Code-search-first inventory: для exercise/template/media list, direct ID, count, search, picker, assignment и playback зафиксировать ownership source и current tenant guard; неизвестный path остаётся gap, не становится global.`  
   Причина: ownership/source inventory существующего контента шире реестра тарифных write-path.

2. `Режим own_only показывает organization только её exercises/templates/media и не читает owner-clinic content другой organization ни через list, ни через direct ID.`  
   Причина: tenant isolation own-only библиотеки не покрыт механикой рубильника.

3. `Режим platform_base добавляет отдельную platform library, создаваемую с нуля global admin. Existing owner-clinic exercises не мигрируют и не публикуются автоматически.`  
   Причина: отдельная base library без миграции clinic-owned контента не описана.

4. `Global admin управляет composition platform base; тариф может включать base-library entitlement без purchase, grant или store surface.`  
   Причина: это независимая от магазина base-library composition, а §5a содержит только рубильники каталога/пакетов.

5. `Publication clinic→platform отсутствует до отдельного workflow/licensing/moderation owner decision.`  
   Причина: запрет автоматической публикации clinic-owned контента не зафиксирован.

6. `Synthetic org A/B acceptance закрывает [redacted-token] negatives, owner-only content privacy, base visibility и отсутствие copied rows/object keys.`  
   Причина: A/B ownership, direct-ID/media и no-copy acceptance для библиотек там отсутствуют.

7. `Desktop/mobile acceptance показывает own-only и own+base состояния; future store отсутствует, а не рендерится пустым/сломавшимся экраном.`  
   Причина: визуальная приёмка own-only/own+base не входит в TEST-проверку лестницы.

#### SaaS billing

8. `Создать отдельный modules/saas-billing domain с ports/service/typed state machine; он переиспользует PaymentProviderPort через DI и не импортирует infra registry напрямую.`  
   Причина: SaaS billing domain/DI contract не является механикой или лимитом.

9. `Добавить минимальные org-owned records: billing account, source-aware tariff subscription, invoice/order и normalized provider event. Invoice фиксирует tariff, amount/currency/period snapshot; webhook event имеет provider event ID и idempotency, но не хранит patient data.`  
   Причина: org-owned billing ledger и idempotent provider events в §5a не спланированы.

10. `Перенести существующие manual tariff_id assignments в subscription/access rows с source=manual; переключить resolver на один access contract и проверять, что compatibility projection совпадает. Mismatch checker даёт non-zero.`  
    Причина: source-aware subscription rows и compatibility mismatch checker отсутствуют.

11. `Добавить global DB setting saas_billing_payment_provider в ALLOWED_KEYS, Settings UI, redaction/secret-retain service и sanctioned accessor; запись идёт через updateSetting с обычным mirror contract. Он не читает и не перезаписывает per-org booking_payment_providers.`  
    Причина: выбор и безопасное хранение SaaS PSP не покрыты механиками.

12. `Сохранить и вернуть provider checkout URL безопасному clinic_admin UI. Return/status page сверяет invoice/order из server-derived org и никогда не принимает сумму, tariff или target org от клиента как source of truth.`  
    Причина: payer checkout/return security contract отсутствует.

13. `Добавить SaaS webhook route под bootstrap principal: load global provider config → verify signature/status → resolve invoice/order → run org-scoped capture. Unknown ref acknowledges safely; forged signature, amount/currency mismatch и replay не активируют доступ.`  
    Причина: подписанный SaaS webhook и replay/amount checks не покрыты.

14. `Закрыть provider-specific gaps из S4-0. В частности, callback, который требует server-side status verification, не считается успешным только по payload; provider order ref и transaction ref имеют проверенный mapping.`  
    Причина: provider-specific server verification остаётся billing scope.

15. `Tariff capture активирует/продлевает source=paid_subscription; expiry/cancel/refund завершает только этот source. Manual global_admin assignment или более новый paid source сохраняют доступ; compatibility tariff projection обновляется тем же service transaction.`  
    Причина: precedence источников paid/manual и транзакционная projection не заданы.

16. `Payment failure/expiry не затрагивают другую клинику и не удаляют clinic-owned exercises/content.`  
    Причина: billing A/B isolation и сохранность clinic-owned data отдельно не приняты.

17. `Global billing surface показывает organizations/payers/subscriptions, trial/grace/past_due, attempts, refunds/cancellations, provider events, invoices/receipts, filters/aggregates и только безопасные PSP-supported support actions. Любая mutation идемпотентна и попадает в immutable admin audit; manual «успешно оплачено» нет.`  
    Причина: global billing operations surface и immutable mutation audit отсутствуют.

18. `Organization settings tab «Тариф и биллинг» показывает current tariff/capabilities/usage/seats, next payment, lifecycle status, upgrade/downgrade effect/date, add-ons, payment history and documents. Она доступна owner/payment admin; ordinary invited specialist не видит tab и получает server denial.`  
    Причина: §5a 6.1 покрывает usage/лестницу, но не payer tab, историю, документы и billing authz.

19. `B2B bank-transfer invoice/status и fiscal receipt/invoice obligations имеют provider/legal decision gate; неподдержанный flow не симулируется фиктивной кнопкой.`  
    Причина: B2B/legal/fiscal decision gate относится к SaaS billing.

20. `Реальные provider credentials, когда владелец их предоставит, вводятся только через Settings на тестовом сервере. До этого architecture, mock checkout и recorded provider contract fixtures должны проходить полностью; отсутствие ключей не блокирует schema/service/UI/webhook implementation.`  
    Причина: keyless-safe provider acceptance и Settings-only credentials не описаны.

#### Platform analytics

21. `Ввести отдельную typed platform aggregate projection/port. Строка содержит только time bucket, organizationId или platform-total bucket, allowlisted metric key, integer/decimal value и generatedAt; нет FK на user/patient, person/session IDs и JSON metadata.`  
    Причина: typed PII-free platform aggregate projection не относится к отчёту о лимитах.

22. `Существующий raw/user analytics остаётся clinic-operational source и не экспортируется через platform port. ProductAnalyticsClientActivityRow и registration drill-down физически недоступны platform API/page.`  
    Причина: физическая изоляция raw patient analytics от platform API не зафиксирована.

23. `Протянуть trusted organizationId в те ingest paths, которые действительно org-scoped. Payload не назначает org; shared-patient event без scoped resource не угадывается и не попадает в per-clinic aggregate.`  
    Причина: trusted-org analytics ingest boundary отсутствует.

24. `Aggregate builders считают только allowlisted counters из billing/subscription и platform load sources. Message body, exercise execution event, program content и patient identity не читаются и не проецируются.`  
    Причина: allowlist источников и запрет клинических/персональных данных не покрыты.

25. `Добавить schema/DTO/static checker, запрещающий в platform analytics person columns, free-form payload и imports clinic drill-down repo. Canary test кладёт узнаваемые PII strings в source fixtures и доказывает их отсутствие в aggregate rows, API JSON, logs и screenshots.`  
    Причина: PII static checker/canary является отдельной security-приёмкой аналитики.

26. `Сделать отдельный global_admin platform port/API; clinic analytics port остаётся строго single-org. clinic_admin A не может запросить B query/filter/direct ID.`  
    Причина: разделение platform и clinic analytics ports и A/B denial отсутствуют.

27. `До финального решения владельца UI показывает только технический preview структуры aggregate buckets без объявления набора KPI окончательным.`  
    Причина: безопасный preview до утверждения KPI не описан.

28. `OWNER GATE: утвердить точный список метрик и формулы после работающих tariffs/billing/usage sources; future store становится источником метрик только если C5D к тому моменту активирован. Кандидаты из рулинга — клиники, специалисты, клиенты как counts, загрузки видео, биллинг и использование — не расширяются персональными drill-down.`  
    Причина: owner gate на metric keys/formulas остаётся после появления источников.

29. `После решения реализовать только утверждённые metric keys, формулы и layout; каждый metric получает source query file:line, denominator/timezone semantics и fixture с ожидаемым числом.`  
    Причина: реализация утверждённых platform KPI и проверяемых формул не покрыта.

#### Интеграционная приёмка

30. `Подготовить непересекающиеся synthetic fixtures только для включённых substages: global_admin; clinic_admin/doctor A и B; разные tariffs/overrides; clinic-owned/base exercises; SaaS invoice/subscription/order. Package/grant fixtures добавляются только если C5D явно активирован. Доказательство: fixture manifest без реальных PII.`  
    Причина: fixture matrix охватывает billing/ownership и PII, которых нет в приёмке §5a.

31. `Global_admin создаёт/меняет tariff, цену/период/full mechanic map, назначает A, меняет override, видит billing state и утверждённые aggregate metrics. Package curation проверяется только в C5D acceptance.`  
    Причина: §5a не принимает вместе constructor, billing state и platform metrics.

32. `Clinic A проходит checkout mock/recorded-provider flow, получает tariff access и продолжает видеть свои clinic exercises отдельно от platform base content.`  
    Причина: checkout и own/base ownership acceptance отсутствуют.

33. `Clinic B не видит tariff override, invoice или analytics A; её собственные exercises и mechanics работают по её tariff.`  
    Причина: cross-org A/B acceptance для override/invoice/analytics не задана.

34. `Payment negatives: duplicate checkout/webhook, forged signature/org ID, wrong amount/currency, unknown provider ref, refund replay. Ни один отказ не меняет subscription/grant.`  
    Причина: payment negative matrix относится к billing security.

35. `Analytics negatives: platform JSON/schema/visual artifacts не содержат patient identity, message text, exercise execution details или clinic drill-down rows; clinic A не получает B.`  
    Причина: PII/A-B negative acceptance platform analytics отсутствует.

36. `UI-фазы получают desktop/mobile screenshots; executor, independent audit и fixer закрывают один и тот же checklist по ORCHESTRATION_BINDINGS.md.`  
    Причина: §5a 7.4 требует просмотр владельца, но не desktop/mobile evidence и единый audit checklist.

#### Definition of Done

37. `Каждая owner attribution ссылается на OWNER_RULINGS_2026-07-15.md, непереопределённую Часть Б OWNER_DECISIONS_FOR_REVIEW.md либо latest OWNER_REVIEW_2026-07-18.md; инженерные решения подписаны как инженерные.`  
    Причина: полный provenance audit старых attribution не включён в 6a.4.

38. `Own-only и base library разведены, clinic content приватен. Если C5D активирован, future store/grants проходят отдельный source-aware/no-copy acceptance; иначе этот подпункт явно отмечается deferred, не failed.`  
    Причина: core own/base privacy остаётся live; условная store-часть отложена и не закрывает core.

39. `Existing provider adapters обслуживают SaaS checkout/capture/refund/webhook; keys DB-backed и redacted.`  
    Причина: SaaS provider flow и credential contract не покрыты.

40. `Global operator billing и organization «Тариф и биллинг» имеют разные authorization surfaces и общий reconciled ledger; ordinary specialist не получает финансовые права.`  
    Причина: billing authorization split и reconciled ledger отсутствуют.

41. `Platform analytics содержит только утверждённые org/platform aggregates и проходит PII canary/static gate.`  
    Причина: platform analytics и PII gate не входят в quota report §5a 6.2.

42. `A/B acceptance, security negatives, screenshots/audits и один финальный CI gate закрыты на тестовом сервере.`  
    Причина: §5a 7.1–7.4 не содержит полного A/B, billing/analytics negatives и screenshot matrix этого пункта.

#### Team/seats и billing operations

43. `Скрыть billing mutation от ordinary specialist и проверить direct API denial.`  
    Причина: финансовая role boundary и direct API denial не названы.

44. `Закрыть org A/B isolation, immutable before/after audit, reconciliation, mock/recorded-provider TEST и organization «Тариф и биллинг» acceptance. Product gates C4C5-01…07 resolved by the 2026-07-19 addendum; real PSP activation remains blocked until YooKassa merchant/legal/receipt/retry/proration operations are specified and proven. C4C5-08 store commerce remains deferred.`  
    Причина: billing A/B, immutable audit, reconciliation и provider acceptance шире seat-лимита.

45. `Достроить standard SaaS billing operations baseline для global admin: subscriptions/payers, paid|unpaid|trial|grace|past_due, payment attempts, refunds, cancellations, filters/stats, invoice/receipt details и provider events.`  
    Причина: global billing operations baseline не входит в mechanics checklist.

46. `Реализовать только PSP-supported safe retry/reissue/cancel/refund/grace operations, reconciliation и immutable audit; ручной success без подтверждённого money event запрещён.`  
    Причина: PSP-supported mutations/reconciliation/audit не покрыты.

47. `Сначала зафиксировать design/spec с учётом выбранного PSP и legal/cash-register model.`  
    Причина: PSP/legal/cash-register design gate отсутствует.

48. `Достроить owner/payment-admin settings surface «Тариф и биллинг»: current tariff/capabilities/usage/seats, subscription status, next payment, upgrade/downgrade, add-ons/seats, payment history, receipts/invoices, B2B bank-transfer invoice/status и failed-payment recovery.`  
    Причина: §5a 6.1 покрывает usage/лестницу, но не полный organization payer surface.

49. `Доказать, что billing принадлежит organization, а ordinary invited specialists не видят tab и не имеют API access.`  
    Причина: organization billing ownership и ordinary-specialist denial не названы.

#### #1057

50. `Достроить существующий payment layer для оплаты клиниками подписки на платформу; не писать платёжку заново и не смешивать её с оплатой услуг пациентами или ранее убранными store phases.`  
    Причина: SaaS subscription billing остаётся отдельным workstream #1057.

51. `Проверить текущее состояние patient online payment: doctor memberships работают end-to-end, patient online payment ранее был mock.`  
    Причина: проверка patient-payment reality не является тарифной механикой.

52. `Сохранить аналитику по клиникам без PII пациентов и не вернуть пять mock payment confirmations в production: они отключены вне development commit 15ad7ba6f, gate fail closed.`  
    Причина: PII-free billing analytics и production mock fail-closed gate отсутствуют.

53. `Перед исполнением перечитать OWNER_RULINGS_2026-07-15.md и сверить существующие saas_tariffs, saas_org_entitlement_overrides, saas_organization_trials; неизвестные развилки сначала исследовать по мировой практике, не угадывать.`  
    Причина: это обязательный preflight будущего billing workstream, а не закрытая реализация.

Неклассифицированных пунктов: **0**.