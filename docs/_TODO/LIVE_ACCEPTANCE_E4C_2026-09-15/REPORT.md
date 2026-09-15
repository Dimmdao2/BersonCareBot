# Живая приёмка Э4c — DEV `:5200`, 15.09.2026

## Итог

**FAIL по одному достигнутому сценарию: на `390×844` у пункта «Клиенты» нет красной точки.**
На desktop увидены все четыре красных входа; на mobile — плашка «Сегодня», подсветка строки и
карточка «Обзора», но иконка «Клиенты» в bottom-nav остаётся без отметки. «Принять» открыл
отдельное подтверждение с обязательным комментарием; подтверждение
закрыто без применения, конфликт остался `pending`. «Отказать» показал комментарий и отдельный
вопрос «Отправить обращение в техподдержку?». Выполнен только отказ с выключенной отправкой в
техподдержку.

После отказа на desktop погасли все четыре входа; на mobile погасли три существовавших входа,
а точку «Клиенты» оценить как погасшую нельзя — до решения её не было. В обеих карточках временных учёток осталась пометка
«Попытка слияния учётных записей заблокирована специалистом». Из обеих карточек открыты
подробности: дата, две конфликтующие учётки, почта одной стороны, телефон другой, инициатор,
специалист и комментарий врача видны.

Проверялся единственный общий Turbopack `http://127.0.0.1:5200` из главного дерева. Второй Next
не запускался. Фактический runtime:

```bash
git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD
# 35b0cfcc6
git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor 260d55362 HEAD; printf 'e4c_in_runtime=%s\n' "$?"
# e4c_in_runtime=0
```

Две независимые browser-сессии вошли обычным человеческим `POST
/api/auth/email-password/login` с `Origin: http://127.0.0.1:5200`, `Referer` того же хоста и
`roleLoginPortal: doctor`. Результат обеих: `200`, `{"ok":true,"redirectTo":"/app/doctor","role":"doctor"}`.
Пароли и доступы из `.env` не читались.

## Что показано

| Что показано | Desktop `1440×1024` | Mobile `390×844` | Что видно |
|---|---|---|---|
| До: плашка «Сегодня» | [01](01-before-today-desktop-1440x1024.png) | [01](01-before-today-mobile-390x844.png) | Плашка «Требует вашего внимания…» видна в обеих ширинах. |
| До: красная точка «Клиенты» | [01](01-before-today-desktop-1440x1024.png) | [01 — дефект](01-before-today-mobile-390x844.png) | Desktop: точка видна в sidebar. Mobile: иконка «Клиенты» в нижнем меню без точки; единственная красная точка относится к «Задачам». **FAIL.** |
| До: подсвеченная строка клиента | [02](02-before-clients-desktop-1440x1024.png) | [02](02-before-clients-mobile-390x844.png) | У строки «Петрова Анна Сергеевна» красная левая граница и красная кнопка предупреждения. |
| До: карточка в «Обзоре» | [03](03-before-overview-desktop-1440x1024.png) | [03](03-before-overview-mobile-390x844.png) | Карточка «Конфликт учётных записей» и действие «Разобрать». |
| «Принять» — отдельное подтверждение | [04](04-accept-confirmation-desktop-1440x1024.png) | [04](04-accept-confirmation-mobile-390x844.png) | Текст «После подтверждения учётные записи будут объединены», комментарий врача и отдельная кнопка «Подтвердить»: слияние не происходит по первому нажатию. Модалка закрыта без применения. |
| «Отказать» — комментарий и вопрос поддержки | [05](05-refuse-confirmation-desktop-1440x1024.png) | [05](05-refuse-confirmation-mobile-390x844.png) | Комментарий врача, вопрос «Отправить обращение в техподдержку?» и выключенный переключатель. |
| После: «Сегодня» без плашки; desktop «Клиенты» без точки | [06](06-after-today-desktop-1440x1024.png) | [06](06-after-today-mobile-390x844.png) | Плашки нет в обеих ширинах. Desktop-точка исчезла. На mobile точки не было и до решения, поэтому это не доказательство её гашения. |
| После: список без подсветки | [07](07-after-clients-desktop-1440x1024.png) | [07](07-after-clients-mobile-390x844.png) | Строка обычная, красная кнопка исчезла. Runtime-факты: `conflict_buttons=0`, `destructive_left_border=false`. |
| След отказа — учётка 1 | [08](08-after-overview-account-a-desktop-1440x1024.png) | [08](08-after-overview-account-a-mobile-390x844.png) | Пометка отказа и дата в карточке Ивановой Анны Сергеевны. |
| Подробности из учётки 1 | [09 верх](09-refusal-details-account-a-top-desktop-1440x1024.png), [10 низ](10-refusal-details-account-a-bottom-desktop-1440x1024.png) | [09 верх](09-refusal-details-account-a-top-mobile-390x844.png), [10 низ](10-refusal-details-account-a-bottom-mobile-390x844.png) | Дата, инициатор Петрова Анна Сергеевна, специалист Дмитрий Берсон, комментарий, обе учётки, почта и телефон. |
| След отказа — учётка 2 | [08](08-after-overview-account-b-desktop-1440x1024.png) | [08](08-after-overview-account-b-mobile-390x844.png) | Та же пометка отказа и дата в карточке Петровой Анны Сергеевны. |
| Подробности из учётки 2 | [09 верх](09-refusal-details-account-b-top-desktop-1440x1024.png), [10 низ](10-refusal-details-account-b-bottom-desktop-1440x1024.png) | [09 верх](09-refusal-details-account-b-top-mobile-390x844.png), [10 низ](10-refusal-details-account-b-bottom-mobile-390x844.png) | Из второй карточки открывается тот же полный след: обе стороны, контакты, инициатор, специалист, дата и комментарий. |

