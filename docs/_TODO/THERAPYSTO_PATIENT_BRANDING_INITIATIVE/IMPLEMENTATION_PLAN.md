# Therapysto + универсальное patient-branding — implementation plan

**Дата:** 2026-08-21. **Ветка:** `wt/therapysto-patient-branding-plan`. **Статус:** план после авторского
исследования и независимого аудита; product code не менялся. Фактическая база —
`CURRENT_STATE_AND_GAP_REPORT.md`, мировые аналоги и ограничения Yandex OAuth —
`EXTERNAL_PRODUCT_RESEARCH.md`, замечания к первой редакции — `INDEPENDENT_PLAN_AUDIT.md`.

> ## 🔴 РЕЖИМ РАБОТЫ (владелец, 22.08.2026): НИ ОДИН ЭТАП НЕ ПРИЗЕМЛЯЕТСЯ
>
> Дословно: «никакой этап не вливается пока — работаем в ветке».
>
> Это относится **ко всем этапам плана — `A`, `B`, `C`, `D`, `E`, `F`**, а не только к тому, что идёт
> сейчас. Ни `git merge` в `feat/doctor-ui-rebuild`, ни `tools/orch-launch.sh land`, ни push. Готовый и
> прошедший аудит этап остаётся на своей ветке и ждёт отдельной команды владельца.
>
> Причина: владелец даёт оба домена сразу, и переезд на Therapysto/Therapygo идёт одним куском. Половина
> переименования в общей ветке — это состояние, в котором доктор видит одно имя, пациент другое, а письма
> третье; в ветке это нормальная промежуточная точка, в `feat` — мусор, который придётся объяснять.
>
> Что при этом ДЕЛАЕТСЯ как обычно: работа в ветках этапов, коммиты, независимый адверсарный аудит,
> строки вердиктов в `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, синхронизация ветки этапа с `feat` в свою
> сторону (`fetch` + `merge` из feat — можно и нужно, порт этого требует).
>
> Снять режим может только владелец явной командой.

## 1. Итоговое решение

Делаем **не два webapp и не форк**, а один webapp с тремя request-surface:

1. `staff` — Therapysto для специалистов и администраторов;
2. `patient_default` — стандартное patient-приложение на отдельном полном домене и под отдельным именем;
3. `patient_branded` — то же patient-приложение на домене клиники с effective brand этой клиники.

Один запрос проходит через один `RequestSurfaceResolver`. Его результат содержит `surface`, `publicOrigin`,
`organizationId` (только для branded surface) и `EffectivePatientBrand`. Этот результат переиспользуют routing,
metadata/manifest, auth/OAuth, абсолютные ссылки и transactional delivery. Отдельные функции «получить имя для
header», «получить имя для письма», «получить домен для OAuth» не создаются.

### 1.1 Единственные источники данных

| Смысл | Единственный источник | Что не создаём |
| --- | --- | --- |
| Therapysto staff identity/origin | точное имя `Therapysto` + существующий typed deploy config (`APP_BASE_URL`) | DB-настройку названия платформы |
| Стандартное patient-приложение | один typed deploy config: обязательные `name` и `origin` | tenant-строку в БД, hardcoded placeholder |
| Домен клиники | существующий per-org `system_settings.org_custom_domain_hostname` | `hostname_binding`/`custom_domains` table |
| Опубликованный бренд | существующий `org_brand_revisions` и его service/port | второй branding module/store |
| Карточка, запись, контакты | существующая `clinic_public_directory_entries` и clinic-public-card port | копию публичного профиля внутри brand |
| SMTP/боты | существующие per-org settings и `dispatchPort`/`clinicDeliveryCredentials` | второй delivery dispatcher |
| OAuth credentials | DB-backed `system_settings`; один OAuth-config resolver выбирает запись по surface | env-секреты и отдельные OAuth flow |

`EffectivePatientBrand` — один composed read model. Для `patient_default` он строится из deploy identity. Для
`patient_branded` он берёт published org brand, а данные карточки/записи/контактов — из существующей public-card
проекции. Дублировать имя/контакты между этими хранилищами нельзя. Если patient app name должен отличаться от
названия клиники, в **существующую** brand revision добавляется одно optional поле `patientAppName` с fallback на
`displayName`; для цвета — один optional accent token с безопасным default. Полноценный theme/CMS не строится.

### 1.2 Адрес клиники: по умолчанию НАШ поддомен (решение владельца 22.08.2026)

**`W3` ЗАКРЫТ вариантом (а).** Пациент клиники приходит на **наш** поддомен вида
`<slug клиники>.therapygo.ru` (домен закрыт владельцем 22.08.2026, см. §5; например
`bersoncare.therapygo.ru`). Собственный домен клиники — отложенная платная опция, не часть базового
пути.

Основание — проверка аналогов 22.08.2026: Medbridge отдаёт white-label портал на СВОЁМ домене
(`upmc.medbridgego.com`) даже клиенту размера UPMC; Physitrack вместо домена даёт клинике нативное приложение в
магазинах под её именем. Ни один из двух не ставит пациента на домен клиники.

Что это даёт: от клиники не требуется ничего (ни DNS, ни похода к регистратору, ни ожидания), один
wildcard-сертификат покрывает все клиники, подключение — минута в админке. Снимаются целиком: apex-домен,
привязка к вечному IP, мониторинг чужих доменов, риск HSTS на чужом домене, захват освободившегося домена,
подтверждение владения (`W2`).

- **Базовый путь:** резолвер сопоставляет метку поддомена с организацией; источник метки — существующий slug
  организации, новой сущности не заводится. Неизвестная метка — hard 404, не platform fallback.
- **Отложенная опция (не исполнять без отдельной команды владельца):** собственный домен клиники через
  `org_custom_domain_hostname`. Всё, что описано ниже про custom domain, относится ТОЛЬКО к ней. Вместе с ней
  возвращается и `W2` (подтверждение владения) — тогда просить, но ради отсутствия паузы при переключении, а не
  ради защиты от подмены: подключение всё равно ручное.
- `org_custom_domain_hostname` остаётся каноническим нормализованным hostname.
- В существующий write path добавляется защита от дубля hostname. На актуальной DEV schema создаётся узкий
  partial unique expression index для непустого `value_json->>'value'` только у этого key; новой таблицы нет.
- Настройку домена оставляем `owner`-only, как сегодня. Расширение прав не нужно для результата и не является
  owner-вопросом этого плана.
- DNS, TLS и proxy binding выполняет оператор. Домен начинает принимать трафик только после этой ручной
  операции; отдельный lifecycle/marketplace/self-service не строится.
- Resolver признаёт branded surface только при точном совпадении нормализованного Host, действующей
  `custom_domain` capability и published brand. Неизвестный/дублирующийся Host — hard 404, не platform fallback.
- Host выбирает surface, но никогда не выдаёт доступ к tenant data. Авторизация остаётся по session/membership/
  enrollment через существующие guards.

### 1.3 Поверхности и маршруты

- Therapysto origin обслуживает staff/admin и свою marketing/login поверхность. Patient-only путь на нём
  переводится на канонический путь стандартного patient origin без переноса cookie.
- Стандартный patient origin обслуживает общий patient login/recovery/cabinet и существующие clinic card/booking
  по slug. Therapysto marketing home там не рендерится.
- Branded origin обслуживает то же patient tree. Корень показывает effective clinic/app brand, login/recovery,
  clinic card и ссылку/форму booking; slug клиники в URL не обязателен, потому что организация уже определена Host.
- Существующие clinic card/booking services переиспользуются; второго route tree с копиями UI и логики нет.
- Session cookie остаётся host-only. Cross-domain SSO не вводится. CSRF продолжает использовать request origin.
- Passkey НЕ удаляется. Он становится одной из переключаемых механик входа и по умолчанию выключен у докторов
  (§1.6). Уже написанный код сохраняется.
  Прежняя строка «Yandex OAuth на patient surfaces обязателен и не отключается» ОТМЕНЕНА решением владельца
  21.08.2026 (§1.6): на staff surface OAuth нет вообще, на patient surface Yandex — открытый owner gate.
- Metadata, OpenGraph и manifest вычисляются через тот же resolved surface; отдельные manifest-файлы под бренды
  не создаются.

### 1.4 OAuth: включён у пациентов, выключен у специалистов

**Действует под §1.6.** `OG-4` ЗАКРЫТ владельцем 22.08.2026: **Яндекс не трогаем**, он остаётся у пациентов как
есть — одна глобальная регистрация, отдельных регистраций на клинику не делаем. На staff/admin surface OAuth
выключен по умолчанию (`OG-5` (б)): механика в списке есть, работающего provider config на этой поверхности нет.

Несколько redirect URI у одного Yandex-приложения решают callback, но **не меняют имя/иконку consent**. Поэтому
один global OAuth client не удовлетворяет white-label.

- Therapysto staff surface OAuth не имеет — прежняя строка про «существующую global Yandex app identity» для него
  отменена §1.6.
- Стандартное patient-приложение получает отдельную global DB-backed Yandex app config с собственными
  client id/secret/exact redirect URI и именем/иконкой, зарегистрированными в Yandex.
- Каждая активируемая branded clinic получает per-org DB-backed Yandex app config с consent identity этой клиники.
- Один OAuth-config resolver выбирает config по `ResolvedSurface`; start и callback не имеют параллельных
  реализаций. Signed state связывает surface, normalized origin и organization id, а callback сверяет exact
  allowlist и снова резолвит surface.
- Между provider configs нет fallback. Branded domain нельзя активировать, пока его Yandex app не готова: OAuth
  остаётся видимым и рабочим, а не отключается.

### 1.5 Боты и transactional mail

- Все patient-facing intents, начатые на branded surface — login/contact confirmation, recovery/security codes и
  notifications — несут `organizationId` и `senderScope='clinic_required'` для Telegram/MAX. Platform bot fallback
  запрещён и уже обеспечивается существующим `dispatchPort`; задача — провести через него все эти intents.
- Branded activation требует настроенные Telegram/MAX credentials для каналов, которые UI предлагает пациенту.
  Неготовый канал не показывается; готовый не откатывается на platform sender.
- SMS остаётся отдельной tariff capability и в branding не включается.
- Existing `clinic_smtp_outbound` остаётся transport source. Один transactional-mail profile resolver соединяет
  его с `EffectivePatientBrand` и per-org template overrides.
- Template overrides хранятся в одном новом per-org `system_settings` key и допускаются только для реально
  существующих patient transactional template IDs и allowlisted variables. Используется один renderer;
  произвольный mass-mail editor/рассылки не строятся.
- **`W1` ЗАКРЫТ владельцем 22.08.2026: отправлять, не fail-closed.** Прежняя редакция («либо собственным SMTP,
  либо недоступен») ОТМЕНЕНА. Владелец: «отправлять и добавлять подпись… если не настроены провайдеры, значит
  пишем типа Therapysto от <клиника>… или просто менять название клиники или добавлять».
  - Когда почта клиники настроена — письмо уходит её SMTP/sender/template, как и было.
  - Когда НЕ настроена или её SMTP отказал — письмо всё равно уходит, с платформенного проверенного адреса, но
    имя клиники видно получателю; Reply-To — адрес клиники. Технический адрес отправителя платформенный и не
    маскируется под домен клиники (подделка чужого домена ломает доставку и запрещена практикой).
  - **ОТКРЫТАЯ ДЕТАЛЬ (не блокирует этап):** точный формат — что именно стоит в имени отправителя и в теме.
    Владелец: «это уже детали, это надо будет решить, как правильно». Решается на этапе C с показом живых
    примеров писем, а не выбором формулировки в плане.

### 1.6 Политика входа по поверхностям (решение владельца 21.08.2026)

Владелец сверился с мировыми аналогами (Physitrack, Medbridge) и зафиксировал:

> «У них нет OAuth вообще для специалистов. Значит и у нас не будет — делаем как они. Для пациентов — оставим вход
> по имейл и по номеру телефона (с подтверждением через бота). Возможно оставлю Яндекс OAuth, но может и нет.»

- **Staff/admin (Therapysto): OAuth выключен** (`OG-5`, вариант (б), владелец 22.08.2026). Механика остаётся в
  списке админки и в коде, но у докторов её значение по умолчанию — «выключено»: ни OAuth-кнопки на входе, ни
  работающего provider config на этой поверхности, пока настройку не включат.
**Модель (владелец, 22.08.2026, дословно): «все механики включаются в админке — отдельно для докторов и отдельно
для пациентов».** То есть способ входа — это НЕ развилка в коде и не удаление кода, а значение настройки для
конкретной поверхности. Матрица «поверхность × механика» живёт в админке, у каждой ячейки есть значение
по умолчанию.

- **🔴 СКВОЗНОЕ ПРАВИЛО: механики не вырезаем, их выключают.** Владелец, 22.08.2026: «я же тебе сказал уже,
  механики не вырезаем, просто я выключу что не надо»; ранее — «я просто не хочу удалять то что уже сделано».
  Правило действует на ЛЮБУЮ механику входа и доставки, а не только на passkey: выключенная механика остаётся в
  коде и включается настройкой. Формулировки вида «удалить путь», «вырезать», «доказательство отсутствия» в этом
  плане запрещены — вместо них «выключено по умолчанию» и доказательство «выключено → недоступно, включено →
  работает».
- **Значения по умолчанию для докторов (владелец, 22.08.2026):** email + пароль включены; вторым фактором —
  код на email ИЛИ код 2FA из приложения (TOTP); владелец: «я думаю этого достаточно».
- **Passkey у докторов — выключён по умолчанию, но сохранён как опция.** Владелец: «мы этот passkey может и
  включим потом как 2FA или сам доктор так захочет, а мы дадим как опцию». То есть у него два возможных будущих
  режима — платформенный (включает админ) и личный (включает сам доктор себе). Реализация не обязана открывать
  оба сразу, но НЕ должна закрывать второй архитектурно.
- **PIN не нужен нигде** (владелец, 22.08.2026). Он вырезан целиком 04.08.2026 (`39ececd53`) — работы нет,
  только запрет заводить заново.
- **Patient (стандартное приложение и branded clinic): email и номер телефона** с подтверждением через бота.
- **Яндекс OAuth для пациентов — ОСТАЁТСЯ** (`OG-4` закрыт 22.08.2026: «не трогать яндекс, просто не паримся с
  именем которое они увидят»). Работает как сейчас, одной глобальной регистрацией; на consent-экране пациент
  увидит имя платформы, а не своей клиники — принято осознанно. Google OAuth остаётся выключенным (решение
  по #1035) — выключенным, не вырезанным.
- **Следствие, которое и есть работа:** поверхностей теперь две с РАЗНОЙ политикой входа, а в global admin сегодня
  один переключатель входа на всю платформу. Нужна политика входа per-surface: staff и patient настраиваются
  раздельно, и настройка staff-поверхности физически не может включить на ней OAuth.

Это правит §1.3 и §1.4 выше и добавляет `TPB-17…19` в §2.

## 2. Атомарные owner requirements

> **Правка имени 22.08.2026.** Во всём документе `PersonCare` заменён на `BersonCare` (10 вхождений) по прямому
> указанию владельца: «не PersonCare - BersonCare». Бренда `PersonCare` не существует — в коде это слово
> встречалось один раз, в комментарии. Этап D означает: **BersonCare становится первой брендированной клиникой**
> на общем механизме.

Checkbox закрывается только доказательством, указанным в той же строке. ID не переименовываются.

- [ ] `TPB-01` User-visible имя staff/platform surface — **Therapysto**. Доказательство: inventory diff + UI/
  metadata/auth issuer assertions без старого platform name.
- [ ] `TPB-02` Specialists, clinic admins и platform admins работают на Therapysto surface. Доказательство:
  host/role route tests для staff/admin paths.
- [ ] `TPB-03` Пациенты работают в отдельно названном standard patient app на отдельном полном owner-selected
  domain. Доказательство: typed config validation и runtime smoke обоих origins.
- [ ] `TPB-04` Не созданы `staff.therapysto.ru` и `patient.therapysto.ru`. Доказательство: deploy config и active
  docs содержат только два выбранных полных домена.
- [ ] `TPB-05` Пациент клиники входит через standard patient domain или активный branded clinic domain.
  Доказательство: одинаковые login/booking/cabinet behavior tests на обоих surface.
- [ ] `TPB-06` BersonCare активирован первой конфигурацией универсального механизма, без BersonCare-specific code.
  Доказательство: runtime settings/brand data + отсутствие BersonCare branching в product code.
- [ ] `TPB-07` Остаются один repo, один webapp, одна DB и общие mechanics. Доказательство: architecture diff не
  создаёт второго app/tree/store/dispatcher.
- [ ] `TPB-08` Branding влияет только на patient-facing surface; staff/admin видят Therapysto. Доказательство:
  cross-surface metadata/UI tests.
- [ ] `TPB-09` Standard patient name/origin меняются deploy config без data migration; clinic domain/integrations
  остаются org-scoped DB settings. Доказательство: config test и settings ownership tests.
- [ ] `TPB-10` **Переписан 21.08.2026 под §1.6.** Прежняя редакция требовала Yandex OAuth на Therapysto — это
  противоречит решению «у специалистов OAuth нет». Требование теперь: на staff surface OAuth отсутствует; на
  patient surfaces Яндекс остаётся включённым одной глобальной регистрацией (`OG-4` закрыт 22.08.2026).
  Отдельная consent identity на клинику НЕ делается (`W4`). Доказательство: config-selection/state/callback
  tests и operator smoke единственной зарегистрированной app identity.

  Происхождение прежней редакции: owner-требование брифа №10 звучало как «OAuth доступен, без утечки чужой
  identity в consent». Формулировки «обязателен и не отключается» владелец не давал — она возникла при
  синтезе плана. Зафиксировано, чтобы не воспроизвелась.
- [ ] `TPB-11` Branded root не показывает Therapysto home/directory и ведёт к brand login/recovery, clinic card,
  booking и patient cabinet. Доказательство: branded-host page/navigation tests.
- [ ] `TPB-12` Branded Telegram/MAX confirmations, codes и notifications идут только через clinic bot; SMS не
  считается branding. Доказательство: dispatch fault injection подтверждает `clinic_required` и отсутствие fallback.
- [ ] `TPB-13` Branded transactional patient mail использует clinic SMTP/sender/template; mass mailing не изменён.
  Доказательство: template/profile selection tests и delivery fault injection.
- [ ] `TPB-14` Первичная domain activation остаётся ручной; self-service DNS/TLS, SEO automation и marketplace не
  построены. Доказательство: operator runbook и отсутствие таких product flows в diff.
- [ ] `TPB-15` User-visible BersonCareBot/platform BersonCare и понятие BersonCare Bot заменены на Therapysto; technical IDs и
  history не переименованы. Доказательство: scoped exact inventory before/after с явным allowlist technical/history.
- [ ] `TPB-17a` Passkey сохранён в коде и выключен у докторов настройкой, а не удалением; включение настройкой
  возвращает его в строй без правки кода. PIN отсутствует. Доказательство: тест «выключено → путь недоступен»
  и «включено → путь работает» на одном и том же коде, плюс сценарий пользователя, у которого passkey уже заведён.
- [ ] `TPB-17` На staff/admin surface OAuth-вход выключен настройкой (`OG-5` (б)): механика присутствует в
  матрице, значение по умолчанию — «выключено», путь недоступен на уровне резолвера, пока её не включат. Доказательство: UI-тест login-экрана без
  OAuth-элементов + route-тест, что OAuth start/callback на staff origin отвечают отказом, а не редиректом.
- [ ] `TPB-18` Пациент входит по email и по номеру телефона с подтверждением через бота на обеих patient-поверхностях.
  Доказательство: одинаковые login behavior tests на standard и branded origin для обоих способов.
- [ ] `TPB-19` Механики входа настраиваются в админке матрицей «поверхность × механика», раздельно для докторов и
  для пациентов, а не одним общим переключателем. Выключенная механика недоступна на уровне резолвера, а не только
  скрыта в UI. Доказательство: settings-тест раздельных значений для двух поверхностей + fault injection
  «обратиться к выключенной механике напрямую» получает отказ.

  **`OG-5` ЗАКРЫТ владельцем 22.08.2026: вариант (б).** OAuth присутствует в списке механик и выключен по
  умолчанию у докторов — так же, как passkey. Ничего не удаляется и не блокируется архитектурно. Прежняя
  редакция требовала, чтобы OAuth на staff нельзя было включить в принципе; она отменена как противоречащая
  модели «все механики включаются в админке».
- [ ] `TPB-16` Реализация расширяет перечисленные choke points и не создаёт параллельных getters/resolvers/stores.
  Доказательство: dependency/architecture audit по diff.

### 2.1 Решения владельца 22.08.2026 по развилкам исследования

| # | Решение владельца | Что это значит для работы |
| --- | --- | --- |
| `W1` | Отправлять, не fail-closed | Закрыто, см. §1.5 |
| `W2` | ⏳ ОТКРЫТО. Владелец: «как? тильда так не делает же?» — верно, Тильда просит только две A-записи и включает HTTPS кнопкой, шага подтверждения владения нет | См. §2.2 ниже |
| `W3` | **(а) НАШ поддомен.** «Ну давай, а, если это проще. Давай так. 1 - А» | Переписан §1.2; `B1`/`B7` перекроены, `B2` отложен |
| `W2` | **Снят вместе с чужими доменами.** Возвращается только вместе с отложенной опцией | — |
| `OG-4` | **ЗАКРЫТ: Яндекс НЕ трогаем.** Владелец: «не трогать яндекс, просто не паримся с именем которое они увидят» | Кнопка остаётся как сейчас, одна глобальная регистрация. Consent покажет имя платформы — принято осознанно |
| `W4` | **Не строить.** «Пока нет. Может не будет и Яндекса, нефиг пока на него тратить время» | Отдельная Yandex-регистрация на клинику не проектируется. Усиливает `OG-4` в сторону «убираем» |
| `W6` | **Принято:** снимаем СВОЮ запись по таймеру с уведомлением клинике; платформенный адрес работает всегда | Владелец отдельно уточнил границу: «доменом клиники мы не распоряжаемся никаким образом» — мы управляем только своей привязкой и своим сертификатом |
| `W7` | **Да**, разделять почтовую репутацию по клиникам | Локальная часть вида `klinika-17@наш-домен`, чтобы жалобы одной клиники не топили всех |
| `W8` | **Да**, но не как анти-фишинг | Неброская отметка «платформа Therapysto» внизу экрана входа. Владелец: «мелочь… дизайн потом задизайним». Обоснование — прозрачность (пациент видит, кто обрабатывает его данные), НЕ защита от фишинга: подделать её так же легко, как сам сайт |
| `W9` | **Да**, с уточнением владельца | HSTS включаем, но БЕЗ распространения на поддомены — «если они не нужны нам технически для чего-то с шифрованием». То есть распространение на поддомен допустимо только там, где поддомен наш и нам самим нужен под шифрование; на доменах клиник — никогда |

**Директива владельца 22.08.2026 по спорным техническим правилам, дословно: «надо так, как делают, а не как мы
придумали».** Относится к правилам из §9.3 отчёта-исследования (не переписывать `Host`, затирать входящие
`x-tenant-*`, CAA, висячий DNS). Эти правила берутся из документации площадок как есть и НЕ переизобретаются;
расхождение с практикой допускается только с явной записанной причиной.

## 3. Этапы реализации

Этапы выполняются последовательно. Перед каждым — перечитать позднейшие owner-регистры, актуальный `AGENTS.md` и
перемерить соответствующий путь на текущем `feat`.

### A — Identity и active docs (`TPB-01`, `02`, `03`, `04`, `09`, `15`)

> **ЧАСТИЧНО ЗАКРЫТО 22.08.2026 — подэтап `A0`, приземлён в `feat` как `9a9a31225`** (ветка
> `wt/therapysto-staff-rename-20260822`, коммит воркера `d8668e641`, бриф
> `docs/_TODO/runs/briefs/THERAPYSTO_STAFF_RENAME_BRIEF_2026-08-22.md`, строка вердикта — в
> `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`).
>
> Владелец 22.08 попросил вынести переименование ТОЛЬКО докторского приложения отдельным первым шагом,
> «не трогая пациентов, не трогая морду пациентов вообще». Сделано:
>
> - [x] `A0.1` Identity установленного приложения персонала → Therapysto: `staffPwaManifest.ts`
>   (`name`, `short_name`), `staffPwaLayoutMetadata.ts` (`appleWebApp.title`; было `BersonAdmin`).
> - [x] `A0.2` **Собственный заголовок вкладки для зон персонала** — прямое требование владельца («наши
>   собственные заголовки обязательно»). Корневой `layout.tsx` НЕ тронут.
> - [x] `A0.3` Staff-only видимый текст: боковое меню доктора/админа, fallback displayName докторской
>   оболочки, тема тестового SMTP-письма админа себе, тема приглашения ПЕРСОНАЛА
>   (`role: z.enum(['admin','doctor'])`), текст про passkey на странице аккаунта, две строки operator-alerts.
>
> **Доказательство (живой прогон ведущего на dev-сервере после приземления):** `/manifest-staff.webmanifest`
> отдаёт `"name":"Therapysto"`, `/manifest.webmanifest` отдаёт `"BersonCare — забота о твоём здоровье"` —
> то есть пациент не задет. Плюс `pnpm --filter webapp typecheck` exit 0 и vitest 4 файла / 8 тестов PASS.
>
> **Осознанно НЕ входило в `A0`** (остаётся в `A1`–`A4` ниже): корневые метаданные, приложение и меню
> пациента, лендинг и юридические страницы, подписи в письмах пациентам (этап C), passkey/TOTP issuer
> (исключены владельцем: «паскей отложим потом, они выключены»), typed product-surface config, правка
> активных документов. Промежуточное состояние «доктор видит Therapysto, пациент видит BersonCare» —
> ожидаемое, а не дефект.
>
> **Ограничение, записанное честно:** независимый адверсарный аудит перед приземлением НЕ запускался —
> прямая команда владельца приземлять плюс bounded строковый rename; живая проверка выполнена ПОСЛЕ
> landing, а не до.

- [ ] `A1` Ввести один typed product-surface config. Therapysto name фиксирован; staff origin использует текущий
  deploy seam; standard patient `name` и `origin` — обязательные deploy inputs без placeholder/default бренда.
- [x] `A2a` **Остаток после `A0`, часть «единый identity seam»:** root metadata и лендинг переведены на
  Therapysto через ОДИН identity value. Идентичность больше не объявляется на маршруте: таблица
  `apps/webapp/src/config/surfaceRoutes.ts` («путь запроса → поверхность») применяется в единственной точке —
  `generateMetadata` корневого `apps/webapp/src/app/layout.tsx` — сразу на metadata/manifest/icons и на видимое
  имя через тот же `PlatformProvider`; девять прежних `export const metadata = staffPwaLayoutMetadata` удалены.
  Доказательство: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/CORRECTION_STAGE_A_ROUND3_2026-08-22.md` —
  живой обход всех 149 маршрутов дерева на dev-сервере, 0 расхождений; проверка под тремя сессиями владельца;
  `PATIENT_APP_NAME=QA-Renamed` не переопределяет staff-имя (`QA-Renamed`×0 на staff-маршрутах).
