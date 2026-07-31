# Вход любым привязанным контактом: как делают взрослые системы и где наша схема ломается

**Кто спрашивает и о чём.** Владелец 31.07: «знаю что так обычно не делают — то есть нет такого что человек
может зайти под любым из привязанных своих контактов. Насколько это может быть плохо или наоборот хорошо для
нас — вот в чём вопрос». Метод он задал там же: «НАЙТИ КАК ПРАВИЛЬНО — то есть как делается во взрослых
системах».

**Предмет разбора:** `IDENTITY_AND_MERGE_SCHEME.md`.
**Источник истины:** `OWNER_QUOTE_2026-07-31_IDENTITY.md`.
**Вход (не пересказывается):** `IDENTITY_SCHEME_AUDIT.md` — 8 расхождений и 11 дыр; `D15A_IDENTITY_RESEARCH.md`
— перепись того, что код делает СЕГОДНЯ.

**Это исследование, а не проект и не решение.** Варианты в §3 даны как «что даёт / чем платим». Выбор за
владельцем. Правок в `apps/` нет.

---

## Короткий ответ на вопрос владельца

Его исходная посылка неверна в одну сторону и верна в другую, и это разные места схемы.

**Неверно: «так обычно не делают».** Ровно так делают Google, Apple и Microsoft — вход по любому из
подтверждённых адресов/номеров аккаунта, один пароль на все. Это мейнстрим, а не экзотика (§1.1).

**Верно: наша схема расходится с практикой — но не в §2.** Расхождение в двух других местах:

1. **«Контакт из мессенджера/OAuth подтверждён априори»** — именно это допущение является документированной
   корневой причиной класса уязвимостей `nOAuth` (полный захват аккаунта) и класса «pre-hijacking» (§1.2).
   Взрослые системы делают наоборот: контакт, пришедший от чужого провайдера, не считается доказанным, пока
   его не подтвердили сами.
2. **Автоматическое слияние аккаунтов.** Google и GitHub слияние просто не делают. Те, кто делает
   (Auth0, Firebase), требуют доказать контроль над ОБОИМИ аккаунтами — что владелец, в отличие от многих,
   уже потребовал сам (§1.2). Здесь схема ближе к практике, чем кажется.

**Что меняет медицина.** Не вывод про §2, а цену ошибки в §5. В медицине неверное слияние — не тикет в
поддержку, а «overlay»: смешение записей двух людей, отдельно названный класс инцидентов безопасности
пациента (§1.5). Наш блокер по активной медистории и правило «медисторию не переносим» бьют ровно туда — но
защищают только от слияния, а не от входа (§2.3).

---

## 1. Как делают взрослые системы

### 1.1. Что считается идентификатором входа, что — каналом доставки, что — фактором

