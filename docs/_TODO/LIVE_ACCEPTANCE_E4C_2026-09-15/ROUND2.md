# Живая приёмка Э4c, круг 2 — DEV `:5200`, 15.09.2026

## Итог

**PASS.** На `390×844` у пункта «Клиенты» в нижней навигации появилась красная точка. После
отказа по своей фикстуре она погасла вместе с тремя остальными отметками: плашкой «Сегодня»,
подсветкой строки клиента и активной карточкой в «Обзоре». То же состояние до/после подтверждено
на `1440×1024`; на desktop адаптивный эквивалент нижней навигации — sidebar.

На mobile соседняя точка «Задач» не изменилась: до и после отказа ссылка имела подпись
«Задачи. Есть просроченные задачи.» и одну красную точку. «Коммуникации» до и после были без
точки. Значит исправление не погасило соседние независимые отметки вместе с конфликтом.

Проверялся единственный общий Turbopack `http://127.0.0.1:5200` из главного дерева. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD && git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor df7433c9d HEAD && curl -sS -o /dev/null -w 'api_me_http=%{http_code}\n' http://127.0.0.1:5200/api/me"
# HEAD=df7433c9d; merge-base завершился rc=0; api_me_http=401
```

В обеих независимых browser-сессиях выполнен обычный парольный `POST
/api/auth/email-password/login` для `dimmdao@yandex.ru` с `Origin: http://127.0.0.1:5200` и
`Referer: http://127.0.0.1:5200/app`. Оба ответа:

```text
status: 200
{"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
```

Пароли и доступы из `.env` не читались.

## Что показано

| Что показано | Desktop `1440×1024` | Mobile `390×844` | Что на снимке видно |
|---|---|---|---|
| До: плашка «Сегодня» и красная отметка «Клиенты» | [01](round2-01-before-today-desktop-1440x1024.png) | [01](round2-01-before-today-mobile-390x844.png) | Плашка видна в обеих ширинах. На desktop красная точка у «Клиентов» в sidebar; на mobile красные точки одновременно у «Задач» и «Клиентов» в нижней навигации. |
| До: подсветка строки в списке | [02](round2-02-before-clients-desktop-1440x1024.png) | [02](round2-02-before-clients-mobile-390x844.png) | У обеих сторон конфликта красная левая граница и красная кнопка предупреждения. Для снятой строки замер дал `borderLeftWidth=3px`, `borderLeftColor=rgb(180, 84, 75)`, `conflictButtons=1`. |
| До: карточка в «Обзоре» | [03](round2-03-before-overview-desktop-1440x1024.png) | [03](round2-03-before-overview-mobile-390x844.png) | Карточка «Конфликт учётных записей» с действием «Разобрать» находится сверху в обзоре своей фикстуры. |
| После: плашки и отметки «Клиенты» нет | [04](round2-04-after-today-desktop-1440x1024.png) | [04](round2-04-after-today-mobile-390x844.png) | Плашка исчезла. Desktop-точка «Клиенты» погасла. На mobile у «Клиентов» точки больше нет, а независимая красная точка «Задач» сохранилась. |
| После: список без подсветки | [05](round2-05-after-clients-desktop-1440x1024.png) | [05](round2-05-after-clients-mobile-390x844.png) | Обе строки обычные. Для снятой строки замер дал `borderLeftWidth=0px`, `borderLeftColor=rgba(0, 0, 0, 0)`, `conflictButtons=0`. |
| После: активная карточка в «Обзоре» погасла | [06](round2-06-after-overview-desktop-1440x1024.png) | [06](round2-06-after-overview-mobile-390x844.png) | Карточки активного конфликта и «Разобрать» нет; вместо неё остался предусмотренный каноном след отказа «Попытка слияния учётных записей заблокирована специалистом». |

Все двенадцать PNG просмотрены глазами после прохода. На снимках нет загрузочного или промежуточного
состояния.

## Скринридерная подпись и mobile-nav

Значение `aria-label` снято с **видимой** ссылки нижней навигации до решения:

```text
Клиенты. Есть конфликт учётных записей клиента.
```

Дословный runtime-замер видимой нижней навигации до решения:

```text
Сегодня        aria-label="Сегодня"                                      red dots=0
Расписание     aria-label="Расписание"                                   red dots=0
Задачи         aria-label="Задачи. Есть просроченные задачи."             red dots=1
Клиенты        aria-label="Клиенты. Есть конфликт учётных записей клиента." red dots=1
Коммуникации   aria-label="Коммуникации"                                 red dots=0
```

После отказа у «Клиентов» измерены `aria-label="Клиенты"` и `red dots=0`; остальные строки этого
замера не изменились.

## Решение и погасшие отметки