- [ ] `A2b` **Остаток `A2`:** legal-страницы и остальной невыполненный периметр (patient mail становится
  brand-aware только в C; passkey/TOTP issuer исключены владельцем 22.08 и в этот пункт не возвращаются без
  его команды). Patient metadata берёт standard patient config.
- [ ] `A3` Повторить user-visible inventory точной командой на implementation SHA; заменить только runtime/product
  occurrences. npm/package/table/module/route identifiers и archive/audit history не трогать.
- [ ] `A4` В активных owner/contract/runbook docs заменить несовместимое platform-name/subdomain описание на
  `TPB-01…16`. Не добавлять параллельную сноску рядом со старым активным вариантом и не редактировать archive.

**Gate A:** targeted config/metadata/auth tests, webapp lint+typecheck для изменённой ветки; review показывает один
identity seam, а не набор getters.

> Metadata-тест части Gate A закрыт 22.08.2026: `apps/webapp/src/config/surfaceRoutes.unit.test.ts` берёт список
> маршрутов обходом реального `src/app/**` и краснеет, когда staff-маршрут отдаёт пациентскую идентичность.
> Проверен тремя инъекциями неисправности (убрать правило поддерева · объявить staff-поддерево пациентским ·
> добавить новый верхнеуровневый маршрут) — все три пойманы; см. `CORRECTION_STAGE_A_ROUND3_2026-08-22.md`.
> Остальные части Gate A (`auth tests`, полный `A2b`/`A3`/`A4`) остаются открытыми.

