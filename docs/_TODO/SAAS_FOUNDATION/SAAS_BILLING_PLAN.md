# SaaS-биллинг и оплата клиниками — план работ (карточка #1057)

**Почему отдельный файл.** Владелец 30.07: «всё что пройдёт аудит по биллингу и оплате saas — записать в актуальный
план задачи именно по биллингу и оплате, а не в этот план по тарифам и квотам — не смешивать». Раздел Phase 4 переехал
сюда целиком из `TARIFFS_PAYMENTS_ADMIN_PLAN.md` без переписывания — это перенос, а не новая бумажка.

**Справочник практики (факты, не решения):** `SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` — где хранить ключи ЮKassa
(в настройках базы, не в переменных окружения), почему автопродление у ЮKassa делается сохранённым способом оплаты, а
расписание держим мы.

**Стык с планом тарифов, чтобы планы не разъехались:**

- счёт клиники = цена тарифа + дополнительные специалисты сверх базы (поле цены задаёт владелец в конструкторе тарифов);
- ступень лестницы доступа — «терпение», «только чтение», «выключено» — включается от коммерческого состояния
  организации, которое ведёт биллинг; сами длительности и конечное состояние настраивает владелец в тарифе
  (`TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, этап 2);
- ⛔ прежняя зашитая лестница «7 дней терпения → 21 день только чтения → блок» и три попытки списания ОТМЕНЕНЫ 30.07:
  это значения полей, а не константы. Их seed в миграции `0259_saas_billing_foundation.sql:238-242` подлежит снятию.

### ⚠️ Инвариант, который биллинг обязан держать (уточнение владельца 30.07)

Оплата клиникой тарифа платформы **никогда** не гейтится тарифными механиками и лестницей доступа — ни в терпении, ни в
режиме только чтения, ни в блоке. Иначе заблокированная клиника не сможет заплатить и снять блок. Гасится только приём
денег клиникой ОТ ПАЦИЕНТОВ (предоплата при записи, онлайн-оплата на приёме) — это отдельная механика тарифа, и она
живёт в плане тарифов, а не здесь. Дословно: «никто и никогда не запрещает клиенту saas платформы оплачивать тариф
платформы». Парный пункт в плане тарифов — 2.1c, с обязательным тестом.

### Найдено аудитом 30.07 и подтверждено по коду — единственный живой дефект из старого плана

- [x] **B0.2 Моки запрещены к деплою (решение владельца 01.08: «моки надо запретить деплоить — вот и все»).**
      Гейт деплоя отказывает, если в собираемом артефакте присутствуют маршруты `*/payments/mock-complete`
      или предикат `isMockPaymentConfirmEnabled` может вернуть `true`. Проверка — на стороне деплоя, а не
      только сборки: сборку можно обойти, деплой — нет. Удалять маршруты НЕ требуется: они остаются рабочим
      инструментом разработки, но перестают быть способными уехать наружу.
      _Контекст, установленный лидом 01.08: ручки зовут ШЕСТЬ живых экранов оплаты (бронь, абонемент, покупка
      в кабинете, две публичные страницы). Удаление сейчас остановило бы оплату целиком до готовности
      настоящего checkout — поэтому запрет на деплой, а не вырезание._
      _Закрыто 02.08 тем же merge-коммитом, что и product: gate принимает только ноль
      `*/payments/mock-complete/route.ts` и отсутствие `mockPaymentGatePolicy.ts`; selftest 3/3 и прямой gate
      зелёные, возвращённые route/predicate дают non-zero. Независимый аудит `a4a435133`, provenance correction
      `7a7fcfac6`, отчёт `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_INDEPENDENT_AUDIT_2026-08-02.md` — PASS;
      реальный deploy не выполнялся._

- [x] **B0.4 Снять лишние тесты моков после B0.2 (владелец 01.08: «вот это конечно лишняя работа была,
      накрутили машинерии опять, вместо того чтобы просто не пускать моки на прод»).** Как только гейт деплоя
      (B0.2) в общей ветке — удалить 20 маршрутных тестов из `paymentsMockCompleteGate.route.test.ts`,
      оставив 4 юнит-теста на сам предикат: они дёшевы и держат его от случайного ослабления в разработке.
      Проверять каждую ручку по отдельности незачем, если ручка физически не уезжает наружу.
      _Урок: «необходимо и достаточно» применяется к ВЫБОРУ работы, а не только к её объёму — пункт плана
      берётся в работу только после проверки, не отменяет ли его более простой механизм._
      _Сделано 01.08 сразу после приземления B0.2: удалён `apps/webapp/src/app/api/booking/paymentsMockCompleteGate.route.test.ts` (20 маршрутных тестов), оставлен `mockPaymentGatePolicy.unit.test.ts` (5 тестов на предикат)._

> **⚠️ B0.3 и B0.3a — ОДИН workstream, приземляются одной веткой (владелец 01.08: «я сказал удаляй моки
> и делай полноценное апи для юкассы — на нём и проверишь»).** Раздельно их вести нельзя: удаление моков
> без настоящего пути выключает оплату, а настоящий путь без удаления моков оставляет чёрный ход.
> **Приёмка — прогон платежа через тестовый магазин ЮKassa** (`shopId 1425962`, ключ в `system_settings`):
> тестовой картой, от корзины до захвата, с подтверждением по вебхуку. Деньги не списываются и списываться
> не должны — путь платежа при этом идентичен боевому, что и делает такой прогон доказательством.
> Проводит его лид, а не пользователь: живых плательщиков на TEST нет и не будет. Пока прогон не сделан —
> пункт открыт, чем бы ни были зелены тесты.
>
> Тестовый магазин закрывает ровно ту нужду, ради которой держали моки. Значит держать их «чтобы на TEST
> хоть как-то работало» больше не за чем: ключи прописываются и в платформенный
> `saas_billing_payment_provider`, и в клинический `booking_payment_providers` — иначе экраны оплаты
> пациента упрутся в ненастроенный эквайринг.

- [ ] **B0.3 Удалить моки (владелец 01.08: «моки удаляй»; ранее — «мы не будем держать опасные моки на проде»).** Как только оплата через ЮKassa работает
      end-to-end, пять маршрутов `*/payments/mock-complete`, предикат `isMockPaymentConfirmEnabled` и его
      тесты удаляются целиком, а шесть экранов оплаты переводятся на настоящий путь. До этого момента их
      удерживает гейт B0.2. **Зависит от:** checkout-путь Phase 4 (ниже в этом файле) и B0.3a.
      _Сделано 01.08: `d413bec9b` (настоящая проверка вебхука ЮKassa вместо выдуманной подписи, снятие
      мок-провайдера), `0ae8734c3` (ссылка на оплату доходит до клиента), `e4de88cde` (шесть экранов уводят
      на провайдера, пять ручек и предикат удалены). Слепой аудит `audit-money-path` — **PASS**: список из
      8 поломок составлен по плану ДО чтения работы, 4 внесены и все 4 покраснели; оплаченного заказа без
      оплаты не получить ни возвратом на нашу страницу, ни поддельным уведомлением с чужого адреса, ни
      подменой тела уведомления с настоящего адреса. Следов мок-оплаты не осталось — проверено файловой
      системой, не индексом. Ложное evidence «гейт 8/8 продолжает сторожить» снято: B0.2 измерен отдельно
      как gate отсутствия маршрутов и predicate-файла и закрыт 02.08 после независимого аудита `a4a435133`._
      ⚠️ **Приёмка проведена НАПОЛОВИНУ (01.08) — до конца пункт не принят.**
      _Что доказано:_ ключи тестового магазина прописаны в `system_settings` штатным маршрутом настроек
      (не сырым SQL), покупка товара пациентом на dev проходит целиком и возвращает **настоящую ссылку
      оплаты ЮKassa** — `https://yoomoney.ru/checkout/payments/v2/contract?orderId=31ffa914-000f-5001-9000-1f8cefbe1832`.
      Платёж проверен не по нашим логам, а запросом к API провайдера `GET /v3/payments/{id}`:
      `status=pending`, `paid=false`, **`test=true`**, `amount=100.00 RUB`, `confirmation.confirmation_url`
      совпадает с тем, что отдало приложение. То есть путь «корзина → намерение → провайдер → ссылка»
      работает на настоящем магазине, а не на моке.
      _Чего не хватает и почему это нельзя закрыть на dev:_ оплата тестовой картой на странице провайдера и
      **подтверждение захвата по вебхуку**. Вебхук ЮKassa приходит на публичный адрес, которого у dev нет
      вовсе, — имитировать его руками означало бы выдать подделку за прогон. Эта половина закрывается
      только на TEST, где адрес публичный.
      _По дороге к этому прогону вскрылись и закрыты четыре двери, каждая с молчаливым отказом:_ права на
      схему `app` обеим рантайм-ролям, владельцы 38 функций схемы `app`, 43 привилегии на таблицах и
      забытый грант пациенту на таблицу товаров (последний — дыра не dev, а самих скриптов: на TEST тот же
      пробел, гейт деплоя эту таблицу не ассертит). Плюс dev-база отставала на миграцию с полем ссылки
      оплаты — применена.
- [x] **B0.3a Ссылка на оплату доходит до экрана — без этого моки не удаляются** (владелец 01.08:
      «мне нужен продукт»). Установлено разбором 01.08: адаптеры провайдеров возвращают настоящий
      `checkoutUrl`, но служба платежей его **выбрасывает** — в записи платёжного намерения нет поля под
      него, ни один маршрут не отдаёт его клиенту, редиректа на оплату в приложении нет, опрос статуса
      есть не во всех четырёх доменах. Поэтому все шесть экранов оплаты (запись, пакеты, товары и их
      публичные варианты) завершают платёж ТОЛЬКО через мок — настоящего пути нет ни у одного.
      Объём: провести `checkoutUrl` через запись намерения, отдать его создающим маршрутом клиенту,
      увести экран на страницу провайдера и вернуть обратно с опросом статуса. Оплата считается
      состоявшейся по вебхуку провайдера, а не по возврату пользователя.
      _Домен — оплата пациентом визита и покупок, не платформенный биллинг клиники за тариф
      (`TARIFFS_PAYMENTS_ADMIN_PLAN.md` §1: «разные домены, не смешивать»). Пункт стоит здесь, потому
      что от него зависит удаление моков, и держать два плана на один workstream нельзя._
      - [x] Ссылка проведена и отдана клиенту, экраны уводят на провайдера, моки снесены —
            `0ae8734c3` + `e4de88cde`, слепой аудит `audit-money-path` PASS: оплаченного заказа без
            оплаты не получить ни возвратом на страницу, ни поддельным уведомлением.
      - [x] **Возврат человека к нам не работает — половина «вернуть обратно» из строки выше не сделана.**
            Найдено тем же аудитом: адрес возврата берётся из метаданных намерения, но **ни один из шести
            создающих маршрутов его не передаёт**, поэтому срабатывает запасное значение
            `https://yookassa.ru` — заплативший человек уходит на сайт провайдера и к экрану опроса не
            возвращается никогда. Оплата при этом проходит и подтверждается вебхуком: ломается не деньги,
            а возвращение. Объём: каждый создающий маршрут кладёт в метаданные адрес СВОЕГО экрана
            возврата, запасное значение перестаёт быть чужим сайтом.
            _Перемерено 02.08:_ `returnUrl` обязателен у обоих payment-service entrypoint и provider port;
            активные booking/membership constructors его передают, все четыре PSP adapter потребляют,
            executable fallback `returnUrl ??/||` в adapter-ах — 0. Старые шесть экранов сократились до трёх
            после удаления каталога; все три редиректят на `checkoutUrl`.
      - [x] Отказ при ненастроенном эквайринге на создании записи говорит общим текстом «не удалось
            создать запись» вместо названной причины — в остальных пяти местах причина названа.
            _Закрыто 02.08:_ product `736487de6`, independent audit run
            `billing-booking-error-copy-audit-r1`; общий mapper для кабинета и public/confirm называет
            `payment_provider_unavailable`/`payments_disabled`, unknown сохраняет fallback. Focused 3/3,
            scoped ESLint/typecheck/diff green; удаление ветки роняет 2/3 тестов. Живой TEST-платёж и webhook
            остаются открыты в B0.3, не в B0.3a.

- [x] **B0.1** Пять ручек `*/payments/mock-complete` закрыты тестом: вне development и test каждая отвечает 404; тест
      краснеет при ослаблении `isMockPaymentConfirmEnabled`. Почему это здесь, а не в плане тарифов: владелец 30.07 —
      «всё что пройдёт аудит по биллингу и оплате saas — записать в актуальный план задачи именно по биллингу и оплате».
      Почему это блокер: все пять ручек висят на одном предикате (`mockPaymentGatePolicy.ts:19-20`), две из них
      публичные и без аутентификации, тестов нет ни на предикат, ни на сами ручки, а схема окружения имеет дефолт
      `NODE_ENV='development'` (`config/env.ts:27-29`) — то есть одно ослабление предиката открывает подтверждение
      платежей наружу, и ничто не покраснеет. Разрешение спора двух триажей: `../runs/tariff-mechanics/S4_ADJUDICATE_RESULT.md`.
      _Доказательство 01.08: `440441c15` — 25 тестов (предикат + каждая ручка отдельно + дефолт схемы). Ослабление предиката роняет 12 из 25; снятие гейта в одной ручке роняет ровно её два теста. Ручек пять, не шесть._

### B1. Одна дверь оплаты — решения владельца 01.08

- [x] 🔴 **B1.1 ОДНА ДВЕРЬ ОПЛАТЫ.** Решение владельца 01.08, дословно: «Одна дверь оплаты, у которой
      обязательные поля: кто платит, за что, сколько, куда вернуть». И следом: «переводи оплату на один
      порт».
      **Что сегодня:** платёж собирают вручную в пяти местах (`modules/payments/service.ts` ×3,
      `modules/saas-billing/service.ts` ×2), каждое зовёт адаптер напрямую. Обязательных полей у вызова
      нет: адрес возврата едет в свободном мешке `metadata`, поэтому три места его кладут, а два — нет,
      и никто этого не замечает. Адаптер ЮKassa, не найдя адреса, подставляет `https://yookassa.ru`
      (`infra/payments/yookassaPaymentProvider.ts:175`) — то есть **клиника, оплатившая тариф, остаётся
      на сайте провайдера и к нам не возвращается**. Деньги при этом доходят: оплату подтверждает
      уведомление, а не возврат человека.
      **Что делаем:** обязательные поля у самой двери — кто платит, за что, сколько, куда вернуть.
      Забыть нельзя: код не соберётся. Запасные подстановки из адаптеров удаляются, угадывать нечего.
      «За что» становится значением, а не отдельным куском кода на каждый повод.
      _Доказательство 01.08: ручной SaaS-счёт проходит через `createIntent`
      (`apps/webapp/src/modules/saas-billing/service.ts:197`); адаптеры кладут три значения в
      provider payload, а отрицательная type-проверка не допускает дверь без `payerRef`
      (`apps/webapp/src/infra/payments/paymentProviderIdentity.unit.test.ts:32`). Лично пройдено:
      `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/infra/payments/paymentProviderIdentity.unit.test.ts`
      — 9 tests; `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec eslint .`._
      _Fix-round 01.08: `61c7ebd148b73d89872b159910a2c550bdec5365` передаёт обязательный return URL
      в `payment_data.confirmation.return_url` сформированного YooKassa invoice request
      (`apps/webapp/src/infra/payments/yookassaPaymentProvider.ts:206`); тот же provider-payload test
      краснеет при удалении поля и после восстановления зелёный в наборе 9 tests. Отчёт:
      `BILLING_PAYMENT_DOOR_R3_FIX_REPORT.md`._
      _T-Bank currency fix 01.08: этот product commit сохраняет принятую `currency` в
      `DATA` (`apps/webapp/src/infra/payments/tinkoffPaymentProvider.ts`) и до HTTP отказывает
      `currency !== 'RUB'`; удаление `DATA.currency` снова роняет provider assertion, а non-RUB test
      подтверждает отсутствие `fetch`. Проверки: SaaS billing suite 14 tests, typecheck, scoped lint,
      `git diff --check`; отчёт `BILLING_PAYMENT_DOOR_R3_AUDIT_REPORT.md`._

- [x] **B1.2 Опознание плательщика — до двери, в одном месте.** Владелец 01.08: «публичная запись
      держится на телефоне или имэйле одинаково». Сессия, подтверждённый телефон, подтверждённая почта —
      три равноправных способа доказать, кто ты. Дверь оплаты про них не знает: ей приходит уже
      опознанный плательщик. Это снимает деление маршрутов на «в кабинете» и «публично», которое сегодня
      удваивает один и тот же код.
      _Закрыто 02.08: product `bbf2f4474`, independent audit `566082b49`, report
      `docs/_TODO/runs/billing/B1.2_PAYER_IDENTITY_INDEPENDENT_AUDIT_2026-08-02.md`. Сессия/SMS/verified
      email сходятся в один `platformUserId`; public phone payment-status, телефон в payment query/return URL
      и contact-based payment method удалены. Acceptance: 5 unit + 5 route; fault injections убито 2/2
      класса, непойманных 0; typecheck/scoped lint/diff green._

- [x] 🔴 **B1.4 КАТАЛОГ ТОВАРОВ ВЫРЕЗАЕТСЯ ЦЕЛИКОМ. Решение владельца 01.08, дословно: «вырезай каталог».**
      Предыстория того же дня: «вырежи этот коммит просто из кода» (про `d8f739587` от 29.05, «booking
      stage 7 products»), «я никогда не просил продавать „промо" - это противоречит смыслу», «подписка и
      доступ к контенту это одно и то же».

      **Что установлено фактами, а не мнением:**
      · Каталог заводится в **Расписание → Настройка → Пакеты**; восемь видов позиций; на dev **ноль
        позиций и ноль покупок** за два с лишним месяца.
      · Из восьми видов реально что-то делают три: курс (зачисляет на курс), абонемент (выдаёт пакет
        визитов), доступ к материалам (открывает страницы). Остальные пять — разовый приём, подарочный
        сертификат, акция, подписка, индивидуальное предложение — либо дублируют предоплату приёма, либо
        обрабатываются как абонемент, либо не делают ничего.
      · **Цена задана дважды.** У абонемента своя `price_minor` (`be_subscription_packages`), у курса своя
        (`courses`), и у карточки каталога своя (`be_products`). Какая спишется — зависит от пути покупки.

      **Целевое:** курс продаётся из курса, абонемент — из абонемента, и оба идут через единую дверь
      оплаты (B1.1). Тогда у каждой вещи одна цена, и расходиться нечему. Третьей таблицы с копией цены
      не существует.

      ⛔ **Уточнение владельца 01.08, дословно: «курсы пока не сделаны вообще так что это не сейчас
      работа».** Значит собственный путь продажи КУРСА в этот заход НЕ строится — терять нечего, курсов
      как продукта ещё нет. Каталог вырезается, продажа курса появится вместе с самими курсами.
      Абонементы существуют своим кодом, их продажа остаётся у них.
      ⛔ **Прод:** на dev покупок ноль, про прод неизвестно.
      Данных нет нигде: на dev ноль строк, про прод владелец 01.08 подтвердил — «там нет этого».
      Значит удаление обычное, без проверок на непустоту.

      _Закрыто 01.08 product `82879072e` + integration `9ba46b865` + audit `b7ce6e033` + bounded
      fix текущего коммита. `catalogRemovalB14.unit.test.ts` — 3/3: запись без product purchase,
      продажа и списание абонемента; все три fault injection красные. Лид повторил
      `check-p0-12-json-payloads`, `check-saas-db-regression`, journal sync, raw-SQL gate, webapp
      typecheck и exact orphan census — exit 0. Отчёт:
      `docs/_TODO/SAAS_FOUNDATION/BILLING_CATALOG_REMOVAL_AUDIT_REPORT.md`._

- [x] 🔴 **B1.3 ПРЕДОПЛАТА ЗА УСЛУГУ — БЕЗ ТОВАРОВ.** Решение владельца 01.08, дословно: «пока мы не
      усложняем и не делаем никакие товары - у нас есть стоимость услуги, можно добавить поле «сумма
      предоплаты» (будет либо ноль, либо полная, либо своя стоимость) и для оплаты при записи брать ее
      если включена галочка - брать предоплату. Нужна галочка брать предоплату. И нужна проверка что
      платежный провайдер доступен на тарифе и настроен в кабинете. если нет - то поля предоплата и
      галочка брать предоплату - недоступны».
      Состав: у услуги появляется галочка «брать предоплату» и поле суммы предоплаты (ноль · полная
      стоимость · своя сумма). При записи берётся эта сумма, если галочка включена. Обе настройки
      недоступны, пока платёжный провайдер не доступен по тарифу И не настроен в кабинете клиники.
      ⛔ Товары для этого НЕ используются и не расширяются.

      ⚠️ **Замер 01.08 перед постановкой работы: построено почти всё, остаётся один кусок.** Экран
      настройки предоплаты существует (`app/app/settings/BookingPrepaymentSection.tsx`), режимы
      существуют (`disabled` · `full_price` · `fixed_minor` · `percent` — ноль, полная и своя у владельца
      закрыты первыми тремя), сумма при записи уже берётся (`canonicalCreate.ts:343-346` →
      `resolvePrepayment`), проверка «провайдер настроен в кабинете» существует
      (`modules/payments/service.ts`, `providerHasCredentials` + `resolveActiveProvider`, отказ
      `payment_provider_unavailable`).
      **Не сделано ровно одно:** проверка срабатывает ПОЗДНО — в момент оплаты. Клиника может включить
      предоплату без доступного провайдера, не узнать об этом и упереться на пациенте. Работа сводится к
      закрытию настройки с видимой причиной; отказ на записи остаётся последним рубежом, потому что тариф
      и настройки меняются после включения. Нового экрана и новой таблицы не заводить.
      _Доказательство 02.08: `pnpm --dir apps/webapp exec vitest run --project fast src/modules/payments/service.test.ts`
      — 6 tests; `pnpm --dir apps/webapp exec vitest run --project route src/app/api/admin/booking-engine/prepayment-policies/route.route.test.ts`
      — 4 tests; `pnpm --dir apps/webapp exec vitest run --project ui src/app/app/settings/BookingPrepaymentSection.ui.test.tsx`
      — 2 tests; `pnpm --dir apps/webapp typecheck`; scoped `pnpm --dir apps/webapp exec eslint src/app-layer/guards/requireEntitlement.ts src/modules/payments/service.ts src/modules/payments/service.test.ts src/app/api/admin/booking-engine/prepayment-policies/route.ts src/app/api/admin/booking-engine/prepayment-policies/route.route.test.ts src/app/app/settings/BookingPrepaymentSection.tsx src/app/app/settings/BookingPrepaymentSection.ui.test.tsx`; `git diff --check`.
      Fault injection: инверсия provider gate в PUT делает route test provider-unavailable красным (200 вместо 409), затем gate восстановлен._

- [x] **B1.5 Первый тарифный платёж и оплаченные дополнительные места (#1057/#1069 §5.1).** Первый
      `tariff_period` capture законно устанавливает период из NULL и завершает активный trial; ранний платёж
      будущего периода ждёт точной границы. `seat_overage` capture/refund меняет только
      `paid_additional_seats`, один раз, и не двигает тариф/статус/период/snapshot. Invite/accept/UI capacity =
      `(override ?? includedSeats) + paidAdditionalSeats`; pending invoice места не даёт. Renewal сохраняет
      количество и берёт `base + quantity × unit`; без unit price отказывает до PSP. Team/Billing переиспользуют
      существующий billing route/overview и возвращают сохранённый invite после checkout; новая таблица/route/provider
      не добавлены.
      _Доказательство 02.08:_ первичный кандидат `2f91ad586` отклонён аудитом `06527f952`, потому что smoke
      повторял product SQL вручную (2 caught / 6 uncaught). Исправленный
      `check-c4a-843-clinic-invite-concurrency.mjs` на том же disposable PostgreSQL 16 вызывает реальные
      `createPgOrganizationInvitesPort`/`createPgSaasBillingRepository`: команда
      `node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` — exit 0. Шесть прежних непойманных
      мутаций теперь дают exit 1; вместе с двумя классами, уже пойманными аудитом, итог **8/8, uncaught 0**.
      `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/app/api/clinic/billing/route.route.test.ts src/app/api/clinic/invites/route.route.test.ts src/app/app/settings/TeamSection.ui.test.tsx src/app-layer/guards/cabinetAccessLadder.test.ts` —
      5 файлов, 51/51; webapp typecheck, scoped ESLint, migration/journal/schema/raw-SQL gates и diff-check — exit 0.
      `0308` нигде не применялась; live TEST card→webhook acceptance остаётся открытой в B0.3.

---

### Phase 4 — достройка SaaS billing поверх существующих PSP (keyless-safe)

> ⛔ **SUPERSEDED — 30.07, replaced by §5a этапом 2 и каноном §4a.** Всё, что ниже в этой фазе описывает жизненный цикл
> доступа фиксированными числами (grace 7 дней → read-only 21 день → blocked, три попытки списания), — отменено:
> длительности, число попыток и конечное состояние стали ПОЛЯМИ, которые задаёт владелец на уровне системы и на уровне
> каждой механики. Дословно 30.07: «ты вообще не должен решать что ограничивать а что нет. ты должен дать мне механизм».
> Значения 7/3/21, засеянные миграцией `0259_saas_billing_foundation.sql:238-242`, тоже подлежат снятию (пункт 2.6a).
> Читать эту фазу можно только как описание платёжной механики; лестницу брать из §5a.


> **Провенанс решений этой фазы:** [`SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md`](./SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md)
> — разведка мировой практики по прямому распоряжению владельца 27.07 («узнать, как делают в реальной практике»).
> Там зафиксировано и обосновано: ключи в `system_settings`, а не в env; автопродление у ЮKassa = сохранённый
> способ оплаты, а не серверная подписка, и в боевом магазине оно ВЫКЛЮЧЕНО до обращения к менеджеру — поэтому
> примитивом делается СЧЁТ, а автосписание строится поверх него; grace 7 дней + 3 попытки → `read_only`, никогда
> автоматический `blocked`; чек по 54-ФЗ не нужен при переводе от ООО/ИП. Там же §6 — пять развилок владельца
> (получатель денег и НДС, включены ли автоплатежи, карты или только перевод, числа grace, шифрование секретов),
> ни одна из которых слайсу на `mock`-адаптере не требуется.
> Чек-лист работ — ТОЛЬКО этот файл ниже; разведка задач не заводит.
>
> **РЕШЕНИЕ ВЛАДЕЛЬЦА по просрочке (27.07), и честное разделение авторства** — раньше оно лежало только в
> разведке, а разведка решений не хранит (см. её же баннер), поэтому переносится сюда:
> — «7 дней мягкого периода с 3 попытками списания → потом режим "только чтение"» — **предложение агента** по
> мировой практике, владелец ответил «ок»;
> — «**Только чтение ещё на три недели. Потом блок на вход.**» — **слова владельца**, его собственное
> дополнение, в практике-разведке этого не было.
> Итого действующая лестница: 7 дней grace с 3 попытками → 21 день `read_only` → `blocked`. Автоматический
> `blocked` минуя `read_only` запрещён.

Урезанная версия S4-4: **только** оплата клиникой тарифа (SaaS-подписка, `saas_billing_subscription` — НЕ mechanic
`subscriptions`, см. риск §8.7), БЕЗ store package orders (S4-3 вне scope).

> **Ретриаж 2026-08-01 (`wt/tariff-plan-triage`):** четыре пункта ниже помечены «НЕ СДЕЛАНО» текстом, который
> писался ДО коммитов `53dd848c2`/`f773c5d8c`/`9bfa4303c` (2026-07-27/28, «SaaS billing foundation» +
> «read-only subscriptions/invoices») — этот файл не обновлялся после их слияния (последняя правка файла
> `05216970b`, 27.07 17:14, коснулась только денежного инварианта, не этих строк). Реальность на 2026-08-01
> ниже под меткой **✅ УТОЧНЕНО 08-01**; исходный текст «НЕ СДЕЛАНО» оставлен рядом как след прежнего замера,
> не переписан.

ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Создать отдельный `modules/saas-billing` domain с ports/service/typed state machine».
- Новый домен `modules/saas-billing` (ports/service), DI через `buildAppDeps`, переиспользует существующий
      `PaymentProviderPort`/`paymentProviderRegistry` — не форкает и не переписывает адаптеры (владелец §1).
      — НЕ СДЕЛАНО: подтверждено дважды независимо (`find apps/webapp/src/modules -iname "*saas-billing*"` — пусто;
      `ls apps/webapp/src/modules | grep -i bill` — пусто). Тот же открытый пункт, что S4-4 в
      `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 (строки 313-370, всё ещё `[ ]`, без commit-ссылок).
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `apps/webapp/src/modules/saas-billing/{ports.ts,service.ts,settings.ts,
      paidPeriod.ts,providerEventEnvelope.ts,service.test.ts}` существуют; DI — `buildAppDeps.ts:247-249,745-760,1834`
      (`createSaasBillingService`, `deps.saasBilling`); переиспользует `PaymentProviderPort`/`resolvePaymentProvider`,
      не форкает адаптеры (`service.ts:1-6,29-44`).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить минимальные org-owned records: billing account, source-aware tariff subscription, invoice/order и normalized provider event.»
- Минимальные org-owned таблицы: billing account, **`saas_billing_subscriptions`**
      (`pending_payment → active → expired/cancelled`), invoice (снимок tariff/amount/currency/period), provider event
      (idempotent, без patient data). **Именование обязательно дизъюнктно с mechanic `subscriptions`:** в `MECHANICS`
      уже есть ключ `subscriptions` ([`org-entitlements/types.ts:14`](../../../apps/webapp/src/modules/org-entitlements/types.ts))
      = «разрешены ли клинике пациентские абонементы» — совсем другая сущность. Все таблицы/типы/переменные Phase 4
      используют префикс `saas_billing_*` / `SaasBillingSubscription`, голое слово «subscription» в новом коде запрещено
      (см. риск §8.7).
      — НЕ СДЕЛАНО: `grep -rn "SaasBillingSubscription\|saas_billing_subscriptions" apps/webapp` — 0 совпадений в схеме
      и коде. Найден только dormant-плейсхолдер `DormantSaasMerchantIdentity` в
      `apps/webapp/src/modules/payments/merchantIdentityContracts.ts:8-20` с явным комментарием «S4-0 declares this
      only; S4-4 owns its DB setting and activation» — заготовка есть, реализации нет.
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО, дизъюнктное именование соблюдено.** `apps/webapp/db/schema/saasBilling.ts`:
      `saasBillingAccounts`/`saasBillingSubscriptions`/`saasBillingInvoices`/`saasBillingProviderEvents`
      (`pgTable`, строки 41/77/154/237); статусы подписки — `SAAS_BILLING_SUBSCRIPTION_STATUS_VALUES` включает
      `pending_payment`; миграция `0259_saas_billing_foundation.sql`. Ни одного голого `subscription`-идентификатора
      не найдено (`grep -in "^export.*\bsubscription\b" db/schema/saasBilling.ts` — 0 совпадений вне префикса).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Перенести существующие manual `tariff_id` assignments в subscription/access rows с source=`manual`».
- Перенести существующие manual `tariff_id` assignments (из Phase 3) в `saas_billing_subscriptions` rows с
      `source="manual"`; compatibility-projection `be_organizations.tariff_id` остаётся согласованной, не второй истиной.
      — НЕ СДЕЛАНО: зависит от предыдущего пункта (таблицы `saas_billing_subscriptions` не существует).
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `service.ts:51-112` `assignManualTariff()` — атомарная транзакция:
      `setManualSaasBillingSubscription({..., tariffId})` создаёт/обновляет subscription с `source` (значения
      `SAAS_BILLING_SOURCE_VALUES = ['manual','paid_subscription']`), затем `updateCompatibilityProjection()`
      держит `be_organizations.tariff_id` согласованным той же транзакцией — не вторая истина. Вызывается из
      `POST /api/admin/commercial` action `assign_tariff` (Phase 3), значит manual-путь Phase 3 уже проходит
      через эту таблицу, а не только через compatibility-projection напрямую.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить global DB setting `saas_billing_payment_provider` в `ALLOWED_KEYS`».
- Новый global setting-ключ `saas_billing_payment_provider` в `ALLOWED_KEYS`
      ([`system-settings/types.ts`](../../../apps/webapp/src/modules/system-settings/types.ts)) — **отдельная** identity
      от `booking_payment_providers` (владелец не путает platform merchant с per-clinic booking merchant — см. S4 §3).
      **Хранилище — `system_settings` (restricted-контур), решение с доказательством, не «временное».** S5-слайс уже
      реализован (`f846eb920`, см. Reality lock), но `app_runtime_settings` — по built-контракту patient-safe без
      секретов: «Restricted integration/admin settings remain in `system_settings`»
      ([`appRuntimeSettings.ts:15-18`](../../../apps/webapp/db/schema/appRuntimeSettings.ts),
      [`0186_app_runtime_settings.sql:1-3`](../../../apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql)),
      а S5-дизайн явно относит «payment credentials» к Restricted ([`SAAS_S5_SETTINGS_ROOT_SPLIT.md` §1.1](./SAAS_S5_SETTINGS_ROOT_SPLIT.md)).
      Этот ключ несёт provider-секреты (shopId/secretKey/webhookSecret) → `system_settings`. Если Phase 4 понадобится
      клиентский НЕ-секретный флаг (например «SaaS checkout включён») — вот ЕГО можно завести как отдельный
      `derived_runtime`-ключ в `app_runtime_settings`; секретный envelope туда не попадает никогда.
      IA-зона этого конфига — **PLAT-05 Configuration** («platform integrations… platform defaults», см. §0a), не
      `MGMT-03`/`MGMT-07` (org booking payments/integrations) — тот же разрез, что канон уже зафиксировал для текущей
      `admin/booking/payments` страницы в `ROUTE_MIGRATION_MAP.md` строке **S25** (см. §0a). UI-поле для этого ключа
      живёт на той же PLAT-страницу(ах), что и Phase 3 (или соседней PLAT-05 секции), не смешивается с org Settings.
      Redaction/secret-handling по тому же паттерну, что уже есть у `booking_payment_providers` в
      [`admin/settings/route.ts`](../../../apps/webapp/src/app/api/admin/settings/route.ts).
      — НЕ СДЕЛАНО: `apps/webapp/src/modules/system-settings/registry.ts` не содержит ключа
      `saas_billing_payment_provider` (только `booking_payment_providers`). Только dormant-заготовка из предыдущего
      пункта (`merchantIdentityContracts.ts`, `activation: "dormant_until_s4_4"`), сам ключ не зарегистрирован.
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `system-settings/registry.ts:313-318` — `saas_billing_payment_provider:
      restricted('admin','global','secret_envelope','mock','redacted')`; `redactSaasBillingPaymentProviderValue`/
      `mergeSaasBillingPaymentProviderSecretsRetain` в `saas-billing/settings.ts:124-162` делают redaction тем же
      паттерном, что `booking_payment_providers`.
- [x] Дефолтный provider id = `"mock"` (уже существующий адаптер, [`paymentProviderRegistry.ts:25-26`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts))
      до тех пор, пока владелец не передаст реальные ключи. Схема/сервис/UI/webhook реализуются и проверяются
      **полностью** на mock-адаптере — отсутствие реальных ключей не блокирует ни один из этих пунктов.
      — ✅ **ЗАКРЫТО, УТОЧНЕНО 08-01** (первичный текст «НЕ СДЕЛАНО, нечему быть дефолтным» был верен на момент
      написания 27.07, устарел после коммитов того же дня): `saas-billing/settings.ts:3`
      `DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID = 'mock'`; читается и потребляется —
      `service.ts:29-44` `resolvePaymentProvider()` выбирает провайдера по этому id из настройки. UI/webhook для
      **приёма** оплаты по нему по-прежнему не существуют (см. пункты «Checkout UI» и SaaS webhook ниже — те
      остаются открытыми отдельно).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить SaaS webhook route под bootstrap principal: load global provider config → verify signature/status».
- `POST /api/payments/saas-webhook/[provider]` (новый, отдельный от booking-webhook) под bootstrap principal:
      load global config → verify signature/status через существующий `verifyWebhook` → resolve invoice /
      `saas_billing_subscription` → org-scoped capture. Неизвестный ref — safe-acknowledge; forged
      signature/amount/currency mismatch/replay не меняют доступ.
      — НЕ СДЕЛАНО: `find apps/webapp/src -iname "*saas-webhook*"` — пусто. Существующие роуты —
      `api/payments/webhook/[provider]` (booking) и `api/payments/patient-acquiring-webhook/[provider]` — оба
      pre-existing, разные поверхности, не тронуты и не дублированы (это ок — не в scope).
      — ✅ **СДЕЛАНО 01.08**, коммит `f2167c1d0`, приземлён в `feat` как `256fbcac1`. Маршрут
      `apps/webapp/src/app/api/payments/saas-webhook/[provider]/route.ts`. Оракул закрыт слепым независимым
      аудитом `audit-billing-saas-webhook`: 11 поломок внесено в продуктовый код, 9 пойманы тестами —
      подделка подписи, повтор события, несовпадение суммы, несовпадение валюты, неизвестный ref,
      запись в подменённую организацию, импорт entitlement-гейта в маршрут, инверсия типа события.
      Инвариант «заблокированная за неуплату клиника обязана мочь заплатить» держит AST-проверка,
      роняющая сборку при value-импорте `requireEntitlement`/`org-entitlements`/`cabinetAccessGate`
      в файл маршрута. Ключи провайдера — только `system_settings`, новых env-переменных нет.
      Открытые следствия из аудита — три пункта ниже.
- [x] ✅ **Проверка подлинности вебхука ЮKassa — СДЕЛАНА, пункт был устаревшим.** Сверено с кодом 01.08
      (лид, по прямому вопросу владельца «ты читал апи?»). Прежний текст этого пункта утверждал, что
      проверка принимает уведомление по заголовку `Authorization: Basic` или по выдуманной подписи
      `x-yookassa-signature`. В `infra/payments/yookassaPaymentProvider.ts` на 01.08 стоит ровно то, что
      предписывает документация ЮKassa: сначала адрес отправителя сверяется со списком их подсетей
      (`isYookassaSenderIpAllowed`), затем объект перезапрашивается по их интерфейсу, и статус, сумма и
      валюта берутся из ответа. В коде это прямо названо барьером: тело уведомления используется только
      чтобы понять, про платёж речь или про возврат, и никогда для итогового статуса. `Authorization:
      Basic` в файле есть, но это НАШИ исходящие запросы к ним, как и должно быть.
      ⚠️ Урок, ради которого пункт оставлен в плане: он год простоял как «🔴 блокер» и был процитирован
      владельцу как живая проблема — потому что читали план, а не код. Прежде чем нести владельцу пункт
      плана как факт, открыть файл.

- [x] **Сверка валюты реального провайдера нормализована до trusted payload.** ЮKassa берёт валюту из
      повторно запрошенного `remote.amount.currency` и кладёт её в `payload.currency`; маршрут сверяет это
      значение со счётом. Доказательство: существующий nested-USD сценарий
      `saasWebhook.route.test.ts` возвращает `currency_mismatch` и оставляет invoice `pending`.
- [x] **Ветка отсутствующего `webhookSecret` (503) покрыта тестом.**
      `saasWebhook.route.test.ts` проверяет `webhook_secret_missing` и нулевые provider fetch/capture.
- [x] **Ветка неизвестного провайдера в URL (400) покрыта тестом.**
      `saasWebhook.route.test.ts` проверяет `payment_provider_unavailable` и нулевые provider fetch/capture.
- [x] **Работа над mock-shape не нужна.** После решения владельца удалить mock product surface его census
      равен нулю: production registry/default provider-backed, mock provider/routes/gate отсутствуют.
      Переписывать несуществующий mock в форму ЮKassa было бы возвратом удалённого пути.

**Как принимают оплату ЮKassa в мире — разобрано 01.08 (владелец: «ищи как делают в мире»).**
Официальных SDK у ЮKassa два: **PHP и Python**. Для Node/TypeScript официального нет —
на странице SDK лежат только сообществоные (`@a2seven/yoo-checkout`, версия WEBzaytsev) с дословной
оговоркой: «All SDKs in this section are written by third-party developers. YooKassa does not review
their code». Поэтому мировая практика для Node — **прямые вызовы REST API v3**: Basic-авторизация
`shopId:secretKey` плюс заголовок `Idempotence-Key` на каждый POST. Это ровно то, что у нас уже
написано в `createIntent`/`refund` — менять транспорт не на что, community-обёртка добавила бы
непроверяемую зависимость в денежный путь ради тех же трёх запросов.
**Тестовая среда у ЮKassa есть и она полноценная:** тестовый режим доступен сразу после регистрации,
до 20 тестовых магазинов, у каждого свои `shopId`/`secretKey`, адрес API тот же боевой
(`https://api.yookassa.ru/v3`), тестовые платежи помечаются `test: true`, есть тестовые карты
(в том числе без 3-D Secure для рекуррентов). Деньги не списываются, путь платежа идентичен боевому.
Следствие для плана: **интеграцию проверяем против тестового магазина, а не против мока** — мок
остаётся только для юнит-уровня. ⛔ **Гейт владельца:** нужны `shopId` и `secretKey` тестового
магазина; кладутся в `system_settings`, не в env.
- [ ] Checkout UI — **другая зона от Phase 3.** Clinic-facing план/usage/инвойсы/оплата = **`MGMT-08` Plan, usage
      and billing** («Current plan, limits, invoices, recovery | Owner; delegated view/pay if explicitly allowed», см.
      §0a) — внутри обычного tenant-дерева `/app/doctor/**` (не в `(global-admin)` route group из Phase 3). Новая
      страница/секция под clinic settings/organization area; возвращает provider checkout URL; return page сверяет
      invoice/order по server-derived org, никогда не берёт сумму/tariff/target org от клиента.
      — НЕ СДЕЛАНО как SaaS-checkout, но соседняя READ-ONLY поверхность в той же MGMT-08 зоне уже существует:
      `apps/webapp/src/app/app/settings/BillingSection.tsx` (+ `billingCommercialState.ts`, вкладка `"billing"` в
      `settingsTabs.ts`) показывает название тарифа, human-readable commercial-state и грид всех механик — но БЕЗ
      checkout/invoice/payment-history/upgrade (`grep -in "invoice\|checkout\|payment history"` на обоих файлах —
      ничего), с явным комментарием в коде: «No tariff-change UI here by design — that stays with the platform
      administrator» (commit `60b43d757`). Живой скриншот этой страницы — `runs/screenshots/billing-real.png`
      (25.07, видны все 15 механик со статусом «Включено»). Это НЕ закрывает пункт плана (нет ни одного элемента
      checkout), но следующая реализация Phase 4 должна расширить/заменить этот компонент, а не дублировать новый.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Tariff capture активирует/продлевает source=`paid_subscription`; expiry/cancel/refund завершает только этот source.»
- Успешный capture продлевает `source="paid_subscription"`; expiry/cancel/refund завершает только этот source;
      manual global-admin assignment не перетирается истёкшей подпиской молча.
      — НЕ СДЕЛАНО: зависит от несуществующего billing-модуля.
      — **УТОЧНЕНО 08-01: модуль уже существует, вызывающего пути capture по-прежнему нет.**
      `saas-billing/service.ts:114-142` `createRenewalSaasBillingInvoice()` создаёт invoice и провайдерский intent,
      но ни один route/action её не вызывает (`grep -rn "createRenewalSaasBillingInvoice" apps/webapp/src` — только
      определение в `service.ts`). `source="paid_subscription"` в схеме объявлен
      (`SAAS_BILLING_SOURCE_VALUES`), но ни одна строка в продуктовом коде его не устанавливает — только `"manual"`
      через `assignManualTariff()`. Пункт остаётся открытым по существу.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «До кода зафиксировать subscription state machine минимум для».
- Деградация при `expired`/`past_due` — сверить с каноном 4-состояний entitlement denial (`upgrade/grace/
read-only/blocked`, [`ROLE_CAPABILITY_MATRIX.md:17`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md),
      см. §0a) при проектировании state machine: истечение подписки не обязано мгновенно бить `blocked` на все
      mechanics — решить явно (grace-период до hard block — инженерный выбор этой фазы, не молчаливый пробел).
      — ЧАСТИЧНО заложен фундамент: `checkEntitlement()` в `requireEntitlement.ts:19-38` уже различает
      `active`/`read_only`/`blocked` lifecycle (не `upgrade`/`grace` полностью, 3 из 4 состояний канона) и протестирован
      (`requireEntitlement.test.ts` кейсы «allows reads in read-only lifecycle but rejects mutations», «allows recovery
      reads in blocked lifecycle»). Но САМА подписка/её state machine, которая переводила бы lifecycle по `expired`/
      `past_due`, не существует — фундамент для потребления есть, источника события (billing) нет.

- [x] **Фискализация: объект `receipt` в платеже и возврате.** Заведено ПРЯМЫМ распоряжением владельца 27.07:
      «И облачную кассу будем подключать» → на уточнение «поле `receipt` в платеже» — **«делай конечно как надо.
      чеки и касса будут»**. Разведка с источниками:
      [`CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md`](./CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md).
      Форма правки — **одно типизированное поле `receipt?` в параметрах `createIntent`; refund — union: полный без
      receipt, частичный с обязательным receipt**
      ([`modules/payments/providerPort.ts:12-18`](../../../apps/webapp/src/modules/payments/providerPort.ts)),
      подмешиваемое в тело запроса ЮKassa, когда оно есть
      ([`infra/payments/yookassaPaymentProvider.ts:79-87`](../../../apps/webapp/src/infra/payments/yookassaPaymentProvider.ts)).
      Не форк адаптера, не второй провайдер. Адаптер без поддержки переданного чека обязан отказать, а не молча
      проигнорировать его. `PaymentProviderConfig` не меняется — чек это данные операции, а не учётка провайдера.
      Состав: `customer.email` (обязателен — ЮKassa доставляет чеки только письмом), `items[]` с `description`,
      `quantity`, `amount`, `vat_code`, `payment_subject: "service"`, `payment_mode: "full_prepayment"`,
      `measure: "piece"`; сумма позиций равна сумме операции. `tax_system_code` — условное поле только для той
      сторонней кассы/конфигурации, которая его требует; сервис «Чеки от ЮKassa» поле игнорирует.
      **`vat_code`, а при действительно требующей его сторонней кассе и `tax_system_code`, — НАСТРОЙКИ кабинета
      глобального админа, не константы** (правило
      [`OWNER_PRODUCT_RULES.md` §19](../../ARCHITECTURE/OWNER_PRODUCT_RULES.md)); доказательство обязательности:
      с 01.01.2026 `4`=20 % соседствует с `11`=22 % и `12`=22/122 — захардкоженная ставка неверна уже сегодня.
      **Порядок обязателен: СНАЧАЛА поле в коде, ПОТОМ тумблер кассы в кабинете ЮKassa.** Как только фискализация
      включена, ЮKassa отклоняет создание платежа без `receipt` (`INVALID_REQUEST`, параметр `receipt`) — то есть
      включение кассы без этой правки ломает ВСЕ платежи.
      Сама касса подключается в кабинете ЮKassa (Настройки → Онлайн-касса), НЕ у нас. Выбор «Чеки от ЮKassa» или
      партнёрской кассы влияет на обязательность `tax_system_code` и на способ TEST-приёмки, поэтому фиксируется до
      включения кассы, но общий receipt contract/порт остаётся один.
      Полный возврат отправляется без `receipt`: ЮKassa строит чек возврата из исходного платежа. Частичный возврат
      обязан передать receipt с суммой позиций ровно на сумму возврата; исходный email/VAT/описание для этого надо
      хранить снимком, а не пересчитывать из изменившихся настроек.
      — Реализовано 02.08: единый `PaymentProviderPort.receipt?`; YooKassa сериализует его в payment,
      invoice payment_data и partial refund, остальные адаптеры явно отклоняют supplied receipt. SaaS service
      берёт VAT/tax-system code из существующих global-admin `payeeRequisites`, email — из billing account и
      сохраняет исходный receipt в invoice snapshot для частичного возврата. Проверено тем же коммитом:
      `pnpm --dir apps/webapp exec vitest run --project unit src/infra/payments/paymentProviderIdentity.unit.test.ts`
      (13 passed), `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts`
      (29 passed), scoped ESLint, `pnpm --dir apps/webapp typecheck`, `git diff --check`; direct fault injection
      `assertReceiptSupported` → no-op сделала тест явного отказа красным, после восстановления — зелёным.
      Официальные источники: [OpenAPI](https://yookassa.ru/developers/api/yookassa-openapi-specification.yaml),
      [платежи с чеками](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/payments),
      [возвраты](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/refunds),
      [приёмка](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/basics).
      Живой TEST 03.08 после включения онлайн-кассы владельцем дошёл до ЮKassa с рабочими Shop ID/ключом,
      но провайдер вернул `400 invalid_request: Receipt is missing or illegal`: в global-admin
      `payeeRequisites` не заданы `vatCode`/`taxSystemCode`, а у billing account не было email. Продуктовый
      разрыв email закрыт `aba3aa990` / land `3b6c1cc52`: владелец или администратор клиники сохраняет email
      для чека на существующей вкладке «Тариф и биллинг», та же clinic-billing роль читает его обратно; живая
      команда получила `PATCH /api/clinic/billing` → `200` и следующий `GET` → `200` с сохранённым email.
      Full CI общего land: `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` → `exit 0`, `461s`;
      TEST deploy: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` → `exit 0`, лог
      `deploy-test-20260803T040130Z-2733069.log`. B0.3 остаётся открыт: до checkout/card/webhook владелец должен
      указать фактические `vatCode` и, если его касса требует, `taxSystemCode`; подставлять налоговые значения
      агенту запрещает `OWNER_PRODUCT_RULES.md` §19.
      Форма для этих значений добавлена 03.08 в существующий экран глобального администратора «Платежи»:
      она редактирует ту же запись `saas_billing_payment_provider`, сохраняет Shop ID и новый секретный ключ
      через уже существующее удержание секретов, а также принимает только коды НДС ЮKassa `1–12` и условный
      код системы налогообложения `1–6`. Новая таблица и новый API не создавались. B0.3 по-прежнему открыт до
      ввода владельцем фактического налогового значения и живого checkout/card/webhook.
      Land `92ae95059`; независимый аудит — PASS. `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` →
      `exit 0`, `472s`; `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` → `exit 0`, лог
      `deploy-test-20260803T042919Z-2783584.log`. Живой TEST под обычной сессией глобального администратора:
      login/admin-mode/GET settings/PATCH settings → `200/200/200/200`; Shop ID сохранён, ключ возвращён только
      как `[REDACTED]`, фактические `vatCode`/`taxSystemCode` остаются `null` до решения владельца.
      Ограничение доказательства: TEST-магазин проверяет receipt только для режима сторонней кассы; настоящая
      приёмка «Чеков от ЮKassa» требует минимального платежа в реальном магазине и полного возврата после проверки
      обоих чеков. Это не разрешает трогать PROD без отдельной команды владельца.
      Живой B0.3 03.08 после ответа владельца «УСН Доходы, без НДС, никаких медицинских услуг»: через защищённый
      TEST fixture packet и существующий TEST-only credential converger были сведены пароли трёх выбранных
      существующих TEST-аккаунтов (clinic owner, global admin, patient; строгие role/state predicates)
      (`set -o pipefail; sudo -n /usr/bin/node .tmp-b0-3-convergence-input.mjs | sudo -n -u
      postgres /usr/bin/node /opt/projects/bersoncarebot-test/apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs
      --apply-test-from-stdin` → exit 0, `changed=3`), без печати email/password. Использованный session route —
      обычный `POST /api/auth/email-password/login`, затем для глобального администратора обычный
      `POST /api/admin/mode`; dev-bypass и подписывание cookie вручную не использовались. Команда
      `sudo -n /usr/bin/node .tmp-b0-3-admin-write.mjs` → exit 0: login/admin-mode/GET/PATCH/GET
      `/api/admin/settings` → `200/200/200/200/200`; запись `saas_billing_payment_provider` прочитана обратно с
      `vatCode="1"`, `taxSystemCode="2"`, `apiKey="[REDACTED]"`.
      Клиника вошла тем же обычным login-route: `POST /api/auth/email-password/login` → `200`; перед оплатой
      `GET /api/clinic/billing` → `200`, billing email присутствует, paid subscription
      `c5488fdc-6065-4abf-a208-05921ececcd6` имеет `status=active`, `lifecycleState=active`,
      `tariffId=e07db366-f471-40a5-bc9b-499908636acd`. `POST /api/clinic/billing` → `500`
      `{"ok":false,"error":"saas_billing_invoice_failed"}`. Точный повтор того же provider-request с тем же
      сохранённым ключом и телом из draft invoice `e13b2c92-5693-463f-8c3a-274cd198bcf7` доказал, что receipt уже
      содержит `vat_code=1` и `tax_system_code=2`, но `POST https://api.yookassa.ru/v3/payments` → `400`:
      `{"type":"error","id":"019fc6ca-1a9f-7255-806f-dbb149e4cb32","description":"You've already used this idempotence key for another request within the past 24 hours. Repeat the request with another idempotence key","parameter":"Idempotence-Key","code":"invalid_request"}`.
      Не хватает нового `Idempotence-Key` при повторе draft invoice после того, как прежний запрос с тем же ключом
      уже был отклонён с другим телом (до ввода налоговых значений); текущий retry вращает ключ только для
      `status=failed`, а provider-create failure возвращает invoice в `draft`. Финальный read-only
      `GET /api/clinic/billing` → `200`: invoice остаётся `draft`, `providerInvoiceRef=null`, `paidAt=null`,
      provider events `0`. По обязательному stop-rule карта не вводилась, webhook/paid/applied tariff не заявлены;
      **вердикт на 03.08: клиника сейчас оплатить тариф на TEST не может**. Код, deploy, push и PROD не трогались.
      **B0.3 idempotency-key регрессия починена 03.08** (`6259357de`, ветка `wt/billing-live-vat`, ещё не
      задеплоена/не запушена): новый `PaymentProviderRequestRefusedError` в `providerPort.ts` — адаптер бросает
      его из `createIntent` только когда ответ PSP ДОКАЗЫВАЕТ, что платёж не создан (ЮKassa 4xx до обработки,
      например `400 invalid_request` при повторном `Idempotence-Key`); `yookassaPaymentProvider.ts` классифицирует
      `!res.ok` по коду статуса (4xx → refused, 5xx/сеть/timeout — прежний обычный `Error`, ключ не трогаем, т.к.
      платёж мог быть создан). `releaseSaasBillingInvoiceProviderIntent` (порт + pg/in-memory реализации) принял
      опциональный `rotateProviderIdempotencyKeyTo`, который `createRenewalSaasBillingInvoice` заполняет только для
      доказанного отказа — тем же детерминированным выводом ключа, что и ручной retry (`invoice.id` + старый ключ),
      поэтому параллельные повторы сходятся на одном новом ключе. Существующая колонка `providerIdempotencyKey`,
      новых таблиц/маршрутов нет. Доказано: `pnpm --dir apps/webapp exec vitest run --project fast
      src/modules/saas-billing/service.test.ts` — 44/44 (3 новых теста: отказ ротирует ключ и повтор проходит другим
      ключом; неоднозначный сбой ключ не меняет и повтор проходит тем же ключом; два параллельных повтора после
      отказа сходятся на одном ключе и провайдер вызывается один раз), `pnpm --dir apps/webapp exec vitest run
      --project unit src/infra/payments/yookassaPaymentProvider.unit.test.ts` — новый файл, 4/4 (400/429 → refused,
      500 → обычный Error, 2xx не затронут); `pnpm --dir apps/webapp typecheck`, scoped ESLint, `git diff --check`
      — чисто. Живой TEST-прогон (карта/webhook) для этого фикса ещё не проводился — пункт «клиника может
      оплатить тариф» остаётся открытым до него; починка снимает именно 24-часовую блокировку повторной попытки.
      **Живой TEST-прогон фикса 03.08, продолжение того же дня (branch `wt/billing-live-vat`).**
      Deploy: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` → `exit 0`, лог
      `deploy-test-20260803T134252Z-3861838.log`. Единственная не-`ok` строка — диагностический
      `E1 post-runtime coverage/read gate` (`saas_isolation_post_runtime_gate_active_unexplained_before_coverage`);
      это известный warn-not-fatal-on-TEST гейт ([[test-deploy-isolation-gate-and-resolve]]), деплой продолжился
      сервисы не останавливались, FORCE-RLS wall assertion прошла отдельно и строго.
      Пароли трёх существующих TEST-аккаунтов (clinic owner `dimmdao@yandex.ru` — тот же owner org
      «Точка Здоровья» `a0000000-0000-4000-8000-000000000001`, что и в прогоне выше; global admin
      `dimmdao@gmail.com`; один client-fixture) сведены тем же классом операции, что и утром (случайные
      TEST-only значения, без печати email/password, через
      `converge-saas-smoke-login-passwords.mjs --apply-test-from-stdin` под `sudo -u postgres`) —
      `changed=3`. Обычный сессионный маршрут: `POST /api/auth/email-password/login` → `200`; `GET
      /api/clinic/billing` → `200`, draft-инвойс `e13b2c92-5693-463f-8c3a-274cd198bcf7` без изменений с утра.
      `POST /api/clinic/billing` (retry) → `500 saas_billing_invoice_failed`; следующий `GET` подтвердил, что
      **идемпотентный ключ РОТИРОВАН** — `providerIdempotencyKey` сменился с утреннего
      `saas_tariff_renewal:78295d73…` на `saas_tariff_refused_retry:d5c8967a30c471dc8a74d38d8341f1b201ceea467f2f38ca8397e337ac1d7c13`
      — прямое живое доказательство, что фикс `6259357de` действует на реальном провайдере, не только в тестах.
      Повторный вызов того же продуктового пути (`saasBilling.createOwnTariffRenewalInvoice` через существующий
      `runWithDbClinicBillingPrincipal`, вызван из одноразового диагностического скрипта — не новый продуктовый
      код, скрипт удалён после использования) на этот раз дошёл до провайдера: invoice перешёл в `status=pending`,
      `providerInvoiceRef=3202b0cd-000f-5001-8000-1177d722639f`,
      `providerCheckoutUrl=https://yoomoney.ru/checkout/payments/v2/contract?orderId=3202b0cd-000f-5001-8000-1177d722639f`.
      Открыт настоящий чекаут ЮKassa headless-браузером (playwright, кэшированный chromium) — страница подтвердила
      тестовый магазин («Это тестовый платёж», сумма `800 ₽` = `amountMinor 80000`, совпадает с ценой тарифа
      СТАРТ). Оплачено официальной тестовой картой ЮKassa (Visa, без 3-D Secure) `4111111111111111`, срок `12/30`,
      CVC `123` — значения взяты с официальной страницы ЮKassa
      `https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing?lang=ru#test-bank-card`,
      не придуманы. Страница ответила «Успешно», редирект на
      `.../v2/success?orderId=3202b0cd-000f-5001-8000-1177d722639f`, код платежа совпадает с `providerInvoiceRef`.
      Статус на стороне провайдера подтверждён отдельно (не по нашим логам): вызов адаптерного
      `listPayments` за `2026-08-03` вернул для `3202b0cd-000f-5001-8000-1177d722639f`
      `{status: "succeeded", amountMinor: 80000, currency: "RUB"}` — платёж реально прошёл у ЮKassa.
      ⚠️ **Вебхук НЕ пришёл.** Час спустя `GET /api/clinic/billing` всё ещё отдаёт тот же инвойс
      `status=pending`, `paidAt=null`, `providerEvents=[]`; `nginx` `access.log` (текущий и все ротированные
      `access.log.*.gz`) на TEST не содержит **ни одного** запроса ни к `/api/payments/saas-webhook/*`, ни к
      `/api/payments/webhook/*` за всю историю ротации — не только для этого платежа, вообще никогда. Причина
      не в коде: официальная документация ЮKassa по тестированию прямо говорит, что для тестовых уведомлений
      URL «нужно прописать в настройках тестового магазина в личном кабинете» — это разовая настройка на
      стороне мерчант-кабинета ЮKassa, а не что-то, что включает наш код или деплой. Подделать уведомление,
      чтобы обойти это, запрещено правилом задачи (это стёрло бы разницу между «провайдер принял» и «наш вебхук
      настроен») и физически отклонилось бы IP-allowlist адаптера (`YOOKASSA_IPV4_ALLOWLIST`), не пройдя auth.
      **Вердикт живого прогона 03.08 (продолжение): платёж реально прошёл у провайдера (`succeeded`, 800₽), но
      клиника ещё не может завершить оплату тарифа НА TEST end-to-end, потому что тестовый магазин ЮKassa не
      настроен слать HTTP-уведомления на наш `saas-webhook` адрес — это владельческая настройка личного кабинета
      ЮKassa, не открытый в коде дефект.** Идемпотентность (сам B0.3-регресс) доказана исправленной живым
      прогоном. Код не менялся, push не делался, PROD не трогался.
      **Продолжение 03.08 после того, как владелец прописал notification URL в тестовом кабинете ЮKassa**
      (`https://test.bersoncare.ru/api/payments/saas-webhook/yookassa`), карточка `#1057`, бриф
      `docs/_TODO/runs/billing/BILLING_WEBHOOK_CHAIN_BRIEF_2026-08-03.md`. TEST был на коммите `a08eddece99`
      (позади текущего `feat/doctor-ui-rebuild`, разница — не-billing коммиты D27/identity/setphone) →
      передеплоен: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` → `exit 0`, лог
      `deploy-test-20260803T143653Z-3933687.log` (единственная не-`ok` строка — тот же известный
      warn-not-fatal E1 гейт, см. [[test-deploy-isolation-gate-and-resolve]]); TEST теперь на `5dca96c9e0f`
      (потомок HEAD ветки на момент запуска). Пароли тех же трёх TEST-фикстур сведены тем же классом операции
      (`converge-saas-smoke-login-passwords.mjs --apply-test-from-stdin` под `sudo -u postgres`, `changed=3`,
      email/password не печатались). Обычный вход клиникой: `POST /api/auth/email-password/login` → `200`;
      `GET /api/clinic/billing` → `200` — старый инвойс `e13b2c92-…` всё ещё `pending`/`paidAt=null`/
      `providerEvents=[]`, т.е. до старта этого прогона вебхук по-прежнему не приходил ни разу.
      `POST /api/clinic/billing` (обычная рента) — идемпотентен по периоду и просто вернул бы тот же зависший
      чекаут без нового provider-события, поэтому для чистой проверки доставки использован тот же продуктовый
      эндпоинт `/api/clinic/billing`, но его апгрейд-путь: `PATCH {tariffId: "ПРОФИ"}` → `200`, новый инвойс
      `a91b7c2e-1484-460e-8788-ded52bbe9d35`, `providerInvoiceRef=3202bcea-000f-5001-9000-1d3202486c7f`,
      `amountMinor=69745` (прорейтированная разница СТАРТ→ПРОФИ). Оплачено headless-браузером (глобальный
      playwright 1.60.0, chromium) той же официальной тестовой картой ЮKassa `4111111111111111`, `12/30`, `123`
      — страница ответила «Успешно», `697,45 ₽`, код платежа `3202bcea-…` совпал с `providerInvoiceRef`.
      **На этот раз вебхук реально дошёл** (впервые за всю историю — предыдущий прогон не нашёл ни одной строки
      никогда): `nginx access.log` — `POST /api/payments/saas-webhook/yookassa` в `17:46:57` и `17:47:07` МСК,
      оба `503`. Причина — не продуктовый код: `route.ts` требует непустой `providerConfig.webhookSecret`
      ДО попытки верификации, а экран глобального администратора «Платежи»
      (`SaasBillingProviderSettings.tsx`) не содержит поля для этого значения (только Shop ID/API key/
      `vatCode`/`taxSystemCode`); прямой проверкой (без раскрытия значения) подтверждено
      `webhookSecret_present:false`. Замечено: для адаптера ЮKassa это поле фактически МЁРТВОЕ —
      `yookassaPaymentProvider.ts`.`verifyWebhook` его не читает вовсе (проверка — IP-allowlist + обратный
      API-запрос), оно существует только как обязательный gate в `route.ts`. Значение заведено через ТОТ ЖЕ
      уже используемый сегодня путь записи настроек (`PATCH /api/admin/settings`, ключ
      `saas_billing_payment_provider`, тот же generic API, которым раньше в этот день были заведены
      `shopId`/`apiKey`/`vatCode`/`taxSystemCode`) — случайное TEST-only 32-байтовое hex-значение, продуктовый
      код не менялся, IP-allowlist и подпись не обходились. Следующая естественная (не подделанная) попытка
      доставки ЮKassa на уже оплаченный инвойс `a91b7c2e-…` пришла в `17:52:01` МСК и прошла gate секрета
      (уже не `503`), но получила **новую** ошибку — `500`. Лог приложения: Postgres
      `permission denied for table saas_billing_invoices` (`42501`) из
      `findSaasBillingInvoiceByProviderRef` → `resolveSaasBillingInvoiceForWebhook` — этот запрос выполняется
      ДО того, как организация известна, под **bootstrap**-принципалом (`packages/db-principal/src/index.ts`:
      принципалы `bootstrap`/`infra` вообще не переключают роль через `SET ROLE`, значит запрос идёт под
      базовой ролью пула, не под `app_clinic_billing`). Миграция
      `0311_clinic_billing_live_payment_path_local.sql` выдала `GRANT SELECT, INSERT, UPDATE` на
      `saas_billing_invoices` только `app_clinic_billing` — базовая/bootstrap-роль этого гранта не получала.
      Это НАСТОЯЩИЙ дефект (grant/migration gap), не конфигурация; правка требует новой миграции — вне
      границ этого прогона («no product code change»), поэтому прогон остановлен на этом шаге. Итоговая
      читка `GET /api/clinic/billing` подтвердила отсутствие порчи: `a91b7c2e-…` остался `status=pending`,
      `paidAt=null`, `providerEvents=[]`, активный тариф клиники не изменился (СТАРТ, `e07db366-…`) — оплата
      реально прошла у провайдера, но ни разу не была захвачена приложением. **Вердикт 03.08 (второе
      продолжение): клиника ПО-ПРЕЖНЕМУ не может оплатить тариф на TEST end-to-end.** Прогресс против
      предыдущего прогона: вебхук теперь физически доходит и проходит IP-allowlist (URL в кабинете ЮKassa
      сработал); блокеров теперь два, оба — код/данные, не кабинет: (1) *закрыт конфигурацией в этом прогоне,
      без кода* — `webhookSecret` не имел поля в UI, значение выставлено через существующий settings API;
      TEST-only значение не переживёт полный рефреш TEST из прод-дампа, а на PROD того же поля в UI тоже нет —
      нужно либо добавить поле в `SaasBillingProviderSettings.tsx`, либо убрать обязательность проверки для
      адаптеров, которые её не используют; (2) *открыт, блокирует, нужна миграция* — выдать read-доступ на
      `saas_billing_invoices` роли, под которой выполняется pre-org bootstrap-запрос вебхука
      (`findSaasBillingInvoiceByProviderRef`), либо провести весь webhook-lookup под ролью, уже имеющей грант.
      Код не менялся, push не делался, PROD не трогался; из настроек TEST изменён только `webhookSecret`
      (тем же generic settings API, не миграцией и не кодом).

      **Продолжение 03.08, задача #1057 «закрыть красный TEST-гейт и достать платёж».** TEST-деплой
      `deploy-test-20260803T161652Z-4162017.log` упал на закрывающем гейте `app_owner SECURITY DEFINER
      table-grant completeness: FATAL app_owner now owns 160 ... expected exactly 159` — TEST units остались
      живы (это гейт, не авария). Прочитан не по имени, а разбором: `pg_proc`-дифф показал
      `app.find_platform_user_ids_by_any_confirmed_email(text)` — функцию из СОВСЕМ ДРУГОГО, не билингового
      коммита (`66b82d55b`, #987 D27 F5/F6, миграция 0342), который вошёл на эту ветку через merge
      `feat/doctor-ui-rebuild` (`87ef0fe6e`) уже ПОСЛЕ того, как счётчик 159 был здесь в последний раз выставлен
      — сам коммит `deploy-test-saas.sh` не трогал. Проверено, а не предположено: тело функции читает только
      `public.platform_users` и `public.user_oauth_bindings`, оба уже полным SELECT выданы `app_owner` более
      ранними auth-функциями (`information_schema.role_table_grants` подтвердил обе строки живьём) — гранта не
      хватало ровно нуля, только счётчик отстал. Правка `824e2fee1`: константа 159→160 с комментарием, откуда
      взялась функция и почему грант не нужен. Повторный `bash deploy/host/deploy-test.sh wt/billing-live-vat`
      → `exit 0`, лог `deploy-test-20260803T170306Z-20459.log`, гейт
      `app_owner SECURITY DEFINER table-grant completeness: OK (... 160/160 secdef functions pinned)`, ни
      одной `FATAL`/`RED` строки в логе, `GET https://test.bersoncare.ru/api/health` → `{"ok":true,"db":"up"}`.

      Живой прогон платежа тем же классом операции, что и раньше (`saas-smoke-login.env`, TEST-only учётки;
      пароли разошлись с БД — сведены заново через `converge-saas-smoke-login-passwords.mjs
      --apply-test-from-stdin` под `sudo -u postgres`, `changed=3`, email/password не печатались). Старый
      зависший инвойс `a91b7c2e-…` (upgrade → ПРОФИ, провайдер уже подтвердил `succeeded` ещё 03.08 утром, но
      наш вебхук ни разу не принял его — блокировал грант-гэп, который чинили 0343/0344/0345) отменён через
      штатный admin-кабинет (`POST /api/admin/saas-billing/payments/{id}/cancel`, платформенная роль,
      документированное поведение: «cancelled invoice, оплаченный поздним вебхуком, закрыт CAS на стороне
      capture» — код не менялся, это существующая К4-ручка) — статус ушёл в `void`, что штатно освободило
      guard «один открытый upgrade-инвойс на подписку» для чистого прогона. Клиника вошла обычным
      `POST /api/auth/email-password/login` → `200`, апгрейд на тариф КЛИНИКА через `PATCH /api/clinic/billing
      {tariffId}` → `200`, новый инвойс `9ed3f0cf-bd8e-4a1a-a034-8eee16b027c2`,
      `providerInvoiceRef=3202e004-000f-5001-8000-19f8dfa7a940`, `amountMinor=199214` (прорейтированная
      разница СТАРТ→КЛИНИКА). Оплачено headless-браузером (Playwright 1.61.0, chromium) официальной тестовой
      картой ЮKassa `4111111111111111`, `12/30`, `123` — страница ответила «Успешно», `1 992,14 ₽`, код
      платежа `3202e004-…` совпал с `providerInvoiceRef`.

      **Вебхук пришёл и на этот раз прошёл дальше, чем когда-либо** (`nginx access.log`:
      `POST /api/payments/saas-webhook/yookassa` в `20:15:47`, `20:15:57`, `20:16:39` МСК) — секрет,
      IP-allowlist и bootstrap-резолвер инвойса (0343) все прошли; `journalctl -u bersoncarebot-webapp-test`
      подтвердил, что выполнение дошло до предпоследнего шага `promotePaidInvoice` —
      `update be_organizations set tariff_id=... where id=...`. Там новый блокер, ранее не виденный:
      `error: platform_commercial_capability_required`, `PL/pgSQL function
      app.reject_staff_commercial_organization_update() line 5 at RAISE`. Это НЕ грант-гэп этого прогона —
      это давний (миграции 0225/0297, задолго до #1057) намеренный guard: триггер `BEFORE UPDATE OF tariff_id
      ON be_organizations` безусловно запрещает `app_staff` менять `tariff_id`, независимо от RLS-политик
      (защита от того, что скомпрометированный/недобросовестный staff-аккаунт сам себе назначит платный
      тариф). Ровно это же 0344 (эта ветка, тем же днём) научило RLS ПУСКАТЬ `app_staff` писать `tariff_id`
      для capture-пути — но триггер об этой легитимной причине не знает и режет запись всё равно. Конфликт
      двух защитных слоёв, не одна забытая строка.
      Транзакция атомарна — проверено, не предположено: `GET /api/clinic/billing` после попытки показывает
      инвойс `9ed3f0cf-…` всё ещё `pending`, `paidAt=null`; прямой счёт `saas_billing_provider_events` в БД —
      `0` строк; активный тариф клиники остался СТАРТ. Платёж реально прошёл у ЮKassa (`succeeded`,
      `1 992,14 ₽`, тестовые деньги), но клиника ПОКА не может завершить оплату тарифа на TEST end-to-end —
      блокирует не грант, а сама архитектура «под какой ролью capture-путь обязан писать тариф». По
      обязательному стоп-правилу задачи (`«если появится другой дефект — зафиксировать точную ошибку и
      остановиться, не трогая state machine и не расширяя грант, чтобы протащить гейт»`) код не менялся,
      триггер не трогался, push не делался, PROD не трогался. Нужно решение владельца: либо capture-путь для
      именно этой записи должен идти под ролью, у которой `app.reject_staff_commercial_organization_update()`
      не срабатывает (например `app_clinic_billing`, которая пишет `saas_billing_*` уже сегодня), либо у
      триггера должно появиться узкое, аудируемое исключение для легитимной billing-driven записи (не общее
      снятие guard'а). Итог по красному TEST-гейту из задачи #1057: **закрыт** (`824e2fee1`, зелёный деплой,
      лог `deploy-test-20260803T170306Z-20459.log`). Итог по живому платежу: **клиника всё ещё не может
      оплатить тариф на TEST end-to-end** — новый, отдельный от гейта дефект, найден и не потрогана ни одна
      из запрещённых задачей вещей.

      **Продолжение 03.08, задача #1057 «измерить состояние, потом закрыть» (этот прогон).** Между
      предыдущей записью и этим прогоном на ветку без пуша прилетели два реальных фикса (не этого прогона,
      найдены по `git log`): `0348` — capture идёт через узкий `SECURITY DEFINER`-аксессор
      `app.apply_paid_saas_billing_tariff`, обходя `reject_staff_commercial_organization_update`; `0350` —
      та же функция получила `UPDATE` на `saas_organization_trials` (второй грант-гэп, найденный отдельным
      живым прогоном на СВЕЖЕЙ орг `Тест Клиника`, `42501` в `22:13:55`/`22:14:05`). TEST передеплоен на этот
      код `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` → `22:42:17` МСК, лог
      `deploy-test-20260803T193918Z-305722.log`, `exit 0` (та же некритичная E1 warn-строка).
      _Измерение (шаги 1–2 брифа), а не догадка:_ `saas_billing_invoices` для обеих клиник на TEST —
      `Точка Здоровья` (`a0000000-…-0001`, тариф `tariff_id=e07db366` СТАРТ, не менялся) и `Тест Клиника`
      (`da6a96cb-…-ce4d`, тариф тот же СТАРТ, не менялся). У `Точка Здоровья` два инвойса апгрейда —
      `a91b7c2e` (→ПРОФИ) и `9ed3f0cf` (→КЛИНИКА) — оба `status=void`, `paid_at=NULL`; для обоих в
      `saas_billing_provider_events` лежит непроигранный (`processed_at=NULL`) поздний ретрай
      `payment.succeeded` (nginx: `200` в `22:02:04` и `22:33:14`) — ЮKassa продолжает слать уведомления по
      уже отменённым вручную инвойсам, аксессор корректно отказывает (`invoice.status <> 'paid'` →
      `applied=false`), это не баг, а ожидаемое CAS-поведение. У `Тест Клиника` два инвойса первого платежа —
      `abb25229` и `a573afc7` — оба `status=pending`, `paid_at=NULL`, событий в `saas_billing_provider_events`
      нет вовсе (все ранние доставки — `500` до `0350`). После `22:42:17` в nginx-логе ровно ОДНА строка
      `saas-webhook` — `22:42:56`, `500`; лог приложения показывает НЕ старый `42501`, а новую именованную
      ошибку `Error: saas_billing_tariff_apply_failed` (аксессор вернул `applied=false`) — это поздний ретрай
      по одному из уже `void`-инвойсов `Точка Здоровья` (тот же корректный CAS-отказ, не новый дефект);
      обновлений `updated_at` для инвойсов `Тест Клиника` после `22:42` в БД нет, то есть их вебхук с этим
      фиксом ещё ни разу не пробовал доставиться заново. **Вывод шагов 1–2: цепочка НЕ завершена ни для одной
      клиники** — продолжаем по брифу.

      _Живой прогон по продуктовому пути (шаг 3), не приватным скриптом:_ вход `Точка Здоровья`
      (`dimmdao@yandex.ru`, `POST /api/auth/email-password/login` → `200`) → `PATCH /api/clinic/billing
      {tariffId: КЛИНИКА}` → `200`, но вернул **ту же самую** `checkoutUrl`/`invoiceId=9ed3f0cf-…`, что и
      предыдущий (уже `void`) прогон. **Новый, ранее не описанный дефект найден, не потроган:**
      `createProratedTariffUpgradeCheckout`
      (`apps/webapp/src/modules/saas-billing/service.ts:243-266`) держит `providerIdempotencyKey` от
      `(organizationId, subscriptionId, targetTariffId, currentPeriodStartsAt)` — при повторном апгрейде на
      ТОТ ЖЕ тариф в том же периоде находит старую запись по этому ключу и на строке 265
      (`if (!created && invoice.providerCheckoutUrl) return invoice;`) отдаёт её **без проверки статуса**;
      ключ ротируется только веткой `invoice.status === 'failed'` (строка 267) — `void` в неё не входит. Итог:
      клиника, которой отменили зависший инвойс, при повторной попытке купить ТОТ ЖЕ тариф навсегда получает
      мёртвую ссылку на уже закрытый у провайдера заказ, а не новый чекаут. Проверено не только по коду:
      открыл эту `checkoutUrl` headless-браузером (Playwright, тот же тестовый `4111111111111111`) — страница
      ЮKassa сразу показала «Успешно» / «Код платежа `3202e004-…`» без формы карты, то есть заказ на стороне
      провайдера уже терминален, платить нечего.
      Тем же способом открыт СУЩЕСТВУЮЩИЙ pending-чекаут `Тест Клиника` (`a573afc7-…`,
      `orderId=3202ff1f-…`) — страница ЮKassa тоже сразу «Успешно» / «тестовый платёж»: **этот платёж уже
      реально прошёл у провайдера** (создан в `22:26:23`, до фикса `0350`), но наш вебхук с исправленным кодом
      по нему ни разу не доставлялся (см. измерение выше — `updated_at` не двигался). Форсировать доставку
      подделкой запрещено правилом задачи; довести именно этот инвойс до `paid` может только следующий
      естественный ретрай ЮKassa (её собственное расписание, не наше). Код, guard-триггер, проверка подписи
      и state machine не менялись; push не делался; PROD не трогался.

      **Вердикт этого прогона:** цепочка **НЕ завершена** ни для одной клиники прямо сейчас — ни одна запись в
      `saas_billing_invoices` не имеет `paid_at`, `tariff_id` обеих организаций остался СТАРТ. Но найдены два
      РАЗНЫХ факта: (1) реальный успешный тестовый платёж `Тест Клиника` (`3202ff1f-…`, `800 ₽`), которому не
      хватило только одного естественного ретрая вебхука после деплоя `0350`, чтобы закрыться самостоятельно;
      (2) новый дефект идемпотентности апгрейда (`service.ts:265`), который до отдельного решения продолжит
      возвращать мёртвые чекауты на повторные апгрейды `Точка Здоровья` на уже voided тарифы — нужен либо
      сброс `providerCheckoutUrl`/ключа при `void`, либо решение владельца, что считать правильным поведением
      повторной попытки после отмены.

**Проверка:** state-machine + idempotency тесты; подписанный webhook success/replay/forgery/amount-mismatch;
capture/refund integration тест на mock-адаптере; secret redaction scan; checkout UI RTL/E2E.
**Выход:** клиника может оплатить тариф через существующий provider layer в mock-режиме на test; когда владелец
даст реальные ключи, включение — это просто смена `providerId` в Settings, без нового кода.