Browser-driver открыл «Разобрать» в «Обзоре», нажал «Отказать», заполнил комментарий врача,
убедился, что переключатель техподдержки имеет `aria-checked=false`, и нажал отдельное
«Подтвердить». Применено решение только для UUID своей фикстуры
`c72d9741-4f58-49af-baa4-24b4d0fe03a2`:

```text
POST /api/doctor/account-merge-conflicts/c72d9741-4f58-49af-baa4-24b4d0fe03a2
body: {"action":"refuse","comment":"Это разные люди: контакты и медицинские истории принадлежат разным пациентам.","supportRequested":false}
status: 200
response: {"ok":true,"action":"refuse","supportRequested":false}
```

Сразу после ответа и после повторной загрузки каждого viewport summary вернул один результат:

```text
status: 200
{"ok":true,"hasConflicts":false,"conflictIds":[],"clientIds":[],"conflicts":[]}
```

Перед уборкой итоговая строка измерена командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && node -e \"const fs=require('node:fs'); const p='docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15'; for(const f of fs.readdirSync(p).filter(f=>f.startsWith('round2-')&&f.endsWith('.png')).sort()){const b=fs.readFileSync(p+'/'+f); console.log(f+' '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20));}\" && sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT id, status, resolved_at, resolved_by, doctor_comment, support_requested, payload #>> '{humanFioDecision,prompt,foundAccountId}' AS found_account_id FROM public.patient_merge_candidates WHERE id='c72d9741-4f58-49af-baa4-24b4d0fe03a2'::uuid;\""
```

Она вернула `status=dismissed`, `resolved_at=2026-09-15 20:58:37.721722+03`,
`resolved_by=b0021a38-fb86-45e9-9aec-d85014e932d4`, комментарий дословно,
`support_requested=false`, `found_account_id=00000000-0000-4000-8000-00000000c4a1`.

## Фикстура и уборка

Перед созданием запущен тот же cleanup+census, который затем применён после съёмки:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_round2_cleanup.sql"
```

Исходный census вернул нули для UUID фикстуры, pending/resolved медицинских конфликтов организации
и support-аудита. После этого one-shot setup создал две `platform_users`, две `user_identity`, два
контакта, два `org_enrollments`, два `clinical_visit`, две `treatment_program_instances` и два
`user_login_events`. Конфликт создан штатной дверью
`app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)` под действующей capability
`pre_session → app_pre_session`:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_round2_setup.sql"
# conflict_id=c72d9741-4f58-49af-baa4-24b4d0fe03a2
# platform_users=2; user_identity=2; org_enrollments=2; clinical_visit=2
# treatment_program_instances=2; user_login_events=2; patient_merge_candidates=1
```

Живой проход выполнен на переднем плане:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && node .live_acceptance_e4c_round2.mjs"
# RELEASED test lock (rc=0, 50s)
```

После съёмки cleanup удалил одну строку `patient_merge_candidates` и две `platform_users`; зависимые
строки удалились своими FK `ON DELETE CASCADE`. Тот же census после `COMMIT` вернул:

```text
fixture_users=0
fixture_identities=0
fixture_contacts=0
fixture_enrollments=0
fixture_visits=0
fixture_programs=0
fixture_login_events=0
fixture_conflicts=0
org_pending_medical=0
org_resolved_medical=0
fixture_support_audits=0
```

Итоговые счётчики совпали с исходными.

## Размеры снимков

Размеры прочитаны из PNG-заголовков той же командой, которая приведена выше перед DB-замером.
Её вывод:

```text
round2-01-before-today-desktop-1440x1024.png 1440x1024
round2-01-before-today-mobile-390x844.png 390x844
round2-02-before-clients-desktop-1440x1024.png 1440x1024
round2-02-before-clients-mobile-390x844.png 390x844
round2-03-before-overview-desktop-1440x1024.png 1440x1024
round2-03-before-overview-mobile-390x844.png 390x844
round2-04-after-today-desktop-1440x1024.png 1440x1024
round2-04-after-today-mobile-390x844.png 390x844
round2-05-after-clients-desktop-1440x1024.png 1440x1024
round2-05-after-clients-mobile-390x844.png 390x844
round2-06-after-overview-desktop-1440x1024.png 1440x1024
round2-06-after-overview-mobile-390x844.png 390x844
```

## НЕ СДЕЛАНО

- Не нажималось «Принять» и не выполнялось слияние; применён только локальный отказ по своей
  фикстуре.
- Обращение в техподдержку не отправлялось: переключатель оставался выключенным.
- Не менялись код продукта, схема, привилегии, env, тариф или данные настоящих клиентов.
- Миграции не запускались. TEST и оба PROD не читались и не затрагивались.
- Полный CI и автоматические UI-тесты не запускались. Browser-driver и SQL были одноразовыми и после
  прохода удалены; живые снимки не сохранены как тест.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.
