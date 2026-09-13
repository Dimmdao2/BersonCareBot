# Зарезервированные слуги клиник — предложение на утверждение

**Дата:** 13.09.2026 · **Статус:** предложение, НИЧЕГО НЕ ВНЕДРЕНО · **Исходная просьба владельца 13.09:**

> «Надо еще заблокировать слаги для клиник: therapysto therapygo therapisto therapigo terapysto terapist
> therapist therapi terapi therapio и все подобные написания и вариации слова тирапевт, плюс clinica
> klinika clinika и все подобное, doctor, med medic doc profi master guru и вот такие вот крутые доменные
> имена — запусти отдельно умного агента пусть составит список мне на утверждение»

Это **только список и рекомендация механизма**. Код не тронут, миграций нет, гейтов не добавлено.

---

## 1. Что уже закрыто сегодня — НЕ переутверждать

Резерв существует и он большой. Замер (скрипт по литералу `Set` в
`apps/webapp/src/modules/clinic-directory/organizationSlug.ts`):

```
node -e "const s=require('fs').readFileSync('apps/webapp/src/modules/clinic-directory/organizationSlug.ts','utf8');
const m=s.match(/RESERVED_ORGANIZATION_SLUGS = new Set\(\[([\s\S]*?)\n\]\)/);
console.log([...m[1].matchAll(/'([^']+)'/g)].length)"
→ 228
```

**228 имён**, живут в трёх согласованных местах:

| Слой | Где | Роль |
| --- | --- | --- |
| Валидатор | `apps/webapp/src/modules/clinic-directory/organizationSlug.ts` — `RESERVED_ORGANIZATION_SLUGS` | единственный источник истины в коде |
| БД | `organization_slug_claims_slug_reserved_check`, миграция `20260912T000500_the_database_knows_every_reserved_public_root.sql` | backstop на запись мимо приложения; **список перенесён дословно, все 228** |
| Сторожа | `reservedNamespace.test.ts`, `organizationSlugDbParity.devDbProof.test.ts` | читают реальность (диск и БД), краснеют при расхождении |

Плюс правила без имён: длина 3–30, формат `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`, **целиком числовой слуг отказан**
(`^[0-9]+$` → `reserved_slug`). То есть `03`, `112`, `103` уже закрыты, отдельно вносить не нужно.

### 1.1 Из того, что владелец назвал прямо сегодня, УЖЕ ЗАБЛОКИРОВАНО

Сверено скриптом против тех же 228:

- инфраструктура — **всё, кроме одного слова**: `www api admin app mail smtp ftp cdn static assets blog help
  support status dev test stage staging prod docs login auth account billing pay checkout well-known` — все
  в резерве. **Не хватает только `webhook`.**
- из медицинских — `doctor`, `clinic`, `clinics`, `docs` в резерве.

### 1.2 Из названного владельцем НЕ заблокировано ничего из главного

`therapysto`, `therapygo`, `therapisto`, `therapigo`, `terapysto`, `terapist`, `therapist`, `therapi`,
`terapi`, `therapio`, `clinica`, `klinika`, `med`, `medic`, `doc`, `profi`, `master`, `guru` — **ни одного
из них в резерве нет.** Сегодня любой зарегистрировавшийся может занять `therapysto.therapygo.ru`.

### 1.3 Дыра, которую я нашёл попутно — живые хосты платформы не в резерве

Замер: `grep -rhoE "[a-z0-9-]+\.(therapygo|therapysto|bersoncare)\.ru"` по репозиторию → реально
используемые метки: `admin id meet turn staff patient edge www test app`.

Из них **`meet`, `turn`, `staff` в резерве отсутствуют** (`admin patient edge www test app` — есть).
`meet.therapysto.ru` и `turn.therapysto.ru` — это Jitsi и TURN-сервер, `staff.therapysto.ru` — рабочая
поверхность. Метка `id` (`id.therapysto.ru`) недостижима как слуг из-за минимальной длины 3 — см. вопрос 4.

Это не гипотеза про будущее, это занятые сегодня хосты. Они в разделе Г ниже.

---

## 2. Что этот список добавляет — цифра

**507 новых имён**, итого станет **735**. По разделам:

| Раздел | Что | Новых |
| --- | --- | ---: |
| А1 | Ядро бренда: therapysto / therapygo и их искажения | 68 |
| А2 | Корень «терапия / therapy» отдельным словом | 17 |
| А3 | Бренд с приставкой/хвостом (представительно) | 24 |
| Б | Профессия и медицина | 132 |
| В | Статус и престиж | 77 |
| Г | Инфраструктура и технические имена | 133 |
| Д | Подмена и присвоение чужого имени — **моё дополнение** | 56 |

Пометки: **[В]** — владелец назвал прямо. **[Я]** — моё суждение, владелец этого не просил.
Раздел Д целиком **[Я]**. В разделах А–Г владелец задал класс словами «и все подобное» — там [В] стоит на
классе, а конкретные написания внутри класса мои.

---

## 3. Механизм — рекомендация (НЕ реализация)

### 3.1 Почему одного списка не хватает: измеренный факт

Я сформулировал правила порождения опечаток бренда (раздел А) и **прогнал их полным перекрёстным
произведением: получилось 927 имён — и это всё равно не полное покрытие.** Пространство опечаток
не перечислимо: `therapysto` → `therapystoo` → `therapystooo` → …

Вывод не «написать список длиннее», а **список закрывает то, что названо, а алгоритм — то, что не названо.**
Ниже 68 имён ядра — это осмысленные, реально регистрируемые формы; хвост берёт правило расстояния.

### 3.2 Рекомендуемая схема — четыре слоя

**Слой 1. Точное совпадение (как сегодня).** Имеющиеся 228 + новые из разделов Г и Д.
Сравнение с финальным слугом как есть. Ноль ложных срабатываний, дёшево. Это «неподвижный пол».

**Слой 2. Совпадение по НОРМАЛИЗОВАННОЙ форме, слуг ЦЕЛИКОМ.** Разделы Б и В.
Нормализация — только для сравнения, в базу пишется исходный слуг:

1. `NFKC` + нижний регистр (уже есть в валидаторе);
2. убрать разделители полностью: `-`, `_`, пробел → `` (так `therapy-sto` → `therapysto`);
3. свернуть повторы букв: `therrapy` → `therapy`, `medd` → `med`;
4. срезать хвостовые цифры: `master1`, `med2026` → `master`, `med`;
5. свернуть цифры-двойники: `0→o`, `1→l` и `1→i`, `3→e`, `4→a`, `5→s`, `6→b`, `7→t`, `8→b`, `9→g`.
   Вариант `1` даёт два кандидата — проверять оба; при более чем ~4 цифрах в слуге сворачивание не делать
   (иначе комбинаторика ради ничего).

Ловит `ma5ter`, `m-a-s-t-e-r`, `master1`, `medd`, `kl1nika`. Не ловит лишнего — см. 3.4.

**Слой 3. Бренд: подстрока + расстояние.** Только раздел А.
- для токенов длиной **≥ 8** (`therapysto`, `therapygo`, `terapysto`, `therapisto`…) — совпадение
  **где угодно внутри** нормализованного слуга: `klinika-therapysto` должно отказываться;
- дополнительно: Дамерау—Левенштейн ≤ 1 к любому из шести опорных написаний
  (`therapysto therapygo terapysto terapygo therapisto therapigo`) для нормализованного слуга целиком.
  Это и есть хвост из 3.1 — без списка на 927 строк;
- **короткие корни** из А2 (`therapy`, `terapi`, `therapio`, `terapia`…) — **только целиком**, по слою 2.
  Подстрочное правило на них применять НЕЛЬЗЯ: `fizioterapiya-plus` — законное имя клиники, а `terapi`
  внутри него есть.

**Слой 4. «Придержано платформой» — §13.2 плана `CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md`.**
Это уже спроектированный, но **не построенный** слой: строка `reservation` в `organization_slug_claims`
без организации, отдаётся живой клинике админом платформы **без миграции**. Прямая цитата владельца 19.08
из того же плана: «блокировать имена заранее — я имею ввиду что не давать другим их занимать, эти имена.
**Может я сам потом такое захочу создать**».

**Рекомендация:** разделы **Б и В** (медицина, престиж) — это ровно тот случай: они не ломают ничего
технически, и владелец может захотеть `medcentr` или `profi` себе. Их правильное место — слой 4, а не
захардкоженный список, который для отмены требует миграции. Разделы **А, Г, Д** — жёсткий запрет навсегда
(слои 1–3). См. вопрос 2: слой 4 не построен, и это развилка.

### 3.3 Что сравнивать НЕ надо