Снимки просмотрены глазами после прохода. Первоначальный browser-driver напечатал для mobile
`nav_conflict_labels=1`, но повторный просмотр PNG показал, что это hidden desktop-sidebar в DOM,
а не видимый mobile-элемент; вывод драйвера не принят как визуальное доказательство. На mobile подробности сняты сверху и после прокрутки
вниз, поэтому обе учётки и оба конфликтующих контакта остаются видимым, а не только DOM-доказательством.

## Найденный дефект

Достижимый сценарий: врач открывает кабинет при медицинском конфликте на ширине `390px` → в
нижнем меню пункт «Клиенты» не получает красную точку → один из четырёх обязательных входов не
сигнализирует о конфликте. Это нарушает прямую строку Э4c и §18б канона.

Повторная живая попытка раскрыть hamburger-меню не дала обхода: пункт «Клиенты» там отсутствует,
потому что пять пунктов нижней панели исключаются из sheet. Ожидание видимой ссылки с
`aria-label="Клиенты. Есть конфликт учётных записей клиента."` истекло через 30 секунд; Playwright
63 раза находил только hidden desktop-sidebar.

Инспекция существующего пути объясняет снимок без предположений:

```bash
sed -n '1,130p' apps/webapp/src/shared/ui/doctor/shell/DoctorBottomNav.tsx
sed -n '480,530p' apps/webapp/src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx
rg -n "MOBILE_SHELL_NAV_IDS" apps/webapp/src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx
```

- `DoctorBottomNav.tsx`: `hasAttention` подключает только `communications` и `tasks`; состояние
  `medicalMergeConflicts` для `patients` не читается.
- `DoctorMenuAccordion.tsx:131,502`: `patients` входит в `MOBILE_SHELL_NAV_IDS`, поэтому скрыт в
  hamburger sheet как уже представленный в bottom-nav.

Код не исправлялся: бриф этой приёмки разрешает из продуктовых действий только отказ по своей
фикстуре.

## Выполненное решение

До нажатия «Отказать» «Принять» было закрыто через «Назад» и `Escape`. Повторное чтение summary
вернуло тот же `pending`-конфликт `f2211630-27da-4fa6-816e-b413c9759216`.

Единственное применённое действие:

