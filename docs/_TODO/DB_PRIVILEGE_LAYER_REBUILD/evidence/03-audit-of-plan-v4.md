Проверка выполнена по репозиторию и документированной семантике PostgreSQL. Live TEST не использовался; текущие значения GUC, реальный каталог TEST и стоимость запросов на его данных — `UNVERIFIABLE-HERE`.

1. **WRONG — CRITICAL: load-bearing утверждение о неустранимой серверной записи неверно.**

План утверждает, что любой отказ обязательно записан до отправки ошибки клиенту и потому не может быть скрыт приложением ([PLAN.md:27](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:27)). Это верно только для необработанной серверной ошибки при исправно настроенном журналировании.

| Случай | Что реально увидит журнал |
|---|---|
| `log_min_messages` выше `ERROR` | Строки `ERROR` не будет. |
| `log_min_error_statement` выше `ERROR` | Основной `ERROR` может остаться, но SQL-оператор исчезнет. Само по себе это не подавляет ошибку. |
| PL/pgSQL `EXCEPTION` | Ошибка передаётся внутреннему обработчику и может вообще не дойти до серверного error reporter; журнал пуст. |
| `SECURITY DEFINER` | Необработанная ошибка обычно логируется, но под session user и внешним вызовом; обработанная внутри функции — нет. Сам `SECURITY DEFINER` не гарантирует ни наличие, ни достаточную атрибуцию. |
| Оператор внутри функции | Может быть виден только внешний `SELECT app.fn(...)`; внутренний объект/параметры не образуют стабильной сигнатуры. |
| Extended/prepared protocol | Необработанная ошибка обычно логируется, но параметры по умолчанию не включаются (`log_parameter_max_length_on_error=0`). Это не no-line случай само по себе, но разрушает атрибуцию. |
| RLS `SELECT` | Ноль, подмножество или лишние строки — штатный результат, ошибки и записи нет. |
| Ошибка подключения до backend | При отказе TCP/TLS/маршрутизации серверной SQL-записи нет; ошибка аутентификации после достижения backend обычно даёт `FATAL`, но не объектную сигнатуру. |

