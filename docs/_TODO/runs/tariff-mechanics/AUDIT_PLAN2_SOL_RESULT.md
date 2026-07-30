# VERDICT: FAIL

§5a правильно разворачивает работу в сторону настраиваемого механизма, но план пока нельзя исполнять: в том же комплекте документов остаются фиксированные лестницы, пороги и упаковка; перечень механик неполон; lifecycle невозможно вычислить из названных входов; заявленный chokepoint не перекрывает все реальные write-пути.

## Matrix A

| Слова владельца | Где реализовано в плане | Статус |
|---|---|---|
| «ты вообще не должен решать… я указываю ЧТО делать доступом к системе вообще и к конкретной функции… какой период терпения… какой период read-only» | §5a 2.1: «поля лестницы… на ДВУХ уровнях»; 2.2: «уровень механики сильнее системного»; 2.3: «ОДИН резолвер состояния» ([план:711](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:711)). | **DISTORTED.** Локальная формулировка верна, но тот же план сохраняет фиксированную лестницу `7 дней / 3 попытки → 21 день → blocked` и называет hard block инженерным выбором ([план:478](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:478), [план:570](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:570)). Кроме того, 2.1 не даёт владельцу управлять предупреждениями и не определяет событие начала лестницы. |
| «мы не ограничиваем часть критичных механик… если нет разминок и CMS — ни он не видит раздела, ни его клиенты…» | §5a 2.4: «выключено — раздела нет ни у специалиста, ни у его пациентов»; 2.5: «критичные механики всегда полный доступ»; общий контракт этапа 4 требует проверку записи и видимости обеих сторон ([план:718](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:718), [план:740](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:740)). | **PRESENT**, но полнота не доказана: критичные механики не перечислены атомарно, а online booking и support отсутствуют в списке подключения. |
| «как настрою то и входит… дай выключатели корректные»; «сами цифры — тебя не касаются» | §5a 2.6: «зашитых констант не остаётся»; 2.7: «числа ставит владелец» ([план:722](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:722)). | **DISTORTED.** §5a и канон всё ещё фиксируют default-off упаковку трёх функций, два предупреждения, 80/100%, примерные значения тарифов и конкретные terminal outcomes. |
| «главное — не переусложнить. Делать НЕОБХОДИМО И ДОСТАТОЧНО…» | Механизм → chokepoint → механики; поведенческие тесты вместо проверки текста; точечные проверки и один финальный CI ([план:683](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:683)). Канон отказывается от внешнего billing/entitlement engine ([канон:300](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:300)). | **PRESENT** как принцип. Реализация chokepoint описана недостаточно строго, а §7 фактически назначает два полных CI. |

## B — оставшиеся хардкоды и решения за владельца

1. **Фиксированная коммерческая лестница в том же плане.**  
   Цитата: «grace 7 дней + 3 попытки → `read_only`» и «7 дней… → 21 день `read_only` → `blocked`» ([план:478](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:478), [план:484](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:484)).  
   Авторство: 7 дней/3 попытки предложил агент, владелец тогда ответил «ок»; 21 день добавил владелец 27.07. Решение superseded словами владельца 30.07 о настраиваемых полях, но активным текстом не помечено.  
   Полевая форма: system lifecycle policy с owner-set duration, retry/warning schedule и terminal state; без литералов в state machine.

2. **Hard block прямо назван инженерным выбором.**  
   Цитата: «grace-период до hard block — инженерный выбор этой фазы» ([план:570](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:570)).  
   Решил агент. Это прямое противоречие owner ruling.  
   Полевая форма: terminal state выбирает владелец в системной политике.

3. **Seat grace остаётся наполовину хардкодом.**  
   Канон фиксирует «14 дней и два предупреждения» ([канон:27](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:27), [канон:197](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:197)).  
   14 дней владелец назвал как значение поля; это допустимо как сохранённые данные. Но «два предупреждения» не имеет поля ни в 2.1, ни в DoD и поэтому остаётся правилом кода.  
   Полевая форма: `patienceDays` плюс owner-configured warning schedule/count либо отсутствие предупреждений до настройки.

