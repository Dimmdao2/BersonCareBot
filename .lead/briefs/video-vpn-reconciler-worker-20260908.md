# Worker brief — #1100 TEST owner VPN/Jitsi reconciler correction

## Канон и authority

Сначала прочитай `AGENTS.md`: маршрут, §1/§1b, §7, §10 и §24. Затем прочитай
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, относящиеся Jitsi runbooks и
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — «Каноническая подсеть owner VPN `awg1` —
`172.31.9.0/24`».

## Задача

В этой ветке реализуй целиком только VM-09 в repo-source:

1. Проверь все активные штатные TEST apply/reconcile/config источники на устаревшие `10.9.1.0/24` и `10.9.1.1` для
   owner-интерфейса `awg1` (сначала code-search, затем точный rg). Runtime-факт уже установлен владельческим
   инцидентом: сеть `172.31.9.0/24`, gateway/DNS `172.31.9.1`, iPhone `.2`, Mac `.3`.
2. Приведи nginx allowlist, Jitsi network policy/template, split-DNS renderer и redirect unit к одному факту.
   Не меняй `awg0`/PROD relay и не заменяй легитимные значения других интерфейсов.
3. Обнови только действующую архитектурную/операционную документацию, если она расходится с executable source.
   Исторические audit logs не переписывай.
4. Проверь `bash -n` изменённых shell scripts, `git diff --check` и точным `rg`, что активный repo-source больше не
   сможет вернуть старый awg1 gateway/subnet. Это разовая inspection, постоянные тесты на строки не писать.
5. Закоммить все и только свои разрешённые файлы явным staging; `git add -A` запрещён. В отчёте назови commit SHA и
   точные команды проверок. Не заканчивай ход в ожидании процесса.

## Scope и запреты

Разрешены `deploy/host/apply-test-nginx-webapp.sh`, `deploy/host/apply-test-vpn-dns.sh`,
`deploy/jitsi/NETWORK_POLICY.md`, `deploy/jitsi/nginx/meet-test.vhost.template.conf` и
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`; если exact search докажет ещё один активный executable source, назови его
лиду как blocker, не расширяй scope. Не трогай webapp production code/tests, план, taskdb, nginx/systemd/live host,
TEST/PROD deploy. PROD полностью вне scope.

Воркеры тесты не пишут. Здесь постоянный тест был бы вредным source-text assertion; достаточно указанных shell и
inspection checks.