### Решение владельца 22.08.2026: общий вход `/app` на одном хосте не решаем; работа не приземляется

Аудит круга 2 поднял вопрос: как должен представляться общий вход `/app`, пока ОДИН хост обслуживает обе
поверхности и страница не знает, кто на неё пришёл. Владелец закрыл вопрос дословно: «предлагаю никак — я
сразу дам оба домена и мы переедем».

Следствия, обязательные для всех последующих кругов и брифов:

- **Отдельного решения для одно-хостового случая НЕ строится.** Ни эвристик по `intent`, ни угадывания роли,
  ни промежуточного «нейтрального» бренда на общих маршрутах. Поверхности разводит хост на этапе `B` —
  это и есть ответ.
- **Правки этапа `A`, которые заставляют staff-страницы объявлять Therapysto, остаются нужными** и после
  переезда: они гарантируют, что зона персонала не наследует пациентскую идентичность независимо от хоста.
  Это не временная подпорка под одно-хостовый случай.
- **Ведущий не сводит этапы в `feat`** — см. шапку файла. Этап `A` живёт на `wt/therapysto-stage-a-20260822`.
- Владелец берёт на себя оба домена (`therapysto.ru` уже делегирован, `therapygo.ru` — за ним).

### B — Единый surface/brand path (`TPB-05`, `07`, `08`, `09`, `11`, `14`, `16`)

