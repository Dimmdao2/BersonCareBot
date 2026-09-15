Штатный гейт из-под `deploy@` ПРОШЁЛ, код возврата `0`.

# Therapysto: sudoers для journal-truth и проверка штатного пути — 15.09.2026

## `harden-ssh-close-root.sh --setup`

Команда:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 "bash /opt/therapysto/src/deploy/host/prod/harden-ssh-close-root.sh --setup"
```

Дословный текст вывода (управляющие ANSI-байты жирного начертания удалены):

```text
==> 1. домашний каталог и ключ учётки deploy
    ключ автоматизации перенесён учётке deploy
==> 2. голый репозиторий должен принимать push от deploy
    /opt/therapysto/git/therapysto.git передан deploy
==> 3. права: ровно четыре команды через sudo, без пароля
    /etc/sudoers.d/30-therapysto-automation принят visudo
==> 4. проверка, что конвейер на месте

Готово. Root по SSH ПОКА ОТКРЫТ — это намеренно.

Дальше, с dev-бокса, выполнить обычный деплой:
    bash tools/deploy-prod-from-dev.sh
Он теперь ходит сюда учёткой deploy и поднимает права через sudo на четыре команды.

Когда деплой пройдёт — вернуться сюда и закрыть root:
    bash /opt/therapysto/src/deploy/host/prod/harden-ssh-close-root.sh --close-root
```

Код возврата: `0`.

## Journal truth под `deploy@`

Команда была запущена из `/home/dev/dev-projects/BersonCareBot` через обязательный общий замок хоста:

```bash
/home/dev/brain/host-orch/run-tests.sh 'BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95'
```

Дословный вывод:

```text
[2026-09-15T10:36:50+03:00] pid=2536576 WAITING for test lock :: BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95
[2026-09-15T10:36:50+03:00] pid=2536576 ACQUIRED test lock :: BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95
эталон: bcb_webapp_dev (277 обещаний) · цель: therapysto_prod (277)
журнал цели не врёт: всё, что сбылось на эталоне, сбылось и здесь
[2026-09-15T10:36:52+03:00] pid=2536576 RELEASED test lock (rc=0, 2s)
```

Код возврата: `0`.

## Состояние прода под `deploy@`

Команда:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 "sudo -n /opt/therapysto/pipeline/therapysto-status"
```

Дословный вывод:

```text
active colour : blue
idle colour   : green
live image    : therapysto-app:bb91018ec
                THERAPYSTO_GIT_COMMIT=bb91018ec
                THERAPYSTO_BUILD_TIME=2026-09-15T06:37:14Z
nginx sends to: 127.0.0.1:6201 127.0.0.1:3201

containers:
therapysto-blue-scheduler-1  Up 43 minutes  therapysto-app:bb91018ec
therapysto-blue-media-worker-1  Up 43 minutes  therapysto-app:bb91018ec
therapysto-blue-webapp-1  Up 43 minutes (healthy)  therapysto-app:bb91018ec
therapysto-blue-api-1  Up 43 minutes (healthy)  therapysto-app:bb91018ec
therapysto-jitsi-prod-web-1  Up 4 days  ghcr.io/jitsi/web:stable-11146-2
therapysto-jitsi-prod-jvb-1  Up 4 days  ghcr.io/jitsi/jvb:stable-11146-2
therapysto-jitsi-prod-jicofo-1  Up 4 days  ghcr.io/jitsi/jicofo:stable-11146-2
therapysto-jitsi-prod-prosody-1  Up 4 days  ghcr.io/jitsi/prosody:stable-11146-2
therapysto-jitsi-prod-coturn  Up 20 hours (healthy)  coturn/coturn:4.17.2-r0-debian
```

Код возврата: `0`. Эта команда показала active colour `blue`, образ `therapysto-app:bb91018ec`, build commit
`bb91018ec` и девять строк контейнеров со статусом `Up`; webapp, API и coturn отдельно отмечены `healthy`.

Для получения именно Docker `RestartCount` была выполнена read-only команда под той же учёткой `deploy`:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy@135.106.187.95 "docker inspect --format '{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} restarts={{.RestartCount}} image={{.Config.Image}}' therapysto-blue-scheduler-1 therapysto-blue-media-worker-1 therapysto-blue-webapp-1 therapysto-blue-api-1 therapysto-jitsi-prod-web-1 therapysto-jitsi-prod-jvb-1 therapysto-jitsi-prod-jicofo-1 therapysto-jitsi-prod-prosody-1 therapysto-jitsi-prod-coturn"
```

Дословный вывод:

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

Код возврата: `1`.

## НЕ СДЕЛАНО

- Точное число Docker-рестартов не подтверждено: установленный root-owned
  `/opt/therapysto/pipeline/therapysto-status` не выводит `RestartCount`, а прямой read-only `docker inspect`
  под `deploy@` не имеет доступа к `/var/run/docker.sock`. Root-доступом этот пробел не обходился.
- `--close-root` не запускался; root по SSH оставлен открытым.
- Деплой, миграции, рестарты, rollback, смена образа или цвета не выполнялись.
- Ручной `psql` и обход journal gate через root не использовались.
- Режим TEST не снимался.
- Строка независимого вердикта в `feat` не добавлялась.