Префиксные и суффиксные правила («всё, что начинается на `med`») — **не рекомендую.** `medvezhiy-ugol`,
`master-klass-zdorovya`, `topol` начинаются с зарезервированных корней и являются законными именами.
Раздел А3 (`therapysto-ru`, `my-therapygo`) в списке оставлен как страховка, но по существу его целиком
закрывают шаги нормализации 2 и 4 плюс подстрочное правило слоя 3.

### 3.4 Ложные срабатывания — «Мастерская здоровья»

Владелец назвал `master`. Клиника «Мастерская здоровья» хочет `master-zdorovya`.

**Правило: зарезервированное слово запрещено как ВЕСЬ слуг, а не как его часть.** Проверка:

| Слуг | Нормализованная форма | Итог |
| --- | --- | --- |
| `master` | `master` | ❌ отказ — совпало целиком |
| `ma5ter` | `master` | ❌ отказ — совпало целиком после свёртки цифр |
| `master-zdorovya` | `masterzdorovya` | ✅ **разрешено** — целиком не совпало |
| `masterskaya` | `masterskaya` | ❌ отказ — отдельная запись в разделе В |
| `masterskaya-zdorovya` | `masterskayazdorovya` | ✅ разрешено |
| `klinika-100` | `klinika100` → `klinikaloo`/`klinikaioo` | ✅ разрешено — ни с чем не совпало |
| `klinika-therapysto` | содержит `therapysto` | ❌ отказ — **бренд ловится и внутри** |

Асимметрия сознательная: своё имя клиника должна иметь возможность построить из общего слова
(«Мастерская здоровья», «Медцентр на Ленина» → `medcentr-na-lenina` разрешён), а наш бренд внутри чужого
адреса не нужен никому и никогда.

### 3.5 Текст отказа

Сейчас код ошибки один — `reserved_slug`. Для класса Б/В человеку стоит подсказать
(«это слово придержано платформой — добавьте название вашей клиники: `master-zdorovya`»), для класса А —
не подсказывать ничего сверх «имя недоступно»: подробный отказ даёт сквоттеру перебором нащупать границу.
Это одна строка в UI, но решение продуктовое — вопрос 6.

---

## 4. Списки

### Раздел А1 — ядро бренда: therapysto / therapygo **[В — владелец назвал класс и 10 написаний]**

**Правило порождения.** Слово = корень `therapy` + хвост `sto`/`go`. Варьируется:
(1) выпадение `h` — `terapy`; (2) `y → i / ie / ee` — `therapi`, `therapie`; (3) гласная в `ther-` —
`tharapy`, `thirapy`; (4) гласная в `-rap-` — `theropy`, `therepy`; (5) удвоение — `therrapy`, `therappy`;
(6) выпадение буквы — `therpy`, `theapy`, `thrapy`, `therapsto`; (7) перестановка соседних —
`thearpy`, `tehrapy`; (8) соседняя клавиша QWERTY — `thetapy` (r→t), `thefapy`, `tgerapy`, `tjerapy`,
`rherapy`, `yherapy`; (9) греко-латинское — `theraphy`, `therapeu`; (10) цифра-двойник — `therapyst0`,
`therapyg0`, `ther4pysto`; (11) хвост — `sto/stoo/sta/stu/st/cto/sro/sti`, `go/goo/gou/gow/g0/ga`.

```
rherapygo rherapysto tehrapygo tehrapysto terapgo terapiego terapiesto terapigo terapisto
terapsto terapygo terapyst terapysto tgerapygo tgerapysto tharapygo tharapysto thearpygo
thearpysto thefapygo thefapysto ther4pygo ther4pysto therapgo theraphygo theraphysto
therapiego therapiesto therapigo therapisto therapisto1 therapiygo therapiysto therapogo
theraposto therappygo therappysto therapsto therapycto therapyg0 therapyga therapygo
therapygoo therapygou therapygow therapysro therapyst therapyst0 therapysta therapysto
therapystoo therapystow therapystu therapyzto therepygo therepysto theropygo theropysto
therrapygo therrapysto thetapygo thetapysto thirapygo thirapysto tjerapygo tjerapysto
yherapygo yherapysto
```

**68 имён. Хвост добирается слоем 3** (расстояние ≤ 1 к шести опорным формам) — полное перекрёстное
произведение тех же правил дало бы 927 строк и всё равно не закрыло бы всё.