- [ ] `B1` Резолвить организацию по метке поддомена нашего patient-домена через существующий slug-резолвер и
  approved DB seam; не из route/proxy напрямую. Неизвестная метка — hard 404.
- [ ] `B1a` Зарезервировать служебные метки (`www`, `app`, `api`, `mail`, `admin` и т.п.), чтобы slug клиники не
  мог их занять. Проверка — на записи slug, а не только на чтении.
- [ ] ~~`B2` unique index на `org_custom_domain_hostname`~~ — **перенесено в отложенную опцию собственного домена
  (§1.2)**. В базовом пути чужих доменов нет, дубль невозможен.
- [ ] `B3` Реализовать один `RequestSurfaceResolver` и подключить к существующему request choke point. Результат
  резолва переиспользуется routing, metadata/manifest и absolute links.
- [ ] `B4` Расширить существующий org branding service: optional patient app name и один accent token; anonymous
  branded projection отдаёт только published/entitled safe fields. Public card/contacts читаются через существующий
  clinic-public-card port.
- [ ] `B5` Переподключить root/login/recovery/clinic card/booking/patient cabinet к одному patient tree с разным
  resolved context. Therapysto home и therapist directory недостижимы на patient origins.
- [ ] `B6` Оставить cookies host-only и текущий CSRF request-origin seam; добавить только regression tests для
  нескольких Host. Unknown Host и cross-org попытки fail closed.
