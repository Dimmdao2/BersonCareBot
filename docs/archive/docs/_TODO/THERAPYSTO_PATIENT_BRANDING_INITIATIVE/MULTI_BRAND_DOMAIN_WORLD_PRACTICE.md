# Один код, одна база, много брендов и доменов — как это устроено в мире

**Дата:** 2026-08-22. **Ветка:** `feat/doctor-ui-rebuild`. **Тип:** исследование мировой практики.
**Кода не написано, миграций нет, БД и хосты не трогались. Изменён один файл — этот.**

**Что это за документ.** Владелец спросил: как зрелые многоарендные SaaS-продукты обслуживают **один код и одну
базу под многими брендами и многими доменами** — когда у каждой клиники может быть свой домен и своё лицо, а
специалисты и админы остаются на одном брендe платформы. Ниже — семь вопросов владельца, по каждому механизм с
источником, потом сверка с нашим планом и развилки.

**Чего здесь НЕТ намеренно, чтобы не дублировать уже сделанное:**

- TLS/ACME/Caddy/Let's Encrypt-в-России — это `docs/_TODO/CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md`. Здесь только
  то, что там НЕ разобрано (лимиты в свежей редакции, HSTS, CAA, «висячий DNS», состояния хоста после поломки).
- Продуктовый экран подключения домена (что клиника вводит, какие тексты ошибок, сроки ожидания) — это
  `docs/_TODO/CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` §4-5. Здесь — только то, что там не покрыто.
- Границы продукта у Physitrack/MedBridge/Rehab Guru/Wibbi — это `EXTERNAL_PRODUCT_RESEARCH.md`. Не повторяю.

**Термины при первом упоминании объясняются в скобках.** Каждое фактическое утверждение несёт ссылку. Там, где я
делаю вывод сам, стоит слово **«вывод»**. Там, где источника найти не удалось, стоит **«не найдено»** — это не
то же самое, что «этого нет».

---

## 1. Краткий ответ

1. **Домен решает ТОЛЬКО одно: какое лицо показать.** Кто ты и что тебе можно — решает сессия и членство, а не
   адрес в браузере. Это разделение — главное правило отрасли; Microsoft пишет его дословно: «никогда не
   используйте значение host в механизме безопасности».
2. **Решение «чей это домен» принимается ровно в одном месте** — в самом первом обработчике запроса (edge/proxy),
   который кладёт результат в заголовок запроса и дальше все читают его. Vercel документирует именно этот код и
   отдельно предупреждает: входящие `x-tenant-*` заголовки надо затирать, иначе клиент подделает арендатора.
3. **Свой домен клиента — это CNAME на наш фиксированный хост** (для корня домена — A-запись, потому что CNAME на
   корне запрещён стандартом), автоматический выпуск сертификата и **два независимых статуса**: «хост проверен» и
   «сертификат выпущен». Пока оба не зелёные — домен не работает, и об этом честно пишут.
4. **Когда DNS клиента ломается позже, домен не «зависает навсегда».** У Cloudflare 75 попыток за 7 дней, потом
   статус `Moved`, ещё 7 дней — и хост удаляется. У Zendesk неверный DNS → мэппинг снимают. Это норма: домен —
   отзываемое состояние, а не запись в настройках.
5. **Брендирование — это НЕ тема и НЕ CSS.** У всех, кто это делает всерьёз, набор настраиваемого крошечный:
   логотип, один-два цвета, имя. Auth0 на уровне организации хранит ровно логотип, основной цвет и цвет фона.
   Произвольный CSS/JS арендатору не дают — это дыра в безопасности и вечная поддержка.
6. **На домене клиники живёт клиентская поверхность, и только она.** Zendesk формулирует прямо: host mapping
   меняет адрес справочного центра «не меняя адреса интерфейса агента», а агент, зашедший на домен клиента,
   **редиректится обратно на платформенный адрес**. Стаффа на бренд-домене не бывает.
7. **Сессии между доменами не сшивают.** Cookie привязана к хосту — это считают не проблемой, а свойством.
   Кросс-доменного SSO для арендаторских доменов в норме не строят.
8. **Почта от имени клиники — это три DNS-записи (DKIM CNAME, Return-Path CNAME, DMARC TXT).** А если клиника их
   не настроила — **никто не отказывается отправлять и никто не подделывает адрес**. Все переписывают отправителя
   на свой платформенный домен, оставляя имя клиники в отображаемом имени и Reply-To. Shopify делает это дословно:
   `store+123@shopifyemail.com`.
9. **Мессенджеры — противоположность почте:** тут «частичного бренда» не бывает. Токен бота или номер WhatsApp —
   актив клиента; не настроил — канал либо выключен, либо идёт через бота платформы.
10. **Ручное подключение домена — нормальный первый шаг.** Microsoft называет порог, на котором ручное перестаёт
    работать: **около десяти арендаторов**. Но мониторинг нужен с первого домена: сертификат протухает молча, и
    первым об этом узнаёт пациент.
11. **Три российских уточнения, каждое меняет решение.** (а) Let's Encrypt для `.ru` частной клиники работает —
    нашумевший запрет из соглашения v1.7 **отменён**, действует v1.8 с 2026-07-06. (б) **Cloudflare в России
    заблокирован по ECH и замедляется провайдерами** — его механику копируем как эталон, но как поставщика
    услуги использовать нельзя. (в) reg.ru, Timeweb и Beget **не поддерживают ни CNAME на корне, ни ALIAS** —
    значит корневой домен клиники означает A-запись и фиксированный IP навсегда; поддомен проще и дешевле.

---

## 2. Вопрос 1. Определение поверхности: где живёт решение «это staff / общий пациентский / домен клиники X»

### 2.1. Механизм, который описывают все

Каноническая схема одна и та же: **первый обработчик запроса читает `Host`, резолвит арендатора, кладёт результат
в заголовок запроса, и дальше никто `Host` больше не читает.**

