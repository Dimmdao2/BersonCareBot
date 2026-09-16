# Витрина клиники и визитки специалистов внутри неё — мировая практика и наш код

**Дата:** 2026-08-19. **Ветка:** `wt/showcase-practice-20260819`.
**Это исследование, не план.** Ничего не строится, таблицы не проектируются, миграции не предлагаются.

**Оракул:** `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §33.6 — решение владельца 19.08 («визитка есть всегда,
выключателя нет») и его же открытый блок про визитки специалистов:

> «логично, что визитка есть только у клиники, но у специалиста в клинике есть свои, как вложенные визитки с
> описанием, и клиника может их показывать… человек, который заходит на страницу записи, должен видеть описание
> специалиста, его фотографию, что про него написано»

> «не должно быть такого, что доктор, который не является админом, определяет, что будут видеть посетители
> клиники — это не его ответственность»

**Разделение труда** — §32 `OWNER_PRODUCT_RULES.md`: ЧТО и КАК СЕБЯ ВЕДЁТ берётся из мировой практики со
ссылкой; КАК реализовать — наше; выбор между равноценными вариантами — владельца. Ниже по каждому вопросу:
первоисточники → замер нашего кода (`file:line`) → одна рекомендация.

**Замеры по DEV** сделаны на `bcb_webapp_dev` (`sudo -u postgres psql -d bcb_webapp_dev`), команды приведены
дословно в §7.

---

## 1. Закрывается ли витрина арендатора вообще

### Мировая практика

**Booksy.** Профиль — это и есть публичная страница бизнеса, отдельного выключателя у неё нет; выключатель
существует у **выдачи в маркетплейсе**, а не у страницы:

> «Your Booksy profile is your public business page. It shows your services, prices, availability, reviews,
> and booking button in one place» — [Booksy Profile](https://biz.booksy.com/en-us/features/booksy-profile)

> «You can turn marketplace visibility off and still use Booksy for booking and management» (FAQ «Can I use
> Booksy without being visible in the marketplace?») — [Booksy Marketplace](https://biz.booksy.com/features/marketplace)

То есть площадка различает **две разные вещи**: (а) существование публичной страницы с кнопкой записи — она
есть всегда и выключателя не имеет; (б) попадание этой страницы в каталог/поиск площадки — вот это
переключается. Там же прямо сказано, зачем страница нужна и без сайта: «Establish your professional online
presence and build trust in minutes. No website necessary», «Profiles are structured to support discovery on
Booksy and visibility in Google search».

**Fresha.** Публичный профиль — обязательный шаг онбординга, отдельный раздел справки называется
[«Create your online profile»](https://www.fresha.com/help-center/knowledge-base/online-profile/194-create-your-online-profile);
профиль одновременно и страница в маркетплейсе, и источник кнопки записи на своём сайте
([«Add a book button to your website»](https://www.fresha.com/help-center/knowledge-base/online-profile/152-add-a-book-button-to-your-website)).
Выключателя «страницы нет» в справке нет — есть настройки того, что на ней показано и что доступно к записи
([«Manage online bookings settings»](https://www.fresha.com/help-center/knowledge-base/calendar/257-manage-online-bookings-settings)).

**Что продаётся платно.** У всей категории платным расширением идёт не «наличие страницы», а брендинг и адрес:
собственный домен, снятие упоминаний площадки, свои цвета/CSS. У SimplyBook.me это буквально отдельная статья
[«Link removal and custom domain»](https://help.simplybook.me/index.php/Link_removal_and_custom_domain), а
white-label тарифы описаны отдельно
([SimplyBook.me White Label](https://simplybook.me/en/white-label-partner-program)); у Trafft
([White Label Booking Software](https://trafft.com/white-label-booking-software/)) — «remove Trafft branding
and add your logo, colors, fonts, URL and SMTP»; у Cal.com то же самое собрано в обзоре
[white-label scheduling](https://cal.com/blog/white-label-scheduling-software). Бесплатный/базовый тариф
получает страницу на домене площадки, платный — свой домен и снятие брендинга.

**Про 404.** Публичного описания того, что отдаётся по адресу «выключенного» профиля, у Booksy/Fresha в
справке нет — потому что в их модели такого состояния не существует: выключается листинг, адрес живёт.
Отдельно замечу: у нас 404 на выключенной карточке — не косметика, а сознательное решение из
`docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §3.3 (одинаковый 404 на «нет такой», «не
опубликована», «выключена» — чтобы аноним не перечислял клиники по форме ответа).