4. **Storage warnings 80/100% — решение агента.**  
   Цитата: «Предупреждения на 80% и 100%» ([канон:203](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:203)); источник виден как research safe default ([research:741](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md:741)). Тот же 80% уже зашит в текущем resolver ([service.ts:223](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:223)), а план не требует его удалить или сделать данными.  
   Полевая форма: предупреждающие пороги задаёт владелец на числовой механике либо они отсутствуют.

5. **Упаковка «Сегодня / разминки / промо выключены у всех, включены только владельцу».**  
   Это закреплено в §5a 1.4 и 4.9 ([план:702](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:702), [план:752](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:752)), а также в каноне ([канон:249](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:249)). В предоставленном authority нет дословного owner ruling именно о такой упаковке.  
   Полевая форма: обычные строки конструктора; состав тарифа и org override задаёт владелец. Если owner-only rollout действительно утверждён, нужна точная цитата/ссылка.

6. **Канон фиксирует поведение платежей неясной фразой «деньги клиники не блокируем никогда».**  
   Одновременно там сказано, что `payments` — тарифный рубильник ([канон:205](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:205)). Это выглядит как запрет владельцу выключить механику.  
   Полевая форма: «нет числовой transaction quota; доступ определяется owner-configured lifecycle механики `payments`».

7. **Литеральные тарифные числа сохранены в обязательном словаре канона.**  
   `3 + 900 ₽`, `300`, `2`, `10 ГБ`, `14 дней` ([канон:237](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:237)). Они не помечены как placeholders и могут попасть в fixtures/UI-тесты как продуктовые defaults.  
   Полевая форма: шаблоны, построенные из фактических значений тарифа.

8. **Старые агентские рекомендации и «первый срез» не удалены из документационного комплекта.**  
   Research всё ещё предлагает unlimited patients, numeric courses/mailings, booking/payments во всех платных тарифах, billing anchor, 80/100% и старый словарь ([research:357](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md:357), [research:731](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md:731)). Punchlist всё ещё содержит «первый срез… CMS» ([punchlist:587](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md:587)). Это решения исследования/лида, не владельца, и многие прямо отменены каноном 30.07.

## MUST FIX — C и D

1. **Свести lifecycle к одному активному контракту во всём плане.** Пока Phase 4 предписывает фиксированную лестницу, а §5a — настраиваемую, два исполнителя могут построить две state machine. Impact: разные terminal states для неоплаты и выключенной механики. Нарушены owner ruling и запрет несовместимых active requirements.

2. **Добавить атомарную матрицу всех механик канона §4.** Сейчас:

   - online booking отсутствует в 4.1–4.9;
   - support toggle отсутствует даже как трассируемый указатель на §11;
   - external calendar и diaries спрятаны в общем 3.4;
   - 4.7 объединяет девять независимых функций;
   - критичные `reminders/notifications`, 2FA, audit log, export, emergency help не названы;
   - запрещённые рубильники для treatment/LFK templates, patient messaging и cancellation rules не имеют отдельных защитных строк.

   Достижимый сценарий: чекбокс 4.7 закрывается, но booking или одна критичная поверхность остаётся неверно классифицированной. Нарушен atomic-checkbox contract.

3. **Определить источник времени начала лестницы.** Поля тарифа и текущие `tariff/override/commercial state` не отвечают, когда механика была потеряна. При изменении `true → false` resolver не сможет отличить первый день терпения от двадцатого. Текущая схема хранит только trial dates ([schema:116](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:116)), а обычный commercial access без trial всегда возвращает `active` ([pgOrgEntitlements.ts:82](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:82)). Как написано, 2.3 работать не может без локального флага или мгновенного отключения.

