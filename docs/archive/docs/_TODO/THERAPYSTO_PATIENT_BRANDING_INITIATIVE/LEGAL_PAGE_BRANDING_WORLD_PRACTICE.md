# Чьё имя стоит на юридических страницах: платформа, поверхность или клиника

Исследование живых страниц реальных продуктов, 22.08.2026. Каждое утверждение — с URL и дословной цитатой.
Что проверить не удалось — помечено явно в разделе 7.

---

## 1. Короткий ответ

1. **Мир ставит на юридические документы имя ЮРЛИЦА ПЛАТФОРМЫ — не имя поверхности и не имя клиники.**
   Из 13 проверенных health/rehab-продуктов имя платформенного юрлица стоит в 12; в одном (Wibbi) юрлицо
   не названо вообще — это дефект их документа, а не другой паттерн. Имя клиники в качестве оператора — **0 из 13**.
2. **Самый близкий к нам случай — Physitrack/PhysiApp — решает вопрос ровно так, как чувствует владелец.**
   Пациентский документ называется «PHYSITRACK End User Terms for Patients», лежит на домене платформы
   (`physitrack.com/legal/physiapp`), стороной названа Physitrack PLC. Слово PhysiApp — только имя продукта в URL.
3. **Имя поверхности не исчезает — оно живёт как название продукта, а не как сторона договора.**
   Подвал пациентского приложения: «PhysiApp © Physitrack PLC» + ссылки на `physitrack.com`.
4. **Один комплект или несколько:** политика конфиденциальности почти всегда ОДНА на всю платформу
   (Physitrack, MedBridge). Отдельным делают обычно только *условия использования для пациента* —
   5 продуктов из 13. То есть паттерн: **одна Privacy + отдельные пользовательские условия для пациента**.
5. **На клинико-брендированной поверхности пациент всё равно видит имя платформы.** MedBridge отдаёт
   клинике поддомен (`kortpt.medbridgego.com`), но в тексте политики — только «Medbridge Inc.», клиника
   не упомянута ни разу. SimplePractice: даже когда сама клиника публикует документ на СВОЁМ домене,
   стороной договора там названа SimplePractice, LLC.
6. **Содержательная причина, а не брендинг:** контролёр (в РФ — оператор) — клиника, платформа — обработчик.
   Ставить на документ имя платформы нужно именно для того, чтобы корректно назвать обработчика.
7. **Для России это не вопрос вкуса.** 152-ФЗ (ст. 9 ч. 4 п. 6) требует указать в согласии
   **наименование и адрес лица, осуществляющего обработку по поручению оператора** — то есть наше юрлицо
   должно быть названо у каждого пациента любой клиники, под каким бы брендом он ни вошёл.

**Вывод по вопросу владельца: инстинкт подтверждается евиденцией.** Но точнее так: на документе стоит
**наименование юрлица платформы**, а бренд Therapysto — как название платформы рядом с ним. Therapygo при
этом остаётся в тексте как имя пациентского приложения, а не как сторона.

---

## 2. Таблица: что показали живые страницы