### Что у нас

Решение владельца §33.6 уже совпадает с практикой: визитка есть всегда, выключателя нет. Код за ним ещё не
пошёл — в проекции живут **два** флага:

- `apps/webapp/db/schema/clinicDirectory.ts:56` — `cardIsPublished: boolean(...).default(false)`, то есть по
  умолчанию карточка **выключена**;
- `apps/webapp/db/schema/clinicDirectory.ts:31` — `isPublished` (публикация самой организации в каталоге);
- `apps/webapp/src/app/[clinicSlug]/page.tsx:33-38` — оба состояния и «нет такой клиники» отдают один `notFound()`.

Замер DEV: `directory_rows=3`, `is_published=2`, **`card_is_published=0`**, `card_with_description=0`. То есть
сегодня публичной визитки нет ни у одной клиники на DEV — ровно тот разрыв, который §33.6 закрывает.

### Рекомендация

Оставить ровно один публичный переключатель — тот, что уже есть у организации (`is_published`, «клиника
существует публично»), и убрать `card_is_published` вместе с его веткой отказа, как и предписывает §33.6.
Обоснование из практики, а не из вкуса: у Booksy и Fresha переключается **обнаружимость** (листинг/каталог),
а не существование адреса; страница с кнопкой записи — это то, ради чего клиника приходит на площадку, и
делать её опциональной значит продавать продукт, который по умолчанию не работает. Платным расширением, когда
до него дойдёт очередь, по практике становится собственный домен и снятие брендинга, а не сама витрина.

---

## 2. Профили специалистов внутри организации

### Мировая практика

Категория пришла к **вложенной странице специалиста, которая при этом индексируется отдельно**.

**Fresha, апрель 2026** — самый свежий и самый прямой источник:

> «Each professional will get their own profile and unique handle or username just like Instagram, Tiktok, or
> Linkedin»

> «Clients can explore and select their preferred professional during the booking process, compare team
> members directly from venue pages, and revisit profiles within appointment details ahead of their visit»

