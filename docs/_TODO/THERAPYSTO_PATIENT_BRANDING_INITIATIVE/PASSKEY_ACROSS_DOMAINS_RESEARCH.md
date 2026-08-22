# Passkey и несколько доменов — исследование (22.08.2026)

Повод: вопрос владельца 22.08.2026 — «мы решили, что мы не делаем passkey, потому что там какая-то херня
с доменами… если у нас passkey будет для Therapysto и персонал клиники захочет подключить passkey как второй
фактор авторизации, то почему нет? Я просто не знаю, как сделать, чтобы passkey было там и там, чтобы пациенты
могли заходить через passkey.»

Это исследование, не работа по коду. Код авторизации не менялся.

---

## 1. Как это вообще работает — простыми словами

Passkey — это не пароль, а пара ключей: секретный лежит в телефоне/ноутбуке (или в iCloud/Google-аккаунте),
а открытый — у нас в базе. Когда вы входите, браузер просит палец/лицо и подписывает нашим ключом наш вопрос.

Главное, что надо понять про домены: **браузер сам, без нашего участия, привязывает ключ к имени сайта.**
При создании ключа записывается одна строка — «имя владельца ключа», по-английски RP ID. У нас сегодня это
просто хост сайта, например `therapysto.ru`. Дальше браузер выдаёт этот ключ **только** страницам, чей адрес
подходит под эту строку. Это и есть защита от фишинга: поддельный сайт `therapysto-login.ru` ключ не получит
никогда, даже если пользователь очень хочет.

Отсюда два следствия, и оба — не наши правила, а правила браузеров:

- **Поддомены — бесплатно и без ограничений.** Если ключ создан для `therapygo.ru`, он работает и на
  `clinic1.therapygo.ru`, и на `clinic2.therapygo.ru`, и на тысяче других поддоменов. Ничего настраивать
  не надо, лимита на количество поддоменов нет.
- **Разные домены — почти невозможно.** `therapysto.ru` и `therapygo.ru` — это два разных имени. Ключ от
  одного на другом не работает. Есть свежий механизм (Related Origin Requests), который позволяет склеить
  несколько доменов, но у него жёсткий потолок — **пять имён на всю систему**, и это специально сделано,
  чтобы никто не выдал один ключ на тысячу клиентских доменов.

И третье, что важно знать заранее: **строку RP ID нельзя поменять потом.** Поменяли — все выданные ключи
одномоментно перестали работать, у всех, молча. Поэтому решение про домены принимается один раз, до того как
у людей появятся ключи.

Вывод в одну фразу: наши поддомены (`admin.therapysto.ru`, `<клиника>.therapygo.ru`) — не проблема вообще;
проблема — только собственные домены клиник (`app.clinic.ru`) и стык двух наших брендов.

---

## 2. Что у нас в коде сегодня

- `apps/webapp/src/modules/auth/passkeyAuth.ts:21-35` — `getPasskeyRpConfig()`:
  `rpId: appUrl.hostname`, `expectedOrigin: appUrl.origin`, где `appUrl = new URL(env.APP_BASE_URL)`.
  То есть **RP ID берётся из одной переменной окружения `APP_BASE_URL`** (`apps/webapp/src/config/env.ts:31`),
  а не из хоста запроса. Один инстанс = один RP ID для всех.
- Там же требование HTTPS (кроме localhost/127.0.0.1) — `passkeyAuth.ts:23-29`.
- `rpName: 'BersonCare'` (`passkeyAuth.ts:31`) — это только подпись в диалоге; менять её безопасно, ключи
  от этого не ломаются (ломает только смена `rpId`).
- RP ID и origin **запоминаются вместе с челленджем** и проверяются при верификации:
  `passkeyAuth.ts:74-76, 96-97, 131, 156` и `apps/webapp/src/infra/repos/pgPasskeyStore.ts:90-126`
  (колонка `rp_id`). Больше ничто не привязывает креденшл к хосту — ни клиника, ни арендатор.
  То есть **сегодня привязка к хосту ровно одна и она глобальная**.
