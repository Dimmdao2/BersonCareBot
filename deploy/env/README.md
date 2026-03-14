# Env-файлы для деплоя

## api.prod (интегратор API + worker)

**Путь на хосте:** `/opt/env/bersoncarebot/api.prod`

**Обязательные переменные** (без них API не стартует):

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3200`  ← прод, не 4200
- `DATABASE_URL='...'`  ← если в пароле есть `$`, вся строка в одинарных кавычках
- `BOOKING_URL=https://...`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_ADMIN_ID=364943522`
- `RUBITIME_WEBHOOK_TOKEN=...`
- `RUBITIME_API_KEY=...`
- `SMSC_ENABLED=true`
- `SMSC_API_KEY='...'`  ← если в значении есть `$`, в одинарных кавычках
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`
- `INTEGRATOR_SHARED_SECRET=...`
- `APP_BASE_URL=https://webapp.bersonservices.ru`

Шаблон: `deploy/env/.env.prod.example`

**Если API не видит переменные** (в логах: "TELEGRAM_BOT_TOKEN is empty", "SMSC_API_KEY is empty") — systemd не подхватывает файл. Проверить на хосте:

```bash
# Юнит действительно загружает api.prod?
systemctl show bersoncarebot-api-prod.service -p EnvironmentFiles

# Файл есть и читается?
ls -la /opt/env/bersoncarebot/api.prod

# После правок api.prod перезагрузить юнит и сервис
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-api-prod.service
```

Убедиться, что в юните есть строка `EnvironmentFile=/opt/env/bersoncarebot/api.prod` (см. `deploy/systemd/bersoncarebot-api-prod.service`). Если юнит старый — переустановить из репозитория и `systemctl daemon-reload`.

---

## webapp.prod (только webapp)

**Путь на хосте:** `/opt/env/bersoncarebot/webapp.prod`

**Переменные** (Telegram/Rubitime/SMSC сюда не класть — они для api.prod):

- `NODE_ENV=production`  ← не "prodaction"
- `HOST=127.0.0.1`
- `PORT=6200`
- `APP_BASE_URL=https://webapp.bersonservices.ru`  ← публичный URL, не 127.0.0.1:5200
- `DATABASE_URL='...'`  ← закрывающая кавычка в конце строки
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`  ← тот же, что в api.prod
- `ALLOW_DEV_AUTH_BYPASS=false`  ← на проде лучше false
- `ALLOWED_TELEGRAM_IDS=7924656602`
- `ADMIN_TELEGRAM_ID=364943522`

Шаблон: `deploy/env/.env.webapp.prod.example`