- [ ] `B7` Выпустить и продлевать один wildcard-сертификат на patient-домен; описать rollback. UI/lifecycle
  automation не строить. Ручная DNS/TLS-активация чужого домена — только в отложенной опции.

**Gate B:** host matrix tests (`staff`, `patient_default`, `patient_branded`, unknown), tenant-isolation fault
injection, targeted route/UI tests, migration dry-run DEV→TEST, lint+typecheck.

### C — OAuth и branded delivery (`TPB-10`, `12`, `13`, `16`)

- [ ] `C1` Добавить global standard-patient и per-org clinic Yandex config в `system_settings` с secret envelope,
  existing settings write service, entitlement/organization context и admin UI в существующей integrations section.
- [ ] `C2` Параметризовать существующий Yandex start/callback одним OAuth-config resolver по `ResolvedSurface`;
  signed state и exact callback allowlist исключают подмену host/org/provider.
- [ ] `C3` Провести все branded patient Telegram/MAX confirmation/recovery/security/notification intents через
  существующий dispatch port как `clinic_required`; удалить любой достижимый platform fallback для них.
- [ ] `C4` Расширить existing SMTP config только sender display data, добавить один org-scoped transactional template
  setting и один mail-profile resolver/renderer. Не трогать doctor broadcasts/mass mailing кроме сохранения текущего
  поведения.