Это следует из [PostgreSQL logging configuration](https://www.postgresql.org/docs/16/runtime-config-logging.html), [PL/pgSQL exception handling](https://www.postgresql.org/docs/18/plpgsql-control-structures.html) и серверного error path, где `ERROR` передаётся текущему обработчику до `EmitErrorReport` ([PostgreSQL elog.c](https://doxygen.postgresql.org/elog_8c.html)).

Утверждение, что сессия не может отключить логирование ([PLAN.md:42](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:42)), также слишком сильное: PostgreSQL поддерживает `SET`-привилегии на параметры, а репозиторий уже содержит легитимную привилегированную сессию, устанавливающую оба порога в `panic` ([set-postgres-role-password.mjs:56](/home/dev/dev-projects/BersonCareBot/deploy/host/set-postgres-role-password.mjs:56)). Какие права на параметры имеют runtime-роли сейчас — `UNVERIFIABLE-HERE`.

2. **WRONG — CRITICAL: `(role, object, principal)` не является единицей авторизации PostgreSQL.**

План объявляет эту тройку полной и утверждает 100% покрытие ([PLAN.md:52](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:52)). Реальное решение зависит как минимум от:

- команды `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/CALL`;
- набора колонок и конкретных значений новой/старой строки;
- `USING` против `WITH CHECK`;
- permissive/restrictive policies;
- `session_user`, `current_user`, роли владельца и `SECURITY DEFINER/INVOKER`;
- `search_path`, GUC и connection options;
- триггеров, последовательностей и вызываемых функций;
- состояния данных, времени и ветви policy expression.

В PostgreSQL политики командно-зависимы, permissive-политики объединяются через `OR`, restrictive — через `AND`, а владельцы обычно обходят RLS ([CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html), [Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). Одна классификация таблицы не доказывает ни чтение, ни запись во всех этих режимах.

3. **HOLE — CRITICAL: flagship-дефект `platform_users` не видит ни один механизм.**

Visibility-проба охватывает только таблицы с `organization_id` ([PLAN.md:71](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:71)). У `platform_users` такой колонки нет ([schema.ts:105](/home/dev/dev-projects/BersonCareBot/apps/webapp/db/schema/schema.ts:105)). Её staff-видимость вычисляется косвенно через `org_enrollments` и `be_organization_members`, а политики различаются по операциям и ролям ([0355 migration:43](/home/dev/dev-projects/BersonCareBot/apps/webapp/db/drizzle-migrations/0355_platform_users_rls_d15b4_comment_reconcile_local.sql:43)).

Следовательно:

- журнал не видит silent zero, subset или excess;
- матрица исключает таблицу из visibility-пробы;
- `RLS+FORCE` лишь подтверждает существование ограждения, но не его правильность;
- ручное исправление текущего случая в Ш2 не предотвращает повторение.

Это прямой дефект класса, ради которого создаётся система, упавший между двумя механизмами.

4. **HOLE — CRITICAL: матрица не доказывает writes, capability-роли и non-table объекты.**

План сам признаёт, что шесть из одиннадцати ролей почти полностью слепы для матрицы, поскольку работают через definer-функции ([PLAN.md:107](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:107)). Замена доказательства журналом означает: ошибка будет обнаружена только после исполнения соответствующей runtime-ветви — возможно уже после потери сообщения или production-операции.

Не покрыты:

- `INSERT/UPDATE/DELETE`, RLS `WITH CHECK` и допустимость конкретной строки;
- sequence `USAGE`;
- права и побочные ошибки триггеров;
- EXECUTE и тело функций/процедур;
- schema/database/type/parameter privileges;
- ownership, membership, `BYPASSRLS`, default privileges;
- `CALL`;
- SECURITY DEFINER-body после изменения его SQL.

Эти классы реальны в репозитории: есть sequence-dependent defaults, явные sequence grants и DB-триггеры. PostgreSQL определяет отдельные права для таблиц, колонок, последовательностей, функций, процедур, схем, баз и параметров ([Privileges](https://www.postgresql.org/docs/16/ddl-priv.html)). Матрица `SELECT count(*)` этого не моделирует.

5. **WRONG — CRITICAL: заявление «внести лишнее полномочие незаметно нельзя» не соответствует артефактам плана.**

План ссылается на `relacl`, `pg_roles` и `pg_policies` ([PLAN.md:32](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:32)), но описанный baseline содержит классификацию table-cells и SELECT-наборы колонок, а три каталожные проверки — только:

1. RLS+FORCE для прямых org-таблиц;
2. список PL/pgSQL handlers;
3. наличие каждой таблицы в baseline.

Поэтому незаметно для заявленного diff можно изменить:

- `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER` privilege;
- sequence/function/procedure/schema ACL;
- членство и атрибуты роли;
- владельца объекта;
- default privileges;
- функцию, view или policy expression без изменения её inventory-строки;
- тело одной из четырёх уже allowlisted функций с `EXCEPTION`.

Особенно показательно противоречие: план обещает, что ACL capability-функций войдёт в baseline ([PLAN.md:192](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:192)), но ни один перечисленный артефакт не задаёт полный двусторонний function-ACL inventory. Рабочий шаблон такого контроля уже существует в `c5a`, но v4 не распространяет его на всю поверхность.

6. **HOLE — CRITICAL: visibility oracle не является независимым семантическим эталоном.**

Owner-count — не спецификация доступа. Он лишь сравнивает роль с владельцем на текущих строках одной организации. Это не доказывает:

- видимость строк с `organization_id IS NULL`;
- indirect/FK/polymorphic ownership;
- OWN-семантику пациента;
- правильность ветвей по status/type/time;
- отсутствие утечки данных, которых сегодня нет;
- корректность owner-executed views.

NULL-строки здесь не теория: platform library намеренно предоставляет staff строки `organization_id IS NULL` ([0250 migration:44](/home/dev/dev-projects/BersonCareBot/apps/webapp/db/drizzle-migrations/0250_c4d_platform_library_read_staff_scope.sql:44)), а leak-запрос плана их исключает.

Кроме того, два последовательных `SELECT` внутри обычного `BEGIN` при стандартном `READ COMMITTED` могут видеть разные snapshots. План не задаёт `REPEATABLE READ`, поэтому concurrent writes способны создать ложный diff или скрыть настоящий ([Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)).

7. **PARTIAL — HIGH: сопоставление с дефектами показывает большую непокрытую область.**

| Класс | Журнал | Матрица | Итог |
|---|---|---|---|
| Staff recognition, Calendar, branding, alerts, phone login, scheduler, T2 `42P01` | Только после реального необработанного DB-error | Обычно нет | Частичное постфактум-обнаружение |
| Write denial/RLS `WITH CHECK` | После исполнения | Нет | PARTIAL |
| Silent zero `platform_users` | Нет | Нет: отсутствует `organization_id` | HOLE |
| Partial visibility на прямой org-таблице с полным fixture | Нет | Да, для текущих строк | PARTIAL |
| Partial/excess на indirect/orgless таблице | Нет | Нет | HOLE |
| Owner/definer view excess | Нет | Не проверяется | HOLE |
| Новый столбец прямой таблицы | Нет | SELECT column-set может поймать | PARTIAL |
| Новый столбец через view/definer/JSON | Нет | Не задано | HOLE |
| Sequence/trigger/function-body denial | После исполнения, если не пойман внутри | Нет | HOLE до исполнения |

Дополнительно FINDINGS и PLAN не содержат канонического десятистрочного реестра «дефект → call path → роль → объект → операция → доказательство закрытия». В [FINDINGS.md:12](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:12) заявлено десять, но далее перечисляется меньше отдельных последствий. Поэтому утверждение «закрыты шесть из десяти» ([PLAN.md:182](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:182)) само не проверяемо.

8. **HOLE — HIGH: каждый gate обходится обычным хорошо намеренным изменением.**

| Gate | Самый дешёвый обычный обход |
|---|---|
| Denial signatures | Поймать ошибку внутри уже allowlisted PL/pgSQL-функции; попасть в уже известную `(role, state, object)` сигнатуру; не исполнить ветвь до production. |
| Authority matrix | Перенести доступ в SECURITY DEFINER, trigger, sequence, view или write; использовать таблицу без `organization_id`. |
| RLS+FORCE | Создать формально существующую, но семантически неправильную permissive-policy. |
| Handler inventory | Изменить тело одного из четырёх уже разрешённых обработчиков без изменения списка. |
| `pg_class` census | Добавить или изменить функцию, sequence, procedure, role, membership, view semantics либо default ACL. |
| Baseline diff | Перегенерировать baseline в том же migration diff и пометить изменение «принято». |
| Deploy/log gate | Внести code-only новый запрос, который до рестарта нигде не исполняется. |

Honesty-раздел признаёт неизвестные cells и writes, видимые только после первого исполнения ([PLAN.md:210](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:210)). Это честное описание, но для требования «agents cannot wreck it» данные дыры фатальны, а не приемлемы.

9. **WRONG — HIGH: `SET ROLE` не заменяет real-login proof, а существующий readiness не закрывает разницу.**

План делегирует `pg_hba`, `rolconfig` и connection options существующему C4 readiness ([PLAN.md:64](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:64)). PostgreSQL действительно применяет role-specific settings только при login, не при `SET ROLE` ([ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html)).

Но текущий readiness проверяет только четыре operational contour и вручную выбранные возможности ([assert-c4-operational-runtime-ready.sh:97](/home/dev/dev-projects/BersonCareBot/deploy/host/assert-c4-operational-runtime-ready.sh:97)). Он не доказывает все:

- физические login URL;
- staff/nonstaff routing;
- config reader, purge и telemetry paths;
- raw pools;
- connection-specific `options`;
- webapp/integrator search-path divergence.

Следовательно, делегация оставляет большую часть реальных подключений непроверенной.

10. **WRONG — HIGH: последовательность шагов невалидна.**

- Ш3 замораживает baseline до Ш5, который создаёт данные, необходимые для осмысленной классификации. После Ш5 потребуется повторное доказательство и re-baseline, которого в плане нет.
- Ш1 сначала allowlist’ит текущие дефекты; Ш2 обещает свести их к нулю, но не задаёт обязательное удаление известных сигнатур. Старая allowlisted сигнатура может навсегда маскировать рецидив в новом call site.
- Production deploy сейчас выполняет migration/readiness до рестарта нового кода ([deploy-prod.sh:175](/home/dev/dev-projects/BersonCareBot/deploy/host/deploy-prod.sh:175)). Значит demand-дефект нового кода ещё не мог попасть в лог.
- Webapp-only deploy после schema check сразу перезапускает сервис и отдельного authorization readiness не содержит ([deploy-webapp-prod.sh:117](/home/dev/dev-projects/BersonCareBot/deploy/host/deploy-webapp-prod.sh:117)).
- «Поставить на крон» противоречит репозиторному процессу: schedule changes должны проходить через `cronport.mjs` ([HOST_DEPLOY_README.md:986](/home/dev/dev-projects/BersonCareBot/deploy/HOST_DEPLOY_README.md:986)). Артефакт регистрации, health key и operator alert не запланированы.

Таким образом, утверждение «задержка — одно исполнение, не один релиз» не гарантировано.

11. **WRONG — HIGH: стоимость и production-безопасность существенно занижены.**

«Механическое» клонирование данных для 172 таблиц за 1–2 дня ([PLAN.md:171](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:171)) должно учитывать FK-граф, unique constraints, sequences, triggers, generated values, queues, side effects и специализированные ownership-модели.

Особенно опасно, что TEST является копией production-данных ([SERVER CONVENTIONS.md:118](/home/dev/dev-projects/BersonCareBot/docs/ARCHITECTURE/SERVER%20CONVENTIONS.md:118)). План не задаёт остановку writers, маркировку синтетических строк, cleanup, запрет delivery side effects или восстановление после частичного seed.

Также не оценены:

- до 1892 многократных `count(*)` каждые пять минут;
- полные RLS scans на production;
- log parsing/rotation race;
- блокировки и snapshot consistency;
- рост на каждую новую таблицу;
- поддержка permanent fixture после schema changes.

Реальная стоимость этих запросов на TEST/PROD — `UNVERIFIABLE-HERE`, но оценка «~80 строк SQL + один день» не имеет репозиторного обоснования.

12. **MISSING — HIGH: журнал не спроектирован как надёжный контрольный канал.**

Нет спецификации:

- logging destination и обязательной доступности collector;
- проверки effective GUC и parameter privileges;
- устойчивого cursor/checkpoint вместо скользящего окна;
- обработки rotation, duplicate и partial records;
- locale/version-independent парсинга object name;
- monitor-of-the-monitor;
- доставки `exit 1` человеку;
- retention, disk limits, PII/parameter policy;
- поведения при недоступности или переполнении журнала;
- защиты от одной старой сигнатуры, маскирующей новый call site.

`(role, SQLSTATE, object)` слишком груба: два разных контура, операции или функции могут иметь одинаковую сигнатуру. Это telemetry, но не доказательство правильной авторизации.

13. **MISSING — HIGH: отсутствует обязательный pre-merge trusted runner.**

Сам план признаёт, что Codex-агент не может запускать DB-gate и должен приложить committed output. Такой output можно забыть обновить, скопировать или получить на другой схеме. Deploy/cron ловят дефект после merge, а journal-demand — после исполнения.

Для требования «агенты не могут обойти» нужен required check на доверенном runner с настоящим PostgreSQL и неизменяемым результатом, а не текстовый артефакт, создаваемый тем же автором изменения.

14. **PARTIAL — MEDIUM: несколько узких элементов действительно полезны.**

Покрыто корректно:

- fail-open Node catches не требуется ломать — это сохраняет inbound messaging;
- исполнение лучше `EXPLAIN`;
- прямой extra/missing `SELECT` grant и изменение SELECT-набора колонок могут быть замечены;
- для заполненной прямой `organization_id`-таблицы paired owner/role counts способны заметить ноль или подмножество;
- `pg_class` census лучше существующего file parser для регистрации новых таблиц;
- явное признание различия `SET ROLE` и login правильно.

Но это полезные локальные проверки, а не замкнутая система. Сам план называет настоящий неотключаемый рубеж — capability-only DB API, где runtime-роли не имеют прямых table/column/sequence privileges ([PLAN.md:197](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:197)) — и затем откладывает именно его.

**Вердикт: нет, PLAN v4 не закрывает требование владельца; единственное изменение с максимальным эффектом — сделать capability-only database API текущим обязательным архитектурным рубежом, лишить runtime-роли прямых прав и доказывать каждый capability исполняемым positive/negative контрактом под реальным login, включая чтение, запись и tenant-isolation.**