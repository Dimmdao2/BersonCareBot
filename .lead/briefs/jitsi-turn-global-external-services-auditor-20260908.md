# Тест или взгляд

Это исправление меняет одноразовую конфигурацию и host-скрипты. Проверяй итоговую конфигурацию чтением diff,
изолированным render/Compose/syntax-прогоном и сопоставлением с pinned upstream templates. Не пиши тесты на строки
shell/YAML/документации. Повторяемый browser/TURN runtime-контракт уже имеет живой красный оракул; его повторит лид
на именованном TEST после принятия candidate.

# Independent auditor-live — #1100 global Jitsi external_services correction

## Authority and exact candidate

Проверь exact committed candidate `1d49c1cee` на ветке
`wt/jitsi-turn-global-external-services-20260908`, база `aac33cfa1`. До inspection прочитай карту заголовков
`AGENTS.md`, целиком §1/§1b/§7/§9/§10a/§10b/§24, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`deploy/HOST_DEPLOY_README.md`, `deploy/jitsi/README.md`, `deploy/jitsi/RUNBOOK.md` и authority
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-03/VM-04.

Candidate исправляет уже воспроизведённый TEST-дефект: main Prosody host отдавал три собственных XEP-0215
service record, а `metadata.<XMPP_DOMAIN>` видел пустой список; Jitsi stable-11146-2 падал в XML fallback и
обнулял browser ICE servers. Требование — единый upstream global `external_services`, тот же coturn HMAC secret,
собственные STUN + TURN/UDP + TURNS/TCP и отсутствие static browser credentials.

Не меняй product/deploy implementation. Можно закоммитить только краткий audit artifact; никаких продуктовых
fixes, новых тестов, host apply/deploy/restart, firewall/nginx/DNS, баз данных, чтения/печати secret values и PROD.
Любые временные файлы/инъекции откати, не push/land. Изолированный Compose render допускается.

## Blind kill-set до чтения implementation

Сначала зафиксируй observable impact для каждого класса, затем читай diff:

1. `external_services` включён только на main VirtualHost, поэтому room metadata снова получает пустой/non-array
   service set и browser стирает ICE configuration.
2. Prosody и coturn используют разные HMAC secrets после install/restart или secret regeneration, поэтому
   credentials выдаются, но TURN allocation отвергается.
3. Secret попадает в argv/log/repo/served `config.js`, либо `TURN_USERNAME`/`TURN_PASSWORD` создают static browser
   credentials.
4. Advertised набор содержит не ровно наши STUN 3478, TURN/UDP 3478 и TURNS/TCP 5349 либо добавляет foreign host.
5. Restart/install используют старое process environment и не подхватывают атомарно синхронизированный env.
6. Health остаётся зелёным при исходном split-context defect, пустых credentials, отсутствующем TLS service или
   печатает short-lived username/password.
7. Удаление custom template/mount неполно и старый host-local module продолжает конкурировать с upstream global
   config; rollback/install ссылаются на удалённый artifact.

## Required verification

Проверь все 11 изменённых файлов и pinned upstream `stable-11146-2` Prosody/Compose templates. Докажи, что
`TURN_CREDENTIALS` в upstream означает HMAC shared secret с per-query timestamp credentials, а не static browser
password; что upstream включает module глобально и что оба named host contexts наследуют service records.
Проверь atomicity/mode/idempotency и shell environment precedence без раскрытия значений.

Запусти применимые `bash -n`, `git diff --check`, изолированный Compose config/render и безопасные package checks.
Не запускай full CI. Верни бинарный PASS/FAIL. Каждый FAIL должен называть достижимый сценарий, impact, точное
VM-03/VM-04 или repo-rule и evidence; вкусовщина/hardening/другая архитектура не finding. Назови exact candidate,
команды и результаты. Если создаёшь audit artifact, stage только его и commit до конца хода; иначе оставь дерево
чистым. Live TEST health/browser forced-TURN остаются обязательным lead gate и не считаются пройденными здесь.
