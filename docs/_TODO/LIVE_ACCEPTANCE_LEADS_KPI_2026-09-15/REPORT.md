# Живая приёмка KPI «Заявки» — DEV `:5200`, 15.09.2026

## Итог

**Увидел:** на «Сегодня» KPI расположены в нужном порядке: **Сообщения · Комментарии · Заявки · Задачи**. «Заявки» — третья плитка, на месте снятых «Тестов».

Проверка сделана на единственном общем Turbopack `http://127.0.0.1:5200`, без второго Next-сервера. Вход — штатный `POST /api/auth/email-password/login` учёткой `dimmdao@yandex.ru` с заголовками `Origin: http://127.0.0.1:5200` и `Referer: http://127.0.0.1:5200/app`; после ответа проверена cookie `bersoncare_webapp_session`.

## Тариф DEV

Целевая DEV-база — только `bcb_webapp_dev`; PROD, миграции и declaration прав не затрагивались.

Перед правкой под общим замком выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT id, name, mechanics ->> 'leads' AS mechanics_leads FROM public.saas_tariffs WHERE name = 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК';\""
```

Значение `mechanics.leads` до: **`NULL`**.

Изменён ровно ключ `mechanics.leads` у тарифа `d1156dc6-e71e-4225-ad94-93c9d423c9e1` (`ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК`) через `jsonb_set(..., '{leads}', 'true'::jsonb, true)`. Результат того же statement: `before_leads = NULL`, `after_leads = true`, `only_leads_changed = t`.

После правки под общим замком выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT id, name, mechanics ->> 'leads' AS mechanics_leads FROM public.saas_tariffs WHERE id = 'd1156dc6-e71e-4225-ad94-93c9d423c9e1'::uuid;\""
```

Значение `mechanics.leads` после: **`true`**.

## Снимки «Сегодня»

- [Desktop 1440×1024](today-kpi-desktop-1440x1024.png): увидел «Сообщения · Комментарии · Заявки · Задачи»; «Заявки» третьи.
- [Телефон 390×844](today-kpi-mobile-390x844.png): увидел «Сообщения · Комментарии · Заявки · Задачи»; «Заявки» третьи.

Живой проход под общим замком:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && python3 .live-kpi-view.py"
```

Это был одноразовый browser-driver для снимка, удалённый сразу после прохода и не сохранённый как UI-тест. Вывод: `desktop_order=messages · comments · leads · tasks`; `mobile_order=messages · comments · leads · tasks`.

## НЕ СДЕЛАНО

- Строка вердикта в `feat` не добавлялась: её должен внести ведущий по этому отчёту.
- Не запускались автоматические UI-тесты, полный CI, миграции, privilege reconcile и второй Next-сервер — они не нужны и запрещены для этого взгляда.