```text
POST /api/doctor/account-merge-conflicts/f2211630-27da-4fa6-816e-b413c9759216
body: {"action":"refuse","comment":"Это разные люди: контакты и медицинские истории принадлежат разным пациентам.","supportRequested":false}
status: 200
response: {"ok":true,"action":"refuse","supportRequested":false}
```

После него summary немедленно ответил:

```text
status: 200
{"ok":true,"hasConflicts":false,"conflictIds":[],"clientIds":[],"conflicts":[]}
```

Перед уборкой итоговая запись измерена командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT id, status, resolved_at, resolved_by, doctor_comment, support_requested, payload #>> '{humanFioDecision,prompt,foundAccountId}' AS found_account_id FROM public.patient_merge_candidates WHERE id='f2211630-27da-4fa6-816e-b413c9759216'::uuid;\""
```

Результат: `status=dismissed`, `resolved_at=2026-09-15 20:22:53.128101+03`,
`resolved_by=b0021a38-fb86-45e9-9aec-d85014e932d4`, комментарий сохранён дословно,
`support_requested=false`, найденная учётка — `00000000-0000-4000-8000-00000000c4a1`.

## Фикстура и уборка

До фикстуры в организации врача не было чужих медицинских конфликтов. Команда измерения:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"WITH doctor AS (SELECT pu.id AS doctor_id, m.organization_id FROM public.platform_users pu JOIN public.user_contacts c ON c.platform_user_id=pu.id AND c.contact_kind='email' JOIN public.be_organization_members m ON m.platform_user_id=pu.id AND m.status='active' WHERE c.value_normalized='dimmdao@yandex.ru') SELECT doctor.doctor_id, doctor.organization_id, count(candidate.id) FILTER (WHERE candidate.status='pending' AND candidate.reason LIKE 'medical_history:%') AS org_pending_medical, count(candidate.id) FILTER (WHERE candidate.status IN ('dismissed','escalated') AND candidate.reason LIKE 'medical_history:%') AS org_resolved_medical FROM doctor LEFT JOIN public.patient_merge_candidates candidate ON candidate.organization_id=doctor.organization_id GROUP BY doctor.doctor_id, doctor.organization_id;\""
# doctor_id=b0021a38-fb86-45e9-9aec-d85014e932d4
# organization_id=a0000000-0000-4000-8000-000000000001
# org_pending_medical=0; org_resolved_medical=0
```

Фикстура заведена дословно этой командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_setup.sql"
```

One-shot setup создал две `platform_users`, две `user_identity`, два контакта, два
`org_enrollments`, два `clinical_visit`, две `treatment_program_instances` и два
`user_login_events`. Сам конфликт создан штатной дверью
`app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)` под действующей capability
`pre_session → app_pre_session`; дверь вернула `f2211630-27da-4fa6-816e-b413c9759216`.

Фикстура убрана дословно этой командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_cleanup.sql"
# DELETE 1  -- patient_merge_candidates
# DELETE 2  -- platform_users; зависимые строки удалены своими FK ON DELETE CASCADE
# COMMIT
```

После просмотра основных PNG тот же summary-конфликт был кратко восстановлен на тех же двух UUID,
чтобы проверить, не переехала ли mobile-точка в hamburger sheet. Дословная команда второго
создания:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_menu_setup.sql"
# INSERT 0 2
# конфликт создан той же app.record_patient_medical_merge_conflict(...): 46461689-dcbc-440f-ba39-dd5b009fd1c1
# COMMIT
```

Эта узкая повторная фикстура содержала только две временные `platform_users` и одну строку
конфликта, потому что проверялся только счётчик summary/навигации; ни одно решение по ней не
нажималось. После живой попытки она убрана дословно:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off < /home/dev/dev-projects/bcb-wt-merge-conflict/.live_acceptance_e4c_menu_cleanup.sql"
# DELETE 1
# DELETE 2
# COMMIT
```