**Google: любой подтверждённый альтернативный адрес — полноценный идентификатор входа.** Документация прямо
говорит: «You can link a non-Gmail email address to the account and use it to sign in, recover your password,
get notifications, and more», причём «You need to use your Google Account password to sign in with it» — один
пароль на все адреса. Ограничения ровно три: адрес подтверждается по ссылке из письма ДО того, как им можно
войти; это не может быть Gmail-адрес; и «You can't use an email address that's already linked to another
Google Account».
Источник: [Use another email to sign in to your Google Account](https://support.google.com/accounts/answer/176347?hl=en&co=GENIE.Platform%3DDesktop).

**Чем платят:** уникальность контакта на весь Google обеспечивается запретом «адрес уже привязан к другому
аккаунту» — то есть коллизию Google не разрешает слиянием, а запрещает на входе.

**Microsoft: вход любым алиасом, НО есть отдельный переключатель «этим алиасом входить нельзя».** Алиас —
это email или номер телефона к тому же аккаунту; «You can sign in to your account with any alias, and you only
have to remember a single password for all of them». Ключевое для нас: на странице «Manage how you sign in to
Microsoft» есть раздел **Sign-in preferences**, где каждый алиас можно снять с права входа — он продолжает
принимать почту, но войти им нельзя; снять права с основного алиаса нельзя, пока он основной. Отдельно
Microsoft сужает доставку: «Verification codes sent by email can only be sent to your primary alias or another
email you added as a way to verify sign in».
Источник: [Change the email address or phone number for your Microsoft account](https://support.microsoft.com/en-us/help/12407/microsoft-account-how-to-manage-aliases).

**Это и есть готовый ответ на развилку «контакт для входа vs контакт для доставки»:** зрелая система держит
оба множества, они не совпадают, и пользователь управляет разницей сам.

**Apple: подписаться можно основным и любым дополнительным адресом, а также номерами телефонов из аккаунта.**
Дополнительные адреса в разделе «Reachable At» имеют двойное назначение — по ним человека находят в FaceTime/
iMessage/Find My, и ими же можно войти.
Источник: [About your Apple Account email addresses](https://support.apple.com/en-us/102529).
⚠️ Тело этой страницы машинно не вычиталось; утверждение опирается на выдержки из неё в поисковой выдаче —
см. §4.

**GitHub: обратный пример — много подтверждённых адресов, но доставка сужена до двух.** У аккаунта может быть
сколько угодно verified emails, однако «GitHub only sends verification codes to the primary and backup email
addresses» и «Only primary and backup email addresses can be used to request a new password».
Источники: [Verifying new devices when signing in](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/verifying-new-devices-when-signing-in),
[Setting a backup email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-a-backup-email-address).

**Чем платят:** потерял доступ к обоим — восстановление недоступно, остальные verified-адреса не помогут.
Это осознанный обмен удобства на сокращение числа дверей.

**Госуслуги (ЕСИА): вход по номеру телефона, email, СНИЛС, ЭП или QR** — то есть множественные идентификаторы
входа приняты и в российской государственной системе с чувствительными данными.
⚠️ Официальная страница [gosuslugi.ru/help/faq/login/1](https://www.gosuslugi.ru/help/faq/login/1) при
обращении отдаёт «доступ ограничен по соображениям безопасности»; утверждение опирается на вторичные
источники ([РИА](https://ria.ru/20250515/gosuslugi-2017196346.html),
[МТС](https://media.mts.ru/technologies/202379-kak-voiti-v-lichnyi-kabinet-na-gosuslugah)) — см. §4.

**Спецификация говорит противоположное про идентичность (и это не противоречие).** OpenID Connect Core §5.7
«Claim Stability and Uniqueness»: «other Claims such as `email`, `phone_number`, and `preferred_username`
**MUST NOT** be used as unique identifiers for the End-User», потому что «An Issuer MAY re-use an email Claim
Value across different End-Users at different points in time». Уникален только `iss` + `sub`.
Источник: [OpenID Connect Core 1.0, §5.7](https://openid.net/specs/openid-connect-core-1_0.html).

**Как это сочетается с Google/Apple/Microsoft:** контакт можно использовать как **логин** (строку, которую
человек вводит), но нельзя использовать как **первичный ключ личности** внутри системы. Google/Apple/Microsoft
делают именно так: внутри — стабильный account id, снаружи — сколько угодно контактов, указывающих на него.
Наша схема это же и подразумевает, но нигде не проговаривает; для кода различие принципиальное.

### 1.2. Слияние аккаунтов: что требуют подтвердить и что переносят

**Google и GitHub: слияния нет вообще.** Google Workspace прямо документирует, что перенос доменов «does not
support merging user accounts or account deduplication»
([Google Workspace admin knowledge base](https://knowledge.workspace.google.com/admin/domains/merge-domains-from-separate-accounts?hl=en)).
GitHub называет «merging» ручной перенос: репозитории (с issues/PR/wiki) переносятся, а права доступа,
атрибуция коммитов через noreply-адрес и достижения — нет; исходный аккаунт удаляется человеком.
Источник: [Merging multiple personal accounts](https://docs.github.com/en/account-and-profile/how-tos/account-management/merging-multiple-personal-accounts).

**Чем платят:** пользователь остаётся с двумя аккаунтами и делает работу руками. Это сознательный выбор: цена
неверного автоматического слияния выше цены неудобства.

**Auth0: слияние есть, и требования к нему совпадают с тем, что уже потребовал владелец.**
- «For both manual and automatic account links, your tenant should request authentication for **both**
  accounts before linking occurs», и «every manual account link should prompt the user to enter credentials».
- Роли явные: primary сохраняет `user_id` и профиль, secondary исчезает из списка пользователей.
- **Данные secondary НЕ переносятся молча:** «The `user_metadata` and `app_metadata` of the secondary account
  are discarded»; профиль secondary остаётся вложенным в `identities[].profileData`. Хочешь перенести — делай
  это явно, до вызова слияния.
- Прямое предупреждение: «Insecurely linking accounts can allow malicious actors to access legitimate user
  accounts».

Источник: [Auth0 — User Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking).

**Firebase: коллизия по email — ошибка, а не повод слить.** При включённом (рекомендуемом) режиме «One account
per email address» попытка привязать credential, чей email уже занят, даёт `FirebaseAuthUserCollisionException`;
штатный выход — заставить человека **войти существующим способом**, и только потом связать новый credential.
Источник: [Firebase Auth — email link sign-in / user collision](https://firebase.google.com/docs/auth/android/email-link-auth).

**Академическая проверка того же правила: «pre-hijacking».** Sudhodanan & Paverd, USENIX Security 2022:
проверили 75 популярных сервисов, **не менее 35 оказались уязвимы** хотя бы к одной из пяти атак —
*Classic-Federated Merge*, *Unexpired Session*, *Trojan Identifier*, *Unexpired Email Change*,
*Non-verifying IdP*. Суть класса: атакующий действует ДО того, как жертва создала аккаунт, и получает доступ
после. Требования, которые авторы выводят:
- «all of the above attacks could be mitigated if the service or IdP sent a verification email to the
  user-provided email address and required the verification to be successfully completed **before** allowing
  any further actions associated with the account»;
- при слиянии — убедиться, что человек «currently control **both** accounts», и то же применять к
  неподтверждённым аккаунтам;
- при сбросе пароля — «Sign out all other sessions and invalidate all other authentication tokens».

Источники: [arXiv:2205.10174](https://arxiv.org/abs/2205.10174),
[USENIX Security 22](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan).

**Практическая проверка того же — `nOAuth` (2023).** Приложения доверяли claim `email` от Microsoft Entra
(Azure AD) и сливали по нему аккаунты. Но «In Microsoft Azure AD, the email claim is both mutable and
unverified so it should never be trusted or used as an identifier»: атакующий в своём тенанте выставлял чужой
email и входил через «Log in with Microsoft» — «merging user accounts results in full account takeover by the
attacker», даже если у жертвы вообще не было аккаунта Microsoft. Microsoft ответила официальным правилом
«never use the email claim to make authentication or authorization decisions», claim `xms_edov` (подтверждён
ли домен) и флагом `removeUnverifiedEmailClaim`; новые multi-tenant приложения с июня 2023 включены в
безопасное поведение по умолчанию.
Источники: [Descope — nOAuth](https://www.descope.com/blog/post/noauth),
[Okta Security — Saying "No Thanks" to nOAuth](https://sec.okta.com/articles/2023/08/saying-no-thanks-noauth/),
[Microsoft — Migrate away from using email claims for user identification or authorization](https://learn.microsoft.com/en-us/entra/identity-platform/migrate-off-email-claim-authorization).

**Это прямо противоречит строке 20 цитаты владельца** («тот что предоставлен в OAuth (яндекс, вк, гугл если
даёт) — все эти системы подтверждают телефон при привязке»). Отраслевая практика: **факт выдачи контакта
провайдером не является доказательством владения им**, пока провайдер отдельно не заявил «verified» и вы этому
флагу не доверяете осознанно.

### 1.3. Отзыв доверия: SIM, перевыпуск, переход номера к другому человеку (дыра D8)

**NIST SP 800-63B-4 — PSTN единственный «RESTRICTED» аутентификатор.** Требования:
- «Verifiers **SHOULD** consider risk indicators (e.g., device swap, SIM change, number porting, other
  abnormal behavior) before using the PSTN to deliver an out-of-band authentication secret»;
- организация обязана предложить «at least one alternative authenticator that is not restricted» и дать
  «meaningful notice regarding the restricted authenticator's security risks»;
- **«setting or changing the pre-registered telephone number is considered to be the binding of a new
  authenticator»** — то есть смена номера это не редактирование поля, а привязка нового фактора со всеми
  требованиями к ней;
- «When an authenticator is added, the CSP **SHALL** notify the subscriber via a mechanism independent of the
  transaction binding the new authenticator»;
- «The CSP **SHALL** suspend, invalidate, or destroy compromised authenticators from the subscriber's account
  promptly following compromise detection»;
- «An account recovery event always causes one or more notifications to be sent to the subscriber to help
  detect fraudulent use», причём уведомления идут не менее чем на два адреса.

Источники: [NIST SP 800-63B-4 — Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/),
[NIST SP 800-63B-4 — Events](https://pages.nist.gov/800-63-4/sp800-63b/events/).

**Насколько реален «номер перешёл другому человеку».** Lee & Narayanan, Princeton CITP, 2021: из **259**
номеров, доступных новым абонентам у двух крупных операторов, **215 оказались переиспользованными** и
уязвимыми к захвату аккаунтов или индексированию персональных данных. В honeypot из **200** номеров
**19 продолжали получать чувствительные сообщения** — включая коды аутентификации — в течение одной недели.
Источники: [CITP blog](https://blog.citp.princeton.edu/2021/05/03/phone-number-recycling-creates-serious-security-and-privacy-risks-to-millions-of-people/),
[recyclednumbers.cs.princeton.edu](https://recyclednumbers.cs.princeton.edu/assets/recycled-numbers-latest.pdf).

**Отдельно — «номер как идентичность» в мессенджерах.** У Telegram смена номера **переносит аккаунт целиком** на
новый номер, и если на целевом номере уже есть аккаунт, старый надо сначала удалить
([Telegram FAQ](https://telegram.org/faq)). То есть привязка «номер → человек» в мессенджере не вечна и
меняется без нашего ведома. Владелец пишет «в мессенджере всегда только один телефон» — это верно в моменте и
неверно во времени: один в моменте, но не тот же самый завтра.

**Практика «замедления» вместо запрета.** Apple при Stolen Device Protection на изменение критичных настроек
аккаунта (в том числе добавление/удаление доверенного устройства, номера, Recovery Key) требует биометрию →
час ожидания → биометрию повторно
([About Stolen Device Protection for iPhone](https://support.apple.com/en-us/120340)). Само восстановление
Apple Account растянуто на дни и «can't be shortened» обращением в поддержку
([How to use account recovery](https://support.apple.com/en-us/118574)). GitHub держит «sudo mode»: действия,
которые «could allow a new person or system to access your account» — в том числе изменение привязанных
email — требуют повторной аутентификации, сессия sudo живёт два часа
([Sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode)).

**Чем платят:** человек, реально потерявший доступ, ждёт. Обмен явный и осознанный: скорость восстановления
обменивается на то, что захват не бывает мгновенным и не бывает незаметным.

### 1.4. Что показывают ДО аутентификации (дыра D10)

**OWASP:** для восстановления пароля возвращать «a consistent message for both existent and non-existent
accounts», причём «in a consistent amount of time», плюс rate-limiting/CAPTCHA.
Источник: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

**Google сделал это дефолтом и сломал ради этого собственный API.** «Email enumeration protection» отключает
выдачу списка способов входа: «A list of sign-in methods for a specified email address is no longer returned
when calling the `createAuthUri` REST API or the `fetchSignInMethodsForEmail` client SDK method». С 15 сентября
2023 включено по умолчанию во всех новых проектах; отключить можно, но «Disabling email enumeration protection
will lower the security of your project… we recommend against doing so».
Источник: [Enable or disable email enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection).

**Прямое попадание в D10.** Наш §3 показывает список привязанных каналов доставки сразу после ввода телефона —
то есть отдаёт состав привязок чужого аккаунта тому, кто ввёл чужой номер. Это ровно тот сигнал, который Google
перестал отдавать и ради этого сломал совместимость публичного метода. GitHub решает то же иначе — сужением
доставки до primary/backup (§1.1), так что перечислять просто нечего.

### 1.5. Что меняется, когда за аккаунтом медицинская история

**Формальное требование.** HIPAA §164.312(d) «Person or Entity Authentication» требует процедур, проверяющих,
что доступ к ePHI получает тот, за кого себя выдают; для пациентских порталов HHS указывает, что они должны
иметь authentication controls, гарантирующие, что доступ получает сам человек **или его законный
представитель**.
Источник: [HHS — Individuals' Right under HIPAA to Access their Health Information](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html).

**Отраслевая асимметрия, которая и есть главный урок.** В медицинских информационных системах различают:
- **дубликат** — один человек в двух записях. Стоит денег и путаницы, но **обратим**;
- **overlay** — записи двух разных людей смешаны в одной. Это «one of the most dangerous forms of patient
  misidentification», ведущее к неверным диагнозам, ошибкам в назначениях и отказам в оплате.

Масштаб: ECRI — 7–10% пациентов не идентифицируются корректно при поиске в EMPI/EHR; AHIMA — 8–12% записей
дубликаты (в среднем ~10%). ONC (2014): «Current methods to match patient records cannot achieve a zero percent
error rate».
Источники: [ONC Patient Identification and Matching Final Report (2014)](https://www.healthit.gov/sites/default/files/resources/patient_identification_matching_final_report.pdf),
[AHIMA — A Realistic Approach to Achieving a 1% Duplicate Record Error Rate](https://ahima.org/media/m1pldevh/ahima-pim-whitepaper.pdf),
[Imprivata — Medical Record Overlay](https://www.imprivata.com/knowledge-hub/medical-record-overlay).

**Что из этого следует для нас.** Отрасль, которая имеет дело ровно с нашей проблемой (один человек — много
идентификаторов, много источников регистрации), пришла к выводу: **дубликаты терпимы, смешение — нет**. Правило
владельца «медисторию и переписку автоматом НЕ ПЕРЕНОСИМ» — это ровно выбор «оставить дубликат, лишь бы не
сделать overlay», и он совпадает с отраслевым. Это сильная часть схемы, а не слабая.

---

## 2. Разбор нашей схемы

### 2.1. Где выигрыш

Довод владельца — «у людей часто есть разные телефоны для макс и телеграм, есть телефон который они указывают
для записи на приём и смс, может быть несколько почт (одну забыли потом вспомнили)» — подтверждается тем, что
вся отрасль пациентской идентификации борется ровно с этим (§1.5): дубликаты возникают не от глупости
пользователей, а от того, что один человек приходит в систему разными путями.

**Сценарии, которые перестают ломаться:**

1. **Записался по одному телефону, пишет боту с другого.** Без модели «любой контакт» человек либо не находит
   свою запись, либо заводит второй аккаунт. Это основной поставщик дубликатов у нас: по
   `D15A_IDENTITY_RESEARCH.md` §3.4 первый контакт из мессенджера уже сейчас разрешается в организацию по
   эвристике «единственная активная организация», то есть человек попадает в систему до всякой идентичности.
2. **Забытая почта.** Классический «одну забыли потом вспомнили»: человек помнит ОДИН из контактов, и модель
   позволяет ему войти именно им, а не гадать, какой был «основным».
3. **Смена мессенджера.** Телефон в MAX и в Telegram разные — при модели «один идентификатор» переход между
   каналами создаёт нового человека.
4. **Восстановление без поддержки.** Чем больше подтверждённых дверей, тем реже человек упирается в «напишите
   в техподдержку» — а у нас поддержка это живые люди клиники, не круглосуточный колл-центр.

**Насколько это массово — по нашим данным не измерено.** Оценка требует запроса к боевой базе (сколько
`platform_users` имеют более одного подтверждённого контакта, сколько collision-групп по телефону), а PROD
из dev по правилам репозитория недоступен. См. §4.

### 2.2. Где ломается: прочность аккаунта равна прочности самого слабого контакта

Это не абстракция, и показать её надо на наших каналах.

**Именование проблемы.** В модели «любой подтверждённый контакт = дверь» риск аккаунта не усредняется по
контактам, а берётся по МИНИМУМУ: атакующему достаточно одной двери. Каждый новый подтверждённый контакт —
это монотонное ухудшение, которое пользователь воспринимает как улучшение («стало удобнее»).

**Конкретный сценарий на нашем контуре, с опорой на уже снятую перепись кода
(`D15A_IDENTITY_RESEARCH.md` §3.3):**

1. Пациент год назад записался на приём, оставил телефон `+7-9XX`. Телефон стал подтверждённым.
2. Пациент сменил номер. Старый ушёл оператору и через несколько месяцев выдан другому человеку — по данным
   Princeton (§1.3) это не редкость, а норма: 215 из 259 номеров.
3. У нас статус «подтверждён» присвоен один раз и навсегда: правил отзыва, переподтверждения и срока годности
   в схеме нет (это дыра D8 аудита, здесь она получает цену).
4. Новый владелец номера пишет боту. По §2 схемы он вводит подтверждённый телефон, выбирает канал доставки,
   получает код **на свой же телефон** — и оказывается внутри чужого аккаунта, где лежат визиты, карточка
   врача, назначенная программа и переписка.

**Что делает сценарий хуже, а не лучше.** По переписи кода сегодня:
- Telegram `/start setphone_<phone>` принимает **произвольный телефон без подписи**
  (`messengerStartParse.ts:15-35,83-91` → `user.phone.link`);
- MAX contact при отсутствии hash или token **продолжает с warning**, а не отказывает (`max/mapIn.ts:109-180`);
- `trustedPhonePolicy.ts:1-64` считает телефон доверенным по одному лишь наличию `patient_phone_trust_at`,
  **не храня рядом источник доверия**.

То есть посылка владельца «телефон к мессенджеру привязан и априори подтверждён» в нашем коде сегодня не
обеспечена: существует путь, где произвольно введённый телефон становится доверенным и неотличимым от честно
подтверждённого. При модели «любой подтверждённый контакт — дверь» это означает, что **самая слабая дверь
открывается вводом строки**. Это не находка аудита схемы — это уже зафиксированное состояние кода (D15A),
которое схема наследует.

**Второй слабый контакт — почта.** Схема считает почту подтверждаемой кодом (V1 аудита), но почта у пациента
часто на бесплатном сервисе, часто без 2FA и часто заброшена. В модели «любой контакт» взлом такой почты
эквивалентен взлому медицинского аккаунта, даже если человек защитил телефон и поставил 2FA.

**Третье: количество дверей растёт само.** Схема §5.7 приземляет контакты из слитого аккаунта в новый.
Пользователь не выбирал «добавить дверь» — двери добавляются как побочный эффект слияния и записи на приём.

### 2.3. Медицина меняет вывод — но не там, где ожидалось

**Не меняет** оценку §2 как таковую: множественные идентификаторы входа используются и в системах с
чувствительными данными, включая государственную ЕСИА (§1.1).

**Меняет цену ошибки, и в двух разных местах по-разному:**

- **Слияние — защищено, и лучше отраслевой практики.** Блокер по активной медистории + «медисторию и переписку
  автоматом НЕ ПЕРЕНОСИМ» = сознательный выбор «дубликат вместо overlay», совпадающий с выводом отрасли
  (§1.5). Довод владельца «поэтому риска для чувствительных данных нет» **в части слияния верен**.
- **Вход — не защищено, и довод туда не распространяется.** Медистория не переносится — но она и не должна
  переноситься, чтобы быть прочитанной: она остаётся в аккаунте, а вход в аккаунт открыт **любым** контактом.
  Атакующему из сценария §2.2 ничего не нужно сливать; он просто входит и читает. Это разрыв в рассуждении
  владельца, который стоит назвать прямо: **аргумент «не переносим, значит не рискуем» закрывает слияние и не
  закрывает §2.**

**Плюс требование HIPAA (§1.5) о том, что портал должен убеждаться, что перед ним сам человек или его законный
представитель.** У нас модель «любой контакт» на практике означает: телефон, который пациент дал при записи,
мог быть телефоном родственника, который его записывал. Это не гипотеза — это обычная практика записи пожилых
пациентов, и она превращает «подтверждённый контакт» в «контакт человека, который был рядом».

---

## 3. Варианты для владельца

Формат: **что даёт / чем платим**. Ни один не является рекомендацией; часть взаимоисключающая, часть
сочетается. Ни один не заводит требований — это материал для решения.

### Вариант A. Разделить «контакт для входа» и «контакт для доставки»

**Как в отрасли:** ровно так сделано у Microsoft — Sign-in preferences, где алиас можно снять с права входа,
сохранив доставку (§1.1); и у GitHub — доставка сужена до primary/backup при любом числе verified-адресов.

**Что даёт:** сохраняет ВЕСЬ выигрыш §2.1 (человека находят и достают по любому контакту, дубликаты не
плодятся) и убирает монотонный рост числа дверей: контакт, добавленный при записи на приём или приехавший из
слияния, по умолчанию доставляет, но не пускает.

**Чем платим:**
- новое поле у контакта и новый экран управления им; человек, добавивший контакт, должен где-то сказать
  «хочу им и входить» — иначе получит «код пришёл, а войти не могу», а это худший из возможных UX;
- ломает буквальную формулировку §2 схемы («при вводе ЛЮБОГО подтверждённого телефона или email — можно
  логинить») — то есть это правка слов владельца, а не уточнение;
- требует дефолта, который сам по себе развилка: новый контакт «пускает» или «не пускает» по умолчанию.

### Вариант B. Ввести срок годности и отзыв подтверждения

**Как в отрасли:** NIST — смена pre-registered номера считается привязкой НОВОГО аутентификатора; риск-индикаторы
SIM change / number porting / device swap; компрометированные аутентификаторы подлежат немедленной
инвалидации (§1.3).

**Что даёт:** закрывает главный сценарий §2.2 (переиспользованный номер) — единственный, где посторонний
получает доступ, ничего не взламывая.

**Чем платим:**
- нужен признак «источник и время доказательства» рядом с каждым контактом — сегодня его нет
  (`trustedPhonePolicy.ts` хранит только `patient_phone_trust_at`), значит это миграция и перепись
  существующего доверия;
- честных пациентов будет периодически просить переподтвердить контакт — трение на ровном месте;
- детект SIM swap/переноса номера у операторов РФ — отдельный внешний сервис, наличие и цена которого не
  выяснены (§4); без него остаётся только грубая мера «срок годности», которая бьёт по всем одинаково.

### Вариант C. Ограничить действия сразу после входа новым контактом

**Как в отрасли:** GitHub sudo mode (повторная аутентификация на действия, открывающие доступ новым людям);
Apple security delay (час) и растянутое на дни восстановление, которое нельзя ускорить (§1.3).

**Что даёт:** разрывает связь «одна слабая дверь → полный доступ». Вошедший впервые новым контактом может
пользоваться сервисом, но не может немедленно прочитать медисторию / удалить другие контакты / поменять 2FA —
а у настоящего владельца есть окно, чтобы увидеть уведомление и нажать тревогу.

**Чем платим:**
- нужно решить, ЧТО именно ограничивается, а это продуктовая развилка, а не техническая: слишком широко —
  пациент не может пользоваться своим кабинетом, слишком узко — мера декоративна;
- задержка бьёт по тем, кто реально потерял доступ и торопится (у нас это может быть человек перед приёмом);
- усложняет и без того неопределённое поведение «заблокированного» аккаунта (дыра D7 аудита).

### Вариант D. Обязательное уведомление остальных контактов о новой двери

**Как в отрасли:** NIST — при добавлении аутентификатора CSP **SHALL** уведомить по каналу, независимому от
той транзакции, которая его привязывает; событие восстановления всегда порождает уведомления, не менее чем на
два адреса (§1.3).

**Что даёт:** это самое дешёвое из всего списка и единственное, что уже частично есть в схеме (§5.6 —
уведомление + код + кнопка тревоги). Не предотвращает захват, но делает его **заметным**, а незаметность —
именно то, что авторы pre-hijacking называют худшим свойством своих атак («completely undetectable from the
victim's perspective»).

**Чем платим:**
- владелец сам ограничил уведомления слиянием; распространение их на КАЖДУЮ новую дверь (включая контакт,
  добавленный при записи на приём) — расширение его правила;
- шум: пациент, который сам добавил третий контакт, получит письма на два предыдущих;
- уведомление бесполезно, если единственный «другой» контакт — та же скомпрометированная почта; требование
  NIST «не менее двух адресов» у нас часто невыполнимо (у многих пациентов контакт ровно один).

### Вариант E. Не считать контакт от провайдера подтверждённым

**Как в отрасли:** это не оптимизация, а закрытие известного класса уязвимостей — `nOAuth` и pre-hijacking
(§1.2); Microsoft прямо: «never use the email claim to make authentication or authorization decisions».

**Что даёт:** убирает расхождение схемы с практикой, названное во втором абзаце этого документа. Контакт из
OAuth/мессенджера остаётся отличным СИГНАЛОМ (кого искать, куда слать код), но дверью становится только после
нашего собственного подтверждения.

**Чем платим:**
- прямо противоречит строкам 19–20 цитаты владельца — это его слова, и правка требует его решения, а не
  агентского вывода;
- добавляет шаг подтверждения там, где владелец сознательно его убирал ради простоты входа из бота;
- по D15A часть текущего доверия уже проставлена именно так — значит нужна перепись существующих строк, а не
  только новое правило.

### Вариант F. Ничего не менять

**Что даёт:** максимальную простоту входа и минимальную нагрузку на поддержку. Модель совпадает с
Google/Apple/Microsoft в главном (§1.1), а самое опасное — перенос медданных — уже заблокировано (§2.3).

**Чем платим:** принимаем сценарий §2.2 как остаточный риск: посторонний, которому оператор выдал бывший
номер пациента, получает доступ к медицинской истории, и мы об этом не узнаем. Оценить его частоту по нашим
данным нельзя (§4); внешние данные (215 из 259) говорят, что переиспользование номеров — не редкое событие.

---

## 4. Чего я не смог выяснить

1. **Сколько НАШИХ людей реально спасает модель.** Прямой вопрос владельца («сколько людей это реально
   спасает») требует счёта по боевой базе: сколько `platform_users` имеют >1 подтверждённого контакта, сколько
   collision-групп по телефону, сколько аккаунтов создано вторым контактом того же человека. PROD-база из dev
   недоступна по правилам репозитория (`AGENTS.md` §1b), а dev-база — сидированная песочница, по которой такой
   вывод делать нельзя. Ответ достижим, но это отдельная работа с доступом, которую я не имел права выполнить.
2. **Apple — не подтверждено первоисточником.** Утверждение «дополнительные адреса и номера из аккаунта годятся
   для входа» опирается на выдержки из [support.apple.com/en-us/102529](https://support.apple.com/en-us/102529)
   в поисковой выдаче; тело страницы машинно не вычиталось (динамическая отдача). Для Google и Microsoft
   первоисточники прочитаны, поэтому вывод §1.1 на Apple не держится.
3. **Госуслуги — официальная страница недоступна.** [gosuslugi.ru/help/faq/login/1](https://www.gosuslugi.ru/help/faq/login/1)
   отдаёт «Доступ ограничен по соображениям безопасности». Перечень способов входа взят из вторичных
   источников. Особенно не подтверждено, есть ли в ЕСИА ограничение вида «этим идентификатором входить нельзя»
   (аналог Microsoft Sign-in preferences) — а это самый интересный для нас вопрос по российской практике.
4. **Детект SIM swap / переноса номера у операторов РФ.** Международно такие сервисы существуют (на них
   ссылается формулировка NIST про risk indicators), но есть ли доступный аналог у российских операторов, на
   каких условиях и с какой задержкой — не выяснено. Это напрямую определяет, реализуем ли вариант B в сильной
   форме или только в форме «срок годности».
5. **Правила MAX по смене номера.** Нашлись только вторичные источники, утверждающие, что номер привязывается к
   аккаунту MAX навсегда и смена не предусмотрена. Официальной документации MAX я не нашёл, а от этого зависит,
   применим ли к MAX сценарий «аккаунт мессенджера переехал на другой номер», известный по Telegram.
6. **Российская нормативка по идентификации в медицинских сервисах.** Разобрана практика HIPAA (США). Что
   требуют 152-ФЗ и ст. 13 323-ФЗ (врачебная тайна) конкретно к силе аутентификации в пациентском кабинете — не
   исследовано; это юридический вопрос, а не инженерный, и отвечать на него по вторичным источникам было бы
   безответственно.
7. **Пять развилок «нормы», которые отрасль не диктует.** Ни один источник не отвечает, каким ДОЛЖЕН быть
   дефолт для нового контакта (пускает/не пускает), сколько ждать в задержке, что именно ограничивать после
   входа новой дверью. Это продуктовые решения; я перечислил цену каждого в §3, но «как правильно» тут нет ни
   у кого.

---

## Источники

**Спецификации и руководства**
- [OpenID Connect Core 1.0, §5.7 Claim Stability and Uniqueness](https://openid.net/specs/openid-connect-core-1_0.html)
- [NIST SP 800-63B-4 — Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- [NIST SP 800-63B-4 — Events (recovery, notification, invalidation)](https://pages.nist.gov/800-63-4/sp800-63b/events/)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [HHS — Individuals' Right under HIPAA to Access their Health Information (45 CFR §164.524)](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html)

**Документация продуктов**
- [Google — Use another email to sign in to your Google Account](https://support.google.com/accounts/answer/176347?hl=en&co=GENIE.Platform%3DDesktop)
- [Google Cloud — Enable or disable email enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection)
- [Google Workspace — merge domains from separate accounts (no user merge/dedup)](https://knowledge.workspace.google.com/admin/domains/merge-domains-from-separate-accounts?hl=en)
- [Microsoft — Change the email address or phone number for your Microsoft account (aliases)](https://support.microsoft.com/en-us/help/12407/microsoft-account-how-to-manage-aliases)
- [Microsoft — Migrate away from using email claims for user identification or authorization](https://learn.microsoft.com/en-us/entra/identity-platform/migrate-off-email-claim-authorization)
- [Apple — About your Apple Account email addresses](https://support.apple.com/en-us/102529) ⚠️ см. §4
- [Apple — About Stolen Device Protection for iPhone](https://support.apple.com/en-us/120340)
- [Apple — How to use account recovery](https://support.apple.com/en-us/118574)
- [GitHub — Verifying new devices when signing in](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/verifying-new-devices-when-signing-in)
- [GitHub — Setting a backup email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-a-backup-email-address)
- [GitHub — Merging multiple personal accounts](https://docs.github.com/en/account-and-profile/how-tos/account-management/merging-multiple-personal-accounts)
- [GitHub — Sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode)
- [Auth0 — User Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)
- [Firebase — Email link sign-in / user collision](https://firebase.google.com/docs/auth/android/email-link-auth)
- [Telegram FAQ](https://telegram.org/faq)

**Исследования и разборы уязвимостей**
- [Sudhodanan & Paverd — Pre-hijacked accounts (USENIX Security 22)](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan) · [arXiv:2205.10174](https://arxiv.org/abs/2205.10174)
- [Lee & Narayanan — Security and Privacy Risks of Number Recycling (Princeton CITP, 2021)](https://recyclednumbers.cs.princeton.edu/assets/recycled-numbers-latest.pdf) · [блог CITP](https://blog.citp.princeton.edu/2021/05/03/phone-number-recycling-creates-serious-security-and-privacy-risks-to-millions-of-people/)
- [Descope — nOAuth: How Microsoft OAuth Misconfiguration Can Lead to Full Account Takeover](https://www.descope.com/blog/post/noauth)
- [Okta Security — Saying "No Thanks" to nOAuth](https://sec.okta.com/articles/2023/08/saying-no-thanks-noauth/)

**Медицинская идентификация**
- [ONC — Patient Identification and Matching Final Report (2014)](https://www.healthit.gov/sites/default/files/resources/patient_identification_matching_final_report.pdf)
- [AHIMA — A Realistic Approach to Achieving a 1% Duplicate Record Error Rate](https://ahima.org/media/m1pldevh/ahima-pim-whitepaper.pdf)
- [Imprivata — Medical Record Overlay](https://www.imprivata.com/knowledge-hub/medical-record-overlay)