- [ ] `C5` Добавить readiness check: branded domain не активируется, пока OAuth и обязательные branded channels не
  сконфигурированы. Неактивный branded hostname не ухудшает standard patient path.

**Gate C:** OAuth state/provider-selection tests; clinic-required dispatch fault injection; SMTP/template selection
tests; проверка, что секреты не попадают в public runtime projection/logs; lint+typecheck.

### D — включение BersonCare первым арендатором: только настройки, без кода (`TPB-05`, `06`, `10`, `11`, `12`, `13`)

Этап не пишет код. Он **включает** BersonCare тем механизмом, который построили A–C, и тем самым проверяет сам
механизм: если для включения пришлось дописать код — механизм сделан неправильно, чинить надо его, а не
подпирать заплаткой. BersonCare здесь — собственный продукт в роли первого арендатора: проходим ровно тот путь,
которым потом пойдут чужие клиники.

- [ ] `D1` Через существующие settings/branding flows опубликовать BersonCare brand, custom hostname, Yandex app,
  Telegram/MAX bots, SMTP/sender/templates. Product code не получает `if BersonCare`.
- [ ] `D2` Выполнить operator DNS/TLS/proxy binding и smoke полного patient journey: branded root → OAuth/login →
  recovery → card/booking → cabinet → bot/email notification.