- Требования к ключу: `residentKey: 'required'`, `userVerification: 'required'`
  (`passkeyAuth.ts:58-62`) — то есть это полноценный passkey с проверкой пользователя, а не «второй фактор
  для галочки».
- Passkey у нас — **первичный вход, а не второй фактор**, и он уже включён для обеих аудиторий:
  - пациенты: `apps/webapp/src/app/app/patient/profile/PasskeySection.tsx`,
    `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx`;
  - персонал: `apps/webapp/src/app/app/account/StaffPasskeySection.tsx`;
  - вход: `apps/webapp/src/app/api/auth/passkey/login/verify/route.ts` — успешная проверка сразу вызывает
    `setSessionFromUser(...)`, то есть создаёт сессию.
  - `apps/webapp/src/modules/auth/passwordEligibility.ts:3-9` (решение владельца 04.08): «patients never have
    a password — login stays code/OAuth/messenger/passkey only». Для пациента passkey — единственный
    «мгновенный» вход без кода.
- Второй фактор сегодня — TOTP: `apps/webapp/src/modules/staff-security/totp.ts`. Издатель зашит строкой
  `const issuer = 'BersonCare'` (`totp.ts:52-56`), плюс 10 recovery-кодов (`totp.ts:59-65`).
  Важно: **TOTP к домену не привязан вообще** — секрет и издатель это просто текст, поэтому TOTP переживает
  любые переезды доменов, в отличие от passkey.

Не проверено в этой сессии: сколько реальных креденшлов лежит в базе TEST/PROD. Утверждать «ключей ни у кого
нет» я не могу — это надо подтвердить одним запросом `count(*)` по таблице креденшлов через порт-агента.

---

## 3. Правила привязки к домену и поддоменам — с цитатами спецификации

