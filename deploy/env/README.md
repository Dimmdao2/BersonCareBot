# Env-файлы для деплоя

Этот файл описывает только текущие env-файлы `BersonCareBot`.

---

## Production

### `api.prod` (integrator API + worker)

**Путь на хосте:** `/opt/env/bersoncarebot/api.prod`

Этот файл используют оба production unit'а:

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`

Обязательные ключи по текущему runtime:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3200`
- `DATABASE_URL='...'`
- `BOOKING_URL=https://...`
- `INTEGRATOR_SHARED_SECRET=...`
- `APP_BASE_URL=https://webapp.bersonservices.ru`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_ADMIN_ID=364943522`
- `TELEGRAM_SEND_MENU_ON_BUTTON_PRESS=true|false`
- `RUBITIME_WEBHOOK_TOKEN=...`
- `RUBITIME_API_KEY=...`
- `SMSC_ENABLED=true|false`
- `SMSC_API_KEY='...'`
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`

Опционально, если используется MAX:

- `MAX_ENABLED=true`
- `MAX_ADMIN_USER_ID=...`
- `MAX_ADMIN_CHAT_ID=...`
- `MAX_API_KEY=...`
- `MAX_WEBHOOK_SECRET=...`

Шаблон для integrator production в репозитории:

- root `.env.example`

Важно:

- `deploy/env/.env.prod.example` **сейчас отсутствует** в репозитории;
- если в значении есть `$`, строку в env брать в одинарные кавычки;
- этот файл `source`-ится bash-скриптами деплоя, поэтому синтаксис должен быть bash-compatible.

Проверка:

```bash
systemctl show bersoncarebot-api-prod.service -p EnvironmentFiles
systemctl show bersoncarebot-worker-prod.service -p EnvironmentFiles
ls -la /opt/env/bersoncarebot/api.prod
sudo systemctl restart bersoncarebot-api-prod.service
sudo systemctl restart bersoncarebot-worker-prod.service
curl -s http://127.0.0.1:3200/health
```

---

### `webapp.prod`

**Путь на хосте:** `/opt/env/bersoncarebot/webapp.prod`

Этот файл использует:

- `bersoncarebot-webapp-prod.service`

Обязательные ключи:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=6200`
- `APP_BASE_URL=https://webapp.bersonservices.ru`
- `DATABASE_URL='...'`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=false`
- `ALLOWED_TELEGRAM_IDS=...`
- `ADMIN_TELEGRAM_ID=...`
- `TELEGRAM_BOT_TOKEN=...`

Шаблон:

- `deploy/env/.env.webapp.prod.example`

Важно:

- Telegram / Rubitime / SMSC runtime-переменные сюда не класть;
- `INTEGRATOR_SHARED_SECRET` должен совпадать с `api.prod`.

Проверка:

```bash
systemctl show bersoncarebot-webapp-prod.service -p EnvironmentFiles
ls -la /opt/env/bersoncarebot/webapp.prod
sudo systemctl restart bersoncarebot-webapp-prod.service
curl -s http://127.0.0.1:6200/api/health
```

---

## Development

### Integrator dev

Фактическое состояние на текущем хосте:

- `/home/dev/dev-projects/BersonCareBot/.env.dev` — отсутствует
- `/home/dev/dev-projects/BersonCareBot/.env` — существует

По коду `apps/integrator/src/config/loadEnv.ts` integrator по умолчанию грузит `.env`, если `ENV_FILE` не задан.

Значит текущий dev source of truth для integrator:

- `/home/dev/dev-projects/BersonCareBot/.env`

### Webapp dev

Фактический файл:

- `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`

Ключи:

- `NODE_ENV=development`
- `HOST=127.0.0.1`
- `PORT=5200`
- `APP_BASE_URL=http://127.0.0.1:5200`
- `DATABASE_URL=...`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=http://127.0.0.1:4200`
- `ALLOW_DEV_AUTH_BYPASS=true|false`

Шаблон:

- `deploy/env/.env.webapp.dev.example`

Примечание:

- старый путь `webapp/.env.dev` больше не актуален для текущей структуры `apps/webapp`.

---

## Если env не подхватывается

Проверить effective unit:

```bash
systemctl cat bersoncarebot-api-prod.service
systemctl cat bersoncarebot-worker-prod.service
systemctl cat bersoncarebot-webapp-prod.service
```

Проверить, что `EnvironmentFile=` совпадает с фактическим путём.

Если исправили env-файл:

```bash
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-api-prod.service
sudo systemctl restart bersoncarebot-worker-prod.service
sudo systemctl restart bersoncarebot-webapp-prod.service
```

---

## Права

Если деплой падает с `Permission denied` на `/opt/env/bersoncarebot/*.prod`:

```bash
sudo chown -R deploy:deploy /opt/env/bersoncarebot
chmod 600 /opt/env/bersoncarebot/api.prod
chmod 600 /opt/env/bersoncarebot/webapp.prod
```

Проверка от пользователя `deploy`:

```bash
cat /opt/env/bersoncarebot/api.prod
cat /opt/env/bersoncarebot/webapp.prod
```