- [ ] `D3` Проверить standard patient domain тем же journey и Therapysto staff login отдельно; ни одна identity не
  протекает в другую.

- [ ] `C5` **`W5` ЗАКРЫТ владельцем 22.08.2026: минимальный мониторинг входит в объём.** Владелец: «про опасное
  состояние согласен, да, нужны будут проверки». Ежедневно: резолвится ли домен клиники туда, куда должен, и
  сколько дней осталось до истечения сертификата. Отказ — сигнал оператору. Причина: это тот же класс молчащего
  отказа, что уже подводил с email/SMS; наружные уведомления об истечении сертификата отменены в июне 2025, и
  предупредить нас некому.

**Gate D:** runtime evidence на TEST. PROD/deploy/push не входят в текущее поручение и требуют отдельной команды
владельца.

### F — Политика входа по поверхностям (`TPB-17`, `18`, `19`)

Исполняется после A (есть typed product-surface config) и до D/runtime activation.

- [ ] `F1` Расширить резолвер поверхности типизированной auth policy: набор допустимых способов входа — свойство
  поверхности, а не глобальная настройка. Staff-поверхность объявляет OAuth недопустимым на уровне типа.
- [ ] `F2` Выключить OAuth-вход на staff/admin surface значением в матрице механик. Ничего не удалять: UI,
  start/callback и provider config остаются в коде, но при выключенной механике путь недоступен на уровне
  резолвера, а не только скрыт в UI. Включение настройкой возвращает его в строй без правки кода.