— [Fresha, Searchable Professional Profiles](https://www.fresha.com/blog/searchable-professional-profiles),
пресс-релиз: [PR Newswire, 16.04.2026](https://www.prnewswire.co.uk/news-releases/fresha-launches-searchable-professional-profiles-redefining-discovery-in-beauty-and-wellness-across-the-global-selfcare-economy-302744959.html).
Профиль несёт «ratings, verified client reviews, services offered, real-time availability, images, bios,
languages spoken, qualifications, and areas of expertise», и по специалистам теперь можно **искать** отдельно
(«consumers can now search by professionals such as stylists, barber, therapist, technicians»).

**Doctolib** разводит два уровня явно: профиль практикующего и **fiche centre** — профиль центра, который
«позволяет собрать всех практикующих одного места, центра или отделения в один профиль»
([Gérer ma fiche centre](https://doctolib.zendesk.com/hc/fr/articles/4409758006292-G%C3%A9rer-ma-fiche-centre)).
Профиль врача при этом самостоятельный и SEO-значимый: текст презентации «улучшает вашу видимость и
онлайн-ранжирование на doctolib.fr»
([Compléter le texte de présentation](https://doctolib.zendesk.com/hc/fr/articles/360058991132-Compl%C3%A9ter-le-texte-de-pr%C3%A9sentation-du-profil-Doctolib)).

**Zocdoc** — крайний полюс: канонической публичной единицей является **врач**, а не практика; карточка врача
живёт по своему адресу и подчиняется отдельным
[profile guidelines](https://www.zocdoc.com/provider-help/en/articles/9613181-profile-guidelines).

**YClients** (наш рынок) держит описание специалиста прямо в виджете записи: «Описание отображается в виджете
онлайн-записи при нажатии на кнопку „i“ рядом с фото сотрудника» и содержит «информацию о профессиональном
опыте, образовании, услугах, которые сотрудник оказывает»
([Настройки сотрудника](https://support.yclients.com/5-8-238--nastrojki-sotrudnika/)). Отдельной публичной
страницы специалиста у YClients нет — только карточка внутри виджета.

**Итог по практике:** «вложенная визитка» (формулировка владельца) — это ровно то, к чему пришли все четверо;
разница только в том, получает ли она вдобавок собственный адрес и индексацию (Fresha, Doctolib, Zocdoc — да;
YClients — нет).

### Что у нас

- Поле под описание **уже есть**: `apps/webapp/db/schema/bookingEngine.ts:190` — `description: text()` в
  `be_specialists`.
- Фотографии специалиста **нет нигде**: в `be_specialists` (`bookingEngine.ts:184-215`) медиа-колонок нет,
  а `photoMediaIds` живёт только у карточки клиники (`clinicDirectory.ts:55`).
- Публичная витрина клиники специалистов **не показывает**: `apps/webapp/src/app/[clinicSlug]/page.tsx:46-158`
  рендерит логотип, название, описание, фото клиники, адреса и контакты — секции специалистов нет вовсе.
- Это не упущение, а действующее ограничение: в слепом kill-set к предыдущей работе пункт K9 «на странице ФИО
  специалистов (specialists_json)» стоит как **признак провала**
  (`docs/_TODO/CLINIC_PUBLIC_PAGE_AUDIT_2026-08-19.md`, раздел B).

Замер DEV: `specialists_total=8`, `specialists_active=7`, **`specialists_with_description=2`**.

### Рекомендация

Вложенная визитка, как и сказал владелец: специалист виден **внутри** страницы клиники и на шаге записи, без
собственного публичного адреса на этом шаге. Обоснование: отдельный адрес специалиста в мировой практике
появляется вместе с **маркетплейсом** — Fresha и Zocdoc дают специалисту свой handle именно потому, что
торгуют поиском по специалистам, а Doctolib — потому что во Франции пациент ищет врача, а не клинику. У нас
маркетплейса нет, а §33.6 прямо говорит «визитка есть только у клиники». Отдельный адрес — обратимое
расширение поверх той же записи, и его стоит откладывать до появления каталога, а не строить впрок.

Фотография специалиста, которую владелец назвал прямо, сегодня хранить негде — это факт, а не задача: он
относится к реализации и решается тем же механизмом, что уже несёт фото клиники.

---

## 3. Кто редактирует описание специалиста — ключевой вопрос

### Мировая практика: три модели, и они делятся по типу площадки

**Модель A — пишет организация (все «бизнес-первые» площадки записи).**

- Booksy: карточка сотрудника заводится владельцем/менеджером при добавлении — «you can add details such as
  their name, picture, contact information, and position»
  ([How do I add a staff member?](https://support.booksy.com/hc/en-us/articles/16536054878354-How-do-I-add-a-staff-member));
  права разграничены так, что «Managers cannot edit the Owner's profile»
  ([How do I manage staff permissions?](https://support.booksy.com/hc/en-us/articles/16535688940946-How-do-I-manage-staff-permissions)).
- Fresha: профиль правится из рабочего пространства бизнеса — «go to Team and select Team members… select the
  team member to open their profile, then click on Actions and select Edit»
  ([Update team member account details](https://www.fresha.com/help-center/knowledge-base/team/102947-update-team-member-account-details)),
  а объём прав задаётся уровнем доступа сотрудника в рабочем пространстве
  ([workspace access level](https://www.fresha.com/help-center/knowledge-base/team/583-update-team-member-details-workspace-access-level)).
  «Once updated, the team member's profile photo and job title will be visible to clients when booking online.»
- SimplyBook.me: описание провайдера — в админке бизнеса, «Manage → Services/Service Providers → Service
  provider details tab»
  ([Adding services, providers and availability](https://help.simplybook.me/index.php/Adding_services,_providers_and_availability(new_interface))).
- YClients: карточка сотрудника с фото и описанием — раздел настроек филиала
  ([Настройки сотрудника](https://support.yclients.com/5-8-238--nastrojki-sotrudnika/)).
- Mindbody: публичные биографии хранятся в профиле сотрудника на сайте бизнеса, и права на редактирование
  раздаются группами разрешений
  ([Staff Permissions — Settings](https://support.mindbodyonline.com/s/article/Staff-Permissions-Settings?language=en_US)).

**Модель B — пишет сам специалист (площадки, где публичная единица — человек).**
Doctolib: «изменение профиля Doctolib возможно только из аккаунта самого практикующего»
([Compléter ou modifier mon profil Doctolib](https://doctolib.zendesk.com/hc/fr/articles/203156979-Compl%C3%A9ter-ou-modifier-mon-profil-Doctolib)),
при этом **fiche centre** — профиль организации — правит администратор:
«чтобы попасть в профиль центра, вы должны быть администратором учреждения»
([Gérer ma fiche centre](https://doctolib.zendesk.com/hc/fr/articles/4409758006292-G%C3%A9rer-ma-fiche-centre)).
Границы не размыты: человек ведёт своё, организация — своё.

**Модель C — пишет кто-то, а площадка модерирует.**
Zocdoc: право на правку профилей врача несёт роль уровня практики — «Users with „practice settings"
permissions have access to the Providers, Practice, Profile Edit… pages», и выдавать её рекомендуют «practice
manager or operational leadership»
([What user permissions are available in Zocdoc?](https://www.zocdoc.com/provider-help/en/articles/9216385-what-user-permissions-are-available-in-zocdoc));
сверху лежат обязательные
[profile guidelines](https://www.zocdoc.com/provider-help/en/articles/9613181-profile-guidelines).

**Вывод из практики, а не из вкуса:** право на публичный текст следует за тем, **чья это страница**. Там, где
публичная единица — бизнес (Booksy, Fresha, YClients, SimplyBook.me, Mindbody), описание сотрудника ведёт
организация. Там, где публичная единица — человек (Doctolib, Zocdoc), человек ведёт своё, а организация —
своё. Модели «сотрудник пишет, админ утверждает» как отдельного массового паттерна в справках этих площадок
**нет** — очередь на модерацию появляется у площадки к самой себе (Zocdoc), а не внутри клиники.

### Что у нас

Ограничение владельца уже выполнено кодом — и выполнено ровно так, как в модели A:

- Единственный вход на запись описания — `apps/webapp/src/app/api/admin/booking-engine/specialists/route.ts:22`
  (POST) и `apps/webapp/src/app/api/admin/booking-engine/specialists/[id]/route.ts:15` (PATCH, поле
  `description`).
- Оба висят на `requireClinicManagementBookingEngine()`
  (`apps/webapp/src/app/api/admin/booking-engine/_requireClinicManagementBookingEngine.ts:23`), который зовёт
  `requireClinicManagementApiContext()` (`apps/webapp/src/app-layer/guards/requireRole.ts:790`), а тот требует
  capability `organization.management` (`requireRole.ts:813`).
- Capability выдаётся только `owner`/`admin`: `apps/webapp/src/app-layer/guards/workspaceCapabilities.ts:59-64`
  — `membershipRole === 'owner' || membershipRole === 'admin'`.
- **Отдельного «своего» входа у доктора нет.** Под `apps/webapp/src/app/api/doctor/` нет ни одного маршрута,
  пишущего `be_specialists.description`; личные настройки доктора ограничены `account/doctor-screens`,
  `account/timezone`, `account/email`.
- **Редактора в кабинете тоже нет:** `grep -rn "admin/booking-engine/specialists" apps/webapp/src` не находит
  ни одного вызова из UI. Поле есть, API есть, экрана нет — вот почему на DEV заполнено 2 из 8.

### Рекомендация

Оставить как есть — описание и фотографию специалиста ведёт админ клиники, отдельного «своего» входа доктору
не давать. Это и решение владельца, и модель A мировой практики, и уже написанный код: менять нечего, надо
только дать этому полю экран в кабинете админа. Модель «доктор пишет, админ утверждает» не брать: у неё нет
опоры в практике площадок записи, она добавляет состояние (черновик/на модерации/опубликовано) и очередь, за
которой кто-то должен ходить, — цена, которую ни одна из пяти изученных площадок не платит.

---

## 4. Один человек в двух ролях

### Мировая практика

Практика однозначна: **один аккаунт, несколько привязок**, а не второй аккаунт.

- **Fresha Workspaces** (апрель 2026): «Fresha Workspaces, enabling professionals to operate seamlessly across
  multiple locations… allow therapists, stylists, and practitioners to work across different venues — for
  example, operating from one location in the morning and another in the evening — all managed through a
  single, unified platform»
  ([пресс-релиз](https://www.prnewswire.co.uk/news-releases/fresha-launches-searchable-professional-profiles-redefining-discovery-in-beauty-and-wellness-across-the-global-selfcare-economy-302744959.html)).
  Плюс тем же релизом — «unique handle» у профессионала, то есть личность человека отвязана от площадки одного
  салона.
- **Doctolib**: отдельная статья справки называется буквально «Настройка мест и расписания, когда практикуешь
  в нескольких учреждениях»
  ([Configurer ses lieux et son agenda lorsqu'on exerce dans plusieurs établissements](https://doctolib.zendesk.com/hc/fr/articles/360044946192-Configurer-ses-lieux-et-son-agenda-lorsqu-on-exerce-dans-plusieurs-%C3%A9tablissements))
  — один профиль врача, несколько мест приёма, включая частный кабинет.

Второго аккаунта не заводит никто: он ломает и запись (два разных «человека» для клиента), и расписание (две
календарные сущности, которые не видят пересечений).

### Что у нас

Модель данных **уже допускает** несколько организаций, а рантайм — **нет**:

- `apps/webapp/db/schema/bookingEngine.ts:263` — уникальность `uq_be_organization_members_org_user` стоит на
  паре (organization, user), то есть один пользователь может состоять в нескольких организациях по построению.
- Но `apps/webapp/src/modules/organization-membership/service.ts:68-70`:
  `if (memberships.length > 1) throw new Error('multiple_active_staff_memberships')`.
- Список приходит из `app.resolve_staff_workspace_memberships(uuid)`
  (`apps/webapp/src/infra/repos/pgOrganizationMembership.ts:165`), который фильтрует `status = 'active'`
  (проверено `\sf` на DEV).
- Значит: **два ACTIVE-членства сегодня валят каждую staff-поверхность исключением** — не отказ, а падение.
- Регистрация независимого специалиста создаёт ему собственную организацию:
  `apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts:169` → `app.provision_specialist_owner()`
  возвращает `organization_id` + `specialist_id` + `membership_id`. То есть «специалист сам по себе» у нас —
  это уже клиника из одного человека, и он неизбежно упирается в тот же запрет, когда его зовут работать в
  чужую клинику.
- Описание специалиста живёт **в организации**, а не у человека: `be_specialists.organization_id`
  (`bookingEngine.ts:188`). Один человек в двух клиниках = две строки `be_specialists` = два независимых
  описания.

Замер DEV: `users_in_more_than_one_org=3`, но **`users_in_more_than_one_org_active=0`** — во всех трёх случаях
второе членство переведено в `disabled`, иначе бы кабинет не открылся. Раскладка:

```
00000000-…-0002 | doctor/disabled | doctor/active
00000000-…-0004 | owner/disabled  | owner/active
d0000000-…-0007 | doctor/disabled | doctor/active
```

Побочно замечено (не задача, выношу как факт): у `d0000000-…-0007` оба членства, включая **чужой** организации
`a0000000-…-0001`, ссылаются на один `specialist_id = e1000000-…-0002`, который принадлежит организации
`d0000000-…-0004`. Строка disabled и в рантайм не попадает, но FK `be_organization_members.specialist_id →
be_specialists.id` межарендаторную привязку не запрещает.

### Рекомендация

Один аккаунт с несколькими членствами и явным переключателем контекста — как Fresha Workspaces и Doctolib;
второй аккаунт не заводить. Обоснование: второго аккаунта нет ни у одной изученной площадки, а у нас он вдобавок
раздвоил бы человека в записи и в расписании. Ближайший честный шаг — не «поддержать мультиклиничность», а
превратить `throw new Error('multiple_active_staff_memberships')` в осознанный выбор организации: сегодня это
не ограничение, а падение, и оно наступит в первый же день, когда владелец пригласит независимого специалиста
в клинику.

Описание при этом остаётся **пер-организационным** (у нас так уже устроено), и это совпадает с моделью A из
§3: текст, который клиника показывает своим посетителям, принадлежит клинике. Человек, работающий в двух
местах, имеет два описания — это не дефект, а следствие того, чья это страница.

---

## 5. Что видно на странице записи до выбора времени

### Мировая практика

Специалист с фото и описанием показывается **до** выбора времени везде:

- **Fresha**: «Clients can explore and select their preferred professional during the booking process, compare
  team members directly from venue pages»
  ([Searchable Professional Profiles](https://www.fresha.com/blog/searchable-professional-profiles));
  «the team member's profile photo and job title will be visible to clients when booking online»
  ([Update team member account details](https://www.fresha.com/help-center/knowledge-base/team/102947-update-team-member-account-details)).
- **YClients**: шаг выбора сотрудника — штатный шаг виджета, описание раскрывается по «i» рядом с фото
  ([Настройки сотрудника](https://support.yclients.com/5-8-238--nastrojki-sotrudnika/),
  [Настройка онлайн-записи для сотрудника](https://support.yclients.com/5-8-676--nastrojka-onlajn-zapisi-dlya-sotrudnika/)).
- **Booksy**: профиль несёт услуги, цены, доступность, портфолио и отзывы в одном месте, до кнопки записи
  ([Booksy Profile](https://biz.booksy.com/en-us/features/booksy-profile)).
- **SimplyBook.me**: у провайдера штатные поля фото и описания, показываемые на странице записи
  ([Adding services, providers and availability](https://help.simplybook.me/index.php/Adding_services,_providers_and_availability(new_interface))).

**Публичные разборы влияния на конверсию — честно о качестве доказательств.** Рецензируемое исследование ровно
про механизм есть одно: *«The Influence of Physician Information on Patients' Choice of Physician in mHealth
Services Using China's Chunyu Doctor App: Eye-Tracking and Questionnaire Study»*, **JMIR mHealth and uHealth,
2019** (айтрекинг, 42 участника + опрос, 254 валидных ответа, PLS-SEM):
[PMC6913723](https://pmc.ncbi.nlm.nih.gov/articles/PMC6913723/). Вывод: фотография врача влияет на выбор через
**аффективное доверие**, остальная информация профиля — через **когнитивное**, и аффективное доверие даёт более
сильный эффект на итоговый выбор. Это исследование про выбор врача в мобильном сервисе, а не A/B-тест виджета
записи — оно объясняет механизм, но не даёт процента прироста.

Всё остальное, что находится по запросу «staff photos conversion», — **вендорские и маркетинговые материалы**
без публикуемой методики: например, «92% of patients read a provider's bio before booking» и «doctors with
profile photos get viewed twice as often»
([Healthgrades Partner Solutions](https://b2b.healthgrades.com/insights/blog/turn-clicks-into-appointments-5-ways-to-strengthen-your-doctor-profile/),
[Aha Media Group](https://ahamediagroup.com/blog/study-how-patients-choose-doctors/)). Цифры цитирую с этой
пометкой: **опубликованного независимого A/B-разбора «показали специалистов на шаге записи → конверсия выросла
на N%» я не нашёл**, и подавать вендорские проценты как доказательство не буду.

### Что у нас

Публичная воронка **не знает о специалисте вообще** — ни имени, ни описания, ни фото:

- Каталог для анонима (`app.read_public_booking_catalog`) возвращает `branches`, `branch`, `services`,
  `service` и больше ничего:
  `apps/webapp/db/drizzle-migrations/0047_the_public_funnel_had_no_door_of_its_own.sql:282-288`. Специалист в
  этой функции используется только как **фильтр** («услуга показывается, если её кто-то из активных
  специалистов оказывает», строки 234-241).
- Слоты (`app.read_public_booking_slots`) выбирают специалиста **за посетителя, произвольно**:
  `ORDER BY availability.created_at DESC, availability.id DESC LIMIT 1` (строка 390) — то есть кто последним
  заведён в доступность, тот и принимает.
- В ответ уезжает `specialistId` как техническое поле контекста (строка 514), но ни `full_name`, ни
  `description` анонимной странице не отдаются.
- API слотов вообще не принимает специалиста как параметр:
  `apps/webapp/src/app/api/booking/public/slots/route.ts:31-38` — только `orgSlug`, `branchId`, `serviceId`,
  `date`, `slotCount`.
- Витрина клиники специалистов тоже не показывает (`apps/webapp/src/app/[clinicSlug]/page.tsx:46-158`).

Разрыв на языке §«Как решать, что делать» п. 1: **человек, который заходит на страницу записи, не получает
того, ради чего он выбирает клинику — он не видит, к кому идёт, и не выбирает его.** Владелец сформулировал
это дословно, и это же говорит вся практика.

### Рекомендация

Показывать специалиста на шаге записи — с фото, описанием и возможностью выбрать его, — и оставлять при этом
вариант «любой свободный», как в виджетах YClients и Fresha. Приоритет ставлю выше отдельной публичной страницы
специалиста (§2): страница записи — это место, где человек принимает решение, и сегодня там дырка не
косметическая, а смысловая (специалист назначается произвольным `LIMIT 1`). Обоснование выбора «показать» —
не проценты конверсии, которых в открытом виде нет, а единогласие практики плюс механизм из JMIR-исследования:
фотография работает через аффективное доверие, текст — через когнитивное, и оба нужны там, где выбирают
человека, а не товар.

---

## 6. Что остаётся решением владельца

Мировой практикой это не определяется — это выбор между равноценными вариантами с разной ценой:

1. **Получает ли специалист собственный публичный адрес** (`/{clinic}/{specialist}` или свой handle), или
   остаётся только вложенной карточкой. Практика делает и так и так; развилка определяется тем, будет ли у нас
   каталог/маркетплейс с поиском по специалистам. §33.6 сейчас говорит «визитка только у клиники» — если это
   решение окончательное, вопрос закрыт; если это про сегодня, его стоит переформулировать.
2. **Виден ли специалист, к которому нельзя записаться онлайн** (принимает только по звонку, или временно не
   ведёт приём). У YClients показ сотрудника в онлайн-записи — отдельный ползунок; вопрос, нужен ли он нам, —
   продуктовый.
3. **Что происходит с описанием, когда человек уходит из клиники.** Текст писал админ клиники (модель A),
   значит остаётся клинике; но если тот же человек работает во второй клинике, у него там своё описание.
   Явного правила ни у кого в справке нет — это решение владельца.
4. **Даём ли мы независимому специалисту, которого пригласили в клинику, переключатель контекста** (Fresha
   Workspaces) или ограничиваем одним рабочим местом. Это про то, кого мы продаём: одиночек, клиники или обоих.
5. **Показывать ли рейтинги и отзывы** в карточке специалиста. У Fresha/Booksy/Zocdoc это половина ценности
   профиля; у нас отзывов нет вообще, и заводить ли их — приоритет владельца, а не следствие этой работы.

---

## 7. Команды замеров (чтобы число можно было перепроверить)

```bash
sudo -u postgres psql -d bcb_webapp_dev -At -c "
select 'specialists_total='||count(*) from be_specialists;
select 'specialists_active='||count(*) from be_specialists where is_active;
select 'specialists_with_description='||count(*) from be_specialists
  where description is not null and btrim(description) <> '';
select 'orgs_total='||count(*) from be_organizations;
select 'members_total='||count(*) from be_organization_members;
select 'users_with_membership='||count(distinct platform_user_id) from be_organization_members;
select 'users_in_more_than_one_org='||count(*) from (
  select platform_user_id from be_organization_members group by 1
  having count(distinct organization_id)>1) t;
select 'users_in_more_than_one_org_active='||count(*) from (
  select platform_user_id from be_organization_members where status='active' group by 1
  having count(distinct organization_id)>1) t;
select 'members_bound_to_specialist='||count(*) from be_organization_members where specialist_id is not null;
select 'specialists_without_member='||count(*) from be_specialists s
  where not exists (select 1 from be_organization_members m where m.specialist_id=s.id);"
```

Результат на 2026-08-19:

| метрика | значение |
| --- | --- |
| `specialists_total` | 8 |
| `specialists_active` | 7 |
| `specialists_with_description` | **2** |
| `orgs_total` | 4 |
| `members_total` | 10 |
| `users_with_membership` | 7 |
| `users_in_more_than_one_org` | 3 |
| `users_in_more_than_one_org_active` | **0** |
| `members_bound_to_specialist` | 7 |
| `specialists_without_member` | 3 |

Карточки клиник:

```bash
sudo -u postgres psql -d bcb_webapp_dev -At -c "
select 'directory_rows='||count(*) from clinic_public_directory_entries;
select 'is_published='||count(*) from clinic_public_directory_entries where is_published;
select 'card_is_published='||count(*) from clinic_public_directory_entries where card_is_published;
select 'card_with_description='||count(*) from clinic_public_directory_entries
  where description is not null and btrim(description)<>'';"
```

`directory_rows=3`, `is_published=2`, `card_is_published=0`, `card_with_description=0`.

Проверка фильтра активных членств:

```bash
sudo -u postgres psql -d bcb_webapp_dev -At -c "\sf app.resolve_staff_workspace_memberships"
# … WHERE membership.platform_user_id = p_platform_user_id AND membership.status = 'active' …
```

---

## НЕ СДЕЛАНО

- **Справки Booksy (`support.booksy.com`), Zocdoc (`zocdoc.com/provider-help`) и Doctolib
  (`doctolib.zendesk.com`) отдают WebFetch HTTP 403.** Цитаты из этих трёх источников взяты из выдачи
  поисковика по адресам их статей, а не из прочитанной мной страницы. Ссылки приведены, но дословность цитат
  ниже уровня остальных: если по этим трём пунктам будет приниматься решение, страницы стоит открыть глазами.
  Полностью прочитаны и процитированы напрямую: Fresha (блог + пресс-релиз PR Newswire), Booksy `biz.booksy.com`
  (Profile, Marketplace), SimplyBook.me help, JMIR-исследование.
- **Справка YClients и Fresha help-center рендерятся JS** — из них получены только заголовки и то, что попало в
  поисковую выдачу; про шаг выбора сотрудника в YClients (`32-34-825`) полный текст статьи прочитать не удалось.
- **Опубликованного A/B-разбора влияния карточек специалистов на конверсию записи не найдено.** Найденное —
  либо рецензируемое исследование про механизм выбора врача (JMIR, не про виджет записи), либо вендорские
  проценты без методики. В §5 это помечено явно; выдавать вендорские цифры за доказательство не стал.
- **Практику Mindbody и Zenoti разобрал поверхностно** (Mindbody — по одной статье о правах, Zenoti не
  разбирал вовсе: закрытая enterprise-документация без публичной справки). Пятерых площадок с открытой
  справкой (Booksy, Fresha, SimplyBook.me, YClients, Doctolib) плюс Zocdoc хватило для однозначного вывода по
  §3 и §4; шестой и седьмой источник его бы не изменил.
- **Тимед/DocDoc/СберЗдоровье не разбирал**: это агрегаторы-маркетплейсы, где публичная единица — врач по
  построению, и они отвечают на другой вопрос (каталог), а не на наш (витрина арендатора). Отмечаю как
  сознательный пропуск, а не как «посмотрел, ничего нет».
- **Ничего не спроектировано и не изменено в коде** — по условию задачи. Таблицы, миграции, план и карточка не
  заводились. Найденная межарендаторная привязка `specialist_id` (§4) вынесена как факт, не как задача.
