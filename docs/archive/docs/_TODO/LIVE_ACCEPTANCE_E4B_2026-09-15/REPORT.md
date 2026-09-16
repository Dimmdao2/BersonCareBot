# Живая приёмка Э4b и KPI Л2 — DEV `:5200`, 15.09.2026

## Итог

**FAIL.** Четыре индикатора медицинского конфликта видны в живом кабинете владельца клиники, но
содержимое общей модалки не открывается: detail API отвечает `500`, потому что runtime не находит
объявленную capability для `app.read_staff_patient_medical_merge_conflict(uuid)`. KPI «Заявки» на
DEV также не виден: у единственной управляющей учётки механика `leads` не включена в тарифе и нет
override.

Проверялся общий Turbopack `http://127.0.0.1:5200` из
`/home/dev/dev-projects/BersonCareBot`, без второго Next-сервера. В момент итогового прохода:

```bash
git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD
# 90b8eee9b
git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor 359df0834 HEAD; printf '359df0834_in_HEAD=%s\n' "$?"
# 359df0834_in_HEAD=0
git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor 543f31516 HEAD; printf '543f31516_in_HEAD=%s\n' "$?"
# 543f31516_in_HEAD=0
```

Живой путь: отдельный browser context → `/api/auth/dev-public` → обычный email/password вход
`dimmdao@yandex.ru` → `/app/doctor` → плашка → `/app/doctor/patients` → кнопка конфликта в строке →
карточка клиента → вкладка «Обзор» → «Разобрать». Одноразовый browser-driver не сохранён как тест
по запрету §10a; команда прохода была:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && python3 .live_acceptance.py"
```

## Шаг 1 — права и тариф на DEV

Команда чтения:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT o.id AS organization_id, o.title, m.role AS membership_role, m.status, (m.role IN ('owner','admin')) AS can_manage_organization, m.specialist_id IS NOT NULL AS has_specialist, pu.id AS platform_user_id, pu.display_name, c.value_normalized AS email, t.name AS tariff_name, t.mechanics ->> 'leads' AS tariff_leads, ov.enabled AS leads_override, ov.expires_at AS leads_override_expires_at FROM public.be_organizations o JOIN public.be_organization_members m ON m.organization_id=o.id JOIN public.platform_users pu ON pu.id=m.platform_user_id LEFT JOIN public.user_contacts c ON c.platform_user_id=pu.id AND c.contact_kind='email' AND c.is_primary=true LEFT JOIN public.saas_tariffs t ON t.id=o.tariff_id LEFT JOIN public.saas_org_entitlement_overrides ov ON ov.organization_id=o.id AND ov.mechanic='leads' WHERE o.title='Точка Здоровья' AND m.status='active' ORDER BY m.role, pu.id;\""
```

Запрос вернул одну строку:

| Учётка | Membership | Может управлять | Есть specialist | Тариф | `tariff_leads` | Override |
|---|---|---:|---:|---|---|---|
| `dimmdao@yandex.ru` | `owner`, active | да | да | `ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК` | `NULL` | отсутствует |

`leads` имеет класс «возможность»: без `mechanics.leads=true` и без активного override итоговая
доступность равна `false`. Тариф и права не менялись.

## Шаг 2 — KPI Л2

- **Не увидел «Заявки».** На «Сегодня» живьём видны `СООБЩЕНИЯ → КОММЕНТАРИИ → ЗАДАЧИ`;
  требуемую последовательность `Сообщения → Комментарии → Заявки → Задачи` DEV показать не может,
  потому что `leads` выключен данными тарифа. Снимок: [01-today-banner-and-kpi.png](01-today-banner-and-kpi.png).
- «Тесты» не видны. Это подтверждает снятие старой плитки, но не заменяет отсутствующее доказательство
  третьей плитки «Заявки».

## Шаг 3 — четыре входа Э4b

| Вход | Результат |
|---|---|
| Плашка на «Сегодня» | **Увидел:** «Требует вашего внимания: конфликт учётных записей клиента». [Снимок](01-today-banner-and-kpi.png). |
| Красная точка на «Клиенты» | **Увидел:** красная точка рядом с пунктом; live aria-label — «Клиенты. Есть конфликт учётных записей клиента.». [Снимок](02-clients-nav-red-dot.png). |
| Подсветка строки в списке | **Увидел:** обе строки пустышек имеют красную левую границу и кнопку-предупреждение. [Снимок](04-clients-list-conflict-row.png). |
| Карточка сверху в «Обзоре» | **Увидел:** карточка «Конфликт учётных записей» с кнопкой «Разобрать» на `/app/doctor/patients/00000000-0000-4000-8000-00000000b4a1?returnTo=%2Fapp%2Fdoctor%2Fpatients`. [Снимок](06-client-overview-conflict-card.png). |

