# Живая приёмка Э4b ПОСЛЕ приземления — DEV `:5200`, 15.09.2026

## Итог

**PASS: найденный прошлым проходом дефект исчез.** На `390x844` обе подписи конфликтной
модалки читаются целиком, а кнопки стоят одним столбцом и занимают всю доступную ширину. На
`1440x1024` обе подписи также читаются целиком; ряд действий справа сохранён.

Приёмка выполнена на общем стенде `http://127.0.0.1:5200`, обычным входом врача
`dimmdao@yandex.ru`, без второго Next-сервера. Перед проходом кандидат в главном дереве был
подтверждён командой:

```bash
git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD
# 975dfbc4e
```

Во время прохода в главном дереве появился только docs-коммит `e2cc0f819`, прямой потомок
`975dfbc4e`; код runtime он не менял:

```bash
git -C /home/dev/dev-projects/BersonCareBot show --no-ext-diff --stat --oneline e2cc0f819
# e2cc0f819 docs(queue): #1113 Л6 круг 2 — FAIL и коррекция: проверок телефона было три, осталась одна
#  docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md | 2 ++
```

## Фикстура и живой проход

В `bcb_webapp_dev` созданы две временные учётки с медицинской историей внутри организации
врача. Строка конфликта создана только штатной дверью
`app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)` после
`app.begin_port_context(...)` с настоящим `pre_session` context class и ролью
`app_pre_session`. Решения врача не нажимались.

Создание фикстуры выполнено под общим замком хоста:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off < /home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/.live_acceptance_e4b_setup.sql"
# db=bcb_webapp_dev
# org=a0000000-0000-4000-8000-000000000001
# doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# conflict=d26be045-d053-4b9c-899b-6df2f9a5cfa0
# platform_users=2 user_identity=2 org_enrollments=2 clinical_visit=2
# treatment_program_instances=2 user_login_events=2 patient_merge_candidates=1
```

Одноразовый browser-driver запущен через обязательный host-runner и после прохода удалён:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && python3 .live_acceptance_e4b_after.py"
# clear_session_status=200 login_status=200
# merge details/summary statuses: 200
# overlap_probe_status=409
# RELEASED test lock (rc=0, 23s)
```

`409` получен при штатной попытке сохранить запись на уже занятое время; именно он открыл
подтверждение наложения в `DoctorCalendarEventPanel`. Кнопка «Создать наложение» не нажималась.

## Снимки и ответы

| Снимок | Подписи читаются целиком | Раскладка действий | Вердикт |
|---|---|---|---|
| [Конфликт, desktop 1440×1024](01-after-desktop-1440x1024.png) | **Да**, обе | Один ряд справа сохранён | Дефекта нет |
| [Конфликт, mobile 390×844](02-after-mobile-390x844.png) | **Да**, обе | Один столбец, обе кнопки во всю доступную ширину | Прежний дефект исчез |
| [`PatientEncounterStartModal`, mobile 390×844](03-after-mobile-encounter-390x844.png) | **Да**: «Очный приём» и «Онлайн-приём» | Один столбец, обе кнопки во всю доступную ширину | Дефекта общего подвала нет |
| [`DoctorCalendarEventPanel`, mobile 390×844](04-after-mobile-overlap-390x844.png) | **Да**: «Отмена» и «Создать наложение» | Один столбец, обе кнопки во всю доступную ширину | Дефекта общего подвала нет |

На mobile нижняя панель действий на каждом снимке видна вместе с содержимым. Измеренная
геометрия кнопок: `x=17`, `width=356`, правая граница `373` при viewport шириной `390`; пары
расположены на `y=752` и `y=796`. У длинной кнопки отказа `clientWidth=354` и
`scrollWidth=354`, то есть горизонтального переполнения текста нет. На desktop кнопки стоят на
`y=718`, первая заканчивается на `x=829.640625`, вторая начинается на `x=837.640625` и
заканчивается на `x=1040`.

Размеры PNG подтверждены командой:

```bash
node -e "const fs=require('node:fs'); for (const f of process.argv.slice(1)) { const b=fs.readFileSync(f); console.log(f+' '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20)); }" docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/01-after-desktop-1440x1024.png docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/02-after-mobile-390x844.png docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/03-after-mobile-encounter-390x844.png docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/04-after-mobile-overlap-390x844.png
# docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/01-after-desktop-1440x1024.png 1440x1024
# docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/02-after-mobile-390x844.png 390x844
# docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/03-after-mobile-encounter-390x844.png 390x844
# docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/04-after-mobile-overlap-390x844.png 390x844
```

## Уборка фикстуры

Фикстура удалена под тем же host-lock. Контроль после `COMMIT`:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off < /home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/.live_acceptance_e4b_cleanup.sql"
# platform_users | user_identity | org_enrollments | clinical_visit | treatment_program_instances | user_login_events | patient_merge_candidates | all_pending_medical_conflicts
# 0              | 0             | 0               | 0              | 0                           | 0                 | 0                        | 0
# RELEASED test lock (rc=0, 0s)
```

## НЕ СДЕЛАНО

- Не нажимались решения конфликта «Слить в этой организации» и «Отказать и передать администраторам платформы».
- Не нажималась «Создать наложение»; первая попытка создания вернула `409`, поэтому запись не появилась.
- Не менялись код продукта и главное дерево; строка вердикта в `feat` не записывалась.
- Не применялись миграции и privilege reconcile; полный CI не запускался.
- Не создавались автоматические UI-тесты; одноразовые SQL-файлы и browser-driver удалены.
- PROD и TEST не затрагивались.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.