Vercel документирует это буквально, и — важно — их файл называется так же, как наш: `proxy.ts`
([Multi-Tenant Platform Concepts, last_updated 2026-07-29](https://vercel.com/docs/platforms/multi-tenant-platforms/concepts)):

```ts
// proxy.ts
const hostname = request.headers.get('host');
const tenant = await resolveTenant(hostname);
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-tenant-id', tenant.id);
return NextResponse.next({ request: { headers: requestHeaders } });
```

Там же — два предупреждения, которые дороже самого кода:

> «Use `NextResponse.next({ request: { headers } })` to send the value to your app. Setting `response.headers`
> instead sends the header to the browser, where server components can't read it. **Delete or overwrite inbound
> `x-tenant-*` headers on every path through the proxy so clients can't supply tenant context themselves.**»

То есть: заголовок арендатора — это внутренний канал, и его надо **затирать на входе**, иначе любой пользователь
пришлёт `x-tenant-id: 42` и притворится другой клиникой.

### 2.2. Правило, которое делает схему безопасной

AWS в whitepaper по мультиарендности формулирует общий принцип: изоляцию **нельзя** отдавать на усмотрение
разработчиков отдельных сервисов — «scoping of access to resources should be controlled through a shared mechanism
that is responsible for applying isolation»
([SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-isolation-mindset.html), AWS SaaS Factory).

Microsoft говорит жёстче и ровно про наш случай
([Host Name Preservation, Azure Architecture Center, ms.date 2026-02-26](https://learn.microsoft.com/en-us/azure/architecture/best-practices/host-name-preservation)):

> «**Never use the value of the host in a security mechanism.** The browser or another user agent provides the
> value, and a user can change it.»

**Вывод:** `Host` выбирает лицо (бренд, тексты, ссылки, метаданные). Доступ к данным клиники даёт исключительно
сессия/членство. Это ровно то, что уже написано в нашем `IMPLEMENTATION_PLAN.md` §1.2 последним абзацем.

### 2.3. Почему `Host` нельзя переписывать на прокси

Тот же документ Microsoft перечисляет, что ломается, если reverse proxy подменяет `Host` на внутреннее имя:

- **абсолютные ссылки** — приложение строит `https://внутреннее-имя/...` и раскрывает бэкенд наружу;
- **redirect URI для OAuth/OIDC** — провайдер отвергает незарегистрированный адрес, вход не работает;
- **cookie** — атрибут `Domain` получает внутреннее имя, браузер не отправляет cookie обратно, сессия молча
  теряется («These problems don't generate an error and aren't directly visible to the end user, which makes them
  difficult to troubleshoot»).

И прямая рекомендация для мультиарендности:

> «If the same application deployment accepts requests from multiple domains, for example, in multitenant
> scenarios, you can't statically define a single domain. Take the host name from the incoming request... In most
> cases, you shouldn't override the host name.»

Отдельно: приложение должно доверять `X-Forwarded-Proto`/`X-Forwarded-Host` **только от известных прокси**, иначе
клиент подделает схему и IP.

**Для нас это конкретно:** какой бы edge мы ни поставили перед приложением (Caddy из исследования 26.07, nginx,
что-то ещё), он обязан **передавать оригинальный `Host` без изменений**. Иначе резолвер поверхности получит имя
edge и всё сломается разом: и бренд, и ссылки в письмах, и CSRF (`csrfOrigin.ts` строит ожидаемый origin именно
из `Host` + `X-Forwarded-Proto`).

### 2.4. Что бывает вместо одного места

Единственный сорсабельный разбор анти-паттерна, который я нашёл, — вторичный, и я привожу его как формулировку,
а не как факт: «первый раз тебя просят про фичу для арендатора, ты пишешь `if (tenant === 'acme')`. Второй раз —
ещё один. К десятому разу кодовая база — минное поле из арендаторских условий»
([Reapdat blog, multi-tenant SaaS architecture](https://www.reapdat.com/blog/multi-tenant-saas-architecture), вторичный
источник, дата не указана). **Первичного инженерного разбора этого анти-паттерна найти не удалось** — искал по
блогам Shopify/Vercel/Cloudflare, нашёл только описания правильной схемы, не разбор провала.

---

## 3. Вопрос 2. Свой домен клиники от начала до конца

> TLS-часть (Caddy `on_demand_tls`, `ask`-эндпоинт, ACME-челленджи, Россия и Let's Encrypt) закрыта исследованием
> 26.07 и здесь НЕ переоткрывается. Ниже — только то, чего в нём нет.

### 3.1. Какая запись и почему две

**Поддомен клиники (`zapis.klinika.ru`) — CNAME на наш фиксированный хост. Корень домена (`klinika.ru`) — A-запись
на IP.** Это не наш выбор, это ограничение DNS: CNAME не может сосуществовать с другими записями в той же точке
зоны, а на корне обязаны быть NS и SOA. Heroku формулирует это прямо: «CNAME records are not available at the zone
apex and can't be used to configure root domains», и рекомендует «use a DNS provider that supports CNAME
functionality at the apex, or use sub-domains exclusively»
([Heroku Dev Center, Custom Domain Names / The Limitations of DNS A-Records](https://devcenter.heroku.com/articles/apex-domains)).

Zendesk идёт дальше и **запрещает A-записи вовсе**: «Zendesk requires that the DNS record be a CNAME record that
points to `yoursubdomain.zendesk.com`. DNS "A" records are not supported»
([Host mapping — Changing the URL of your help center](https://support.zendesk.com/hc/en-us/articles/4408838571930-Host-mapping-Changing-the-URL-of-your-help-center)).
Практическое следствие: у Zendesk корень домена под справочный центр отдать нельзя в принципе — только поддомен.

**Для нас:** если мы хотим поддерживать корневой домен клиники (`klinika.ru`, а не `zapis.klinika.ru`), мы обязаны
иметь **стабильный публичный IP** у edge и раздавать A-запись. Это уже зафиксировано в предложении 19.08 (вывод №1).
Новое здесь — вторая сторона: **A-запись означает, что мы не можем менять IP edge, не сломав всех клиентов
разом.** CNAME эту свободу сохраняет. Отсюда стандартная формула отрасли: **клиентам предлагают поддомен, а корень
поддерживают как исключение.**

### 3.2. Два независимых статуса, а не один

Cloudflare for SaaS (промышленный эталон именно этой задачи) держит **два независимых поля состояния**, и это
единственно честная модель ([Cloudflare for SaaS — Configuration Overview, last updated 2026-06-19](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)):

| Поле | Значение |
| --- | --- |
| `result.status` | хост проверен, трафик можно проксировать |
| `result.ssl.status` | сертификат выпущен и разложен по сети |

> «Production traffic requires both statuses as `active` plus DNS pointing to your SaaS target.»

Если первый `active`, а второй нет — «Cloudflare has validated the hostname, but the certificate has not completed
issuance and deployment». Пользователь при этом увидит ошибку TLS, а не 404 — то есть **сообщение клинике должно
различать эти два состояния**, иначе диагностика невозможна.

Полный список состояний ([Validation status, 2026-05-07](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/)):
`Pending`, `Active`, `Active re-deploying`, `Blocked` (домен ранее замечен в злоупотреблениях), `Moved`, `Deleted`.

### 3.2a. Как это выглядит у девяти площадок — сводка механики

Собрано из первичных доков каждого продукта (даты — их собственные `updated_at`, где страница её публикует).

| Продукт | Запись для поддомена | Корень домена | Проверка владения | CA |
| --- | --- | --- | --- | --- |
| **Cloudflare for SaaS** | CNAME на ваш CNAME-target | **Apex proxying** (свои статические префиксы, «only certain customers have access», платно) | опционально: TXT `_cf-custom-hostname` или HTTP-токен | LE / Google Trust Services / SSL.com; при пустом `certificate_authority` **сам смотрит CAA клиента** и выбирает совместимый CA ([CA list, 2026-04-16](https://developers.cloudflare.com/ssl/reference/certificate-authorities/)) |
| **Vercel** | CNAME на **уникальный для проекта** хост вида `d1d4fc829fe7bc7c.vercel-dns-017.com` | A-запись (RFC 1034 §3.6.2), **IPv6 не поддерживается** | TXT `_vercel` **только если домен занят другим аккаунтом** | Let's Encrypt; http-01 для обычных, **dns-01 для wildcard — поэтому wildcard требует NS на Vercel** ([Working with SSL, 2026-06-08](https://vercel.com/docs/domains/working-with-ssl)) |
| **Netlify** | CNAME на `<site>.netlify.app` | **ALIAS/ANAME** на `apex-loadbalancer.netlify.com` предпочтительно; A `75.2.60.5` — «discouraged» | по умолчанию нет | LE; публикует свой **ACME account URI для CAA-пиннинга** ([HTTPS/SSL, 2026-01-30](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/)) |
| **Heroku ACM** | CNAME на уникальный «хайку» `<...>.herokudns.com` | **ALIAS/ANAME только** — A-записи запрещены: «Because Heroku uses dynamic IP addresses, it's necessary to use a CNAME-like record» | нет | LE, автопродление за месяц до истечения ([ACM, 2026-07-07](https://devcenter.heroku.com/articles/automated-certificate-management)) |
| **Shopify** | CNAME `www` → `shops.myshopify.com.` | **A `23.227.38.65`** + AAAA — apex A обязателен | нет | CAA должна разрешать **три**: `letsencrypt.org`, `pki.goog`, `ssl.com` |
| **Webflow** | CNAME `www` → `cdn.webflow.com` | A `198.202.211.1` | **TXT `_webflow`** с одноразовым UUID | LE **и** Google Trust Services (после переезда на Cloudflare); продление **только по факту истечения**, не заранее ([2025-08-18](https://help.webflow.com/hc/en-us/articles/33961362849811)) |
| **Zendesk** | CNAME на `<sub>.zendesk.com` | **не поддерживается вовсе** | нет | LE, **один SNI-сертификат на 100 host-mapped доменов** |
| **Intercom** | CNAME на региональный `custom.intercom.help` / `.eu` / `.au` | нет | нет | **CA не назван нигде в документации** |
| **HubSpot CMS** | CNAME на `[HubID].groupX.sites.hubspot.net` | **две A-записи** на портальные IP (не публикуются), AAAA запрещены | TXT с портальным `{hsdomainkey}` | Google Trust Services, SAN-сертификат, автопродление за 30 дней; CAA должна содержать `pki.goog` |

**Пять выводов из таблицы, которых нет в наших документах:**

1. **Корень домена делится на три лагеря.** Heroku его **запрещает** через A (динамические IP). Netlify **разрешает, но отговаривает**. Shopify/Webflow/HubSpot **требуют** A на фиксированный anycast-IP. **Zendesk и Intercom обходят вопрос целиком — поддерживают только поддомены.** Последнее — легитимное продуктовое решение, а не ограничение.
2. **Доказательство владения — самое слабое место отрасли.** Настоящий challenge требуют только **Webflow** (`_webflow` TXT) и **HubSpot** (`{hsdomainkey}`). Остальные полагаются на «CNAME указывает на нас, значит вы владеете именем» — и это безопасно только потому, что цель **уникальна и неугадываема** (хайку Heroku, `<sub>.zendesk.com`, `d1d4fc…vercel-dns-017.com`). У Shopify цель общая (`shops.myshopify.com`) — там это работает, потому что платформа терпит произвольные хосты.
3. **CAA — самая частая задокументированная причина отказа выпуска у всех девяти.** И CA у всех разные. Значит инструкция клинике обязана называть **конкретный** CA, а не «разрешите выпуск сертификатов».
4. **Перевыпуск сертификата на каждое изменение — скрытая ловушка масштабирования.** Zendesk перевыпускает общий 100-SAN сертификат **при каждом** добавлении/изменении/удалении host-mapping. Netlify предупреждает: больше 5 алиасов на apex при внешнем DNS упирается в лимиты LE. Heroku предупреждает, что включение/выключение ACM «трипает» лимиты, которые сам Heroku снять не может.
5. **Автооткат при поломке DNS документируют РОВНО ДВОЕ** — Cloudflare (`Moved` → через 7 дней `Deleted`, восстановление только PATCH-ом) и Zendesk (см. §3.4). Netlify, Heroku, Shopify, Webflow, Intercom, HubSpot и Vercel **не документируют ничего**. То есть здесь мы не копируем конвенцию — мы её проектируем.

### 3.3. Способы проверки владения — их три, и они не равны

Cloudflare предлагает (тот же источник, 2026-06-19):

- **HTTP automatic** — «validation occurs after DNS cutover, creating potential downtime»: клиент переключает DNS,
  и только после этого мы можем выпустить сертификат. Между переключением и выпуском — окно, где сайт не работает.
- **TXT validation** — «can complete before DNS changes»: клиент кладёт TXT-запись заранее, сертификат выпускается
  до переключения, переключение проходит без окна.
- **Delegated DCV** — клиент один раз кладёт `_acme-challenge.klinika.ru CNAME klinika.ru.<наш-хост>` и больше
  ничего не делает никогда: все последующие продления мы проходим сами. Это **единственная схема, где клиника
  трогает DNS ровно один раз**
  ([Delegated DCV, 2026-05-05](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/delegated-dcv/)).
  Yandex Cloud предлагает ровно ту же механику (см. §3.9), так что это не «фича Cloudflare», а общий приём.

**Это важная поправка к нашей развилке O4 из документа 19.08.** Там рекомендация была «отдельный шаг подтверждения
владения не нужен, ACME-челлендж сам его доказывает». Это верно **для безопасности**, но неверно **для отсутствия
простоя**: HTTP-only схема гарантирует окно недоступности между переключением DNS и выпуском сертификата.
Pre-validation через TXT существует именно чтобы это окно убрать. Отдельно: Microsoft приводит второй, независимый
довод за проверку владения — **опечатка при вводе домена паркует чужое имя**
([Domain Name Considerations, ms.date 2025-06-13](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/domain-names)):

> «somebody made a typo... they set it up as `invoices.adventurework.com`. ... But when another company named
> *Adventure Work* tries to add their custom domain to Contoso's platform, they're told that the domain name is
> already in use.»

### 3.4. Что происходит, когда DNS клиники ломается ПОЗЖЕ

Это самое ценное, чего нет ни в одном нашем документе. Cloudflare документирует полный жизненный цикл деградации:

- **Backoff-расписание валидации**: 75 попыток, распределённых на 7 дней; первые 10 проверок укладываются в 20
  минут, интервал растёт экспоненциально и упирается в потолок 4 часа (с 40-й попытки — ровно 4 часа); «at the end
  of this schedule, if the validation is unsuccessful, **the custom hostname will be deleted**»
  ([Backoff schedule, 2026-07-16](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/backoff-schedule/)).
- **Статус `Moved`** — «Custom hostname is not active after Pending for the entirety of the Validation Backoff
  Schedule **or it no longer points to the fallback origin**». То есть клиент поменял CNAME → хост уезжает в
  `Moved`.
- **Статус `Deleted`** — «Occurs when status is `Moved` for more than seven days».
- Вернуть в строй — PATCH-запросом, перезапускающим валидацию (Validation status, 2026-05-07).

**Zendesk — единственный, кто описал поведение полностью, и это готовый образец.** Схема из трёх шагов: сначала
**проактивное уведомление**; если ошибка сохраняется **к моменту продления сертификата (обычно в пределах
30 дней)** — Zendesk **снимает нерабочий host mapping**, и «your Zendesk account would only be available by
accessing the `yoursubdomain.zendesk.com` URL»
([DNS errors with Zendesk provisioned SSL, обновлено 2026-07-01](https://support.zendesk.com/hc/en-us/articles/4408846660250)).
То есть: **предупредить → дождаться естественной точки (продление) → откатиться на платформенный адрес.**
Это единственный полностью специфицированный прецедент из девяти изученных площадок.

Heroku: `heroku certs:auto` показывает `Failing`/`Failed`, если DNS не указывает на выданный target вида
`<domain>.herokudns.com`; лечится `heroku certs:auto:refresh` после починки DNS
([Automated Certificate Management](https://devcenter.heroku.com/articles/automated-certificate-management)).

Squarespace (из нашего же документа 19.08): без verify-CNAME домен **отвязывается через 15 дней**.

**Общая форма, которую видно у всех четырёх:** домен клиента — это **отзываемое состояние с таймером**, а не
булево поле «включено». Есть период ретраев, есть промежуточный статус «сломано, но ещё держим», есть срок, после
которого привязка снимается.

### 3.5. Висячий DNS и захват поддомена — риск, о котором мы нигде не писали

Microsoft описывает атаку целиком (Domain Name Considerations, 2025-06-13):

1. Клиника уходит от нас, мы отключаем её арендатора.
2. Клиника **забывает удалить** CNAME `zapis.klinika.ru` → наш хост.
3. Злоумышленник заводит у нас новую организацию и заявляет тот же `zapis.klinika.ru`.
4. Наша проверка владения видит, что CNAME указывает на нас, — и признаёт домен подтверждённым.
5. Он поднимает на домене клиники страницу с её брендом и собирает данные пациентов.

Две защиты, названные там же:

- требовать **удаления CNAME до того**, как домен снимут с аккаунта;
- **запретить переиспользование идентификаторов арендатора** и требовать TXT-запись с **новым случайным
  значением на каждую попытку подключения** (тогда старый CNAME сам по себе ничего не доказывает).

Там же — про **CAA-записи** (DNS-запись, ограничивающая, какие удостоверяющие центры вправе выпускать сертификаты
для домена): если у клиники есть CAA, она обязана явно разрешить наш CA, иначе выпуск не пройдёт. Это реальная
причина отказа выпуска, которую наш `ask`-эндпоинт не увидит и не объяснит.

### 3.6. Лимиты Let's Encrypt — и одна цифра, которая меняет выбор архитектуры

Страница обновлена **2026-08-05** ([letsencrypt.org/docs/rate-limits](https://letsencrypt.org/docs/rate-limits/)).
Сами цифры совпадают с зафиксированными 26.07 и не переоткрываются. Новое — три вещи.

**Первое, и самое важное. «Зарегистрированный домен» определяется по Public Suffix List — и это значит, что все
поддомены НАШЕЙ платформы делят ОДНУ квоту 50 сертификатов в неделю.** Домен каждой клиники — свой
зарегистрированный домен со своей квотой (практически безлимит для нашего масштаба). А вот `klinika-1.наш-домен.ru`,
`klinika-2.наш-домен.ru` и так далее — все в одном ведре.

> **Наивная схема «по сертификату на каждый поддомен платформы» упирается в 50 новых клиник в неделю.**

Именно поэтому Vercel и Netlify толкают к **wildcard-сертификату через dns-01** для платформенного домена. И это
**поправка к исследованию 26.07**: там сказано, что wildcard не нужен, потому что on-demand выпустит по
сертификату на каждый поддомен при первом обращении. Для нашего сегодняшнего масштаба вывод 26.07 верен (лимит
на порядок выше числа клиник). Но причина, по которой он верен, — не «wildcard не нужен вообще», а «нас пока
мало»; при выходе на десятки новых клиник в неделю схема упрётся. Это стоит знать заранее, а не выяснять на
лимите.

**Второе. ARI (ACME Renewal Information, RFC 9773) исключён из ВСЕХ лимитов** — продления перестают потреблять
бюджет вовсе. CertMagic (движок Caddy) заявляет полную поддержку ARI, так что при выборе Caddy этот класс риска
закрывается сам.

**Третье. Срок жизни сертификатов сокращается, и это удваивает трафик продлений.** Let's Encrypt объявил
поэтапное снижение срока по умолчанию **с 90 дней до 64, затем до 45** в течение ближайших двух лет; продление
сместится с ~60-го дня на ~30-й
([Rate limits and 45-day certs, 2026-02-24](https://letsencrypt.org/2026/02/24/rate-limits-45-day-certs)).
Отдельно с **2026-01-15** общедоступны **короткоживущие сертификаты на 160 часов (чуть больше 6 суток)** — но это
**opt-in** через профиль `shortlived`, и для нас он не нужен
([6-day and IP certs GA, 2026-01-15](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)).

**Четвёртое, эксплуатационное. OCSP больше нет.** Let's Encrypt удалил OCSP-URL из сертификатов **2025-05-07** и
полностью выключил OCSP-респондеры **2025-08-06**; отзыв проверяется только через CRL
([OCSP service has reached end of life, 2025-08-06](https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life)).
Практическое следствие: любая наша будущая проверка «жив ли сертификат клиники» не должна опираться на OCSP —
только на дату истечения и на факт успешного TLS-хендшейка.

**Пятое, про аккаунты.** Let's Encrypt прямо рекомендует крупным хостерам **один общий ACME-аккаунт**: «We will be
unable to effectively adjust rate limits if many different accounts are used» — повышения лимитов выдаются **на
аккаунт**, поэтому много аккаунтов = никаких повышений
([Integration Guide, обновлено 2025-06-23](https://letsencrypt.org/docs/integration-guide/)). Обратная сторона:
лимит «300 новых заказов на аккаунт за 3 часа» становится потолком **на весь наш парк сразу**.

### 3.7. HSTS — граната, которую легко уронить на арендаторский домен

HSTS (`Strict-Transport-Security`) — заголовок, которым сайт говорит браузеру «ходи ко мне только по HTTPS».
Директива `includeSubDomains` распространяет это на все поддомены, `preload` — зашивает домен в браузер намертво.

Vercel документирует ровно ту разницу, которая нам нужна
([Encryption and TLS, last_updated 2026-07-02](https://vercel.com/docs/cdn-security/encryption)):

- для своих `*.vercel.app`: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload;`
- **для клиентских доменов: `Strict-Transport-Security: max-age=63072000;`** — и словами: «Custom domains use
  HSTS, but only for the particular subdomain».

Причина, почему нельзя иначе: HSTS preload «cannot easily be undone»
([hstspreload.org](https://hstspreload.org/)), а `includeSubDomains` на чужом домене выключит клинике все её
собственные поддомены без HTTPS — почтовый, старый сайт, что угодно.

**Для нас:** это готовое правило, которое стоит записать до первой активации, а не после инцидента: на домене
клиники — HSTS без `includeSubDomains` и без `preload`.

### 3.8. Российская специфика — здесь исследование дало больше всего нового

Исследование 26.07 закрыло главный вопрос доказательно: `bersoncare.ru` и `test.bersoncare.ru` — оба `.ru` — уже
живут на автопродлеваемых сертификатах Let's Encrypt. Это остаётся верным. Но по четырём пунктам картина
уточнилась, и один из них меняет выбор инфраструктуры.

#### 3.8.1. Let's Encrypt и `.ru` — соглашение v1.7 отменено, есть официальное заявление

В июне 2026 российские и прибалтийские техмедиа сообщили, что Subscriber Agreement **v1.7** (от 2026-06-04)
запрещает выпуск для `.ru`/`.su`
([anti-malware.ru, 2026-06-10](https://www.anti-malware.ru/news/2026-06-10-111332/50332);
[habr.com, 2026-06-09](https://habr.com/ru/news/1045658/)). Повод был настоящий: v1.7 добавил гарантию заявителя,
что он не находится в комплексно санкционированной стране и не является запрещённой стороной.

**Let's Encrypt дважды опроверг это официально:**

- Автору статьи на Хабре (2026-06-09): «Let's Encrypt can issue certificates for non-government entities in Russia
  due to statutory exemptions protecting personal communications, alongside specific Office of Foreign Assets
  Control (OFAC) authorizations designed to promote Internet freedom and human rights».
- В официальном анонсе **v1.8**: «**It does not change where or to whom Let's Encrypt issues certificates**» …
  «we have not, and do not, block the use by non-governmental people and entities in comprehensively sanctioned
  countries». v1.8 **убирает формулировку v1.7** и заменяет её общим разделом о соответствии применимому праву
  ([community.letsencrypt.org, 2026-06-22](https://community.letsencrypt.org/t/updating-the-let-s-encrypt-subscriber-agreement-to-v1-8/248355)).
- Действующее соглашение сегодня — **v1.8, в силе с 2026-07-06** ([letsencrypt.org/repository](https://letsencrypt.org/repository/)).

**Это прямое обновление к нашему документу 26.07**, который описывал v1.7 как действующую редакцию с гарантийной
оговоркой. Вывод 26.07 («не блокер для обычной клиники») подтвердился, но основание изменилось: пункта, который
там разбирали, **больше нет в тексте**.

Оговорка, которая остаётся: **государственная** клиника или любая санкционированная организация — отдельный
вопрос, и он действительно ограничен. Частная клиника — нет.

Чего подтвердить **не удалось**: блокирует ли РКН/ТСПУ исходящие обращения к `acme-v02.api.letsencrypt.org` с
российского хостинга. Первичных свидетельств нет; в форуме LE есть старые анекдотические темы, на них не
опираюсь. Наше собственное живое доказательство (работающие автопродления на этом боксе) сильнее любого форума.

#### 3.8.2. 🔴 Cloudflare в России фактически неработоспособен — а значит Cloudflare for SaaS нам не вариант

Это самая практически значимая находка раздела.

- **Блокировка ECH.** Cloudflare включил Encrypted Client Hello по умолчанию в октябре 2024; РКН начал блокировать
  **2024-11-06** и **2024-11-07** выпустил заявление, рекомендующее владельцам сайтов либо отключить TLS ECH, либо
  перейти на отечественные CDN. Затронуты сотни тысяч сайтов
  ([The Record](https://therecord.media/russia-blocks-thousands-of-websites-that-use-cloudflare-service)).
- **Троттлинг.** С **2025-06-09** российские провайдеры начали замедлять сайты за Cloudflare — соединение
  обрывается примерно после 16 килобайт («шестнадцатикилобайтная штора»), сайты становятся практически
  непригодны ([Zona Media, 2025-06-19](https://en.zona.media/article/2025/06/19/cloudflare);
  [BleepingComputer](https://www.bleepingcomputer.com/news/technology/russias-throttling-of-cloudflare-makes-sites-inaccessible/);
  [The Record — подтверждение Cloudflare](https://therecord.media/cloudflare-russia-restricting-access-crackdown)).

**Вывод:** промышленный эталон, который я описываю в §3.2-3.4 как образец **механики**, нельзя использовать как
**поставщика услуги** для клиники, обслуживающей российских пациентов. Механику копируем, продукт — нет. Это, к
слову, независимо подтверждает рекомендацию исследования 26.07 держать собственный edge на Caddy, а не покупать
чужой SaaS-фронт.

#### 3.8.3. Коммерческие западные CA для российских организаций сжимаются

**GlobalSign**, у которого была непропорционально большая доля в `.ru` (13,4% доменов зоны против ~1% в мире),
около **2026-06-13** начал **принудительно отзывать** сертификаты, выданные российским компаниям; к 2026-06-15
затронуто примерно 22 000 доменов `.ru` — падение на 27% от октябрьского пика 2025 года.
**Первичного заявления самого GlobalSign нигде нет** — есть только анализ данных Certificate Transparency и
российские СМИ ([разбор данных на ipinfo.io](https://community.ipinfo.io/t/globalsign-is-revoking-ssl-certificates-for-russian-websites-here-is-what-the-data-shows/7381)).
**Помечаю как вторичное и неподтверждённое**, но направление совпадает с тем, что 26.07 зафиксировано про
ZeroSSL/Sectigo/DigiCert.

**Следствие, которое переворачивает привычное допущение:** для российской частной клиники **бесплатный ACME
(Let's Encrypt / Google Trust Services) сегодня надёжнее платного западного CA**, а не наоборот.

#### 3.8.4. Российский НУЦ (Минцифры) — почему это не решение для клиники

Национальный удостоверяющий центр выдаёт бесплатные TLS-сертификаты через Госуслуги с 2022 года российским
юрлицам и ИП. **Корень НУЦ не входит в доверенные хранилища мировых браузеров.** Пользователю нужно вручную
установить корневой сертификат для Chrome, Firefox, Safari, Edge; сайты ВТБ, Сбера, Альфа-Банка перестали
открываться в Chrome/Safari/Edge после перехода на сертификаты НУЦ. Обходной путь — браузер с предустановленным
корнем: **Яндекс Браузер** и Atom. **2026-07-23** Минцифры предупредило, что проблема может распространиться на
банки, маркетплейсы и интернет-магазины, и снова рекомендовало установить корень.
Источники — российские техмедиа, все **вторичные**:
[skillbox](https://skillbox.ru/media/code/sertifikaty-mincifry/), [gogov.ru](https://gogov.ru/news/930959),
[comss.ru](https://www.comss.ru/page.php?id=20986). Условия самой программы (срок действия, поддержка wildcard,
точные критерии) прочитать **не удалось** — `gosuslugi.ru` отдаёт «Доступ ограничен по соображениям безопасности»
для не-российских адресов.

**Практический вывод для нас:** сертификат только от НУЦ даёт полноэкранную ошибку безопасности в Chrome и Safari
любому пациенту, который не устанавливал корень. Для сайта записи к врачу — где посетитель приходит впервые, с
телефона, и уже нервничает — это убийца конверсии. **НУЦ — аварийный путь для госсвязанных сайтов, а не
проектное решение.** Это уточняет, но не отменяет вывод 26.07 («не требование сегодняшнего дня»).

#### 3.8.5. 🔴 Российские DNS-провайдеры: ALIAS/ANAME на корне почти ни у кого нет

Проверено по документации самих провайдеров:

| Провайдер | CNAME на корне | ALIAS / ANAME | Источник |
| --- | --- | --- | --- |
| **reg.ru** | нет — панель прямо пишет «поддомен, кроме `@`» | **нет** | [help.reg.ru — настройка ресурсных записей](https://help.reg.ru/support/dns-servery-i-nastroyka-zony/nastroyka-resursnykh-zapisey-dns/nastroyka-resursnykh-zapisey-v-lichnom-kabinete) |
| **Timeweb Cloud** | нет — CNAME «только для поддоменов» | **нет** | [timeweb.cloud/docs/domains/dns-records-management](https://timeweb.cloud/docs/domains/dns-records-management) |
| **Beget** | нет — «у домена второго уровня всегда есть NS и SOA, поэтому установить CNAME для домена нельзя» | **нет** | [wiki.beget.tech](http://wiki.beget.tech/ru/dns/how-to-set-cname.html) |
| **Yandex Cloud DNS** | нет | **ДА — тип `ANAME`**: «similar to a CNAME record, but can be used in the same domain with other records» | [yandex.cloud/docs/dns/concepts/resource-record, обновлено 2026-08-21](https://yandex.cloud/en/docs/dns/concepts/resource-record) |
| cloud.ru, nic.ru | **не проверено** — страницы не открылись | не проверено | пробел |

**Это решает развилку про корень домена, и не в пользу корня.** Три из четырёх массовых провайдеров, которыми
реально пользуется маленькая российская клиника, **не дают ни CNAME на корне, ни ALIAS/ANAME**. Значит модель
Heroku/Netlify («дайте клиенту ALIAS на наш хост») для типичного российского арендатора **физически не работает**.
Остаются три варианта:

- **(а) только поддомен** (`zapis.klinika.ru`) с CNAME — модель Zendesk/Intercom, самая чистая и самая дешёвая;
- **(б) стабильный A-адрес** на корне — модель Shopify/Webflow/HubSpot, но она навсегда привязывает нас к
  конкретному IP edge;
- **(в)** попросить клинику перенести DNS в Yandex Cloud DNS и использовать ANAME — реалистично только для клиник
  с техническим подрядчиком.

#### 3.8.6. Отечественный аналог Cloudflare for SaaS: Yandex Cloud Certificate Manager

Механика та же, включая делегирование:

- Два вида проверки — HTTP и DNS. DNS-вариант через **TXT** `_acme-challenge.example.com` требует проходить
  проверку **каждые 60 дней** при автопродлении; вариант через **CNAME**
  `_acme-challenge.example.com CNAME <certificate_ID>.cm.yandexcloud.net.` «enables you to undergo a check only
  once» — то есть **однократная настройка**, как delegated DCV у Cloudflare. Обе записи одновременно ставить
  нельзя ([Certificate Manager — challenges](https://yandex.cloud/en/docs/certificate-manager/concepts/challenges)).
- Если проверка не пройдена **в течение недели**, сертификат получает статус `Invalid` (при выпуске) или
  `Renewal_failed` (при продлении).
- **Квоты, которые нужно знать заранее** ([limits, обновлено 2026-07-20](https://yandex.cloud/en/docs/certificate-manager/concepts/limits)):
  по умолчанию **20 сертификатов и 10 доменов на облако** (повышается через поддержку); жёсткие лимиты —
  100 доменов на сертификат, **50 сертификатов на домен в неделю**, **5 на одинаковый набор доменов в неделю**.
  Последние две цифры — буквально лимиты Let's Encrypt, что подтверждает, какой CA под капотом.

**Вывод:** если мы когда-нибудь захотим не держать собственный edge, российский путь существует и устроен так же.
Но дефолтная квота «10 доменов на облако» означает, что её надо поднимать **до одиннадцатой клиники**, а не после.

#### 3.8.7. Домен клиники ведёт её старый подрядчик

Это ровно тот случай, ради которого отрасль минимизирует число записей и делает их CNAME-ами (Zendesk объясняет
две ротируемые `_domainkey`-CNAME именно так: «you won't have to make any changes when the keys are updated»
([Zendesk DKIM](https://support.zendesk.com/hc/en-us/articles/4408822303386-Digitally-signing-your-email-with-DKIM))).
**Первичного источника, измеряющего нагрузку на поддержку от этой проблемы, не найдено** — она общеизвестна, но
в цифрах никем не опубликована. Наш практический вывод: чем меньше записей и чем меньше поводов вернуться к
подрядчику второй раз, тем выше доля клиник, которые вообще дойдут до конца.

#### 3.8.8. Проксирование через чужой CDN ломает выпуск

Зафиксировано в документе 19.08 по документации SimplyBook.me; исследование подтвердило, что это общая грабля:
Intercom прямо предупреждает, что Cloudflare в проксированном режиме даёт **Error 1014 (CNAME Cross-User Banned)**;
WorkOS пишет то же самое — «WorkOS uses Cloudflare, who prohibit domains from being proxied across accounts»
([WorkOS custom domains](https://workos.com/docs/custom-domains/authkit)); Zendesk и HubSpot требуют «серое
облако». То есть инструкция клинике обязана содержать строку «Cloudflare — только DNS, без проксирования».

### 3.9. Обновление к рекомендации 26.07 про Caddy — механика изменилась

Исследование 26.07 рекомендовало Caddy `on_demand_tls` с `ask`-эндпоинтом. Рекомендация остаётся верной, но
**три детали в её тексте устарели** — проверено по актуальной документации и по исходникам Caddy на master
(2026-08-22):

1. **`ask` объявлен устаревшим и будет удалён.** В исходнике (`modules/caddytls/ondemand.go`):
   `Ask string // Deprecated. WILL BE REMOVED SOON. Use 'permission' instead with the 'http' module.`
   Новая форма — модуль `tls.permission.http`; задать одновременно `ask` и `permission` — жёсткая ошибка
   конфигурации ([caddy/modules/caddytls/ondemand.go](https://github.com/caddyserver/caddy/blob/master/modules/caddytls/ondemand.go)).
2. **`interval`/`burst` не просто «не рекомендованы» — их больше нет.** Парсер Caddyfile теперь падает с
   сообщением «the on_demand_tls 'interval' option is no longer supported, remove it from your config».
   **Следствие: единственный поддерживаемый способ ограничить темп выпуска — наш собственный эндпоинт.**
3. **Параметра `?remote_ip=` не существует** — Caddy шлёт только `?domain=`. IP клиента доступен внутри
   кастомного `permission`-модуля через контекст, но не в HTTP-запросе к `ask`. Таймаут клиента — **10 секунд**,
   метод GET, **редиректы запрещены**, принимается любой код 2xx.

Подтверждение того, что 26.07 назвал главным риском, в собственных словах Caddy: при включённом on-demand без
`ask`/`permission` при старте пишется строка
**«YOUR SERVER MAY BE VULNERABLE TO ABUSE: on-demand TLS is enabled, but no protections are in place»**
(`modules/caddytls/tls.go`). А CertMagic — библиотека под Caddy — формулирует границу ответственности прямо:
**«To impose rate limits, specify your own DecisionFunc»**
([github.com/caddyserver/certmagic](https://github.com/caddyserver/certmagic)).

**Ещё две вещи из CertMagic, важные для эксплуатации:**

- **Общее хранилище = один кластер и один ACME-аккаунт.** «any instances that use the same storage facilities are
  considered part of the cluster»; аккаунт лежит там же (`acme/<issuer>/users/<email>/`). Значит лимиты
  Let's Encrypt «на аккаунт» действуют на весь парк сразу (см. §3.6).
- **«Persistent storage is a requirement: ephemeral storage will likely lead to rate limiting on the CA-side».**
  То есть хранилище сертификатов обязано пережить перезапуск контейнера.

**И одна вещь, которой в документации нет ни у кого** — помечаю как свой инженерный вывод, не как цитату:
Caddy прямо запрещает делать DNS-запросы внутри `ask` («Avoid making DNS queries or other network requests»), но
нигде не говорит, где тогда проверять, что DNS клиники действительно указывает на нас. Единственная согласованная
форма: **проверять DNS асинхронно в момент подключения домена** (клиника ввела домен → фоновая задача резолвит →
ставит флаг «проверено»), а `ask` делает ровно один индексный поиск по этому флагу. Это заодно бережёт бюджет
«5 неудачных валидаций в час на имя».

**Про альтернативы, если вдруг вернёмся к вопросу:** `lua-resty-auto-ssl` (рассматривался 26.07 как вариант для
nginx) **объявлен заброшенным** — в README прямым текстом «This project is currently abandoned», последний релиз
**v0.13.1 от 2019-10-01** ([github.com/auto-ssl/lua-resty-auto-ssl](https://github.com/auto-ssl/lua-resty-auto-ssl)).
Вывод 26.07 «не рекомендуется» подтверждается сильнее, чем тогда: теперь это не «тоньше экосистема», а мёртвый
проект. Traefik по-прежнему не умеет on-demand для произвольного SNI и в OSS-редакции не умеет HA с ACME («it is
not possible to run multiple instances… with Let's Encrypt enabled»
([Traefik v3.7 ACME docs](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/))).

---

## 4. Вопрос 3. Бренд против кода: как один UI служит многим брендам

### 4.1. Настраиваемого — мало, и это осознанно. Это «словарь токенов», а не тема

У всех, кто делает это всерьёз, арендатору отдают **закрытый, поимённо перечисленный набор значений**, а всё
остальное платформа выводит сама.

| Продукт | Что настраивает арендатор | Источник |
| --- | --- | --- |
| **Auth0, Organizations** | логотип + основной цвет + цвет фона — и всё | [B2B Branding](https://auth0.com/docs/get-started/architecture-scenarios/business-to-business/branding): «provides a way to store logo, primary color, and background color» |
| **WorkOS AuthKit** | **четыре цвета** на светлую и тёмную тему (фон страницы, фон кнопки, текст кнопки, ссылки) + скругление + шрифт (только Google Fonts) + логотип + favicon | [AuthKit Branding](https://workos.com/docs/authkit/branding): «Other colors used in the UI, like the focus outline, hover styles, or borders, are created automatically based on the four colors you provide» |
| **Stripe Connect** | ровно четыре поля на объекте аккаунта: `icon`, `logo`, `primary_color`, `secondary_color` | [Stripe API — Account object](https://docs.stripe.com/api/accounts/object) |
| **Salesforce Experience Cloud** | `BrandingSet` — именованный список свойств (`BRAND_COLOR`, `TEXT_COLOR`, `LINK_COLOR`, `PAGE_BACKGROUND_COLOR`, изображения, шрифты) | [Metadata API — BrandingSet](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_brandingset.htm) |
| **Shopify** | перечень настроек объявлен в `config/settings_schema.json`, значения ложатся в `settings_data.json`; мерчант меняет вид «without editing code» | [settings_schema.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-schema-json) |
| **Zendesk Guide** | перечень в `manifest.json`, типы `text/list/checkbox/color/file/range`, **не более 200 настроек**, логотип и favicon обязательны | [Customizing the Settings panel of the theme](https://support.zendesk.com/hc/en-us/articles/4408846524954-Customizing-the-Settings-panel-of-the-theme) |

**Ключевая деталь механики — платформа выводит производные значения сама.** Salesforce документирует это прямо:
«When an administrator updates a property in the Theme panel, the system automatically updates any Lightning
components that use the tokens associated with that branding property» — Text Color → `colorTextDefault`, Action
Color → `colorBackgroundButtonBrand`/`colorBrand`/`colorTextBrand`, а состояния hover/active вычисляются из
«Action Color Darker» ([Standard Design Tokens for Communities](https://developer.salesforce.com/docs/atlas.en-us.lightning.meta/lightning/tokens_standard_communities.htm)).
Арендатор даёт **семена**, платформа считает остальное.

**Разрешение бренда происходит на каждом запросе, а не при сборке.** Stripe Checkout берёт брендинг в момент
создания сессии и для connected-аккаунтов использует бренд **подключённого аккаунта**
([Checkout appearance](https://docs.stripe.com/payments/checkout/customization/appearance.md?payment-ui=stripe-hosted)).
Intercom Messenger выбирает бренд **по домену/поддомену** при загрузке, с приоритетом «точное > частичное >
wildcard» ([Style your Messenger to support multiple brands](https://www.intercom.com/help/en/articles/3946163-style-your-messenger-to-support-multiple-brands)).

> **Оговорка исследования:** ни один вендор не документирует **транспорт** (как именно токены доезжают до
> браузера — inline `:root{--brand-…}`, отдельный CSS-файл, что-то ещё). Все документируют **контракт** — имена
> полей и API. Первичного источника на «как это доставляется» не найдено.

### 4.2. Что НЕ дают настраивать — и как это обосновывают

Здесь исследование дало прямые цитаты, и они разделяются на два разных обоснования.

**Обоснование «безопасность» — самое явное у WorkOS.** Их кастомный CSS (единственная найденная легальная
«отдушина» и та — данные, а не код) описан так: «**All code input is sanitized and stripped of any potentially
harmful elements**» — запрещены `script`, `iframe`, `form`, `object` и inline-обработчики событий; элементы
`style` вырезаются «to prevent external override»; **JavaScript и динамический контент не поддерживаются вовсе**
([AuthKit Branding](https://workos.com/docs/authkit/branding); анонс — [AuthKit custom CSS, 2025-06-23](https://workos.com/blog/authkit-custom-css)).

**Обоснование «поддержка и обновления» — у Zendesk, и оно жёстче, чем ожидалось.**
«When you use the standard Copenhagen theme... it is supported by Zendesk and automatically updated when new theme
features are released»; «**you cannot edit the code to customize the theme. Otherwise, it will no longer be
considered a standard theme**»; «**Custom themes are _not_ supported by Zendesk and are _not_ automatically updated
when new theme features are released**»
([About the standard theme and custom themes](https://support.zendesk.com/hc/en-us/articles/4408821255834-About-the-standard-theme-and-custom-themes-in-your-help-center)).
То есть тронул код — вышел из поддержки и из автообновлений.

> **Поправка к моей же первой редакции:** фразы «Zendesk не поддерживает кастомный CSS» в их документации **нет**.
> Есть ровно две цитаты выше — это граница **поддержки и обновляемости**, а не заявление о безопасности.

**Обоснование «структура меняется, не привязывайтесь» — у Auth0**, и это самое полезное для нас:
«**CSS class names change each time Auth0 builds the project. Custom CSS that targets these classes will break**»
и «**The HTML structure of Universal Login pages is subject to change. Avoid customizations that rely on the HTML
structure**» ([Customize page templates](https://auth0.com/docs/customize/login-pages/universal-login/customize-templates)).

**Обоснование «фиксированная раскладка + белый список свойств» — у Stripe.** Для Elements: «La disposition de
chaque Element reste la même, mais vous pouvez modifier les couleurs, les polices, les bordures, les marges
intérieures» (раскладка каждого элемента остаётся прежней; менять можно цвета, шрифты, границы, внутренние
отступы), и «Chaque nom de classe utilisé dans un sélecteur prend en charge une liste des propriétés CSS
autorisées» — у каждого класса **белый список** допустимых CSS-свойств
([Appearance API](https://docs.stripe.com/elements/appearance-api.md?api-integration=paymentintents)).
У hosted Checkout CSS нет вовсе — только семь полей, причём `font_family` — перечисление примерно из 24 шрифтов.
И отдельный, внешний по отношению к продукту довод: «Les règles de réseau exigent également généralement que vous
utilisiez un nom d'entreprise et un logo exacts et cohérents» — правила платёжных сетей требуют точного и
согласованного имени и логотипа.

**Ограничение «контент — платформенный, меняется только оправа» — у Intercom:** «**Messenger content such as
spaces, apps, the welcome message, etc. cannot be customized for multiple brands**» (тот же источник, что выше).
И у Chargebee: «**Currently, custom header and footer elements are not supported. Only header color modifications
and logo customization are available**»
([Checkout layout customization](https://www.chargebee.com/docs/billing/2.0/hosted-capabilities/checkout-layout-customization)).

**Наш собственный канон уже стоит ровно на этой позиции** — владелец 16.07: «Отдельный layout, theme или bespoke
design под каждую клинику не планируется: меняются identity/brand assets, но не базовая композиция продукта»
(`OWNER_RULINGS_2026-07-16.md:71-77`, цитируется по `CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` §1.1). То есть
решение владельца совпадает с самой консервативной частью мировой практики, а не отстаёт от неё.

**И совет Shopify авторам тем — самая точная формулировка принципа из всех найденных:**
«**Keep theme settings to the minimum that's required to empower the majority of merchants**» — избегать «niche
settings and settings for edge cases»; «Make sure that all the flexibility provided in the theme is predictable»;
«**Avoid any magic settings that remove control from merchants**»
([Theme design best practices](https://shopify.dev/docs/storefronts/themes/best-practices/design)).

### 4.3. Где команды сползают в форк — и на каком именно числе арендаторов

Здесь нашёлся **первичный, датированный источник**, и он даёт не только запрет, но и порог.

Microsoft Azure Architecture Center, раздел «Antipatterns to avoid → Specialized customizations for tenants»
([Deployment and configuration approaches, ms.date 2025-07-16, updated 2026-04-30](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/deployment-configuration)):

> «**Avoid deploying features or a configuration that only applies to a single tenant.** This approach adds
> complexity to your deployments and testing processes. **Instead, use the same resource types and codebase for
> each tenant.** Use strategies like feature flags for temporary changes or for features that are rolled out
> progressively. Or use different pricing tiers with license entitlements to selectively enable features for
> tenants that require them.»

Оттуда же три вещи, которых нет больше нигде:

1. **Порог, на котором «список арендаторов как конфигурация» ломается.** Разворачивать каждого арендатора из
   параметров пайплайна «works well for small numbers of tenants», но «as the number of tenants increases, often
   **around 10 or more**, it becomes cumbersome to reconfigure the pipeline as you add tenants». Дальше нужен
   «tenant list as **data**» — каталог арендаторов, из которого control plane создаёт ресурсы.
2. **Feature flags — не механизм тарификации.** «Feature flags aren't usually the right choice for these
   scenarios. Instead, consider building a process to track and enforce the *license entitlements* that each
   customer has.» Иначе `if (tenant === 'X')` просто маскируется под флаг.
3. **Ручной деплой — часть того же анти-паттерна:** «Manual deployment processes add risk and slow your ability
   to deploy.»

**Для нас:** порог «около 10» — это буквально момент, когда наша ручная активация домена (`TPB-14`) начнёт
конкурировать за время оператора. Не раньше. И вторая строка прямо подтверждает нашу архитектуру механик/тарифов:
брендирование и домен у нас уже entitlement, а не флаг.

Наш план фиксирует защиту от форка явно (`TPB-06`: «BersonCare активирован первой конфигурацией универсального
механизма, **без BersonCare-specific code**»; доказательство — «отсутствие BersonCare branching в product code»).
Это ровно та защита, о которой пишет Microsoft, и у нас она сильнее: у них это принцип, у нас — бинарный чекбокс
приёмки.

> **Пробел:** ни одного первичного инженерного разбора **от названной продуктовой команды** про уход от
> пер-арендаторских веток/сборок найти не удалось. Есть только консалтинговые блоги — на них не опираюсь.

### 4.4. PWA-манифест на бренд-домене — бесплатное следствие, не отдельная работа

Манифест PWA (файл, из которого браузер берёт имя, иконку и стартовый адрес установленного приложения) резолвится
относительно своего URL, и `scope` задаётся «absolute URL that is same-origin with manifest file URL»
([MDN, Manifest `scope`, обновлено 2025-06-23](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope)).

**Вывод:** идентичность установленного приложения привязана к origin. Значит, если манифест вычисляется из того же
резолвера поверхности, что и всё остальное (наш `B3`), то домен клиники **автоматически** получает собственное
устанавливаемое приложение с её именем и иконкой, а платформенный домен — своё. Отдельного механизма
«organization PWA» (UX08-08) строить не надо — надо только не захардкодить манифест.

---

## 5. Вопрос 4. Что живёт в корне брендированного домена

### 5.0. Одиннадцать продуктов: в корне лежит ПРОДУКТ, а не логин и не маркетинг

| Продукт | Что в корне домена клиента | Корень домена (apex)? | Бейдж платформы |
| --- | --- | --- | --- |
| Zendesk Guide | **продукт** (справочный центр) | **нет**, только поддомен | нет |
| Intercom | **продукт** (Help Center) | поддомен или подпуть | тумблер, тарифного гейта в доке не найдено |
| HubSpot CMS | **маркетинг** (собственные страницы клиента) | да | не найдено |
| Shopify | **продукт** (витрина) | да | убирается **на любом тарифе** |
| Discourse | **продукт** (форум) | да, но сложнее | нет |
| Salesforce Experience | **продукт**, если Custom URL повешен на путь `/` | да | не найдено |
| Circle | **продукт** за логином | да | убирается на тарифе **$199 Business** |
| Teachable | **продукт/маркетинг** (страница школы) | да, на платных | не найдено |
| Podia | **продукт** | да | убирается на платных, **кроме страницы логина** |
| Statuspage | **продукт** (статус-страница) | не задокументировано | отдельной опции нет, только через Custom CSS от $99 |
| Better Stack | **продукт** (статус-страница) | не задокументировано | поле API `whitelabeled`, «This is a billable feature» |

**Десять из одиннадцати отдают в корне сам продукт. Ни один не отдаёт голый экран входа как пункт назначения.**
Circle и Podia прячут продукт за логином, но логин там — дверь перед продуктом, а не то, ради чего домен
существует.

**И один прецедент, который стоит прочитать до принятия решения по нашему `TPB-11`.** Podia — единственный, кто
документирует, почему бренд платформы **остаётся** на странице входа, размещённой на домене клиента: убрать его
нельзя, потому что эта отметка «is always displayed to help customers identify that they're signing in through
Podia and ensure they're accessing the correct platform»
([Removing "Powered by Podia"](https://help.podia.com/en/articles/11370438-removing-powered-by-podia-from-your-site-and-emails)).
То есть **анти-фишинговый** довод: пациент должен понимать, куда он вводит пароль. У нас `TPB-11` требует, чтобы
branded root вёл к brand login — и это совместимо: вопрос не в том, чей логин, а в том, есть ли на нём маленькая
честная отметка «вход через Therapysto». Это не решённая мной вещь, а вход в развилку `W8` ниже.

### 5.1. Что показывают

Zendesk формулирует границу точнее всех
([Host mapping](https://support.zendesk.com/hc/en-us/articles/4408838571930-Host-mapping-Changing-the-URL-of-your-help-center)):

> «Host mapping enables you to change the URL that your customers see when accessing your help center **without
> having to change the actual address of your agent interface or Zendesk account**.»
> «it doesn't affect the URL of the Zendesk sign-in page, nor does it change the URL of the agent interface.»
> Если агент попробует работать через host-mapped адрес — «the agent will be redirected to the default URL».

То есть: **на домене клиента — только клиентская поверхность. Сотрудник, пришедший туда, выкидывается обратно на
платформенный адрес.** Это ровно наш `TPB-08` и `TPB-11`, подтверждённые чужим продакшеном.

И второе, важное для нашей развилки O5: **платформенный адрес продолжает работать** — «The original URL continues
to function... host mapping only changes the external-facing URL of your help center» (там же). Никакого
принудительного редиректа платформенного адреса на клиентский нет. Это совпадает с уже принятым у нас решением
(`CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md:477-480`: домен может протухнуть, а ссылка из письма
полугодовой давности обязана открыться).

Shopify — обратная модель для сравнения: там выбирается **primary domain**, и остальные подключённые домены на
него редиректят (зафиксировано в `CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` §4.1). Разница объясняется тем, что
у Shopify домен — это и есть витрина магазина, а у Zendesk справочный центр — придаток к основному аккаунту.
**Наш случай ближе к Zendesk: у клиники домен — дополнительный вход, а не единственный.**

### 5.2. Как не протечь брендом платформы

Механизм, которым отрасль убирает «Powered by», — **тарифный переключатель, а не код**. Intercom: отключение
брендинга в Messenger и письмах «only available in certain pricing plans»
([Intercom Community FAQ](https://community.intercom.com/customer-faq-28/how-can-i-get-rid-of-the-intercom-branding-2397), вторичный —
это официальное community-FAQ Intercom, но не docs). Tawk.to продаёт «Remove Branding add-on» отдельной строкой
([tawk.to help](https://help.tawk.to/article/purchasing-the-remove-branding-and-white-label-add-on)).

**Для нас это уже решено владельцем 16.07** («для платного полного брендирования... собственный домен... полностью
заменяет product-facing branding на закреплённой за ней поверхности») — и совпадает с рынком.

### 5.3. Обратная утечка: бренд клиники в staff-интерфейсе

Отдельного документа «мы следим, чтобы бренд арендатора не попал в админку» ни у кого **не найдено** — потому что
у всех это следствие архитектуры: админка живёт на **другом хосте** (`admin.shopify.com`, `<sub>.zendesk.com`), и
резолвер бренда там просто не запускается.

**Вывод для нас — и это наш главный структурный риск, которого нет у Shopify/Zendesk:** у нас staff и patient живут
в **одном** приложении и различаются только резолвом. Значит, «бренд не течёт в staff» у нас — не следствие
топологии, а **свойство, которое надо проверять тестом**. Наш план это учитывает (`TPB-08`, доказательство —
«cross-surface metadata/UI tests»), и это правильно; но стоит понимать, что мы держим руками то, что у них держит
разделение хостов.

---

## 6. Вопрос 5. Вход на разных поверхностях

### 6.1. Cookie привязана к хосту — и это считают свойством, а не багом

Cookie без атрибута `Domain` отправляется только тому хосту, который её выдал. Значит пациент на
`klinika.ru` и он же на общем пациентском домене — **две разные сессии**. Кросс-доменного SSO между
арендаторскими доменами в норме не строят: Zendesk прямо оставляет вход и интерфейс агента на платформенном
адресе (§5.1), Shopify держит админку на своём домене.

Формальное подтверждение — MDN про атрибут `Domain`: «**If omitted, the cookie is returned only to the host that
sent them (i.e., it becomes a 'host-only cookie')**. This is more restrictive than setting the host name, as the
cookie is not made available to subdomains of the host»
([Set-Cookie, обновлено 2026-08-15](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

**И самая точная формулировка отраслевой позиции — у Auth0**, в их же инженерном блоге про несколько кастомных
доменов на одном тенанте ([Multi-brand identity simplified, 2026-01-14](https://auth0.com/blog/multi-brand-identity-simplified-auth0-multiple-custom-domains/)):

> «**Each custom domain represents a separate security context and requires its own Access Token and session.
> Therefore, while the user profile is shared, users must sign in separately to each custom domain to establish a
> new application session.**»

И там же — про то, как выбирается лицо: страница входа «**dynamically branded based on the request's hostname**».
Это буквально наша схема: **общая идентичность, отдельная сессия на домен, бренд по хосту.**

Okta говорит то же на уровне cookie: «**The session cookie produced for an Okta tenant is linked to the accessed
URL**», и пользователь, пришедший на стандартный адрес после кастомного, «will be prompted to re-authenticate»
([Okta support, 2025-09-01](https://support.okta.com/help/s/article/update-application-configuration-when-adding-custom-url-domain-to-okta-org)).

**Наше решение (host-only cookie, без cross-domain SSO — `IMPLEMENTATION_PLAN.md` §1.3, `B6`) совпадает с
практикой дословно.** Никакой находки «мы делаем не как все» здесь нет.

### 6.2. Redirect URI при многих доменах — точное совпадение, никаких шаблонов

RFC 9700 «OAuth 2.0 Security Best Current Practice» (**опубликован январь 2025**) требует:

> §2.1: «authorization servers MUST utilize exact string matching except for port numbers in `localhost`
> redirection URIs of native apps.»
> §4.1.3: «the authorization server MUST ensure that the two URIs are equal» (простое строковое сравнение по
> RFC 3986).

Причина названа там же: «several successful attacks exploiting flaws in the pattern-matching implementation or
concrete configurations have been observed in the wild»
([RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)).

**Что это значит для нас практически.** Wildcard-редиректа на `*.клиника.ru` не бывает и не будет. Есть ровно две
рабочие схемы:

- **A. Один фиксированный callback-хост.** Старт и callback всегда на платформенном домене; в `state`
  (подписанном) лежит, на какой домен вернуть пользователя после. Один зарегистрированный redirect URI на все
  клиники. Минус: пациент на секунду видит платформенный домен в адресной строке.
- **B. По одному зарегистрированному redirect URI на каждый активированный домен.** Пациент домена не покидает.
  Минус: каждая новая клиника требует ручной регистрации у провайдера.

Наш план сейчас описывает B (`§1.4`: «Каждая активируемая branded clinic получает per-org DB-backed Yandex app
config») — и это **не выбор между A и B по признаку callback**, а следствие другого требования: **consent-экран**.

### 6.3. Consent-экран — вот где B становится обязательным

Несколько redirect URI у одного приложения решают маршрутизацию, но **не меняют имя и иконку на экране согласия** —
это уже зафиксировано нашим аудитом (`INDEPENDENT_PLAN_AUDIT.md` F-01) по документации Яндекса.

Мировой аналог подтверждает, что это общее свойство протокола, а не особенность Яндекса. У Google брендинг
OAuth-приложения настраивается на «Branding page of the Google Auth Platform» и живёт **на проект**, а не на
клиент ([Google Cloud, Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049)). Утверждение
«поэтому под каждый бренд нужен отдельный проект» встречалось мне только во вторичном пересказе — **на самой
странице Google я этой фразы не нашёл**, поэтому привожу как вторичное.

**Вывод:** если требование «пациент клиники видит на экране согласия только её имя» остаётся в силе, отдельная
регистрация приложения на клинику неизбежна — редиректами это не решается. Если требование снимается (или Яндекс
у пациентов вообще убирается — открытый гейт `OG-4`), схема A проще и дешевле в эксплуатации.

### 6.4. Что ломается при переезде домена или отключении бренда

- **Сессии** — умирают вместе с хостом. Пользователь на новом домене просто не залогинен. Это нормально и обратимо.
- **Пароли, сохранённые в браузере** — привязаны к origin. После переезда менеджер паролей не предложит их на новом
  адресе. Лечится только тем, что старый адрес продолжает работать (§5.1) — и это ещё один аргумент против
  «жёсткого редиректа» платформенного адреса.
- **Passkey — самое жёсткое.** Ключ привязан к RP ID (домену, для которого он создан). Спецификация WebAuthn
  Level 3 ввела **Related Origin Requests**: файл `/.well-known/webauthn` на домене RP со списком разрешённых
  origin'ов. Ограничение, названное явно: «WebAuthn requires client implementations to support **at least 5 unique
  labels**, however there are no known clients which support more than 5, so that should be treated as the maximum»
  ([passkeys.dev — Related Origin Requests](https://passkeys.dev/docs/advanced/related-origins/); см. также
  [web.dev, Allow passkey reuse across your sites with ROR](https://web.dev/articles/webauthn-related-origin-requests)).

  **Пять доменов — это потолок.** Значит passkey **физически не масштабируется** на много клинических доменов:
  даже если бы захотели — на шестой клинике механизм бы кончился.

  > **Уточнение 22.08.2026 (правка лида после написания отчёта).** Исходная редакция этого абзаца ссылалась на
  > «решение владельца убрать passkey». Оно было ОТМЕНЕНО в тот же день: владелец — «все механики включаются в
  > админке, отдельно для докторов и отдельно для пациентов», «я просто не хочу удалять то что уже сделано».
  > Passkey не удаляется, а становится переключаемой механикой, по умолчанию выключенной у докторов, с возможным
  > будущим включением как второй фактор или как личная опция доктора. Технический вывод этого раздела при этом
  > НЕ меняется и становится даже важнее: потолок в 5 доменов означает, что passkey можно включать на
  > **staff-поверхности Therapysto** (она одна) и **нельзя** обещать на пациентских доменах клиник.

  Насколько это необратимо: «**The browser cryptographically ties passkeys to the RP ID when you create them**»
  ([web.dev — RP ID deep dive, обновлено 2026-02-19](https://web.dev/articles/webauthn-rp-id)); и следствие,
  сформулированное прямо: «**changing the URL would invalidate all passkeys that have ever been used**»
  ([Duende, 2025-10-14](https://duendesoftware.com/blog/20251014-deep-dive-into-relying-party-id-and-origin-with-passkeys),
  вторичный, но с конкретным разбором мультиарендного случая). Auth0 фиксирует ту же привязку одной строкой:
  «Passkeys are bound to your custom domain by the relying party ID attribute `rpId`»
  ([Auth0 custom domains](https://auth0.com/docs/customize/custom-domains)).

  **Проектное следствие, если passkey когда-нибудь вернётся:** учётные данные должны жить на ОДНОМ фиксированном
  auth-домене, который никогда не меняется, а домены клиник — федерироваться к нему. Собственный RP ID на каждом
  домене клиники — тупик по построению.

Дополнительно — **запрет wildcard в redirect URI как продуктовая политика, а не только как RFC.** Auth0:
«Avoid using wildcard placeholders for subdomains in production application callbacks and allowed origins as it
can make your application vulnerable to attacks», и называет угрозу поимённо — **захват поддомена**, при котором
токены уезжают не тому получателю, а logout-URL уводит на фишинг
([Wildcards for subdomains](https://auth0.com/docs/get-started/applications/wildcards-for-subdomains)).
Это тот же вектор, что в §3.5 — только с другой стороны.

**Контр-сигнал, для честности:** GitHub **2026-08-14** ввёл wildcard-сопоставление внутри каждого
зарегистрированного redirect URI именно чтобы поддержать «tenanted subdomains of your app»
([GitHub Changelog](https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps/)).
Это послабление со стороны провайдера против рекомендации BCP; **не читать это как «шаблоны стали безопасны»**.

### 6.5. Третьесторонние cookie — почему это не наша проблема

Контекст, ради которого существуют кастомные домены у Auth0/Okta: браузеры давят third-party cookie. Точные даты:

- **Safari блокирует все третьесторонние cookie по умолчанию с 2020-03-24** (Safari 13.1 / iOS-iPadOS 13.4):
  «Cookies for cross-site resources are now blocked by default across the board»
  ([WebKit blog, 2020-03-24](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- **Chrome НЕ удалил третьесторонние cookie — Google отменил это решение 2025-04-22:** «we've made the decision to
  maintain our current approach to offering users third-party cookie choice in Chrome, and will not be rolling out
  a new standalone prompt for third-party cookies»
  ([Privacy Sandbox — next steps, 2025-04-22](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps)).

**Вывод, который стоит запомнить:** отмена в Chrome ничего не отменила в проектировании. Safari и Firefox уже
блокируют, и Auth0, Okta, Firebase, перестроившиеся на first-party кастомные домены, назад не откатились.
Проектировать надо под поведение Safari, а не под отсрочку Chrome.

Для нас это в любом случае не блокер: мы не встраиваемся iframe'ом в чужие сайты и не полагаемся на
third-party cookie. Наша сессия — first-party на том домене, где пациент находится.

---

## 7. Вопрос 6. Почта, боты и всё исходящее под брендом клиники

Этот раздел — самый доказательный из всех, потому что здесь у отрасли есть единодушный, задокументированный ответ.

### 7.1. Механизм: почему `From: klinika@klinika.ru` через наш SMTP не долетит

- **SPF** (RFC 7208, апрель 2014) проверяет **не** видимый заголовок `From`, а конвертный `MAIL FROM` и `HELO`.
- **DMARC** (RFC 7489, март 2015) — это то, что связывает аутентификацию с видимым `From`: нужно **выравнивание
  (alignment)**: домен из `From` должен совпадать с доменом DKIM-подписи (`d=`) или с доменом, аутентифицированным
  SPF ([RFC 7489 §3.1](https://datatracker.ietf.org/doc/html/rfc7489#section-3.1)).

Отсюда структурный провал: платформа подписывает DKIM своим доменом (`d=` ≠ `klinika.ru` → выравнивание DKIM
падает) и использует свой bounce-домен (SPF проходит, но для **нашего** домена → выравнивание SPF падает). DMARC
не проходит. При `p=quarantine`/`p=reject` у клиники письмо уходит в спам или отбивается.

Ровно эти два лечения и просят все продукты — по одной CNAME на каждое:

> первая CNAME «is used to configure DKIM on emails you send from Intercom, which allows the email you send from
> Intercom to be **DKIM aligned for DMARC**»; вторая «is used to configure the return-path address... which allows
> the email you send from Intercom to be **SPF aligned for DMARC**»
> ([Intercom, Connect your email support channel, обновлено 2026-04-24](https://www.intercom.com/help/en/articles/9744849-connect-your-email-support-channel))

**Почему CNAME, а не TXT:** чтобы платформа могла ротировать ключи, не трогая DNS клиента. Zendesk объясняет это
дословно: «As long as you use the method described below... you won't have to make any changes when the keys are
updated» ([Zendesk DKIM](https://support.zendesk.com/hc/en-us/articles/4408822303386-Digitally-signing-your-email-with-DKIM)).

### 7.2. Почему это стало обязательным именно сейчас

- **Google, с 1 февраля 2024.** Для отправителей 5000+ писем в день: SPF **и** DKIM **и** DMARC, и «the domain in
  the sender's From: header must be aligned with either the SPF domain or the DKIM domain»
  ([Email sender guidelines](https://support.google.com/a/answer/81126)). **Важно для нас:** обязательная
  «отписка в один клик» на транзакционные письма **не распространяется** — «Transactional messages are excluded
  from this requirement» ([FAQ](https://support.google.com/a/answer/14229414)). Требования по аутентификации —
  распространяются.
- **Yahoo, с февраля 2024** — то же самое, с явным «Ensure the domain in the From: header is aligned»
  ([Yahoo Sender Best Practices](https://senders.yahooinc.com/best-practices/)).
- **Microsoft/Outlook.com, с 5 мая 2025** — для 5000+/день к `@outlook.com`/`@hotmail.com`/`@live.com`: SPF+DKIM
  pass и DMARC минимум `p=none` с выравниванием; после майского обновления — не «в спам», а отказ доставки.
  **Источник вторичный:** [dmarcian, 2025-04-04](https://dmarcian.com/microsoft-enforces-spf-dkim-dmarc/),
  пересказывающий анонс Microsoft; сам анонс Microsoft прочитать не удалось (страница не отрендерилась). Точный
  текст SMTP-ошибки в разных пересказах различается — на него не опираться.

### 7.3. 🔴 Главный ответ: что делают, когда клиника НЕ настроила домен

**Единогласно, по пяти независимым первичным источникам: не отказываются отправлять и не подделывают адрес.
Переписывают `From` на свой платформенный домен, сохраняя имя клиники в отображаемом имени и/или Reply-To.**

| Продукт | Что происходит | Источник |
| --- | --- | --- |
| **Shopify** | «if you take no action, then your sender email is rewritten to `store+123@shopifyemail.com`» (цифры уникальны на магазин). Если записи позже откатят — переписывание возвращается. Явное предупреждение: существующий DMARC не должен иметь `adkim=s`/`aspf=s`, и записей DMARC не может быть две | [Displaying your store's sending email](https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/email-rewrites) |
| **HubSpot** | «HubSpot will modify the email address to use a HubSpot managed domain (e.g. `hs-domain.com`), so the resulting sending address will appear as: `user=yourcompany.com@hs-domain.com`» — отправка не отменяется | [Overview of email authentication](https://knowledge.hubspot.com/marketing-email/overview-of-email-authentication) (обновлено 2026-06-23) |
| **Mailchimp Transactional (Mandrill)** | «we'll use a `mandrillapp.com` subdomain as the sending domain for your email address, **but replies from recipients will still go to your email address**» | [New sending domain authentication requirements](https://mailchimp.com/developer/release-notes/new-sending-domain-authentication-requirements/) (2023-12-19) |
| **Zendesk** | «the message identifies the sender as *zendesk.com* to avoid getting rejected»; получатель видит «via zendesk.com», агент — предупреждение об SPF в интерфейсе | [Allowing Zendesk to send email on behalf of your email domain](https://support.zendesk.com/hc/en-us/articles/4408832543770-Allowing-Zendesk-to-send-email-on-behalf-of-your-email-domain) |
| **Intercom** | общий домен `intercom-mail.com` «for initial setup and testing», «not recommended for long-term use»; неаутентифицированный адрес несёт видимую метку **«Unauthenticated»** | [Connect your email support channel](https://www.intercom.com/help/en/articles/9744849-connect-your-email-support-channel) (2026-04-24) |

**Postmark ранжирует варианты явно** и не рекомендует отправку с неаутентифицированного домена клиента:
(1) полное выравнивание на домене клиента — рекомендовано; (2) верифицированный адрес без полного выравнивания —
получите «via»/«on behalf of» и «emails may look unprofessional at best, or, untrustworthy at worst»;
(3) отправка со своего платформенного домена с кастомным отображаемым именем
([Best practices for sending on behalf of your users](https://postmarkapp.com/guides/best-practices-for-sending-on-behalf-of-your-users), обновлено 2023-03-27).

**Amazon SES доводит выбор до уровня конфигурации** — при настройке кастомного MAIL FROM домена явно спрашивают,
что делать, если MX-запись не найдена: **`Use default MAIL FROM domain`** (тихо откатиться на поддомен
`amazonses.com`) или **`Reject message`** («emails that you attempt to send from this domain are automatically
rejected») ([Creating and verifying identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)).
То есть «откат против отказа» — это признанная отраслью развилка, и по умолчанию предлагается **откат**.

### 7.4. Что из этого следует как правильная форма

1. **Никогда не блокировать транзакционное письмо.** Не доставленное подтверждение записи хуже, чем письмо с
   платформенного адреса.
2. **Никогда не подделывать.** Ставить неаутентифицированный домен клиники в `From` больше нельзя — февраль 2024
   это закрыл.
3. **Переписывать `From` на свой аутентифицированный домен, а идентичность клиники нести в (а) отображаемом
   имени и (б) `Reply-To`.** Mandrill сохраняет Reply-To явно; Shopify/HubSpot кодируют клиента в локальной части
   (`store+123@`, `user=clinic.ru@`) — это заодно **разделяет репутацию отправителя по арендаторам**, чтобы жалобы
   одной клиники не топили платформенный домен.
4. **Показывать клинике видимый статус «не подтверждено»** (слово Intercom), а не молча деградировать.
5. **Перепроверять непрерывно.** Shopify документирует обратный переход: откатили DMARC → адрес снова переписан.

### 7.5. Мессенджеры — обратная логика

**Telegram:** токен бота создаётся клиникой в BotFather; делегированного OAuth-механизма нет. Маршрутизация в
мультиарендной схеме идёт по пути вебхука и/или заголовку `X-Telegram-Bot-Api-Secret-Token`; жёсткие ограничения —
порты 443/80/88/8443, валидный TLS, ответ 200 за 60 секунд, `setWebhook` отключает `getUpdates`
([Telegram, Marvin's Marvellous Guide to All Things Webhook](https://core.telegram.org/bots/webhooks)).

**WhatsApp Business API:** у каждого арендатора свой WABA и свой номер; онбординг — через Embedded Signup у Meta,
номер выбирается **до** старта потока, чужой номер подтверждается OTP; Twilio называет **3-4 недели** на первые
два шага программы Tech Provider ([Twilio Tech Provider program](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program));
одна WABA на аккаунт → ISV заводит субаккаунт на клиента
([Register WhatsApp senders](https://www.twilio.com/docs/whatsapp/isv/register-senders)).

**Вывод:** в мессенджерах «частичного бренда» не существует. Либо у клиники есть свой бот/номер, либо канал
выключен, либо пациент общается с ботом платформы. Промежуточной формы, эквивалентной «From платформы + Reply-To
клиники», здесь нет. **Первичного документа, предписывающего конкретный fallback, ни у Telegram, ни у Twilio не
найдено** — это следствие устройства API, а не чья-то политика.

---

## 8. Вопрос 7. Эксплуатация: ручное подключение, самообслуживание, мониторинг

### 8.1. Ручное против самообслуживания

**Первичного, датированного инженерного разбора «мы перешли с ручного на self-service, вот цена» найти не
удалось.** Искал по инженерным блогам Vercel, Cloudflare, по dev.to/indiehackers — нашлись только вендорские и
вторичные материалы, на них не опираюсь. Это честный пробел исследования.

Зато нашёлся **датированный первичный источник с конкретным порогом**, и он отвечает на тот же вопрос с другой
стороны. Microsoft: разворачивать арендаторов из параметров пайплайна «works well for small numbers of tenants»,
но «as the number of tenants increases, **often around 10 or more**, it becomes cumbersome to reconfigure the
pipeline as you add tenants»; дальше нужен «tenant list as **data**»
([Deployment and configuration approaches, ms.date 2025-07-16](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/deployment-configuration)).

Что можно сказать доказательно, из механики выше:

- **Ручное подключение стоит ровно одну операцию оператора на домен** (проверить запись, привязать, прогнать
  smoke). При десятках клиник это часы в год.
- **Самообслуживание стоит не «формы», а машины состояний**: два независимых статуса (§3.2), backoff-расписание
  ретраев (§3.4), тексты ошибок на каждое состояние, перепроверка при поломке, снятие привязки по таймеру.
  Cloudflare публикует эту машину целиком — она нетривиальна, и это её реальная цена.
- **Порог «около 10» — не догадка, а опубликованное наблюдение**, и он совпадает с двумя другими цифрами,
  всплывшими независимо: дефолтная квота Yandex Cloud «10 доменов на облако» (§3.8.6) и предупреждение Netlify
  про «больше 5 алиасов на apex при внешнем DNS» (§3.2a).
- Следовательно **`TPB-14` («первичная активация домена остаётся ручной») — не компромисс, а нормальная первая
  ступень.** Переход к самообслуживанию оправдан примерно на десятой клинике с собственным доменом, а не раньше
  и не позже.

### 8.2. Мониторинг — что именно надо ловить

Из механики §3.4 и §7.5 складывается конкретный список сигналов, каждый со своим источником:

| Сигнал | Как ловится | Прецедент |
| --- | --- | --- |
| Сертификат близко к истечению / не продлился | периодическая проверка `notAfter` на живом домене | исследование 26.07 §«Renewal failure»: Caddy продлевает молча и бизнес-алерта не шлёт |
| Клиника поменяла CNAME/A — домен больше не указывает на нас | периодический DNS-резолв, сравнение с ожидаемым | Cloudflare: это ровно условие статуса `Moved` |
| Домен клиники не продлён у регистратора | NXDOMAIN при резолве | тот же механизм |
| DKIM/Return-Path CNAME сняты, DMARC откатан | перепроверка DNS перед отправкой / по расписанию | Shopify документирует автоматический откат на `store+123@` |
| CAA-запись клиники запрещает наш CA | проверка CAA при подключении | Microsoft, Domain Name Considerations |

И правило деградации, общее для всех: **не «сломано навсегда» и не «молча тихо», а промежуточное состояние с
таймером** — Cloudflare `Moved` → 7 дней → `Deleted`; Squarespace 15 дней; Zendesk снимает мэппинг.

**Для нас это стыкуется с уже известной болью репозитория:** прод-алертинг не ловит отказ доставки email/SMS
(зафиксировано в памяти проекта, инцидент 20-21.07 молчал более суток). Сертификат клиники — тот же класс молчащего
отказа, только первым его увидит пациент, а не мы.

### 8.3. Клиника, чей домен ведёт чужой подрядчик

Это самая частая практическая причина, по которой подключение зависает. Отраслевой ответ — **минимизировать
просьбу**: как можно меньше записей, и все CNAME, чтобы не приходить второй раз при ротации ключей (Zendesk,
§7.1). **Измеренной оценки нагрузки на поддержку не найдено** ни у кого — проблема известна, цифр никто не
публикует.

---

## 9. Что из этого применимо к нам

Сверено против `IMPLEMENTATION_PLAN.md` (редакция 22.08), `CURRENT_STATE_AND_GAP_REPORT.md`,
`CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` и `CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md`.

### 9.1. Где план УЖЕ совпадает с мировой практикой

| Наш пункт | Мировое подтверждение |
| --- | --- |
| Один `RequestSurfaceResolver` на существующем choke point (`§1.2`, `B3`) | Vercel `proxy.ts` — та же схема и тот же файл |
| «Host выбирает surface, но никогда не выдаёт доступ к tenant data» (`§1.2`) | Microsoft: «Never use the value of the host in a security mechanism»; AWS: изоляция через общий механизм |
| Неизвестный/дублирующийся Host → hard 404, не fallback (`§1.2`) | Cloudflare: без `active` по обоим статусам трафик не проксируется |
| Cookie остаются host-only, cross-domain SSO не вводится (`§1.3`, `B6`) | Zendesk оставляет вход/агента на платформенном адресе; отрасль не сшивает сессии между доменами |
| На branded surface нет Therapysto home и каталога специалистов (`B5`, `TPB-11`) | Zendesk: агент, пришедший на host-mapped адрес, редиректится обратно |
| Брендирование влияет только на patient-facing (`TPB-08`) | Zendesk host mapping не трогает интерфейс агента |
| Никакого theme-builder'а: optional `patientAppName` + один accent token (`§1.1`, `B4`) | Auth0 Organizations: логотип + основной цвет + цвет фона, и всё |
| Первая активация домена — ручная, self-service не строим (`TPB-14`, `B7`) | цена самообслуживания = машина состояний Cloudflare, а не форма |
| Отдельная OAuth-регистрация на каждый бренд (`§1.4`, аудит F-01) | consent-идентичность не меняется redirect-URI ни у Яндекса, ни у Google |
| Passkey убран, на пациентских поверхностях не появится (`§1.6`, `F2b`) | passkey через ROR упирается в потолок 5 доменов — на много клиник не масштабируется |
| Branded email — свой SMTP/sender/template, и всё через один resolver (`§1.5`, `C4`) | Intercom/Zendesk/Shopify: DKIM CNAME + Return-Path CNAME + DMARC |

### 9.2. Где план расходится с практикой — и оправдано ли это

**Р1. «На branded surface email либо отправляется своим SMTP, либо недоступен/fail-closed» (`§1.5`).**
Расходится с единогласной практикой (§7.3): Shopify, HubSpot, Mandrill, Zendesk, Intercom — все продолжают
отправлять, переписав `From` на платформенный домен.
**Оправдано ли:** частично. Требование «письмо с чужим брендом не уходит» выполняется и при переписывании — там
бренд платформы честный, а не подставной. Но у нас fail-closed означает **пациент не получил подтверждение
записи**. Это owner-развилка `Q1` ниже, не самовольная правка.
**Замечание про SMTP клиники:** у нас `clinic_smtp_outbound` — это отправка через **её собственный SMTP-сервер**,
а не через нашу платформу с её DKIM. Это иная модель, чем у всех процитированных (они — ESP, отправляющий за
клиента). Своя SMTP снимает проблему выравнивания целиком, но переносит на клинику отказы её сервера. Оба варианта
рабочие; важно, что fail-closed выбран для **обоих**, и вот это — вопрос.

**Р2. Telegram/MAX — `clinic_required` без fallback (`§1.5`, `TPB-12`).**
С практикой **совпадает** (§7.5: в мессенджерах промежуточной формы нет). Расхождение только кажущееся.
Единственное уточнение: `C5` уже требует не активировать branded domain, пока каналы не настроены — это и есть
правильная защита, потому что она переносит отказ **на момент активации**, а не на момент, когда пациент ждёт код.

**Р3. Развилка O4 (19.08): «отдельный шаг подтверждения владения не нужен».**
Расходится с §3.3 и §3.5 по двум независимым причинам: (а) HTTP-валидация создаёт окно недоступности, которого
TXT-pre-validation не создаёт; (б) без TXT со свежим случайным значением остаётся вектор «висячий DNS».
**Не оправдано** — но это и не «ошибка плана»: O4 была явно оставлена владельцу как открытая развилка. Здесь просто
появились два новых довода в пользу «нужен».

### 9.3. Чего в плане НЕТ, а у зрелых продуктов есть

Это главный результат исследования. Каждый пункт — **вход для владельца**, не решённая работа.

1. **Затирание входящих `x-*`-заголовков арендатора.** Vercel предупреждает об этом отдельной фразой. В нашем
   плане `B3` описывает установку контекста, но не его защиту от подделки на входе. Если резолвер будет передавать
   `organizationId` дальше по цепочке заголовком — это дыра ровно того класса, которую Vercel документирует.
   *(В `proxy.ts` сегодня заголовков арендатора нет — их и нет откуда взяться, пока нет резолвера. Это про будущий
   код, а не про находку в текущем.)*
2. **Требование сохранять оригинальный `Host` на edge.** Ни в плане, ни в `B7` («описать ручную DNS/TLS/proxy
   активацию») не сказано, что edge обязан **не** переписывать `Host`. Microsoft перечисляет три класса поломок,
   которые из этого следуют, и одна из них — молчаливая потеря сессии. У нас дополнительно от `Host` зависит CSRF.
3. **Правило HSTS для арендаторских доменов.** Vercel: на клиентских доменах HSTS **без** `includeSubDomains` и
   **без** `preload`. У нас об этом нигде ни слова; ошибка здесь необратима на стороне браузеров клиники.
4. **CAA-записи как причина отказа выпуска.** Не упомянуты нигде. Клиника с CAA просто не получит сертификат, а
   `ask`-эндпоинт скажет «разрешено» — диагноз будет невозможен.
5. **Висячий DNS / захват домена при отключении клиники.** Ни в плане, ни в предложении 19.08. Две защиты
   (удалить CNAME до снятия; TXT со свежим случайным значением на каждую попытку) — механические и дешёвые.
6. **Жизненный цикл «домен сломался позже».** План (`§1.2`) сознательно отказывается от «domain-state машины» —
   и для активации это правильно. Но у всех есть **минимум**: перепроверка, промежуточное состояние, срок снятия.
   Сейчас у нас `org_custom_domain_hostname` — строка, которая не умеет быть «сломанной».
7. **Мониторинг протухающего сертификата и уехавшего DNS.** `B7`/`TPB-14` описывают ручную активацию, но не
   наблюдение. Предложение 19.08 называло это этапом Э6 (0,5 дня) — в текущий план он не перенесён.
8. **Разделение репутации отправителя по арендаторам.** `store+123@`, `user=clinic.ru@` — не косметика: это защита
   платформенного домена от жалоб одного арендатора. У нас не обсуждалось.
9. **Клиника не подтвердила почтовый домен — что видит она сама.** У Intercom это видимый статус
   «Unauthenticated», у Zendesk — предупреждение агенту. У нас `C5` проверяет готовность только в момент
   активации; постоянного видимого статуса нет.
10. **Что показывать, если два статуса разошлись** (хост проверен, сертификат нет). Пациент видит ошибку TLS, а не
    нашу страницу — значит объяснять должен экран настроек клиники, и у него должно быть отдельное состояние.
11. **Что квота Let's Encrypt на поддомены платформы — общая.** Если мы когда-нибудь дадим клиникам поддомены
    вида `klinika.наш-домен.ru` вместо/вместе с их доменами, все они делят одно ведро «50 сертификатов в неделю»
    (§3.6). Наивная схема упрётся на пятидесятой новой клинике за неделю. В плане поддомены платформы не
    предусмотрены (`TPB-04`), так что сегодня это не риск — но если решение изменится, ограничение придёт вместе
    с ним.
12. **Правило «Cloudflare — только DNS, без проксирования» в инструкции клинике** (§3.8.8). Сегодня это знание
    живёт в документе 19.08 как вывод №7, но в план не перенесено.
13. **Что делать, если у клиники уже стоит `_acme-challenge` от прежнего хостера.** Vercel документирует это как
    отдельную причину, по которой выпуск не проходит ни у кого другого. Инструкция должна говорить «удалите
    старую запись», а не только «добавьте новую».

### 9.4. Что подтвердилось как наша сильная сторона

- **`TPB-06` («без BersonCare-specific code», доказательство — отсутствие branching)** сильнее, чем то, что
  описывает отрасль: у них это принцип, у нас — бинарный чекбокс приёмки.
- **`dispatchPort` с `clinic_required` и без тихого fallback уже построен** (`CURRENT_STATE_AND_GAP_REPORT.md` §6).
  Это ровно тот единый механизм, о котором пишет AWS, и он у нас есть до начала работы.
- **CSRF уже origin-agnostic** — второй домен не ломает его без единой правки (§2 отчёта о состоянии). Большинство
  проектов в этом месте как раз и ломается.
- **`APP_BASE_URL` в env, а не в БД, с миграцией `0273` как прецедентом** — готовая форма для `PATIENT_APP_BASE_URL`.

---

## 10. Развилки владельцу

Ничего из этого я не решал. По каждой — рекомендация и безопасный вариант по умолчанию.

| # | Развилка | Рекомендация | Безопасный вариант, пока ответа нет |
| --- | --- | --- | --- |
| **W1** | **Письмо пациенту, когда почта клиники не настроена или её SMTP отказал: не отправлять (текущий план) или отправить с платформенного адреса от имени клиники (`Клиника Х <no-reply@наш-домен>`, Reply-To клиники)?** Вся отрасль выбрала второе | Отправлять с платформенного адреса. Не полученное подтверждение записи вредит пациенту сильнее, чем наш домен в служебной строке письма. Бренд платформы при этом не подставной | Оставить fail-closed. Это строже; смягчить позже дешевле, чем откатывать разосланные письма |
| **W2** | **Нужен ли отдельный шаг «подтвердите владение доменом» (TXT со свежим случайным значением)?** Это переоткрытие O4 с двумя новыми доводами | Нужен. Он убирает окно недоступности при переключении DNS и закрывает захват домена через висячий CNAME. Цена — одна дополнительная запись в инструкции | Без него, как решено в O4 — но тогда явно записать, что окно недоступности при переключении есть, и что при отключении клиники мы требуем сначала удалить запись |
| **W3** | **Поддерживаем ли корень домена клиники (`klinika.ru`) или только поддомен (`zapis.klinika.ru`)?** Проверено: reg.ru, Timeweb и Beget **не дают ни CNAME на корне, ни ALIAS/ANAME** (§3.8.5) — значит корень означает A-запись и фиксированный IP edge навсегда | Только поддомен, как Zendesk и Intercom. Это не урезание, а осознанное решение двух зрелых продуктов; и оно единственное, которое не привязывает нас к IP на годы вперёд | Поддомен |
| **W4** | **Consent-экран Яндекса: важно ли, чтобы пациент клиники видел только её имя?** От этого зависит, нужна ли отдельная регистрация приложения на каждую клинику (дорого в эксплуатации) или хватит одного с общим callback | Если `OG-4` закрывается как «убираем Яндекс» — вопрос снимается целиком и это самый дешёвый исход. Если «оставляем» — отдельная регистрация на клинику, иначе требование не выполняется | Не строить, пока `OG-4` открыт (уже зафиксировано в `F5`) |
| **W5** | **Мониторинг доменов и сертификатов — входит в текущий объём или откладывается?** Сейчас его нет ни в одном этапе | Включить минимальный: ежедневная проверка `notAfter` + резолв DNS + сигнал оператору. Это тот же класс молчащего отказа, что уже подводил нас с email/SMS | Отложить, но записать явно как известный непокрытый риск, а не забыть |
| **W6** | **Что делает система, когда домен клиники уехал/протух: держим вечно или снимаем по таймеру?** У всех — таймер (7-15 дней) | Снимать по таймеру с уведомлением клинике, платформенный адрес продолжает работать всегда. Иначе накапливаются мёртвые привязки, каждая из которых — вектор захвата | Держать вручную и снимать руками, раз активация всё равно ручная |
| **W7** | **Разделяем ли репутацию почтового отправителя по клиникам** (локальная часть вида `klinika-17@наш-домен`)? | Да, если W1 закрывается как «отправлять с платформенного адреса». Иначе жалобы одной клиники бьют по всем | Один общий адрес — при ручной активации и малом числе клиник риск невелик |
| **W8** | **Остаётся ли на странице входа на домене клиники маленькая отметка «вход через Therapysto»?** `TPB-11` требует, чтобы branded root вёл к brand login; про отметку не сказано ничего. Podia единственный, кто объясняет, зачем она нужна: пациент должен понимать, куда вводит пароль (§5.0) | Оставить одну неброскую строку именно на экране входа и восстановления, и нигде больше. Это не «протечка бренда платформы», а анти-фишинговый маркер; и он не мешает решению 16.07 «полностью заменяет product-facing branding» — вход не витрина | Не добавлять ничего: сегодняшняя формулировка `TPB-11` этого не требует, а добавить строку позже дешевле, чем объяснять пациенту, почему она появилась |
| **W9** | **Ставим ли жёсткое правило «HSTS на доменах клиник — без `includeSubDomains` и без `preload`»** прямо сейчас, до первой активации? (§3.7) | Да, записать сейчас. Ошибка здесь необратима на стороне браузеров клиники — откатить нельзя ни нам, ни ей | Записать правило даже если активацию отложим: оно ничего не стоит и защищает от одного класса необратимых ошибок |

---

## 11. Источники

Все ссылки открывались в ходе этого прохода 2026-08-21/22. Дата в скобках — дата документа/обновления, если
источник её публикует.

**Определение поверхности и мультиарендность**

1. [Vercel — Multi-Tenant Platform Concepts](https://vercel.com/docs/platforms/multi-tenant-platforms/concepts) (last_updated 2026-07-29)
2. [Vercel — Vercel for Platforms](https://vercel.com/docs/platforms) (last_updated 2026-07-28)
3. [Microsoft Azure Architecture Center — Host Name Preservation](https://learn.microsoft.com/en-us/azure/architecture/best-practices/host-name-preservation) (ms.date 2026-02-26)
4. [Microsoft Azure Architecture Center — Domain Name Considerations in Multitenant Solutions](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/domain-names) (ms.date 2025-06-13)
5. [AWS — SaaS Tenant Isolation Strategies: The isolation mindset](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-isolation-mindset.html)
6. [Reapdat — Multi-tenant SaaS architecture lessons](https://www.reapdat.com/blog/multi-tenant-saas-architecture) — **вторичный**, дата не указана

**Домены, сертификаты, жизненный цикл**

7. [Cloudflare for SaaS — Configuration overview (fallback origin, CNAME target, статусы, методы валидации)](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/) (2026-06-19)
8. [Cloudflare for SaaS — Validation status](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/) (2026-05-07)
9. [Cloudflare for SaaS — Backoff schedule](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/backoff-schedule/) (2026-07-16)
10. [Cloudflare for SaaS — Pre-validation (TXT `_cf-custom-hostname`, HTTP-токен)](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/) (2026-06-20)
11. [Cloudflare for SaaS — Delegated DCV](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/delegated-dcv/) (2026-05-05)
12. [Cloudflare for SaaS — Apex proxying](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/) (2026-06-10)
13. [Cloudflare — Certificate Authorities (LE / Google Trust Services / SSL.com)](https://developers.cloudflare.com/ssl/reference/certificate-authorities/) (2026-04-16)
14. [Cloudflare for SaaS — Troubleshooting (состояние Moved при смене DNS клиента)](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/reference/troubleshooting/) (2026-06-19)
15. [Zendesk — Host mapping: Changing the URL of your help center](https://support.zendesk.com/hc/en-us/articles/4408838571930-Host-mapping-Changing-the-URL-of-your-help-center) (`updated_at` 2026-06-12)
16. [Zendesk — DNS errors with Zendesk provisioned SSL (снятие мэппинга при продлении)](https://support.zendesk.com/hc/en-us/articles/4408846660250) (2026-07-01)
17. [Heroku Dev Center — The Limitations of DNS A-Records](https://devcenter.heroku.com/articles/apex-domains)
18. [Heroku Dev Center — Custom Domain Names for Apps](https://devcenter.heroku.com/articles/custom-domains) (2026-06-07)
19. [Heroku Dev Center — Automated Certificate Management](https://devcenter.heroku.com/articles/automated-certificate-management) (2026-07-07)
20. [Vercel — Working with SSL (http-01 против dns-01, wildcard требует NS Vercel)](https://vercel.com/docs/domains/working-with-ssl) (last_updated 2026-06-08)
21. [Vercel — Adding and configuring a custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) (last_updated 2026-02-27)
22. [Vercel — Domains troubleshooting (RFC 1034 §3.6.2, отсутствие IPv6)](https://vercel.com/docs/domains/troubleshooting) (last_updated 2026-07-20)
23. [Netlify — Configure external DNS (ALIAS/ANAME на apex)](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/) (2025-10-28)
24. [Netlify — HTTPS/SSL (CAA-пиннинг ACME-аккаунта, лимиты алиасов)](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/) (2026-01-30)
25. [Shopify — Connect domain manually](https://help.shopify.com/en/manual/domains/add-a-domain/connecting-domains/connect-domain-manual)
26. [Webflow — Manually connect a custom domain (`_webflow` TXT)](https://help.webflow.com/hc/en-us/articles/33961239562387-Manually-connect-a-custom-domain) (`updated_at` 2025-09-17)
27. [Webflow — SSL certificates / CAA](https://help.webflow.com/hc/en-us/articles/33961362849811) (2025-08-18)
28. [Intercom — Troubleshooting custom domain set up and HTTPS/SSL](https://www.intercom.com/help/en/articles/7301427-troubleshooting-custom-domain-set-up-and-https-ssl)
29. [HubSpot — Connect a domain to HubSpot](https://knowledge.hubspot.com/domains-and-urls/connect-a-domain-to-hubspot) (2026-06-26)
30. [HubSpot — SSL and domain security](https://knowledge.hubspot.com/domains-and-urls/ssl-and-domain-security-in-hubspot) (2026-06-22)
31. [Let's Encrypt — Rate Limits](https://letsencrypt.org/docs/rate-limits/) (обновлено 2026-08-05)
32. [Let's Encrypt — Challenge Types](https://letsencrypt.org/docs/challenge-types/) (2026-02-12)
33. [Let's Encrypt — Integration Guide (один общий ACME-аккаунт для хостеров)](https://letsencrypt.org/docs/integration-guide/) (2025-06-23)
34. [Let's Encrypt — Rate limits and 45-day certs](https://letsencrypt.org/2026/02/24/rate-limits-45-day-certs) (2026-02-24)
35. [Let's Encrypt — 6-day and IP certificates GA](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability) (2026-01-15)
36. [Let's Encrypt — OCSP service has reached end of life](https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life) (2025-08-06)
37. [Vercel — Encryption and TLS (HSTS на кастомных доменах)](https://vercel.com/docs/cdn-security/encryption) (last_updated 2026-07-02)
38. [HSTS Preload List Submission](https://hstspreload.org/)

**Собственный edge (обновление к исследованию 26.07)**

39. [Caddy — Automatic HTTPS / On-Demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls)
40. [Caddy — Caddyfile global options `on_demand_tls`](https://caddyserver.com/docs/caddyfile/options#on-demand-tls)
41. [Caddy — исходник `modules/caddytls/ondemand.go` (депрекация `ask`, таймаут 10 с, только `?domain=`)](https://github.com/caddyserver/caddy/blob/master/modules/caddytls/ondemand.go)
42. [CertMagic — README и исходники (`DecisionFunc`, требование постоянного хранилища)](https://github.com/caddyserver/certmagic)
43. [lua-resty-auto-ssl — «This project is currently abandoned»](https://github.com/auto-ssl/lua-resty-auto-ssl)
44. [Traefik v3.7 — ACME certificate resolvers (нет on-demand, нет HA в OSS)](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/)

**Россия**

45. [Let's Encrypt — Updating the Subscriber Agreement to v1.8 («It does not change where or to whom Let's Encrypt issues certificates»)](https://community.letsencrypt.org/t/updating-the-let-s-encrypt-subscriber-agreement-to-v1-8/248355) (2026-06-22)
46. [Let's Encrypt — Repository (действующая редакция v1.8, в силе с 2026-07-06)](https://letsencrypt.org/repository/)
47. [Habr — новость о v1.7 с ответом Let's Encrypt](https://habr.com/ru/news/1045658/) (2026-06-09) — **вторичный**
48. [The Record — Russia blocks websites using Cloudflare (ECH)](https://therecord.media/russia-blocks-thousands-of-websites-that-use-cloudflare-service) (2024-11)
49. [Zona Media — Cloudflare throttling в России](https://en.zona.media/article/2025/06/19/cloudflare) (2025-06-19)
50. [ipinfo.io community — анализ данных об отзыве сертификатов GlobalSign для `.ru`](https://community.ipinfo.io/t/globalsign-is-revoking-ssl-certificates-for-russian-websites-here-is-what-the-data-shows/7381) (2026-06) — **вторичный, первичного заявления CA нет**
51. [Skillbox — сертификаты Минцифры и доверие браузеров](https://skillbox.ru/media/code/sertifikaty-mincifry/) — **вторичный**
52. [reg.ru — настройка ресурсных записей DNS](https://help.reg.ru/support/dns-servery-i-nastroyka-zony/nastroyka-resursnykh-zapisey-dns/nastroyka-resursnykh-zapisey-v-lichnom-kabinete)
53. [Timeweb Cloud — управление DNS-записями](https://timeweb.cloud/docs/domains/dns-records-management)
54. [Beget — как установить CNAME](http://wiki.beget.tech/ru/dns/how-to-set-cname.html)
55. [Yandex Cloud DNS — типы ресурсных записей (`ANAME`)](https://yandex.cloud/en/docs/dns/concepts/resource-record) (2026-08-21)
56. [Yandex Cloud Certificate Manager — проверка прав на домен](https://yandex.cloud/en/docs/certificate-manager/concepts/challenges)
57. [Yandex Cloud Certificate Manager — квоты и лимиты](https://yandex.cloud/en/docs/certificate-manager/concepts/limits) (2026-07-20)

**Брендирование и темы**

58. [Auth0 — Business-to-Business Branding (Organizations: logo, primary color, background color)](https://auth0.com/docs/get-started/architecture-scenarios/business-to-business/branding)
59. [MDN — Web app manifest `scope`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope) (обновлено 2025-06-23)
60. [Intercom Community — How can I get rid of the Intercom Branding?](https://community.intercom.com/customer-faq-28/how-can-i-get-rid-of-the-intercom-branding-2397) — официальное community-FAQ, не docs
61. [tawk.to — Purchasing the Remove Branding add-on](https://help.tawk.to/article/purchasing-the-remove-branding-and-white-label-add-on)
62. [WorkOS — AuthKit Branding (четыре цвета; санитизация кастомного CSS)](https://workos.com/docs/authkit/branding)
63. [WorkOS — Introducing custom CSS in AuthKit](https://workos.com/blog/authkit-custom-css) (2025-06-23)
64. [Stripe — Account object (`settings.branding`)](https://docs.stripe.com/api/accounts/object)
65. [Stripe — Elements Appearance API (белый список CSS-свойств)](https://docs.stripe.com/elements/appearance-api.md?api-integration=paymentintents)
66. [Stripe — Checkout appearance (семь полей, перечисление шрифтов)](https://docs.stripe.com/payments/checkout/customization/appearance.md?payment-ui=stripe-hosted)
67. [Salesforce — Metadata API `BrandingSet`](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_brandingset.htm)
68. [Salesforce — Standard Design Tokens for Communities (свойство бренда → токен)](https://developer.salesforce.com/docs/atlas.en-us.lightning.meta/lightning/tokens_standard_communities.htm)
69. [Shopify — `settings_schema.json`](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-schema-json)
70. [Shopify — Theme design best practices («keep theme settings to the minimum»)](https://shopify.dev/docs/storefronts/themes/best-practices/design)
71. [Zendesk — Customizing the Settings panel of the theme (типы настроек, лимит 200)](https://support.zendesk.com/hc/en-us/articles/4408846524954-Customizing-the-Settings-panel-of-the-theme)
72. [Zendesk — About the standard theme and custom themes (граница поддержки и автообновлений)](https://support.zendesk.com/hc/en-us/articles/4408821255834-About-the-standard-theme-and-custom-themes-in-your-help-center)
73. [Auth0 — Customize page templates («CSS class names change each time Auth0 builds»)](https://auth0.com/docs/customize/login-pages/universal-login/customize-templates)
74. [Chargebee — Checkout layout customization (header/footer не настраиваются)](https://www.chargebee.com/docs/billing/2.0/hosted-capabilities/checkout-layout-customization)
75. [Microsoft Azure Architecture Center — Deployment and configuration approaches (анти-паттерн пер-арендаторских правок; порог «около 10»)](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/deployment-configuration) (ms.date 2025-07-16, updated 2026-04-30)
76. [Intercom — Style your Messenger to support multiple brands (выбор бренда по домену)](https://www.intercom.com/help/en/articles/3946163-style-your-messenger-to-support-multiple-brands)
77. [Podia — Removing "Powered by Podia" (почему на экране входа остаётся)](https://help.podia.com/en/articles/11370438-removing-powered-by-podia-from-your-site-and-emails)
78. [Circle — Pricing (Business $199: «Remove Circle branding»)](https://circle.so/pricing)
79. [Better Stack — Create a status page API (`whitelabeled`, «This is a billable feature»)](https://betterstack.com/docs/uptime/api/create-a-new-status-page/)

**Вход и идентичность**

80. [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html) (январь 2025)
81. [passkeys.dev — Related Origin Requests (потолок 5 меток)](https://passkeys.dev/docs/advanced/related-origins/)
82. [web.dev — Allow passkey reuse across your sites with Related Origin Requests](https://web.dev/articles/webauthn-related-origin-requests)
83. [Google Cloud — Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049)
84. [MDN — `Set-Cookie` (host-only cookie)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) (обновлено 2026-08-15)
85. [Auth0 — Multi-brand identity simplified: Multiple Custom Domains («separate security context»)](https://auth0.com/blog/multi-brand-identity-simplified-auth0-multiple-custom-domains/) (2026-01-14)
86. [Okta — Update application configuration when adding a custom URL domain](https://support.okta.com/help/s/article/update-application-configuration-when-adding-custom-url-domain-to-okta-org) (2025-09-01)
87. [Auth0 — Custom domains («Passkeys are bound to your custom domain by the `rpId`»)](https://auth0.com/docs/customize/custom-domains)
88. [Auth0 — Wildcards for subdomains (запрет wildcard в redirect URI; захват поддомена)](https://auth0.com/docs/get-started/applications/wildcards-for-subdomains)
89. [web.dev — RP ID deep dive](https://web.dev/articles/webauthn-rp-id) (обновлено 2026-02-19)
90. [Duende — Deep dive into Relying Party ID and origin with passkeys](https://duendesoftware.com/blog/20251014-deep-dive-into-relying-party-id-and-origin-with-passkeys) (2025-10-14) — **вторичный**
91. [WebKit — Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) (2020-03-24)
92. [Google Privacy Sandbox — Next steps (отмена удаления third-party cookie)](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps) (2025-04-22)
93. [GitHub Changelog — Multiple redirect URIs and token refresh for OAuth Apps](https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps/) (2026-08-14)
94. [WorkOS — Custom domains for AuthKit (Cloudflare должен быть DNS-only)](https://workos.com/docs/custom-domains/authkit)

**Почта под брендом арендатора**

95. [RFC 7489 — DMARC, §3.1 Identifier Alignment](https://datatracker.ietf.org/doc/html/rfc7489#section-3.1) (март 2015)
96. [RFC 7208 — Sender Policy Framework (SPF) v1](https://www.rfc-editor.org/rfc/rfc7208.html) (апрель 2014)
97. [Google — Email sender guidelines](https://support.google.com/a/answer/81126) (требования с 2024-02-01)
98. [Google — Email sender guidelines FAQ](https://support.google.com/a/answer/14229414)
99. [Yahoo — Sender Best Practices](https://senders.yahooinc.com/best-practices/)
100. [dmarcian — Microsoft Enforces SPF, DKIM, DMARC](https://dmarcian.com/microsoft-enforces-spf-dkim-dmarc/) (2025-04-04) — **вторичный**, пересказ анонса Microsoft; сам анонс прочитать не удалось
101. [Shopify — Displaying your store's sending email (переписывание на `store+123@shopifyemail.com`)](https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/email-rewrites)
102. [HubSpot — Overview of email authentication](https://knowledge.hubspot.com/marketing-email/overview-of-email-authentication) (обновлено 2026-06-23)
103. [HubSpot — Understand email sending in HubSpot](https://knowledge.hubspot.com/marketing-email/understand-email-sending-in-hubspot) (обновлено 2026-07-24)
104. [Mailchimp — New sending domain authentication requirements](https://mailchimp.com/developer/release-notes/new-sending-domain-authentication-requirements/) (2023-12-19)
105. [Zendesk — Allowing Zendesk to send email on behalf of your email domain](https://support.zendesk.com/hc/en-us/articles/4408832543770-Allowing-Zendesk-to-send-email-on-behalf-of-your-email-domain)
106. [Zendesk — Digitally signing your email with DKIM](https://support.zendesk.com/hc/en-us/articles/4408822303386-Digitally-signing-your-email-with-DKIM)
107. [Intercom — Connect your email support channel](https://www.intercom.com/help/en/articles/9744849-connect-your-email-support-channel) (обновлено 2026-04-24)
108. [Intercom — Send outbound email from your own address](https://www.intercom.com/help/en/articles/182-send-outbound-email-from-your-own-address) (обновлено 2026-07-17)
109. [Postmark — Best practices for sending on behalf of your users](https://postmarkapp.com/guides/best-practices-for-sending-on-behalf-of-your-users) (обновлено 2023-03-27)
110. [Postmark — How do I send email on behalf of my customers?](https://postmarkapp.com/support/article/how-do-i-send-email-on-behalf-of-my-customers) (обновлено 2025-10-29)
111. [SendGrid/Twilio — Enforce authentication with a DMARC policy](https://www.twilio.com/docs/sendgrid/ui/sending-email/dmarc) (обновлено 2026-03-16)
112. [Amazon SES — Creating and verifying identities (Easy DKIM, custom MAIL FROM, Behavior on MX failure)](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
113. [Salesforce — Bulk Sender Guidelines for Marketing Cloud Engagement: Addendum](https://help.salesforce.com/s/articleView?id=000795011) (2026-05-28)

**Мессенджеры**

114. [Telegram — Marvin's Marvellous Guide to All Things Webhook](https://core.telegram.org/bots/webhooks)
115. [Twilio — WhatsApp Tech Provider program overview](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program)
116. [Twilio — Register WhatsApp senders (ISVs)](https://www.twilio.com/docs/whatsapp/isv/register-senders)
117. [360dialog — Integrated Onboarding](https://docs.360dialog.com/partner/onboarding/integrated-onboarding)

---

## 12. НЕ СДЕЛАНО и границы

**Где источники расходятся, и кому я верю**

- **Let's Encrypt и `.ru`.** Российские и прибалтийские техмедиа (июнь 2026) утверждают, что LE запретил
  `.ru`/`.su`. **Сам Let's Encrypt говорит обратное** и удалил спорную формулировку в v1.8. Верю первичному
  источнику — заявлению LE от 2026-06-22 и действующей редакции соглашения. **Не планировать по медиаверсии.**
- **Автооткат при поломке DNS клиента** документируют ровно двое (Cloudflare, Zendesk), семь остальных — нет.
  Это **не устоявшаяся конвенция**, а пробел в отрасли. Значит §10 `W6` — реальная развилка, а не выбор из
  готовых образцов.

**Чего найти не удалось**

- **Первичный, датированный инженерный разбор перехода «ручное подключение → самообслуживание»** с ценой
  каждого варианта. Порог «около 10 арендаторов» взят у Microsoft и относится к деплою, не к доменам —
  я переношу его по аналогии и помечаю это как перенос.
- **Первичный источник про нагрузку на поддержку от «домен ведёт старый подрядчик клиники»** — проблема
  общеизвестна, цифр никто не публикует.
- **Первичное заявление GlobalSign об отзыве сертификатов российских компаний** (§3.8.3) — есть только анализ
  данных Certificate Transparency и российские СМИ.
- **Условия программы сертификатов Минцифры/НУЦ** (§3.8.4) — `gosuslugi.ru` геоблокирует; срок действия,
  поддержка wildcard и точные критерии остаются непроверенными.
- **Поддержка типов записей у cloud.ru и nic.ru** (§3.8.5) — страницы не открылись.
- **Блокирует ли РКН исходящие обращения к ACME-серверам Let's Encrypt** с российского хостинга (§3.8.1) —
  первичных свидетельств нет; наше живое доказательство (работающие автопродления) сильнее форумных анекдотов.
- **Фраза «под каждый бренд нужен отдельный Google Cloud проект»** — была во вторичном пересказе, на самой
  странице Google я её не нашёл (§6.3).
- **Точный текст SMTP-ошибки Microsoft** (§7.2) — первоисточник не отрендерился, приведён вторичный пересказ
  с оговоркой.
- **Транспорт токенов брендирования** — ни один вендор не документирует, как именно значения доезжают до
  браузера (§4.1). Все документируют контракт, никто — механизм.
- **Первичный инженерный разбор ухода от пер-арендаторских форков от названной продуктовой команды** (§4.3).
- **Специфика Recurly** — не исследовалась вовсе; не считать её «неограниченной» по умолчанию.
- **Кастомный домен для Messenger у Intercom** — в документации найдены только Help Center, News Center и
  почтовые ассеты. Возможно, такого продукта просто нет.
- **Прод, TEST и БД не трогались.** Ни одной команды, меняющей состояние. Плана, кода и других документов не
  правил — изменён только этот файл.
- **Ничего из §9.3 и §10 не является решённой работой.** Это входы для владельца; заводить из них скоуп
  самостоятельно запрещено режимом ведения плана.