### Раздел А2 — корень «терапия / therapy» отдельным словом **[В]**

**Правило.** Сам корень без хвоста, в латинице и в транслитерации кириллицы: `therapy`/`терапия`.
Применяется **только как весь слуг** (см. 3.2, слой 3 — подстрока здесь запрещена).

```
terapi terapia terapie terapija terapio terapist terapiya terapy
therapee therapi therapia therapie therapija therapio therapist therapiya therapy
```

### Раздел А3 — бренд с приставкой или хвостом **[Я — представительно]**

**Правило.** Бренд + маркетинговый довесок. По существу закрывается нормализацией (срез разделителей и
хвостовых цифр) и подстрочным правилом; оставлено страховкой на случай, если внедряется только слой 1.

```
my-therapygo my-therapysto official-therapygo official-therapysto the-therapygo the-therapysto
therapygo-app therapygo-clinic therapygo-med therapygo-online therapygo-rf therapygo-ru
therapygo1 therapygo2026 therapygoru therapysto-app therapysto-clinic therapysto-med
therapysto-online therapysto-rf therapysto-ru therapysto1 therapysto2026 therapystoru
```

### Раздел Б — профессия и медицина **[В — «вариации слова тирапевт, clinica klinika и все подобное, doctor, med medic doc»]**

**Правило.** Родовое слово профессии или медицинского учреждения не может стать частным адресом одной
клиники. Источники форм: (1) транслитерация кириллицы — `terapevt`, `vrach`, `poliklinika`, `zdorovie`;
(2) латинские и английские формы — `medic`, `clinic`, `hospital`; (3) частые русско-английские гибриды,
которыми называются клиники — `medcentr`, `medline`, `medplus`; (4) соседние специальности **[Я]** —
`stomatolog`, `psiholog`, `rehab`, `lab`, `apteka`: класс тот же, владелец их не называл.

```
analizy apteka bolnica bolnitsa clinica clinika cliniqa clinique consultation dantist dental
dentist doc docteur doctors dokta dokter doktor doktor-online doktora doktors farmacia fizio
fizioterapia fizioterapiya gospital gospitalj hospital hospitals klinica klinicheskiy klinik
klinika kliniki konsultacia konsultaciya lab laboratoriya laboratory labs lekar lekari massage
massazh med med-center med-centr medcenter medcentr medcentre medcity medecin medexpert medgroup
medhelp medhelper medhome medhouse medic medical medicina medicine medics medicus medik mediki
meditsina medlab medline medplus medpro medprof meds medservice medservis medstar medycina
pharmacy physio physiotherapy policlinic policlinica poliklinik poliklinika polyclinic priem
priyom psiholog psihoterapevt psihoterapiya psy psycholog psychologist psychotherapy reabilitacia
reabilitaciya rehab rehabilitation stomatolog stomatologiya stomatology terapeft terapeut
terapeuta terapeuts terapevt terapevta terapevte terapevticheskiy terapevtika terapevtiya terapevty
terapewt therapeut therapeuta therapeutic therapeutics therapeutika therapevt therapies therapists
vrach vrach-online vrachi vrachu zapis zdorove zdorovie zdorovye zdrav zdravnica zdravnitsa
```

**132 имени.** Спорные внутри раздела, на которые стоит посмотреть отдельно: `zdorovie`, `zdorovye`,
`zdorove`, `priem`, `zapis` — очень частые составные части законных названий. Как **целые** слуги они
родовые, и правило 3.4 оставляет `zdorovie-plus`, `tochka-zdorovya`, `zapis-k-vrachu` разрешёнными.

### Раздел В — статус и престиж **[В — «profi master guru и вот такие вот крутые доменные имена»]**

**Правило.** Слово, не несущее имени, а объявляющее превосходство. Три источника: (1) названные владельцем
`profi`, `master`, `guru` и их формы; (2) тот же класс в латинице и транслитерации — `pro`, `expert`,
`top`, `best`, `vip`, `lux`, `elite`, `premium`; (3) «номер один» во всех написаниях — `no1`, `nomer1`,
`number1`, `numberone` (сам `1` и `№1` формат и так не пропускает).

