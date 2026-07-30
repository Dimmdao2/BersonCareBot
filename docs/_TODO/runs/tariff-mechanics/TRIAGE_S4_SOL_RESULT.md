# ИТОГ

| Вердикт | Количество |
|---|---:|
| `НУЖНО СЕЙЧАС` | **0** |
| `НУЖНО ПОЗЖЕ` | **12** |
| `НЕ НУЖНО` | **41** |
| **Всего** | **53** |

Сокращения: `TP` — [текущий план](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:653), `QD` — [канон механик](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:18), `OR` — [owner review](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md:225), `ROAD` — [текущий roadmap](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md:585), `QR` — [справочник практики](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md:1).

## НУЖНО СЕЙЧАС

Нет. После проверки кода, RLS и действующих C4/C7 gates ни у одного из 53 пунктов не осталось доказанного текущего failure-сценария, который требовал бы нового checkbox в этапах 2–6. Поэтому готовых для вставки чекбоксов нет.

## НУЖНО ПОЗЖЕ

3. **Platform-base library.** Предусловие: владелец снимает более поздний defer на курирование библиотек (`TP:839–846`); ownership-схема уже подготовлена, но библиотека пуста. Отслеживается `ROAD C4D/#724`. Практика: каталоги обычно продаются как capability, а не как лимит числа элементов (`QR:93–97,169–175`); разделение platform/clinic ownership справочник не исследовал.

4. **Управление составом base library.** Предусловие: активирован curator workflow и появился platform-owned контент. Отслеживается `ROAD C4D/#724`; purchase/store остаётся отдельным `C5D`. Практика: доступ к каталогу обычно является entitlement-флагом; кто и как курирует base library, практика молчит.

17. **Глобальная billing operations surface.** Предусловие: существуют SaaS ledger, subscription lifecycle, invoices и provider events. Отслеживается `ROAD C5B/#844`, `OR:163–185`. Практика: базовый audit trail не должен зависеть от коммерческого состояния (`QR:103–122`); конкретный набор support actions практика не нормирует.

18. **Organization «Тариф и биллинг».** Предусловие: работают ledger, checkout и lifecycle подписки. Отслеживается `ROAD C5B/#845`, `OR:187–212`, зона `MGMT-08` в `TP:95–98`. Практика молчит о точном составе payer-tab и локальной ролевой модели.

19. **B2B/фискальный контур.** Предусловие: выбран и доказан merchant/legal/cash-register contract реального PSP. Отслеживается `TP:588–609`, `OR:152–161,214–223`, `ROAD C5B`. Практика `QR` про российскую фискализацию и B2B bank transfer молчит.

21. **Typed PII-free aggregate projection.** Предусловие: активирован C6 и появились рабочие billing/usage sources. Отслеживается `ROAD C6/#854`, `OR:252–291`. Практика молчит.

22. **Физическое отделение raw clinic analytics.** Предусловие: строится platform analytics port/API. Отслеживается `ROAD C6/#854`; это обязательная security-граница будущей ветки. Практика молчит.

23. **Trusted organization attribution при ingest.** Предусловие: определены org-scoped event sources C6. Отслеживается `ROAD C6/#854`. Практика молчит.

24. **Allowlist источников агрегатов.** Предусловие: существуют утверждённые метрики и их источники. Отслеживается `ROAD C6/#854`. Практика молчит.

25. **PII schema/static/canary gate.** Предусловие: существуют aggregate schema, API и визуальная поверхность, которые можно проверить. Отслеживается `ROAD C6/#854`, чей gate требует privacy negatives. Практика молчит.

26. **Раздельные platform/clinic analytics ports и A/B denial.** Предусловие: появился platform analytics API. Отслеживается `ROAD C6/#854`; failure, который тогда надо закрыть, — clinic A получает aggregate/drill-down B. Практика молчит.

29. **Реализация утверждённых KPI.** Предусловие: готовы источники и зафиксированы формулы/окна C6. Отслеживается `OR:261–291`, `ROAD C6/#854`. Практика требует прозрачной проверяемой метрики (`QR:54–77`) и различает business-time и delivery-time событий (`QR:469–474`).

## НЕ НУЖНО

1. **Inventory всех library paths.** Это процесс, а не отдельное поведение. Реальные list/direct-ID пути уже org-scoped, ownership закреплён схемой/RLS, а `ROAD C4` требует list/direct/count/search/picker/media matrix. Неизвестного достижимого path не найдено. Практика молчит.