4. **Описанный “один порт” не делает обход технически невозможным.** Текущий checker сознательно не проверяет вызов guard ([checker:64](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/scripts/check-s4-entitlement-coverage.ts:64)); `requireEntitlementForRead` всегда разрешает чтение, а page guard — no-op ([guard:47](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:47), [guard:140](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:140)). Реестр экспортов не защищает:

   - внутренний service/repository write;
   - lazy write во время read;
   - push-onboarding materialisation;
   - новый route/action, не добавленный в family;
   - integrator write.

   План должен назвать реальную непроходимую write boundary и поведенческий negative test для каждого класса входов. Иначе повторяется уже зафиксированный bypass первой PWA-подписки.

5. **Scope не позволяет закрыть заявленный integrator-контур.** Проблема §5a прямо называет бота/integrator, но разрешённый scope всего плана перечисляет только webapp ([план:171](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:171)). Webapp route `/api/integrator/events` не покрывает прямые записи из `apps/integrator/**`. Исполнитель либо оставит обход, либо нарушит scope.

6. **Один resolver пока означает как минимум три реализации.** Commercial lifecycle уже вычисляется отдельно в `pgOrgEntitlements.resolveAccess`, `pgPlatformEntitlements.effectiveAccessForPlatform` и patient SECURITY DEFINER snapshot ([pgOrgEntitlements.ts:82](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:82), [pgPlatformEntitlements.ts:121](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:121)). §5a не требует свести platform/staff/patient paths. Impact: администратор, специалист и пациент могут видеть разные ступени одного тарифа.

7. **Не закрыты внешние зависимости.** 4.8 зависит от #1071, но не фиксирует owner contract «собственные SMTP и боты клиники; платформенные коды/напоминания не входят в рассылку». 5.1 зависит от billing #1057. Без явного dependency gate #1069 либо зависнет, либо будет закрыт без каналов/счёта.

8. **Definition of Done не закрывает собственный план.** В нём нет:

   - полной матрицы всех механик;
   - file-volume freeing из 5.5;
   - clinic-owned mailing channels/support routing;
   - документационных 6a.4–6a.5;
   - условия «все stage checkboxes закрыты».

   Кроме того, 7.1 требует один full CI, а 7.2 — повторный full CI после интеграции ([план:797](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:797)). Текущий DoD допускает формальное завершение с открытым документационным и функциональным scope.

## E — документационный комплект

Комплект пока не сведён.

- Research объявляет «решений здесь нет», но содержит два активных раздела «РАЗВИЛКИ ВЛАДЕЛЬЦУ», safe defaults и отменённый словарь. Он противоречит канону по patients, courses, mailings, packaging и period usage.
- §5a 6a.3 ошибочно отмечен `[x]`: punchlist всё ещё содержит старый первый срез, старые выводы и D-13 с фразой «при молчании делается так» ([план:784](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md:784), [punchlist:916](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md:916)).
- План и канон конфликтуют по fixed billing ladder и warning thresholds.
- `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` обработан честно: в шапке явно стоит приоритет §5a и предупреждение не брать оттуда работу ([S4:5](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md:5)); 6a.4 остаётся открытым. Это не скрыто, но требование единого комплекта ещё не выполнено.

## Что в плане верно

- Правильный порядок: механизм → chokepoint → механики.
- Два уровня lifecycle и приоритет mechanic-level над system-level.
- Выключенная CMS/разминки скрывается у обеих сторон, данные не удаляются.
- File volume freeing правильно объявлен предусловием enforcement.
- Числовые проверки помещены внутрь транзакции; race proof и FORCE-RLS principal явно требуются в 5.7–5.8.
- Тестовая политика соответствует правилу «поведение, не текст».
- Pending reconciliation старого S4-документа не скрыт.

## Не смог проверить

- Живые DEV/TEST состояния и UI: по brief тесты, миграции и deploy не запускались.
- Полный остаток всех 83 строк старого S4: 6a.4 специально ещё не выполнен.
- Происхождение default-off решения для «Сегодня / разминки / промо» вне предоставленных документов: в authority нет дословной цитаты, поэтому авторство считаю неподтверждённым.
- Семантический индекс был недоступен из-за отсутствующего DSN; проверка выполнена через BM25 code-search и точечное чтение.

Файлы не изменялись.