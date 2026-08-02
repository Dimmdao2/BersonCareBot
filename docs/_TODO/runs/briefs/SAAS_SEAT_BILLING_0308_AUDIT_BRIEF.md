# Тест или взгляд: смешанный независимый pass

Денежное и конкурентное поведение проверяется blind kill-set, существующими acceptance-тестами и fault injection;
schema/migration/journal, grants, отсутствие второго payment door и file-scope — взглядом. Канон: `AGENTS.md` §1,
§4a, §5, §10b, §24. Authority: `docs/_TODO/runs/briefs/SAAS_SEAT_BILLING_0308_BRIEF.md`, оба указанных
там SaaS-плана и candidate head `2f91ad586`. Worker reports и зелёные тесты доказательством не считать.

## Blind kill-set до чтения candidate tests

1. Первый подтверждённый тарифный платёж переводит pending/NULL period в active/paid period и атомарно завершает
   trial; ранний renewal не двигает границу до наступления оплаченного периода.
2. Seat invoice до capture не расширяет capacity; первый capture добавляет сохранённое количество один раз, replay
   с тем же или другим provider event ничего не добавляет и не меняет tariff/status/period/snapshot.
3. При полном подтверждённом refund allowance уменьшается ровно один раз; partial seat refund отклоняется; уже
   существующие специалисты не удаляются, блокируется только новый рост.
4. Invite при исчерпанной capacity ничего не создаёт/не отправляет, отдаёт серверную цену; checkout заново проверяет
   org usage/capacity/price, requestKey даёт один invoice и один PSP intent, unusable draft ретраится.
5. После оплаты обычный invite проходит; два конкурентных invite на одно оплаченное место дают ровно один success;
   accept overlay не считает наличие цены оплатой.
6. Renewal amount = base + paid quantity × current unit, snapshot хранит количество; отсутствующая unit price при
   положительном allowance падает до provider side effect.
7. Team return/poll/replay и Billing overview позволяют человеку завершить оплату; потеря browser-state не теряет
   купленную общую capacity; platform breakdown различает виды платежа.
8. Существует один capture state machine и один lock order subscription→invoice; старые promotion doors не имеют
   product callers. Клиентские org/amount/currency не являются authority.
9. Миграция 0308 детерминированно backfill-ит только точный legacy prefix, ставит checks/partial indexes и journal
   entry без коллизии; никакой новой таблицы, route, payment adapter, receipt/fiscalization или DEV/TEST/PROD mutation.

## Доказательство и границы

- До чтения новых тестов записать kill-set в audit report под `docs/_TODO/runs/billing/`.
- Обязательны existing disposable PostgreSQL concurrency smoke, focused service/routes/UI tests, migration/schema/
  journal gates, typecheck, scoped ESLint, raw-SQL gate и `git diff --check`.
- Один раз fault-inject каждый независимый класс из worker brief: always-promote kind switch; price-based accept;
  pending-count; omission allowance from create/accept/UI; omission renewal seat component; missing decisive lock;
  unusable draft replay; rejection of first NULL-boundary payment. Временный product fault полностью откатить.
- Product fix не делать, не push, не применять 0308 к DEV/TEST и не трогать PROD. Постоянными могут остаться только
  недостающие acceptance tests и audit report.
- Итог бинарный: `PASS` только если каждый named class пойман и весь restored candidate зелёный; иначе конкретный
  достижимый finding с impact, evidence и нарушенным требованием.