Один и тот же запрос выполнен до создания и после уборки:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"WITH scope AS (SELECT 'a0000000-0000-4000-8000-000000000001'::uuid AS org_id, ARRAY['00000000-0000-4000-8000-00000000c4a1'::uuid,'00000000-0000-4000-8000-00000000c4a2'::uuid] AS user_ids) SELECT (SELECT count(*) FROM public.platform_users, scope WHERE id=ANY(scope.user_ids)) AS fixture_users, (SELECT count(*) FROM public.user_identity, scope WHERE platform_user_id=ANY(scope.user_ids)) AS fixture_identities, (SELECT count(*) FROM public.user_contacts, scope WHERE platform_user_id=ANY(scope.user_ids)) AS fixture_contacts, (SELECT count(*) FROM public.org_enrollments, scope WHERE platform_user_id=ANY(scope.user_ids)) AS fixture_enrollments, (SELECT count(*) FROM public.clinical_visit, scope WHERE patient_user_id=ANY(scope.user_ids)) AS fixture_visits, (SELECT count(*) FROM public.treatment_program_instances, scope WHERE patient_user_id=ANY(scope.user_ids)) AS fixture_programs, (SELECT count(*) FROM public.user_login_events, scope WHERE user_id=ANY(scope.user_ids)) AS fixture_login_events, (SELECT count(*) FROM public.patient_merge_candidates candidate, scope WHERE candidate.organization_id=scope.org_id AND candidate.anchor_user_id=ANY(scope.user_ids) AND candidate.candidate_user_id=ANY(scope.user_ids)) AS fixture_conflicts, (SELECT count(*) FROM public.patient_merge_candidates candidate, scope WHERE candidate.organization_id=scope.org_id AND candidate.status='pending' AND candidate.reason LIKE 'medical_history:%') AS org_pending_medical, (SELECT count(*) FROM public.patient_merge_candidates candidate, scope WHERE candidate.organization_id=scope.org_id AND candidate.status IN ('dismissed','escalated') AND candidate.reason LIKE 'medical_history:%') AS org_resolved_medical, (SELECT count(*) FROM public.admin_audit_log audit WHERE audit.details->'candidateIds' ?| ARRAY['00000000-0000-4000-8000-00000000c4a1','00000000-0000-4000-8000-00000000c4a2']) AS fixture_support_audits;\""
```

Оба результата совпали:

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

То есть после уборки совпали не только UUID фикстуры, но и общие счётчики медицинских конфликтов
организации. Support-аудит не появился, что соответствует выключенному вопросу техподдержки.

## Размеры снимков

PNG-заголовки прочитаны командой:

```bash
node -e "const fs=require('node:fs'); const path=require('node:path'); const dir='docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15'; const files=fs.readdirSync(dir).filter(f=>f.endsWith('.png')).sort(); let desktop=0,mobile=0,bad=0; for(const f of files){const b=fs.readFileSync(path.join(dir,f)); const size=b.readUInt32BE(16)+'x'+b.readUInt32BE(20); const expected=f.includes('-desktop-')?'1440x1024':f.includes('-mobile-')?'390x844':'unknown'; if(expected==='1440x1024')desktop++; if(expected==='390x844')mobile++; if(size!==expected){bad++; console.log('MISMATCH '+f+' '+size+' expected='+expected);}} console.log('png='+files.length+' desktop_1440x1024='+desktop+' mobile_390x844='+mobile+' mismatches='+bad);"
# png=26 desktop_1440x1024=13 mobile_390x844=13 mismatches=0
```

## НЕ СДЕЛАНО

- «Принять» не подтверждалось: по брифу его требовалось только открыть и закрыть без применения.
- Обращение в техподдержку не отправлялось: переключатель оставлен выключенным; выполнен локальный отказ.
- Пациентская учётка владельца `kinesiospace@gmail.com` не использовалась: след проверялся врачом в карточках обеих конфликтующих учёток, а не входом пациента; парольного пути у неё нет.
- Не менялись код продукта, схема, привилегии, env или данные тарифа; миграции не запускались.
- Не запускались автоматические UI-тесты и полный CI. One-shot SQL и browser-driver удалены после прохода и не сохранены как тест.
- TEST и оба PROD не читались и не затрагивались.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нужно ли отдельной командой открыть correction Э4c для недостающей mobile-точки «Клиенты»?
Продуктового решения не требуется: ожидаемое поведение уже однозначно задано §18б.