```
best best1 bestclinic brilliant class diamond eksklusiv ekspert eksperty elit elite etalon
exclusive expert experts first gold golden grand guru ideal idealny imperial klass leader leaders
lider lux luxe luxury maestro master mastera masters masterskaya maxi maximum mega megamed no1
nomer1 nomerodin number1 numberone perfect platinum premium prestige prestizh prime pro pro100
prof professional professionals proff profi profis profy royal sensei standard standart star stars
super supermed top top1 topclinic ultra ultramed unikum unique vip vips zvezda
```

**77 имён.** `status` в этом классе уже зарезервирован. **Это самый спорный раздел на предмет
«придержать, а не запретить»** — см. вопрос 2: `profi`, `master`, `guru`, `premium` — ровно те имена,
которые владелец может захотеть себе.

### Раздел Г — инфраструктура и технические имена **[В — «заблокировать все возможно-полезные технические названия»]**

**Правило.** Имя, которое сегодня или завтра станет хостом, корневым путём или служебной меткой.
Заземлено на реальность, не на догадку: (1) **живые хосты платформы, найденные grep'ом по репозиторию** —
`meet`, `turn`, `staff` (остальные уже в резерве, см. §1.3); (2) единственное недостающее из названного
владельцем — `webhook`; (3) стандартный технический словарь эксплуатации **[Я]** — очереди, сборка,
мониторинг, контейнеры, хранилище: любой из них завтра станет поддоменом.

```
archive archives backend backup backups balancer batch blob bot bots broker bucket build builds
caddy call callback callbacks calls canary cluster conference console container cron database
databases deploy deployment devops docker draft drafts dump dumps example examples fixtures
frontend grafana hook hooks identity infra infrastructure integrator jitsi job jobs journal jwt
k8s kafka keycloak kibana kube kubernetes logs meet memcached metrics migrate migrations minio
mock mocks monitor monitoring nginx node nodes notification notifier notify object objects oidc
old openid operator operators ops panel pipeline prometheus push queue queues rabbit realm redis
registry release releases restore rollback rtc runner saml sample scheduler schema seed sentry
server servers sip sms snapshot sso staff storage stub stun task tasks telegram temp tmp token
tokens trace tracing trash turn video voice webapp webhook webhooks webrtc worker workers
```

**133 имени.** Приоритет внутри раздела: `meet`, `turn`, `staff`, `webhook` — это не гипотеза, это занятые
хосты и названное владельцем слово; их надо закрыть, даже если остальной раздел владелец не утвердит.

### Раздел Д — подмена и присвоение чужого имени **[Я — ЦЕЛИКОМ моё дополнение, владелец этого не просил]**

**Правило.** Адрес вида `mvd.therapygo.ru` или `sberbank.therapygo.ru` выглядит как наш собственный
поддомен и работает по нашему TLS — это готовый инструмент обмана, а отвечать за него будем мы.
Три подкласса: (1) государство и экстренные службы; (2) крупные потребительские бренды РФ и мира;
(3) наши собственные прежние имена — `bersoncare`, `bersoncarebot`.

```
alfa-bank alfabank ambulance apple avito beeline berson-care bersoncare bersoncarebot dms emergency
fns fond fsb gazprom gazprombank google gosuslugi gov mchs megafon microsoft ministerstvo minzdrav
mts mvd nalog neotlozhka odnoklassniki oms ozon pfr police policia policija politsia prokuratura
rospotrebnadzor rostelecom roszdravnadzor sber sberbank sbermed sfr skoraya strahovaya sud tele2
telegram-org tinkoff viber vkontakte vtb whatsapp wildberries yandex
```

**56 имён.** **Честное ограничение: этот список принципиально неполон** — чужих брендов бесконечно много.
Его роль — закрыть очевидное; остальное закрывается не списком, а процедурой снятия по жалобе, для которой
нужен слой 4 (§13.2) и админский экран. Не выдаю его за покрытие.

### Что я сознательно НЕ включил

- **Матерная лексика и оскорбления.** Класс настоящий (слуг светится в письмах, в push и в адресной
  строке), но список таких слов не место в плановом документе. Механика: короткий список корней ru/en,
  проверка **подстрокой**, ведётся отдельно от этого файла. Нужен — заведу отдельно, скажите.
- **Имена клиник-конкурентов** (`invitro`, `gemotest`, `medsi` и т.п.). Блокировать чужие клиники на своей
  платформе — не защита, а произвол, и границу провести нечем. Через жалобу, не списком.

---

## 5. Что придётся тронуть при внедрении — чтобы никого не удивило