| Продукт | Чьё имя как сторона/оператор в документе | Отдельные документы для пациента? | Что видит пациент на брендированной поверхности |
|---|---|---|---|
| **Physitrack / PhysiApp** | **Physitrack PLC** ([terms](https://www.physitrack.com/legal/terms), [privacy](https://www.physitrack.com/legal/privacy), [physiapp](https://www.physitrack.com/legal/physiapp)) | Privacy — общая; **Terms — отдельные** «End User Terms for Patients» на домене платформы | Подвал: «PhysiApp © Physitrack PLC», ссылки ведут на `physitrack.com` |
| **MedBridge / MedBridge GO** | **Medbridge Inc.** ([privacy](https://www.medbridge.com/privacy), [patient terms](https://www.medbridgego.com/patientTermsOfUsePrivacyPolicy)) | Общие; тот же текст отдаётся на пациентском домене | На клинико-брендированном поддомене (`kortpt.medbridgego.com`) в тексте — только Medbridge Inc.; клиника не названа |
| **SimplePractice** | **SimplePractice, LLC** ([terms](https://www.simplepractice.com/terms/), [client portal terms](https://authentic-counseling.clientsecure.me/terms-of-service)) | **Да** — «Client Portal Terms of Service» + Client Portal Privacy Policy | Портал под брендом практики, но сторона договора — SimplePractice, LLC; практика не названа |
| **Jane App** | **Jane Software Inc.** ([terms](https://jane.app/terms)) | Нет — раздел «Notice to Patients» внутри общих условий | — |
| **Practice Better** | **Green Patch Inc.** (юрлицо ≠ бренд) ([terms](https://www.practicebetter.io/terms-of-service)) | Нет (не найдено) | — |
| **Cliniko** | **Red Guava Pty Ltd** (юрлицо ≠ бренд) ([privacy](https://www.cliniko.com/policies/privacy/)) | Нет; пациента отсылают в клинику | — |
| **Healthie** | **Healthie Inc.** ([privacy](https://www.gethealthie.com/privacy), [BAA](https://www.gethealthie.com/baa)) | Нет; пациента отсылают к провайдеру | — |
| **Doxy.me** | **Doxy.me Inc.** ([ToS](https://doxy.me/en/terms-of-service), [privacy](https://doxy.me/en/privacy-policy)) | **Да** — Acceptable Use Policy для пациентов ([AUP](https://doxy.me/en/acceptable-use)) | Комната ожидания под брендом врача; живой подвал проверить не удалось |
| **Rehab Guru** | **Rehab Guru Ltd** ([terms](https://www.rehabguru.com/terms), [privacy](https://www.rehabguru.com/privacy-policy)) | **Да** — [страница для пациента](https://www.rehabguru.com/patient-information) + end-user licence terms | Пациенту прямо объясняют, что контролёр — его клиницист |
| **Wibbi** | **юрлицо не названо вообще** ([privacy](https://wibbi.com/privacy-policy/)); ToS по публичным URL — 404 | Нет | — |
| **Zanda Health (Power Diary)** | **Zanda Health Pty Ltd** ([terms](https://zandahealth.com/us/terms-of-use/), [privacy](https://zandahealth.com/us/privacy-policy/)) | Нет; условия «применимы только к подписчикам-практикам» | Client Portal без собственного пользовательского документа |
| **Tebra (Kareo/PatientPop)** | **Tebra Technologies, Inc.** ([platform privacy](https://www.tebra.com/platform-privacy-policy)) | **Да** — [Patient Portal Terms of Service](https://www.tebra.com/patient-portal-terms-service) | Имя Tebra видно пациенту прямо в заголовке документа |
| **Exer** | **Exer Labs, Inc.** ([privacy](https://www.exer.ai/privacy-policy)) | Публичные документы покрывают только маркетинговый сайт и прямо отказываются от приложения | — |

### Общий SaaS-паттерн (белая марка вне медицины)

| Продукт | Отдельный документ для конечного пользователя | Роль платформы | Имя платформы на брендированной поверхности |
|---|---|---|---|
| **Shopify** | Да — [Consumer Privacy Policy](https://www.shopify.com/legal/privacy/consumers) | обработчик «at the direction of the Merchant» | Гарантий нет; но мерчант **обязан** вставить ссылку на политику Shopify в свою |
| **Substack** | Нет — те же ToS/Privacy связывают читателя | двойная: контролёр своего слоя, обработчик у автора | **Постоянный подвал на кастомном домене:** «© 2026 Matthew Yglesias · Privacy ∙ Terms ∙ Collection notice» → `substack.com` |
| **Intercom** | Частично — [Product Privacy Notice](https://www.intercom.com/legal/product-privacy-notice) | «service provider to our Customers» | Снимаемый бейдж «We run on Intercom» |
| **Calendly** | Да — [Participant Terms](https://calendly.com/legal/invitee-terms-conditions) | «Calendly acts as a processor» | Снимаемый «Powered by Calendly» |

Честно о распределении: **3 из 4** общих SaaS публикуют ОТДЕЛЬНЫЙ документ для конечного пользователя;
**все 4** письменно фиксируют статус обработчика. Единственный, кто держит ссылки платформы прямо в подвале
белой марки как несъёмный элемент, — Substack, и именно потому, что применяет к читателю ТЕ ЖЕ документы.

---

## 3. Разбор двух ближайших к нам продуктов

### 3.1 Physitrack / PhysiApp — буквально наша форма

Physitrack — продукт для клиницистов, PhysiApp — приложение для пациента. Отдельный бренд, отдельный домен
(`physiapp.com`), отдельное приложение в сторах. И тем не менее:

- **Документ для пациента называется именем платформы.** Заголовок:
  «**PHYSITRACK END USER TERMS FOR PATIENTS**» — [physitrack.com/legal/physiapp](https://www.physitrack.com/legal/physiapp).
  Слово «physiapp» осталось только в URL.
- **Сторона — юрлицо платформы, с адресом:**
  «Physitrack PLC, a company established and existing under the laws of England and Wales, having its
  registered office at Bastion House, 4th Floor 140 Aldersgate Street, London, United Kingdom, EC1A 4HY».
- **Документ прямо объясняет пациенту его положение:**
  «You are not a customer of Physitrack. Physitrack's contractual relationship is with your healthcare
  practitioner (the "Practitioner"), who is our customer and who has arranged for you to use the Platform».
- **И прямо называет роли:**
  «We are not a controller of your personal data. The Practitioner is the controller of your personal data.
  We only process your personal data on the Practitioner's behalf and in line with its instructions and the
  provisions of UK/EU GDPR.»
- **Политика конфиденциальности — ОДНА на всех**, и она это говорит:
  применяется к «Patients of a Health Practitioner who access our services as part of their treatment»,
  и «We act as a processor to Health Practitioners' and we collect data on their behalf»
  ([privacy](https://www.physitrack.com/legal/privacy)); оператор — «Physitrack PLC and/or our group companies».
- **DPA не оставляет двусмысленности:** «Data Controller: You», «Data Processor: Physitrack PLC»
  ([DPA](https://www.physitrack.com/legal/data-processing-agreement)).
- **Что видит пациент.** Подвал `physiapp.com`: «© 2025 Physitrack PLC. PhysiApp® is a trademark of
  Physitrack PLC», ссылки — Privacy policy → `physitrack.com/en-gb/legal/privacy`, Terms of service →
  `physitrack.com/legal/physiapp`. Подвал экрана входа пациента `us.physiapp.com/login`:
  «PhysiApp © Physitrack PLC - Terms of Service - Privacy & Security», обе ссылки на `physitrack.com`.
- **Стор:** продавец приложения PhysiApp в App Store — «Physitrack PLC», политика приватности —
  `physitrack.com/privacy` ([листинг](https://apps.apple.com/us/app/physiapp/id1047722007)).

**Ровно та развилка, которую решает владелец, — и Physitrack решил её в пользу платформы.**
PhysiApp остаётся именем продукта и товарным знаком; стороной, оператором и хостом документов является Physitrack.

### 3.2 MedBridge / MedBridge GO — плюс живая белая марка

MedBridge интереснее тем, что у него есть настоящие клинико-брендированные поверхности:
`kortpt.medbridgego.com`, `encompasshealth.medbridgego.com`, `advocateaurorahealth.medbridgego.com` и др.

- **На клинико-брендированной странице заголовок клиники, а текст — платформы.** Страница озаглавлена
  «KORT | Patient Portal», а первая же строка политики:
  «**Medbridge Inc. ("Medbridge") is committed to protecting Your privacy** when You visit the Medbridge
  Website and the Medbridge Mobile App, and other websites owned by Medbridge, **including personalized
  white label websites**» — [kortpt.medbridgego.com/privacy_policy](https://kortpt.medbridgego.com/privacy_policy).
  **Имя клиники KORT в юридическом тексте не встречается ни разу.**
- **Один и тот же текст политики отдаётся на трёх уровнях** — на клиницистском домене
  ([medbridge.com/privacy](https://www.medbridge.com/privacy)), на пациентском
  ([medbridgego.com/privacy_policy](https://www.medbridgego.com/privacy_policy)) и на клинических поддоменах.
  Это ровно модель «один комплект документов на всю платформу».
- **MedBridge — единственный содержательный выброс по ролям.** Он объявляет контролёром СЕБЯ по умолчанию:
  «For the majority of the Personal Information maintained, collected, or used by Medbridge, Medbridge is
  the Data Controller», и лишь частично уступает: «For some healthcare data, Your individual healthcare
  provider or their organization may be the Data Controller for whom Medbridge holds and processes data»
  ([medbridgego.com/patientTermsOfUsePrivacyPolicy](https://www.medbridgego.com/patientTermsOfUsePrivacyPolicy)).
- **Стор:** пациентское приложение «Medbridge GO for Patients» издано платформенным юрлицом
  (App Store — MedBridge Education LLC; Google Play — Medbridge, Inc.), не клиникой.

### 3.3 Контрольная точка: SimplePractice

Самый жёсткий тест — когда документ хостит САМА клиника, на своём домене, под своим брендом. Практика
Maddox Counseling публикует «Client Portal Terms of Service» у себя
([maddoxcounselingllc.com](https://maddoxcounselingllc.com/client-portal-terms-of-service/)), и текст гласит:

> «These Terms of Service are a binding contract between the Client … and **SimplePractice, LLC**
> (referred to herein as "SimplePractice", "Us", "Our" or "We").»
> «To access and use the Service, You must be a Client of a Provider using SimplePractice's Software.»

А на брендированном портале практики ([authentic-counseling.clientsecure.me](https://authentic-counseling.clientsecure.me/terms-of-service))
роли названы прямо: «**Your Provider is the controller of Your User Data.** It is Your Provider's sole
responsibility (not SimplePractice's) to manage, maintain, store, or export … the User Data.»

Даже под чужим брендом и на чужом домене стороной остаётся платформа.

---

## 4. Контролёр против обработчика — почему имя вообще важно

Это не брендинг, а распределение ответственности, и именно оно диктует, чьё имя стоит на документе.

**Явно называют клинику контролёром, а платформу обработчиком:** Physitrack («The Practitioner is the
controller»), SimplePractice («Your Provider is the controller of Your User Data»), Jane («Each Subscriber
determines: What Subscriber Data to collect…», Jane — «agent», «business associate»), Rehab Guru («you are
the data controller of your patients data and we are the processor»), Wibbi («Wibbi is the processor of
personal data»), Zanda («We act as a data processor for Customer Data … including patient/client information»).
Через HIPAA-конструкцию Covered Entity / Business Associate то же самое говорят Healthie и Tebra.

**Двойная роль — норма, и её стоит перенять:** платформа является контролёром своих собственных данных
(учётка, биллинг, логи, безопасность) и обработчиком клинических данных пациента. Дословно у Zanda:
«We act as a data controller for Account Data … We act as a data processor for Customer Data that our
customers upload or enter into the Services». То же у Substack и Healthie.

**Выброс:** MedBridge объявляет контролёром преимущественно себя. Doxy.me вовсе уклоняется от
терминологии и перекладывает решение на врача: «You are responsible for determining the requirement for
any BAA» ([doxy.me/en/privacy-policy](https://doxy.me/en/privacy-policy)).

**Что из этого следует практически.** Обработчик не может опубликовать «политику клиники» — у него нет
её целей обработки. Но обработчик ОБЯЗАН быть назван, чтобы конструкция поручения была законной. Отсюда и
берётся мировой формат: **документ от имени платформы, в тексте которого сказано, что контролёр — клиника,
и что запросы субъекта идут в клинику.** Лучший образец формулировки — Rehab Guru:

> «As a patient, your data controller is the person who issued you an exercise programme, not Rehab Guru.
> Rehab Guru are the Data Processor on the behalf of the Data Controller, which is likely to be the
> individual clinician or their organisations.» — [rehabguru.com/patient-information](https://www.rehabguru.com/patient-information)

---

## 5. Особенности для России (152-ФЗ)

Здесь ответ жёстче, чем в GDPR/US, и он усиливает вывод.

1. **Политику публикует ОПЕРАТОР, каждый свою.** Ст. 18.1 ч. 2: «Оператор обязан опубликовать или иным
   образом обеспечить неограниченный доступ к документу, определяющему его политику в отношении обработки
   персональных данных» ([fzrf.su/…/st-18.1](https://fzrf.su/zakon/o-personalnyh-dannyh-152-fz/st-18.1.php)).
   Значит клиника публикует свою политику, а мы — свою. Наша политика физически не может быть «политикой клиники».
2. **Поручение обработки.** Ст. 6 ч. 3: «Оператор вправе поручить обработку персональных данных другому лицу
   с согласия субъекта персональных данных…»; ч. 4: лицо, обрабатывающее по поручению, не обязано получать
   согласие само; ответственность перед субъектом несёт оператор
   ([fzrf.su/…/st-6](https://fzrf.su/zakon/o-personalnyh-dannyh-152-fz/st-6.php)).
3. **🔴 Ключевое для нашего вопроса.** Ст. 9 ч. 4 требует включить в согласие:
   п. 3 — «наименование или фамилию, имя, отчество и адрес **оператора**, получающего согласие»;
   п. 6 — «наименование или фамилию, имя, отчество и адрес **лица, осуществляющего обработку персональных
   данных по поручению оператора**, если обработка будет поручена такому лицу»
   ([fzrf.su/…/st-9](https://fzrf.su/zakon/o-personalnyh-dannyh-152-fz/st-9.php)).
   **То есть наименование НАШЕГО юрлица обязано быть показано пациенту — даже если он вошёл через
   `app.bersoncare.ru` и вообще не знает слова «Therapysto».** Спрятать платформу за белой маркой в РФ нельзя.
4. **В РФ на документе стоит НАИМЕНОВАНИЕ ЮРЛИЦА, а не бренд.** Закон оперирует «наименованием и адресом»,
   а не торговой маркой. Мировая практика это же и делает — обратите внимание: Practice Better = Green Patch
   Inc., Cliniko = Red Guava Pty Ltd. Бренд стоит рядом как имя сервиса, юрлицо — как сторона.
5. **Разница с EU/US.** В GDPR разделение controller/processor такое же по смыслу, но 152-ФЗ дополнительно
   требует поимённого указания обработчика В САМОМ СОГЛАСИИ, чего GDPR не требует (ст. 13 GDPR требует лишь
   категории получателей). В US-модели вместо этого работает BAA между клиникой и платформой — договор, а не
   раскрытие пациенту. **Поэтому американские примеры (MedBridge, Tebra, Healthie) для нашей юрисдикции —
   ориентир по форме, но не по объёму раскрытия: нам раскрывать нужно БОЛЬШЕ, чем им.**

---

## 6. Варианты для владельца

Во всех вариантах на документе стоит наименование юрлица платформы — это не выбор, а следствие ст. 9 ч. 4 п. 6.
Выбор — в том, сколько документов и как они разложены по поверхностям.

### Вариант A. Один комплект платформы + короткая памятка пациенту (модель Physitrack)
Одна «Политика обработки персональных данных» от имени юрлица платформы (бренд Therapysto), покрывающая обе
поверхности; отдельно — короткие «Условия использования для пациента». Обе поверхности и клинические домены
ссылаются на один и тот же URL. Плюс отдельная страница-памятка «кто ваш оператор» в духе Rehab Guru.

- **Плюсы.** Ровно то, что делает ближайший аналог. Одна политика — один предмет поддержки и обновления,
  нет риска расхождения редакций. Пациенту при этом даётся документ его языка, а не клиницистский договор.
  Формально закрывает и ст. 18.1, и ст. 9 ч. 4 п. 6. Клиническая белая марка обслуживается без правок.
- **Минусы.** Пациент видит незнакомое имя «Therapysto» на странице, куда пришёл под брендом своей клиники —
  требуется одна поясняющая фраза. Единый текст обязан аккуратно разделять двойную роль (контролёр своего
  слоя / обработчик клинического), иначе получится размытая формулировка как у MedBridge.

### Вариант B. Два полных комплекта — свой для Therapysto, свой для Therapygo
Отдельные Условия и Политика на каждой поверхности, оба от того же юрлица.

- **Плюсы.** Каждый текст говорит с одной аудиторией, ничего лишнего. Ближе к Tebra и Calendly, где у
  конечного пользователя свой документ.
- **Минусы.** Два документа расходятся при первом же обновлении — это самая частая юридическая ошибка такого
  рода. Клиническая белая марка порождает третий вопрос («а мой-то какой?»). Ни один из проверенных
  продуктов не держит ДВЕ полные политики конфиденциальности — отдельным делают только условия. Евиденции
  за этот вариант в чистом виде нет.

### Вариант C. Политика клиники впереди, платформа — ссылкой
Пациенту показывается политика его клиники, наша — второй ссылкой (модель Shopify: мерчант обязан вставить
ссылку на политику платформы в свою).

- **Плюсы.** Максимально «бесшовно» для клиники под её брендом. Юридически корректно отражает, что оператор — клиника.
- **Минусы.** Требует, чтобы у каждой клиники БЫЛА своя опубликованная политика и она её поддерживала —
  для малых клиник это нереалистично, а отвечать перед РКН за пустую страницу будем мы репутационно.
  В health-сегменте так не делает НИ ОДИН из 13 проверенных продуктов; это паттерн e-commerce, где мерчант
  и правда самостоятельная сторона сделки.

### Что поддерживает евиденция

**Вариант A.** Он совпадает с решением ближайшего структурного аналога (Physitrack/PhysiApp: одна Privacy на
платформу + отдельные пациентские условия под именем платформы), совпадает с поведением белой марки в
MedBridge и SimplePractice (текст платформы под чужим брендом), и единственный из трёх закрывает
российское требование назвать обработчика поимённо, не перекладывая обязанность публикации на клинику.

Инстинкт владельца («должно быть написано Therapysto») евиденцией **подтверждается**, с одной поправкой:
на документе должно стоять **наименование юрлица**, а Therapysto — рядом, как название платформы.
Therapygo корректно упоминать в тексте как имя пациентского приложения.

**Замер текущего состояния (для протокола, не рекомендация):** сейчас `apps/webapp/src/app/legal/terms/page.tsx`
и `.../privacy/page.tsx` говорят не «Therapygo», а «**BersonCare Platform**», и содержат оговорку
«При необходимости юридически полного текста замените этот шаблон на утверждённую редакцию». Юрлицо не названо
ни в одном из двух документов. Подвал `LegalFooterLinks.tsx` ведёт на `/legal/terms` и `/legal/privacy`.

---

## 7. Что проверить не удалось

Явно, чтобы никто не принял пробел за факт:

1. **Живой клинико-брендированный подвал** ни у одного продукта, кроме MedBridge, — комнаты ожидания Doxy.me,
   пациентские порталы Wibbi, Client Portal Zanda, Patient Portal Tebra требуют авторизованной сессии.
   Проверено на MedBridge (клинические поддомены открыты публично) и на SimplePractice (публичный
   `clientsecure.me` и копия на домене практики).
2. **Google Play-листинг PhysiApp** — страница отдала усечённую навигацию, издатель и ссылка на политику
   не подтверждены. App Store подтверждён (Physitrack PLC).
3. **`simplepractice.com/c/privacy/`** — страница отдала только заголовок «Client Portal Privacy Policy»
   без тела; наличие документа подтверждено, содержание — нет.
4. **Wibbi Terms of Service** — `wibbi.com/terms-of-service/` и `/terms-of-use/` отдают HTTP 404; ссылки на
   ToS нет ни в подвале, ни в политике. Юрлицо Wibbi не названо в их политике вообще (это дефект их документа,
   а не наша ошибка чтения).
5. **Юридические документы пациентского приложения Exer** — публичные ToU/Privacy прямо исключают приложение
   («These Terms apply only to the Website»), а на «separate agreements» ссылок не дают.
6. **`medbridge.com/privacy-policy`** отдаёт 404 — верный адрес `medbridge.com/privacy` (проверен).
7. **Rehab Guru end-user licence terms** — URL процитирован в их ToS, сама страница не открывалась.
8. **Российская отраслевая практика белой марки** — статья YCLIENTS «Обработка персональных данных при
   онлайн-записи» отдала только заголовок без текста; кто назван оператором в их виджете, **не подтверждено**.
   Российская часть выше опирается на первоисточник — текст 152-ФЗ, — а не на чужую практику.
9. **«Powered by Calendly» и «We run on Intercom»** — тексты бейджей взяты из справок и сообществ вендоров,
   на живой странице виджета дословно не наблюдались (JS-инъекция во фрейм).
10. Материалы про white-label HIPAA с сайтов подрядчиков (accountablehq, capminds и т. п.) в выводы **не
    включались** — это маркетинговые тексты, а не первоисточник.
