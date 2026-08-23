# Независимый аудит — узкие runtime INSERT-grants (`796f88d48`)

**Вердикт: `PASS, FOR LAND`.**

Кандидат: `796f88d48` на `wt/runtime-write-grants-clean-20260823` (дерево чистое, `HEAD` `4b4928e90`).
Authority: `docs/_TODO/CURRENT_GOAL.md`, отчёт `RUNTIME_WRITE_GRANTS_CLEAN_2026-08-23.md`, runtime-находка
`42501` на рассылках и публичном адресе клиники. Метод по `AGENTS.md` §24.4: состав ролей/колонок и
отсутствие лишнего — взглядом на diff, сгенерированный SQL и интроспекцию живой DEV; достижимое
INSERT/RLS-поведение — существующим rollback-only тестом на `bcb_webapp_dev` плюс инъекция.
Уровень запуска — `local`/step по §10: полный CI не гонялся и признаков repo-уровня нет
(изменены только объявление прав, его артефакт и два теста в том же каталоге).

## Построчно по шести пунктам

| # | Требование | Итог | Доказательство |
|---|---|---|---|
| 1 | `app_staff` INSERT `public.broadcast_audit`: ровно `organization_id`, `executed_at` | **PASS** | diff `relation-access.ts:2384-2394` — две добавленные строки, удалений нет; сгенерированный `GRANT INSERT` вырос ровно на эти два имени |
| 2 | `app_staff` INSERT `public.broadcast_audit_recipients`: ровно `organization_id` | **PASS** | diff `relation-access.ts:2441-2444` — одна добавленная строка; в SQL `("audit_id", "platform_user_id")` → `("audit_id", "organization_id", "platform_user_id")` |
| 3 | `app_staff` INSERT `public.clinic_public_directory_entries`: ровно восемь emitted-колонок | **PASS** | diff `relation-access.ts:2550-2564` — ровно восемь добавленных строк: `card_is_published`, `description`, `locations_json`, `logo_media_id`, `photo_media_ids`, `public_contact_email`, `public_contact_phone`, `public_website_url` |
| 4 | Generated DEV/TEST SQL побайтно следует рукописному `relation-access.ts` | **PASS** | `generate-cli.mjs --db bcb_webapp_dev --check` и `--db bersoncarebot_test --check` — оба «совпадает побайтно», `rc=0` (код читался отдельной строкой, не после пайпа) |
| 5 | `runtime-role-write-grants.devDbProof.test.mjs` доказывает INSERT/42501/RLS/rollback | **PASS** | 7/7 зелёных на живой `bcb_webapp_dev`; инъекция дала 4 красных; следов в базе нет |
| 6 | В кандидат не попал несвязанный scope | **PASS** | `git diff feat/doctor-ui-rebuild..HEAD --stat` — ровно шесть файлов кандидата; упоминания исключённого scope есть только в тексте коммита и секции «NOT ported» отчёта, ни строки кода или SQL |

## Что проверено самостоятельно, а не принято по отчёту

**Полнота колонок доказана интроспекцией, а не рассуждением о Drizzle.** Слабое место такой правки — «а вдруг
Drizzle называет ещё одну колонку, которой в гранте нет»: доказательный тест пишет список колонок руками, то
есть повторяет модель автора, а не поведение ORM. Замер на живой DEV (`pg_attribute`) закрывает эту дыру
структурно — гранты после правки совпадают с ПОЛНЫМ физическим набором колонок всех трёх отношений:

- `broadcast_audit` — 16 колонок в базе, 16 в гранте;
- `broadcast_audit_recipients` — 3 и 3;
- `clinic_public_directory_entries` — 15 и 15 (совпадает и с Drizzle-схемой `apps/webapp/db/schema/clinicDirectory.ts`,
  где `organization_id` — первичный ключ, отдельного `id` нет).

Ни одна emitted-колонка физически не может оказаться вне гранта, какими бы ни были правила эмиссии Drizzle.
Обратная сторона — что грант не шире нужного — верна по тому же замеру: раз INSERT называет все колонки
отношения, полный набор и есть минимальный.

