# D15b/7a — final composed audit (Ш1–Ш9)

## Тест или взгляд

Сначала прочитай `AGENTS.md` целиком по маршруту: обязательны §1/§1b, §5, §9–§10b, §12 и §24. Это смешанный
аудит. Повторяемые actor/subject boundaries проверяй существующими поведенческими тестами и blind kill-set;
разовые DDL/owner/privilege/композиционные свойства — чтением итогового состояния и узкими проверками. Не пиши
тесты на текст исходника или отсутствие строк.

## Authority и цель

Authority — существующий Track D: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, атомарный пункт
**D15b/7** и его первый цельный этап **D15b/7a**. Полный текст требования из owner checklist:

> «внутри уже существующего identity/DB-port + port-context seam разделить opaque actor/identity ref и opaque
> medical-subject ref, используя/расширяя `app_ext.variant_a_identity_refs`,
> `app.pre_session_resolve_identity`, `PortContextPrincipal.actorRef/subjectRef`, `portContextRuntime` — без
> второго linkage-service, HTTP hop или параллельного store; на совместимом первом этапе оба UUID разрешаются
> внутри seam в текущий `platform_users.id`, массовый перенос клинических FK в этот этап не входит. Type-aware
> resolver fail-closed не принимает actor-ref вместо subject-ref и наоборот. Аудит — в существующий
> `admin_audit_log` только на пересечение границы (link creation; login раз на session; card раз; list одним
> batch event), не на каждый DB query. Раздельные таблицы/UUID в одном Postgres — высокообратимый шаг;
> дорогой/низкообратимый шаг — только последующее физическое разнесение баз, решается ПОСЛЕ этой стадии;
> RU↔EU-стадии нет.»

Порядок и критерии Ш1–Ш9 бери из
`docs/_TODO/runs/integrator-cleanup/D15B7A_ACTOR_SUBJECT_SPLIT_SCHEME_2026-08-22.md` §4 и из отчётов
`D15B7A_STEP3*` … `D15B7A_STEP9*`. Более поздние owner-решения/OWNER_DECISIONS побеждают старую прозу.
Проверяемая интеграционная голова — `34d681969e033cdf434af57a71bef7ee3bb7656f`; продуктовая композиция Ш1–Ш9
уже содержалась в её предке `fbfbf023b72887e100e87ce75694dd72af02d45a`.

## Scope

До чтения существующих тестов составь named kill-set на всю композицию Ш1–Ш9. Затем проверь итоговый код,
миграции/contract, владельцев и гранты, DI/port boundaries, клинический профиль и существующие тесты. Обязательно
покрой классы отказов:

- actor-ref и subject-ref различимы, стабильны и не взаимозаменяемы; неверный kind/opaque ref отказывает fail-closed;
- оба ref совместимого этапа разрешаются только внутри существующего seam к тому же физическому пользователю;
- нет второго linkage-service, HTTP hop, параллельного identity store или массового переноса clinical FK;
- `PortContextPrincipal.actorRef/subjectRef` доходят через единственный DB-port/context path без обхода;
- link/login/card/list audit events имеют требуемую гранулярность и не пишутся на каждый DB query;
- patient demographics принадлежат medical subject/clinical profile, при этом staff/admin/patient actor paths не
  смешивают субъекта с действующим лицом;
- итоговые function bodies материализуются под декларационными владельцами и сохраняют RLS/principal boundary;
- все девять шагов действительно присутствуют вместе, а не только их отдельные отчёты/коммиты.

Переиспользуй существующие тесты и fault-injection evidence. Если для named дорогой молчаливой поломки проверки
реально нет, добавь минимальный acceptance-тест и один раз докажи fault injection. Временные product-поломки
обязательно откати. Product fix не делай. Полный CI не повторяй: exact product SHA уже прошёл его; запускай только
таргетированные/phase проверки, которые дают новый сигнал.

## Разрешённые записи

Можно коммитить только намеренные acceptance-тесты и один audit-artifact:
`docs/_TODO/runs/integrator-cleanup/D15B7A_COMPOSED_AUDIT_2026-08-23.md`. Никаких правок product-кода,
WORK_ORDER/checklist/taskdb, deploy, базы, DEV/TEST, веток интеграции или чужих документов.

Категорически запрещено читать, менять, сливать или удалять любые `therapysto*`, `night-*`, `reaudit-*`,
`surface-map-audit*`, `flashcall-research*` ветки/рабочие копии и их инициативные документы.

## Verdict

Верни бинарный PASS/FAIL. Каждый FAIL — достижимый сценарий, impact, точное нарушенное требование и evidence.
PASS допустим только когда каждый элемент kill-set пойман существующей проверкой с прежним fault-injection
evidence либо новым минимальным acceptance-тестом, а разовые свойства доказаны взглядом. До конца хода коммит
обязателен, если созданы audit-artifact/тесты; чистое дерево и точный SHA назвать в отчёте.