- [ ] `F2b` Passkey НЕ удалять. Подключить его к матрице механик как переключаемую опцию, по умолчанию
  выключенную у докторов. Код и маршруты сохраняются; выключённая механика недоступна на входе, но включается
  настройкой без правки кода. PIN заново не вводить (вырезан 04.08.2026).
- [ ] `F2c` Второй фактор докторского входа по умолчанию: код на email ИЛИ TOTP. Один общий выбор фактора, не два
  независимых пути входа.
- [ ] `F3` Свести patient-вход к email и телефону с подтверждением через бота на обеих patient-поверхностях,
  переиспользуя существующие pre-session seams канонических контактов; второго пути входа не создавать.
- [ ] `F4` Заменить единственный global-admin переключатель входа на per-surface политику; миграция существующего
  значения детерминирована и не включает OAuth там, где его быть не должно.
- [ ] `F5` Яндекс у пациентов остаётся включённым как есть (`OG-4` закрыт). Отдельных регистраций на клинику не
  заводить (`W4`). Ничего не вырезать — только значения переключателей.

**Gate F:** targeted auth/settings tests, fault injection «staff + OAuth» отвечает отказом, lint+typecheck.

### E — Финальная приёмка (`TPB-01…19`)

- [ ] `E1` Закрыть каждый checkbox §2 только его бинарным evidence; синхронизировать активные docs и runbook.
- [ ] `E2` На implementation-ветке перед landing выполнить relevant tests, lint и typecheck. Full CI — только по
  действующему §9 `AGENTS.md`, не как автоматический ритуал этапа.
- [ ] `E3` Независимый аудитор проверяет owner checklist и достижимые regression/security сценарии. Finding вне
  `TPB-01…16` — owner question, а не самовольное расширение scope.
- [ ] `E4` После PASS приземлять только штатным orchestration flow. Миграционный dry-run должен быть уже зелёным;
  временные базы/fixtures не создаются.

## 4. Что сознательно не делаем

- второй `webapp`, отдельную BersonCare папку, product fork или копию route tree;
- `staff.therapysto.ru`/`patient.therapysto.ru`;
- generic hostname-binding/domain lifecycle table;
- self-service DNS/TLS, SEO automation, domain marketplace;
- cross-domain SSO, passkey expansion, native branded apps;
- новый dispatch engine, новый public clinic profile, второй brand store;
- arbitrary theme builder или общий CMS шаблонов;
- mass mailing и SMS-provider work;
- технический mass rename и переписывание истории.

## 5. Единственные owner inputs

1. ~~имя стандартного patient-приложения~~ — **ЗАКРЫТ 22.08.2026: `Therapygo`** (производное от домена).
2. ~~его полный основной домен~~ — **ЗАКРЫТ 22.08.2026 владельцем: `therapygo.ru`.** Выбран из вариантов
   `Therapysto.app` / `Therapygo.ru` / `Therapygo.app`. Staff-поверхность — `therapysto.ru`.
3. ~~полный домен BersonCare~~ — **ЗАКРЫТ следствием `W3`:** BersonCare как первый арендатор живёт на
   `bersoncare.therapygo.ru` по общему правилу §1.2; отдельного домена ему не требуется. Существующий
   `bersoncare.ru` при желании владельца становится redirect'ом, но это операторская настройка, не код.
4. ~~`OG-4` — Яндекс у пациентов~~ — **ЗАКРЫТ 22.08.2026: остаётся как есть.**

**Все owner inputs закрыты.** Этапы A–D больше не ждут решений владельца.

Остальные развилки первой редакции закрыты технически: domain edit остаётся owner-only; active docs исправляются
на месте; standard и branded identity получают отдельные Yandex app registrations; новая domain table не нужна.