W3C WebAuthn Level 2, §5.1.3 / определение RP ID
(https://www.w3.org/TR/webauthn-2/#rp-id):

> «A public key credential can only be used for authentication with the same entity (as identified by RP ID)
> it was registered with.»

> «By default, the RP ID for a WebAuthn operation is set to the caller's origin's effective domain. This
> default MAY be overridden by the caller, as long as the caller-specified RP ID value is a registrable domain
> suffix of or is equal to the caller's origin's effective domain.»

> «For example, given a Relying Party whose origin is `https://login.example.com:1337`, then the following
> RP IDs are valid: `login.example.com` (default) and `example.com`, but not `m.login.example.com` and not
> `com`.»

Что это значит для наших хостов:

| Хост | Можно ли объявить RP ID = `therapysto.ru` | Можно ли объявить RP ID = `therapygo.ru` |
|---|---|---|
| `therapysto.ru` | да (это он сам) | нет |
| `admin.therapysto.ru` | **да** — родительский домен разрешён | нет |
| `therapygo.ru` | нет | да |
| `<clinic>.therapygo.ru` | нет | **да** — родительский домен разрешён |
| `app.clinic.ru` | нет | нет |

Ключевые ответы на вопросы владельца:

1. **`admin.therapysto.ru`** — да, один и тот же ключ работает и на `therapysto.ru`, и на админке, если при
   регистрации указать RP ID = `therapysto.ru`. Ничего дополнительно настраивать не нужно.
2. **`<clinic>.therapygo.ru`** — то же самое и это самое важное: если RP ID = `therapygo.ru`, ключ работает
   на **любом** количестве поддоменов клиник. Лимита нет. Подтверждение (Corbado, разбор ROR,
   https://www.corbado.com/blog/webauthn-related-origins-cross-domain-passkeys):
   > «Subdomains of the primary rpID don't require separate ROR configuration… Subdomains inherit the parent
   > domain's passkey automatically — ROR addresses cross-registrable-domain scenarios instead.»
3. **Обратно нельзя.** Сайт `therapysto.ru` не может выдать ключ, привязанный к `admin.therapysto.ru`
   («not m.login.example.com» в примере спецификации) — сужать нельзя, только расширять вверх до
   регистрируемого домена.
4. **`app.clinic.ru`** — вне этой механики полностью. Это чужой регистрируемый домен, ни один наш RP ID
   его не покрывает.

---

## 4. Related Origin Requests — лимит, поддержка, годится ли нам

Это единственный штатный механизм «один ключ на несколько разных доменов». Появился в WebAuthn Level 3.

**Как объявляется.** На домене RP ID выкладывается JSON по адресу `/.well-known/webauthn`
(без расширения `.json`, `Content-Type: application/json`), внутри массив `origins`
(passkeys.dev, https://passkeys.dev/docs/advanced/related-origins/):

```json
{ "origins": ["https://shopping.co.uk", "https://shopping.ca"] }
```

**Лимит.** passkeys.dev:

> «WebAuthn requires client implementations to support at least 5 unique labels… there are no known clients
> which support more than 5, so that should be treated as the maximum for deployments.»

web.dev (https://web.dev/articles/webauthn-related-origin-requests):

> «Each element of this list will be processed to extract the eTLD + 1 label… In Chrome, the maximum number
> of labels is 5.»

Считаются не origin'ы, а **уникальные «метки»** — регистрируемая часть имени. `amazon.com`, `amazon.de`,
`amazon.co.uk` — это одна метка `amazon`, поэтому Amazon умещает 50+ origin'ов в лимит. У нас
`therapysto` и `therapygo` — это **две разные метки**, значит остаётся запас всего на **три** метки, то есть
на три собственных домена клиник за всю жизнь продукта.

Corbado прямо называет причину лимита:

> «This limit is a deliberate anti-abuse mechanism designed to prevent misuse. It stops entities like shared
> hosting providers (e.g., wordpress.com) from creating a universal passkey that could work across thousands
> of unrelated customer subdomains.»

и вывод:

> «ROR does not scale to arbitrary customer custom domains… For true multi-tenant scenarios, OIDC/SAML
> federation is the appropriate architectural choice.»

**Поддержка браузерами (проверено 22.08.2026 по таблице passkeys.dev/device-support/):**

| Платформа | Поддержка ROR |
|---|---|
| Windows / Ubuntu / macOS | Chrome 128+, Edge 128+, Firefox 152+ |
| macOS | Safari (macOS 15+) |
| iOS / iPadOS | v18+ |
| Android | Chrome 128+, Edge 128+, Firefox 152+ |
| ChromeOS | 128+ |

Chrome/Edge — с августа 2024, Safari — с сентября 2024 (iOS 18 / macOS 15), Firefox — с версии 152
(май 2026, баг Mozilla 2010193 «RESOLVED FIXED», target milestone «152 Branch»,
https://bugzilla.mozilla.org/show_bug.cgi?id=2010193). То есть поддержка сегодня уже широкая, но старые
телефоны на iOS 17 и встроенные webview в мессенджерах её не имеют. Определять наличие поддержки в рантайме
можно через `PublicKeyCredential.getClientCapabilities()` → `relatedOrigins` (passkeys.dev).

Статус стандарта: WebAuthn Level 3 — Candidate Recommendation Snapshot от 26.05.2026, предложение перевести
в Recommendation от 20.07.2026, на момент публикации разбора ещё в AC review
(https://securityboulevard.com/2026/08/webauthn-level-3-whats-new-in-the-passkey-standard/).

**Годится ли нам:** для склейки `therapysto.ru` + `therapygo.ru` — да, ровно под это ROR и сделан.
Для собственных доменов клиник — нет: три штуки и всё, а дальше отказ, который придётся объяснять клиенту.

---

## 5. Как делают другие в мультиарендной схеме

Ближайший к нам по форме случай — Auth0 с несколькими кастомными доменами
(https://auth0.com/docs/customize/custom-domains/multiple-custom-domains/passkeys). Дословно:

> «A passkey enrolled on `login.brand1.com` cannot be used on `login.brand2.com`.»

> «Where passkeys can be used: Passkeys are bound to the domain where they were created.»

> «Related origins not yet supported. Planned for future release — use per-domain enrollment for now.»

и список ограничений: «No cross-domain passkey sharing», «Cannot transfer passkeys between domains»,
пользователи «must enroll passkeys separately for each custom domain».

То есть даже у крупного вендора идентичности ответ сегодня — **либо один центральный домен авторизации для
всех, либо отдельная регистрация ключа на каждом домене**. Третьего нет.

Что стоит центральный домен по UX: пациент клиники, нажав «Войти» на `app.clinic.ru`, уезжает на наш
`therapygo.ru` (виден чужой адрес в строке браузера), логинится и возвращается. Это ровно то, как работает
«Войти через …» у всех. Брендирование при этом ломается ровно на один экран — но именно на экран входа,
который клиника и хочет видеть своим.

Отдельная регистрация на каждом домене стоит другого: пациент, зашедший вчера с `therapygo.ru`, а сегодня с
`app.clinic.ru`, увидит «passkey не найден» и должен будет войти кодом и завести второй ключ. Для нашей
аудитории это плохой момент.

Оговорка о доверии к источникам: сравнительные обзоры вендоров (ssojet, mojoauth) я использовал только как
навигацию, цитировал первичные доки.

---

## 6. Passkey как второй фактор

Да, это нормальный и распространённый паттерн — но обычно он выглядит иначе, чем ожидается.

Как это устроено в жизни (GitHub Docs, https://docs.github.com/en/authentication/authenticating-with-a-passkey/about-passkeys
и раздел 2FA): passkey с проверкой пользователя (биометрия/PIN) **сам по себе считается двумя факторами** —
«что-то, что у вас есть» (устройство) плюс «что-то, что вы есть/знаете» (палец или PIN). Поэтому у GitHub
passkey не добавляется к паролю, а **заменяет** пароль и второй фактор целиком, одним действием. Отдельно
существуют security key как чисто второй фактор — их надо применять вместе с паролем, и это другой режим.

У нас в коде уже стоит `userVerification: 'required'` (`passkeyAuth.ts:61`), то есть наши ключи — как раз
«двухфакторные в одном шаге».

Практический вывод для вопроса владельца «персонал захочет passkey как второй фактор»: технически это
делается тривиально (тот же ceremony, просто вызывается после проверки пароля, а не вместо неё), и это
безопаснее TOTP — TOTP-код можно выманить фишингом, passkey нельзя, потому что браузер не отдаст его чужому
домену. Но это **не** то, что даёт максимум пользы: сильнее и проще — дать персоналу passkey как первичный
вход (что уже реализовано), а пароль/TOTP оставить запасным путём. Комбинация «пароль + passkey» защищает от
фишинга не лучше, чем «passkey один», зато требует двух действий.

Здесь есть развилка для владельца, а не инженерное решение: хотим ли мы, чтобы у сотрудника клиники passkey
был *обязательным* вторым фактором (тогда потеря телефона = потеря доступа до восстановления), или
*альтернативным* быстрым входом.

---

## 7. Пациенты и восстановление доступа

Реалистично ли это для реабилитационных пациентов (часто пожилых, иногда с общим на семью устройством)?
Ответ: как **дополнительная** возможность — да; как единственный вход — нет.

Что говорит исследовательская литература:

- Обзор литературы по внедрению passkey (MDPI, Applied Sciences 15(8):4414, https://www.mdpi.com/2076-3417/15/8/4414):
  основные препятствия — «misaligned user perception and technical issues regarding account recovery,
  sharing, and delegation». То есть именно восстановление, шаринг и «войти за родственника» — слабые места,
  а не сама криптография.
- Восстановление — самое уязвимое звено: потеряли все устройства, где был ключ, — падаете в резервный путь
  (код на почту/SMS), а этот путь фишится как раньше. Атакующие уже сместились на восстановление.
- Пожилые пользователи с когнитивными сложностями: тревога ошибиться приводит к избеганию технологии, плюс
  сопротивление обновлениям ОС (обзор, PMC12759956).
- Общее устройство — отдельная проблема: passkey привязан к учётке телефона/облака, а не к человеку.
  Если планшет один на семью и там один Google-аккаунт, «ключ мамы» и «ключ дочери» лежат вместе, и разделить
  их пользовательскими средствами трудно.

Практически это значит: у нас уже правильная конструкция — пациент всё равно может войти кодом
(`passwordEligibility.ts`: код/OAuth/мессенджер/passkey), а passkey просто убирает ожидание кода для тех,
у кого он настроился. Ломать этот резервный путь нельзя ни при каких условиях.

---

## 8. Варианты для владельца

### Вариант A. Один центральный домен входа для всех
Вход всегда происходит на одном нашем хосте (например `id.therapysto.ru`), оттуда возврат на нужный сайт.
RP ID один и навсегда.

- **Что видит человек:** нажал «Войти» на `app.clinic.ru` или на `clinic.therapygo.ru` — на секунду
  переехал на наш адрес, вошёл пальцем, вернулся. Один ключ работает везде, включая будущие домены клиник.
- **Что стоит нам:** самая большая работа — надо построить обмен сессией между доменами (это, по сути,
  собственный SSO), и это уже не «поправить одну строчку». Плюс на экране входа виден наш адрес.
- **Что закрывает:** полностью белый бренд клиники на экране входа.

### Вариант B. Passkey только на наших хостах (`therapysto.ru` + `therapygo.ru` и их поддомены)
RP ID = `therapysto.ru` для персонала и админки; RP ID = `therapygo.ru` для пациентов. Дополнительно можно
склеить их через ROR (2 метки из 5), если понадобится один ключ на оба бренда.

- **Что видит человек:** персонал — один ключ на `therapysto.ru` и `admin.therapysto.ru`. Пациент на
  `<клиника>.therapygo.ru` — один ключ, работает на всех клиниках. На `app.clinic.ru` кнопки passkey просто
  нет, там вход кодом/мессенджером как сейчас.
- **Что стоит нам:** почти ничего сверх того, что уже есть — сегодня RP ID берётся из одной переменной
  `APP_BASE_URL`, надо научиться выбирать его по хосту запроса. Плюс решение «какой RP ID у каждого бренда»
  принимается один раз и навсегда.
- **Что закрывает:** пациенты на собственном домене клиники passkey не получат, пока мы не сделаем A.

### Вариант C. Passkey как необязательный второй фактор только для персонала
Пациенты — без passkey вообще, у персонала passkey добавляется к паролю (или заменяет TOTP).

- **Что видит человек:** сотрудник клиники включает в настройках «вход по отпечатку» и больше не вводит
  TOTP-код. Пациенты не видят изменений.
- **Что стоит нам:** меньше всего работы, но и меньше всего выгоды: у пациентов остаётся ожидание кода,
  а это как раз то место, где входы теряются.
- **Что закрывает:** ничего не закрывает навсегда — из C можно доехать до B, если RP ID выбран правильно
  с самого начала.

### Вариант D. Passkey не делаем / выключаем
- **Что видит человек:** вход только кодом, OAuth и мессенджерами.
- **Что стоит нам:** формально ноль, фактически — код passkey уже написан и работает, выключение его
  обесценивает; плюс каждый вход пациента остаётся с ожиданием кода.
- **Что закрывает:** возвращаться придётся с нуля, и если у кого-то ключи уже есть — они пропадут.

---

### Что поддерживает доказательная база

**Вариант B** — он единственный, который даёт реальную пользу без крупной стройки, и его ограничение
(«на чужом домене клиники passkey нет») совпадает с тем, что делают вендоры: Auth0 прямым текстом говорит
«passkeys are bound to the domain where they were created» и предлагает пер-доменную регистрацию как
текущий ответ. Наш главный сценарий — `<клиника>.therapygo.ru` — покрывается **бесплатно**, потому что
поддомены наследуют ключ родительского домена без всякого ROR и без лимита на количество.

**Чтобы победил вариант A**, должно быть верно одно из двух: (1) собственных доменов клиник ожидается не
«горстка», а много, и вход на них должен быть таким же быстрым, как на наших; или (2) мы решаем, что
единая учётка «один ключ на всю платформу, включая будущие бренды» — продуктовое требование, а не удобство.
ROR тут не спасает: три метки на клиентские домены — потолок, и он архитектурный, а не наш.

**Чтобы победил вариант C**, должно быть верно, что пациентам passkey реально не заходит — это проверяется
цифрой, а не спором: сколько пациентов на TEST/PROD довели регистрацию ключа до конца.

**Решение, которое надо принять раньше всех остальных:** какая строка становится RP ID для каждого бренда.
Её нельзя поменять потом, не обнулив все выданные ключи. Пока ключей мало — цена ошибки нулевая; после
запуска — это инцидент.

---

## 9. Что проверить не удалось

1. **Сколько реальных passkey-креденшлов существует на TEST и на PROD.** Не смотрел в базу (это исследование,
   без привилегированных команд). Утверждение «ключи только у владельца» — не подтверждено. Проверяется одним
   `count(*)` по таблице креденшлов через порт-агента, отдельно по TEST и PROD.
2. **Точный текст §5.11 (Related Origin Requests) в самой спецификации W3C.** Страница `webauthn-3` отдалась
   усечённой, цитата «5 labels» взята из passkeys.dev и web.dev, а не из первоисточника. Смысл везде
   совпадает, но формальная цитата спецификации не получена.
3. **Реальное поведение Firefox 152 на живом стенде.** Есть закрытый баг Mozilla и таблица passkeys.dev;
   живой проверки ROR в Firefox я не делал.
4. **Позиция Google/Microsoft по «passkey как второй фактор к паролю»** — прямых цитат их документации не
   набрал, использована документация GitHub (наиболее явная формулировка) и общая логика user verification.
5. **Свежая (2026) статистика конверсии passkey у пожилых пользователей** в медицинском контексте —
   нашёл только общую литературу по usability, отраслевых цифр по реабилитации нет.

---

## Источники

- W3C WebAuthn Level 2, RP ID — https://www.w3.org/TR/webauthn-2/#rp-id
- passkeys.dev, Related Origin Requests — https://passkeys.dev/docs/advanced/related-origins/
- passkeys.dev, Device Support — https://passkeys.dev/device-support/
- web.dev, Allow passkey reuse across your sites with Related Origin Requests — https://web.dev/articles/webauthn-related-origin-requests
- Corbado, WebAuthn Related Origins — https://www.corbado.com/blog/webauthn-related-origins-cross-domain-passkeys
- Mozilla Bug 2010193, Implement WebAuthn Related Origins — https://bugzilla.mozilla.org/show_bug.cgi?id=2010193
- Auth0 Docs, Passkeys with Multiple Custom Domains — https://auth0.com/docs/customize/custom-domains/multiple-custom-domains/passkeys
- GitHub Docs, About passkeys — https://docs.github.com/en/authentication/authenticating-with-a-passkey/about-passkeys
- Security Boulevard, WebAuthn Level 3: What's New — https://securityboulevard.com/2026/08/webauthn-level-3-whats-new-in-the-passkey-standard/
- MDPI Applied Sciences 15(8):4414, Challenges and Potential Improvements for Passkey Adoption — https://www.mdpi.com/2076-3417/15/8/4414
- PMC, Navigating Digital Security and Usability Challenges for Older Adults With Cognitive Concerns — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12759956/