Плашка, кнопка строки и «Разобрать» открыли одинаковый dialog «Конфликт учётных записей» с одинаковыми
двумя действиями. Снимки: [из «Сегодня»](03-shared-modal-from-today.png),
[из списка](05-shared-modal-from-list.png), [из «Обзора»](07-shared-modal-from-overview.png).
Подпись отказа во всех трёх открытиях — **«Отказать и передать администраторам платформы»**; слов
«в поддержку» в модалке нет.

Однако модалка показывает «Конфликт больше недоступен», поэтому ФИО обеих сторон, последнюю активность,
назначения и даты увидеть не удалось. Browser fetch дал:

```text
GET /api/doctor/account-merge-conflicts                                  -> 200, конфликт найден
GET /api/doctor/account-merge-conflicts/00000000-0000-4000-8000-00000000b4c1 -> 500
```

Точная причина из runtime-log получена командой:

```bash
rg -n -C 4 "account-merge-conflicts/00000000|read_staff_patient_medical|permission denied|accepted port context|required|Error:" /home/dev/dev-projects/BersonCareBot/apps/webapp/.next/dev-server-turbo.log | tail -240
```

```text
Missing unique declared webapp port capability for app.read_staff_patient_medical_merge_conflict(uuid)
```

## Фикстура и уборка

Во временную фикстуру вошли две `platform_users`, две `user_identity`, две `org_enrollments`, две
`clinical_visit`, две `treatment_program_instances`, две `user_login_events` и один
`patient_merge_candidates`: суммарно 13 строк. Ввод и удаление выполнялись через общий host-lock;
миграции и privilege reconcile не запускались.

Контроль после явного удаления всех детерминированных UUID:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT (SELECT count(*) FROM public.platform_users WHERE id IN ('00000000-0000-4000-8000-00000000b4a1','00000000-0000-4000-8000-00000000b4a2')) + (SELECT count(*) FROM public.user_identity WHERE platform_user_id IN ('00000000-0000-4000-8000-00000000b4a1','00000000-0000-4000-8000-00000000b4a2')) + (SELECT count(*) FROM public.org_enrollments WHERE id IN ('00000000-0000-4000-8000-00000000b4b1','00000000-0000-4000-8000-00000000b4b2')) + (SELECT count(*) FROM public.clinical_visit WHERE id IN ('00000000-0000-4000-8000-00000000b4e1','00000000-0000-4000-8000-00000000b4e2')) + (SELECT count(*) FROM public.treatment_program_instances WHERE id IN ('00000000-0000-4000-8000-00000000b4d1','00000000-0000-4000-8000-00000000b4d2')) + (SELECT count(*) FROM public.user_login_events WHERE id IN ('00000000-0000-4000-8000-00000000b4f1','00000000-0000-4000-8000-00000000b4f2')) + (SELECT count(*) FROM public.patient_merge_candidates WHERE id='00000000-0000-4000-8000-00000000b4c1') AS fixture_rows_left, (SELECT count(*) FROM public.patient_merge_candidates WHERE status='pending' AND reason LIKE 'medical_history:%') AS all_pending_medical_conflicts_left;\""
```

Результат: `fixture_rows_left = 0`, `all_pending_medical_conflicts_left = 0`.

## НЕ СДЕЛАНО

- Не подтверждён порядок из четырёх KPI: «Заявки» отсутствуют из-за данных тарифа DEV.
- Не подтверждено содержимое модалки (две учётки, последняя активность, назначения и даты): detail API
  падает до SQL из-за отсутствующей runtime capability.
- Не исправлялся код, не менялись тариф/override, runtime env или привилегии; миграции на DEV не
  применялись и reconcile не запускался.
- Не запускались автоматические UI-тесты и полный CI.
- Не использовалась и не проверялась паролем `dimmdao@gmail.com`; PROD не затрагивался.
- Строка вердикта в очередь не добавлялась.
