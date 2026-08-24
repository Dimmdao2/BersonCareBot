# Audit brief: Therapysto domain cutover readiness, candidate `a3538b37d`

## Тест или взгляд

- Повторяемое поведение host-map validation, offline render, owner-gated apply, monitoring exit status и redirect —
  **тест** через публичный CLI с временными файлами/fake binaries, только если тест отвечает §10a/§10b.
- Сохранение существующей topology nginx, TLS boundary, использование key paths, полнота runtime inputs,
  атомарность rollback и правдивость runbook — **взгляд** по полному diff и одноразовый offline rendering; не
  писать тесты строк исходника.
- Факт отсутствия live-применения — **взгляд** по состоянию ветки и разрешённым командам; к серверу не обращаться.

## Роль и authority

Ты независимый `auditor-live`. До каждого действия выполняй карту заголовков `AGENTS.md`. Полностью прочитай
§10a, §10b и §24.4–§24.7 до классификации проверок. Затем прочитай `README.md`,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md`, `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2,
§1.2a, B7, B8, C5a, Stage D/E и `SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §1–§3.

Источник оракула — `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`: «`test.bersoncare.ru` продолжает работать на прежнем адресе.»

Прямое решение владельца текущего хода: пакет будущего переключения готовится и проверяется в отдельной ветке,
но не вливается и не применяется до отдельной команды. Точные TEST-host values не утверждены и не угадываются.

## Кандидат и граница

- Candidate: `a3538b37d5cd5f21929cc475ba948186717edb42` относительно `5272a0761`.
- Проверяется весь diff восьми файлов в deploy/docs.
- Никаких live-изменений: не трогать DNS, TLS, nginx, systemd, env, БД, settings, cron, TEST или PROD.
- Аудитор не чинит продуктовый код. Он может оставить только audit-artifact и необходимые acceptance-тесты.

## Обязательный blind protocol

До чтения нового теста `therapysto-domain-cutover.test.mjs` составь kill-set из authority. После этого прочитай
весь diff и проверь каждый класс. Минимум должны быть независимо решены следующие достижимые сценарии:

1. Новая multi-host конфигурация не теряет действующие TEST contracts существующего nginx seam: VPN/IP allowlist,
   integrator routes, payment webhook exceptions, access log, maintenance fallback, upload/timeouts и forwarded Host.
2. Unknown Host fail-closed действительно валиден для nginx с TLS, а не только похож на конфигурацию.
3. Staff/admin/default patient/technical branded/custom clinic host доходят до правильного upstream; технический
   branded host редиректит на custom с сохранением URI.
4. TLS-модель соответствует плану: собственный apex + wildcard проверяются как разные имена, custom clinic host
   имеет exact-host certificate boundary, каждый объявленный key path реально используется; wildcard не выдаётся
   за покрытие apex.
5. DNS preflight проверяет утверждённый target, а не просто существование любой DNS-записи.
6. Runtime origins/callback inputs, нужные уже существующему surface resolver/auth, включены в preflight/cutover;
   сохранённый env не выдаётся за подготовленное переключение.
7. Apply до owner-gate невозможен, candidate nginx проверяется до reload, ошибка проверки не оставляет сломанный
   активный файл, rollback реально восстанавливает прежний `test.bersoncare.ru` seam.
8. Offline/render режим не меняет host state; пустые, дублирующиеся, неверные и неутверждённые host values
   отвергаются без угаданных defaults.
9. Ежедневный monitoring сравнивает DNS с ожидаемым target и даёт ненулевой сигнал при достижении порога истечения
   сертификата, а не только печатает дату.
10. Runbook-команды действительно проверяют отрендеренный candidate и описывают точный cutover/rollback без
    ложного закрытия B7/B8/C5a/D1–D3/C5.

Для повторяемого поведения добавь минимальные acceptance-тесты только когда это оправдано §10a/§10b. Падающий на
кандидате тест является доказательством дефекта; не подгоняй его и не исправляй production script. Разовые
операторские свойства проверяй чтением/одноразовым offline rendering, не тестами текста.

## Вердикт и артефакт

Создай `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` с:

- бинарным `PASS` или `FAIL` по candidate SHA;
- kill-set до тестов и для каждого пункта результат;
- только реальные findings: достижимый сценарий, impact, нарушенное owner/repo requirement, evidence;
- точные команды и результаты;
- fault injection либо падающий acceptance-test на каждый повторяемый класс;
- явный список того, что не применялось live.

Если есть finding, вердикт `FAIL`; не чинить продукт. Закоммить audit-artifact и только действительно нужные
acceptance-тесты точными путями, сообщение с `#787`. Не пушить, не вливать, не завершать ход с незакоммиченным
деревом.