Не работа этого документа, но без этого приземление сломается:

1. **Каждое добавленное имя обязано попасть И в код, И в CHECK базы одной миграцией.** Сторож
   `organizationSlugDbParity.devDbProof.test.ts` покраснеет иначе. Это уже случалось: находка 17.I того же
   плана — коммит `9071c7438` добавил `live` и `product` в код, миграции не выпустил, сторож стоял красным
   с 09.09 по 11.09.
2. **Проверка `reservedNamespace.test.ts`: «в резерве нет имени, которое формат и так не пропускает».**
   Все 507 предложенных имён — длиной ≥ 3 и валидной формы (проверено скриптом), так что тест не сломают.
   Но если владелец захочет резервировать двухбуквенные DNS-метки (`id`, `dr`, `vk`, `s3`) — им понадобится
   исключение в `isClaimableShape`, рядом с уже имеющимися `m`, `mx`, `ns`, `cp`. См. вопрос 4.
3. **Перед приземлением померить, не выселяет ли список живые клиники.** На TEST известны
   `saas-test-clinic-a`, `saas-test-clinic-b` — под список не попадают. **Прод не мерян** (нет доступа из
   этой сессии) — замер по `organization_slug_claims` обязателен до миграции, через порт-агента.
4. Слой 3 (расстояние + подстрока) — это новый код в валидаторе. В CHECK базы он не переносится: база
   остаётся backstop'ом по точному списку, алгоритмическая часть живёт только в приложении.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ

**1. Целиком или внутри?** Моя рекомендация: бренд (раздел А, слова ≥ 8 букв) — запрещён **где угодно
внутри** слуга; всё остальное — только как **весь слуг целиком** после нормализации. То есть
`master-zdorovya` разрешён, `master` — нет, `klinika-therapysto` — нет. Согласны?

**2. Запретить навсегда или «придержать за собой»?** Разделы Б и В (`medcentr`, `profi`, `master`, `guru`,
`premium`) — это ровно то, про что Вы говорили 19.08: «может я сам потом такое захочу создать». Их место —
слой «придержано платформой» (§13.2 плана от 19.08), который отдаёт имя без миграции. **Но этот слой
спроектирован и НЕ построен.** Развилка: (а) ждать, пока построим слой, и пока не блокировать — риск, что
имена займут; (б) заблокировать сейчас в коде отдельной помеченной секцией и перенести в слой, когда он
появится. Рекомендую (б).

**3. Минимальная длина — 3 или 4?** Сегодня 3, и именно поэтому `med`, `doc`, `pro`, `top`, `vip`, `lux`,
`spa` вообще достижимы и их приходится перечислять. Поднять до 4 — одно правило вместо десятка записей,
но отрежет и законные короткие имена. Рекомендую **оставить 3** и держать список: правило слишком грубое.

**4. Резервировать ли двухбуквенные метки?** `id.therapysto.ru` — живой хост. Как слуг `id` недостижим
(длина), но как DNS-метка — вполне. Нужно решение: резервировать ли `id`, `dr`, `vk`, `s3`, `tg` наравне
с уже зарезервированными `m`, `mx`, `ns`, `cp`, или считать, что минимальная длина 3 это закрывает.

**5. Уникальность по нормализованной форме между клиниками — вводить?** Сегодня `berezy`, `berezy1` и
`ber-ezy` могут принадлежать трём разным клиникам: уникальность стоит на сыром слуге. Это не про наш
бренд, это про то, что одна клиника может подделаться под другую. **[Я]** — Вы этого не просили, но дыра
того же класса. Ввести?

**6. Текст отказа.** Говорить ли человеку, ПОЧЕМУ имя недоступно? Для родовых слов подсказка полезна
(«добавьте название клиники»), для бренда — вредна (подсказывает границу перебора). Рекомендую: родовым —
подсказку, бренду — глухое «имя недоступно».

**7. Раздел Д (`gov`, `sberbank`, `police`) — утверждаете?** Это полностью моя инициатива. Список
принципиально неполон, и его ценность — закрыть очевидное, а не притвориться полным покрытием.

**8. Матерный список — заводить?** Отдельным файлом, не здесь.

---

**НЕ СДЕЛАНО:** механизм не реализован, миграция не написана, замер на проде не проведён, тесты не тронуты.
Это документ на утверждение, следующий шаг — Ваше «да/нет» по восьми вопросам выше.