**Инъекция: тест чувствителен именно к этой правке.** Артефакт `privileges.bcb_webapp_dev.sql` подменён на
версию из `796f88d48^`, прогон повторён, файл возвращён (`git status` чист):

```
not ok 1 - generated broadcast grants admit the full Drizzle inserts after table privilege reset
ok   2 - broadcast proof turns red for each newly required audit column
ok   3 - broadcast recipient proof turns red for its newly required organization_id column
not ok 4 - INSERT privilege does not cross the broadcast tenant wall
not ok 5 - generated clinic-directory grant admits the production Drizzle insert in its clinic
ok   6 - clinic-directory proof turns red for every newly required Drizzle DEFAULT column
not ok 7 - INSERT privilege does not cross the clinic-directory tenant wall
# tests 7 / pass 3 / fail 4
```

Красные `1` и `5` — это ровно те два `42501`, ради которых заведён кандидат: до правки штатный INSERT не
проходит. Красные `4` и `7` — следствие того же: тесты стены ждут отказа именно RLS-политики, а на старом
гранте вставка не доживает до неё, падая на правах. Зелёные `2`, `3`, `6` при подмене ожидаемы — они и так
отзывают колонку.

**Rollback реален, а не заявлен.** После обоих прогонов на DEV: `broadcast_audit` со строкой `rollback proof` —
`0`, `clinic_public_directory_entries` с `Rollback proof` — `0`, общее число строк каталога `4` (не изменилось).
Каждый блок — `BEGIN … ROLLBACK`, отказные — под `ON_ERROR_STOP=1`, обрыв соединения откатывает.

**Стена арендатора не ослаблена выданным `organization_id`.** Главный риск правки — что право писать
`organization_id` даст записать чужую организацию. Тесты `4` и `7` показывают отказ RLS-политики
(`row-level security policy for table …`) при подстановке чужого `organization_id` — принципал остаётся
запертым в своей клинике на обоих путях.

**Правка теста — не ослабление.** `relation-access.test.mjs` обновляет единственное жёстко зашитое ожидание
`exactColumns` для `clinic_public_directory_entries`; проверка остаётся ТОЧНОЙ (не «содержит»), просто под новый
состав. Это §10 «тесты подгоняются под код», а не снятие гейта. 43/43 зелёные.

**Соседняя дверь проверена и дефекта не даёт.** `app_seam_specialist_provision_owner` сохранил прежний список
из семи колонок на том же отношении. Это не забытая половина правки: тот путь идёт через definer-функцию с
явным списком колонок, а не через Drizzle, и покрыт своим живым доказательством
`specialist-owner-provisioning.devDbProof.test.mjs`, которое ассертит появление строки каталога.

## Наблюдения вне owner scope (не задачи, §10 — recommendation)

1. `relation-access.test.mjs` не имеет `exactColumns`-ожиданий для `broadcast_audit` и
   `broadcast_audit_recipients` — состав их грантов декларативным тестом не пришпилен. Поведение при этом
   покрыто новым DEV-доказательством, так что дыры в защите нет; это про то, где ловится будущий дрейф.
2. `auditInsert` в доказательстве подаёт `'{}'::jsonb` в текстовую колонку `audience_filter`. Postgres принимает
   это через I/O-приведение в assignment-контексте, тест валиден; но литерал не соответствует типу колонки и
   читается как опечатка.

## НЕ СДЕЛАНО

- Полный CI, deploy, push, PROD и `--execute` — по брифу не выполнялись.
- Живой клик-through рассылки и создания публичного адреса на TEST не делался: TEST в скоуп аудита не входил,
  доказательство ограничено `bcb_webapp_dev`.
- Не проверялось, нет ли того же класса `42501` на других отношениях: `~80-табличный` overlay сознательно
  оставлен за границей кандидата, и это отдельный вопрос владельцу, а не дефект `796f88d48`.