2. **Own-only A/B isolation.** Уже обеспечено: list и direct ID фильтруют `owner_kind='organization'` и текущий org в [pgLfkExercises.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:540); DB CHECK/RLS закреплены в [0217_platform_lfk_ownership.sql](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0217_platform_lfk_ownership.sql:54), platform-read сужен до staff в [0250…sql](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0250_c4d_platform_library_read_staff_scope.sql:44). Повторный checkbox без найденного обхода — hardening. Практика tenant-isolation в `QR` не исследована.

5. **Запрет clinic→platform publication.** Уже действует: `OR:237–250` запрещает неявное превращение clinic content в platform content; миграция падает на legacy NULL вместо автопубликации, clinic create жёстко пишет organization ownership. Будущий publication workflow потребует отдельного owner decision. Практика молчит.

6. **Сводная A/B/no-copy acceptance.** Own-only matrix уже в `ROAD C4:592–593`; base visibility выполняется вместе с будущим C4D, store no-copy — только с deferred C5D. Старый пункт неатомарен и дублирует разные gates. Практика молчит.

7. **Desktop/mobile own/base/store-absent acceptance.** Уже покрыто `ROAD C7:655–658`: deferred branches не симулируются пустыми экранами, обязательны source-bound screenshots и visual seals. Практика молчит.

8. **Отдельный `modules/saas-billing`.** Точно покрыто `TP:504–509`. Практика молчит: DI/module boundary локальна.

9. **Billing account/subscription/invoice/provider event.** Точно покрыто `TP:510–521`. Практика: зрелые event systems сохраняют source event и дедуплицируют по source ID (`QR:445–467`).

10. **Manual source и compatibility projection.** Точно покрыто `TP:522–525` и единым access contract `TP:252–256`. Практика: entitlement/grant engines существуют (`QR:644–647`), но конкретный manual/paid precedence справочник не нормирует.

11. **Глобальный PSP setting.** Точно покрыто `TP:526–547`: отдельный от per-org booking credentials, restricted DB storage, redaction и sanctioned accessor. Практика молчит.

12. **Checkout URL и безопасный return.** Точно покрыто `TP:560–572`, включая server-derived org и запрет доверять клиентским amount/tariff/org. Практика молчит.

13. **Подписанный SaaS webhook.** Точно покрыто `TP:552–559,611–614`. Практика подтверждает source idempotency/replay safety (`QR:445–474`); payment signature/amount contract справочник не исследовал.

14. **Provider-specific verification.** Уже входит в provider contract verification и real-activation proof `TP:611–614`, `OR:152–161`. Отдельный provider-specific checkbox дублирует общий контракт. Практика молчит.

15. **Paid/manual precedence и transactional projection.** Точно покрыто `TP:573–586`. Практика знает entitlement/grant model, но конкретную precedence policy не задаёт.

16. **Payment failure не затрагивает B и не удаляет content.** Покрыто data-preserving lifecycle `TP:726–729` и Phase 5 A/B/payment negatives `TP:630–639`. Практика: зрелые healthcare SaaS сохраняют read-only/export/reactivation после отмены (`QR:124–143`).

20. **Keyless-safe implementation и Settings-only credentials.** Точно покрыто mock-default `TP:548–551` и Phase 4 output `TP:611–614`. Практика молчит.

27. **Технический preview KPI.** Владелец его не просил; это выбрасываемый UI без failure-сценария. Platform analytics отложена, а текущий `OR:261–275` уже задаёт metric implementation contract. Практика молчит.

28. **Новый OWNER GATE на метрики.** Уже снят: `OR:261–275` фиксирует направления и оставляет формулы C6 implementation contract без нового owner-gate; зависимости записаны в `ROAD C6:643–646`. Практика требует прозрачности метрики (`QR:54–63`), но не требует ещё одного согласования.

30. **Общий mega-fixture.** Billing fixtures уже есть в `TP:618–622`; C4D и C6 имеют собственные gates. Смешанный fixture нарушает атомарность этапов. Практика молчит.

31. **Сводная acceptance constructor+billing+analytics.** Constructor+billing уже покрыты `TP:623–629`; analytics принадлежит C6. Сводный checkbox дублирует две стадии. Практика молчит.

