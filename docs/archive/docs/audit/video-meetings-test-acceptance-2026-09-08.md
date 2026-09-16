# Видеовстречи 1:1 — итоговая приёмка DEV/TEST

Дата: 2026-09-08. Workstream: taskdb `#1100`. PROD не затрагивался.

## Итог

PASS. На TEST работает self-hosted Jitsi 1:1 с прямым P2P по умолчанию, собственным coturn как fallback,
собственным JVB, короткоживущими TURN credentials и серверным пределом в два участника. В runtime браузеров не
обнаружено обращений к чужим STUN/TURN, `meet.jit.si`, 8x8 или telemetry endpoints.

## Применённая версия

- Интеграционная ветка: `feat/doctor-ui-rebuild`.
- Код TEST: `5f97267db79d4404dc75c699f9d4863780fbddbd`.
- Команда: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`.
- Результат: `deploy-test: PASS branch=feat/doctor-ui-rebuild head=5f97267db79d B0/post-B0 only`.
- Transcript: `/var/log/bersoncarebot/deploy-test/deploy-test.20260908T161323Z.4IUZQk.log`.

## Автоматические проверки приложения

- Команда: `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`.
- Exact tested SHA: `71ea8a3caacb0fcfdfa1304e86f4a1604d0fd906`.
- Результат: PASS — webapp 574 files / 3045 tests, integrator 119 files / 641 tests, privilege gates, migration
  checks, lint, typecheck и build. Последующие изменения до `5f97267db` затрагивали только Jitsi runtime scripts и
  их audit-документацию; их отдельная живая проверка приведена ниже.

## Jitsi/coturn health

Команда из TEST checkout:

```bash
JITSI_TEST_ENV_FILE=/opt/env/bersoncarebot/jitsi.test \
TURN_TEST_ENV_FILE=/opt/env/bersoncarebot/jitsi-coturn.test \
bash deploy/jitsi/bin/health-check.sh
```

Результат: `RESULT: PASS`.

Фактически проверено:

- все пять контейнеров подняты; coturn healthy;
- Jicofo подключён к XMPP, JVB `/about/health` отвечает 200;
- основной и metadata Prosody-контексты отдают только собственные STUN, TURN/UDP и TURNS/TCP;
- TURN credentials генерируются на ограниченное время из общего HMAC secret;
- реальные credentialed allocation проходят по UDP `3478` и TLS `5349`;
- MUC имеет серверный `muc_max_occupants = 2`;
- в объединённой и реально отданной конфигурации нет известных иностранных endpoints.

## Живая браузерная проверка

Проверка выполнялась двумя независимыми Chromium contexts с synthetic camera/microphone и третьим независимым
context для попытки занять лишнее место. Секреты и краткоживущие credentials в этот документ не записывались.

Обычный запуск — `python3 /tmp/bcb_video_acceptance.py`:

- вход специалиста и обмен fragment-секрета гостя: PASS;
- оба участника получили воспроизводимые удалённые видеокадры: PASS;
- выбран прямой P2P путь (`host`/`srflx`/`prflx`, UDP): PASS;
- третье подключение отклонено Prosody с `service-unavailable`: PASS;
- браузеры обращались только к `test.bersoncare.ru` и `meet.test.bersoncare.ru`: PASS;
- завершение встречи и cleanup: PASS.

Принудительный fallback — `BCB_FORCE_TURN=1 python3 /tmp/bcb_video_acceptance.py`:

- оба участника получили удалённые видеокадры: PASS;
- у обоих выбран relay candidate собственного coturn: PASS;
- TURN/UDP и TURNS/TCP присутствовали с временными credentials: PASS;
- третье подключение и foreign-host проверки повторно прошли: PASS.

## Права доступа

Гостевой обмен проверен через pre-session principal. Для него используется отдельная named capability
`app.resolve_current_organization_mechanic_access(text)`, которая только устанавливает допустимый tenant-контекст и
делегирует вычисление общей канонической функции. Широкие relation grants для webapp/guest не добавлялись.

Модель доступа остаётся двухуровневой:

- обычные авторизованные staff/patient/platform запросы используют роли отношений и RLS;
- публичные ссылки, pre-session вход, webhooks, платежи и другие реальные boundary-сеams получают точечные named
  capabilities.

Это не набор разрешений на каждую бизнес-функцию: узкие capabilities остаются только там, где широкая relation-role
нарушила бы tenant/security boundary.
