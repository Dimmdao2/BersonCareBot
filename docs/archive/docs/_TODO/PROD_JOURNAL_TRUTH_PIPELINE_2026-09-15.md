Штатный гейт из-под `deploy@` НЕ ПРОШЁЛ, код возврата `2`.

# Доустановка конвейера и проверка журнала миграций — 15.09.2026

Цель: новый PROD `135.106.187.95`, уже выложенный commit
`bb91018eccefce272dd7159eed60586f6d69dc92`. Старый PROD не затрагивался.

## 1. Доустановка конвейера

Команда:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 "sudo -n /opt/therapysto/pipeline/install-pipeline.sh bb91018eccefce272dd7159eed60586f6d69dc92"
```

Код возврата: `0`.

Дословный вывод:

```text
==> обновляю рабочее дерево до bb91018eccefce272dd7159eed60586f6d69dc92
HEAD is now at bb91018ec fix(ci): гейт видимости тестов перестал мерить чужие рабочие копии
==> раскладываю конвейер из этого же коммита
пакет видео разложен в /opt/therapysto/jitsi из bb91018ec
==> устанавливаю обязательные host-cron задания
background-jobs-cli --apply-installed (prod): расписание уже совпадает с manifest
конвейер разложен из bb91018eccefce272dd7159eed60586f6d69dc92
```

## 2. Команда появилась; штатный гейт из-под `deploy@`

Проверка установленного файла:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 \
  "if [ -x /opt/therapysto/pipeline/therapysto-journal-truth ]; then ls -l /opt/therapysto/pipeline/therapysto-journal-truth; else echo 'ОТКАЗ: команда /opt/therapysto/pipeline/therapysto-journal-truth не появилась' >&2; exit 1; fi"
```

Код возврата: `0`.

Дословный вывод:

```text
-rwxr-xr-x 1 root root 1898 Sep 15 07:27 /opt/therapysto/pipeline/therapysto-journal-truth
```

Гейт запущен из `/home/dev/dev-projects/BersonCareBot` через обязательный общий host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh 'BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95'
```

Код возврата: `2`.

Дословный вывод:

```text
[2026-09-15T10:27:55+03:00] pid=2525552 WAITING for test lock :: BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95
[2026-09-15T10:27:55+03:00] pid=2525552 ACQUIRED test lock :: BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95
  конвейерный путь: sudo: a password is required
sudo: a password is required
ОТКАЗ: цель therapysto_prod не ответила ни одной строкой
[2026-09-15T10:28:00+03:00] pid=2525552 RELEASED test lock (rc=2, 5s)
```

Точная строка отказа основного пути: `конвейерный путь: sudo: a password is required`.
Fallback также получил `sudo: a password is required`. Root-доступ и ручной `psql` не использовались.

## 3. Состояние runtime после доустановки

Штатная status-команда:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 "sudo -n /opt/therapysto/pipeline/therapysto-status"
```

Код возврата: `0`.

Дословный вывод:

```text
active colour : blue
idle colour   : green
live image    : therapysto-app:bb91018ec
                THERAPYSTO_GIT_COMMIT=bb91018ec
                THERAPYSTO_BUILD_TIME=2026-09-15T06:37:14Z
nginx sends to: 127.0.0.1:6201 127.0.0.1:3201

containers:
therapysto-blue-scheduler-1  Up 34 minutes  therapysto-app:bb91018ec
therapysto-blue-media-worker-1  Up 34 minutes  therapysto-app:bb91018ec
therapysto-blue-webapp-1  Up 35 minutes (healthy)  therapysto-app:bb91018ec
therapysto-blue-api-1  Up 35 minutes (healthy)  therapysto-app:bb91018ec
therapysto-jitsi-prod-web-1  Up 4 days  ghcr.io/jitsi/web:stable-11146-2
therapysto-jitsi-prod-jvb-1  Up 4 days  ghcr.io/jitsi/jvb:stable-11146-2
therapysto-jitsi-prod-jicofo-1  Up 4 days  ghcr.io/jitsi/jicofo:stable-11146-2
therapysto-jitsi-prod-prosody-1  Up 4 days  ghcr.io/jitsi/prosody:stable-11146-2
therapysto-jitsi-prod-coturn  Up 20 hours (healthy)  coturn/coturn:4.17.2-r0-debian
```

Цвет — `blue`, образ и build-id — `bb91018ec`; webapp и API healthy, `scheduler` и
`media-worker` присутствуют и работают. Их uptime значительно старше доустановки pipeline, поэтому
доустановка их не перезапускала.

Проверка health:

```bash
curl -fsS --max-time 15 https://therapysto.ru/api/health
```

Код возврата: `0`.

Дословный вывод:

```text
{"ok":true,"db":"up"}
```

Попытка получить точный `RestartCount` для четырёх контейнеров:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 \
  "sudo -n /usr/bin/docker inspect --format '{{.Name}} restarts={{.RestartCount}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} image={{.Config.Image}}' therapysto-blue-webapp-1 therapysto-blue-api-1 therapysto-blue-scheduler-1 therapysto-blue-media-worker-1"
```

Код возврата: `1`.

Дословный вывод:

```text
sudo: a password is required
```

## НЕ СДЕЛАНО

- Гейт не доказал отсутствие расхождений: установленная команда есть, но sudoers не разрешает
  `deploy@` вызвать её без пароля. Гейт завершился кодом `2` до сравнения.
- Точный инвариант `restarts=0` не доказан: штатный `therapysto-status` не печатает `RestartCount`,
  а точечный read-only `docker inspect` из-под `deploy@` завершился `sudo: a password is required`.
- Не выполнялись повторный deploy, миграции, рестарты, rollback, переключение цвета или образа,
  снятие режима TEST, ручной доступ к PostgreSQL и изменение данных PROD.
- Строка вердикта в `feat` не добавлялась: её должен внести ведущий после устранения sudoers-блокера
  и успешного штатного прогона.