32. **Checkout A плюс own/base.** Checkout A уже `TP:630–632`; ownership проверяет C4. Составной дубликат. Практика молчит.

33. **B не видит override/invoice/analytics A.** Override/invoice A/B уже `TP:630–639`, analytics A/B — `ROAD C6:645–646`. Составной дубликат. Практика молчит.

34. **Payment negatives.** Дословно покрыто `TP:633–639` и Phase 4 verification `TP:611–612`. Практика подтверждает event-source idempotency (`QR:453–467`).

35. **Analytics negative acceptance.** Уже является gate C6: formula fixtures и two-org/privacy negatives (`ROAD:645–646`), а технически раскладывается на пункты 25–26. Практика молчит.

36. **Screenshot/auditor process.** Это repo-wide процесс из `ORCHESTRATION_BINDINGS`, а не продуктовый scope; C7 уже требует screenshots и два seals. Без конкретного responsive-дефекта отдельный checkbox — invented test scope. Практика молчит.

37. **Provenance owner attribution.** Уже открыто и описано в текущем плане `TP:934–939`; новый пункт ничего не добавляет. Практика молчит.

38. **Own/base/store DoD roll-up.** Дублирует 2–7 и смешивает текущую privacy boundary с deferred store. Практика: capability packaging и grants существуют (`QR:169–175,644–647`), но локальный ownership/no-copy contract она не определяет.

39. **Provider adapters + DB-backed keys.** Дублирует Phase 4 `TP:504–614`. Практика молчит.

40. **Две billing surfaces и общий ledger.** Дублирует будущие канонические пункты 17–18 и `ROAD C5B:602–604,619–620`. Практика: базовый audit должен сохраняться независимо от коммерческого состояния (`QR:103–122`).

41. **Platform analytics DoD.** Сводный дубль 21–26 и C6 gate. Практика молчит.

42. **Полный A/B/security/screenshots/CI roll-up.** Уже разложено между Phase 5 `TP:616–648`, §5a stage 7 `TP:850–860` и `ROAD C7`. Новый mega-checkbox неатомарен. Практика молчит.

43. **Direct API denial ordinary specialist.** Это составная часть будущего пункта 18 и уже обязательный authority `OR:203–212`, `ROAD C5B:619–620`. Практика молчит.

44. **Сводная billing acceptance.** Дублирует Phase 4/5, пункты 17–19 и deferred C5D; как один checkbox неатомарна. Практика: event-first ledger поддерживает reconciliation/auditability (`QR:453–467`).

45. **Global billing operations baseline.** Дословный дубль будущего пункта 17 и `OR:165–185`. Практика: зрелый billing product Lago включает events, invoices и business UI (`QR:646`), но не нормирует конкретные поля BersonCare.

46. **Safe mutations/reconciliation/audit.** Уже часть пункта 17 и authority `OR:178–185,211–212`. Практика: event-first + idempotency — устойчивый retry/reconciliation pattern (`QR:453–467`).

47. **PSP/legal/cash-register spec.** Дублирует будущий пункт 19 и текущий fiscal checkbox `TP:588–609`. Практика молчит.

48. **Полный payer surface.** Дословный дубль будущего пункта 18 и `OR:187–201`. Практика молчит.

49. **Organization billing ownership/denial.** Дубль пункта 18 и `OR:203–212`. Практика молчит.

50. **Достроить payment layer без переписывания.** Это уже сама граница Phase 4: `TP:501–509` и owner ruling `TP:62–65`. Практика молчит; это repo-specific reuse.

51. **Повторно проверить patient online payment.** Reality уже зафиксирована: patient pay использует mock, а patient commerce отделён от SaaS subscription billing (`TP:155–159`; старый S4 reality lock). Повторная проверка не предотвращает failure текущего tariff mechanism. Практика молчит.

52. **PII-free analytics + production mock gate.** Пункт неатомарен: analytics принадлежит C6, а mock уже fail-closed для production в [mockPaymentGatePolicy.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) и используется всеми пятью mock routes. Практика молчит.

53. **Перечитать rulings и провести preflight.** Уже обязательны STOP-GATE/code-search-first `TP:286–291` и reality inventory. Это процедура, не отдельное требование поведения. Практика молчит.

## Не смог оценить

**0.**

Проверка была полностью read-only: файлы, планы и taskdb не изменялись; тесты не запускались.