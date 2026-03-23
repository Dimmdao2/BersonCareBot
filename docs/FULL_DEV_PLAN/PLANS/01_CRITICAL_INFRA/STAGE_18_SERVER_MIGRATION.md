# Этап 18: Перенос инфраструктуры на российский сервер

> Приоритет: P3 (выполняется после стабилизации приложения)
> Зависимости: нет (параллелен с разработкой)
> Риск: высокий (даунтайм, потеря данных)

---

## Подэтапы

### 18.1 Выбор и подготовка сервера

**Задача:** развернуть идентичное окружение на российском VPS.

**Действия:**
1. Установить Ubuntu 24.04 LTS.
2. Установить Node.js 22.x (через nvm или NodeSource).
3. Установить PostgreSQL 16.
4. Установить nginx.
5. Установить pnpm.
6. Создать пользователя `deploy`.
7. Создать структуру директорий: `/opt/projects/bersoncarebot`, `/opt/env/bersoncarebot`, `/opt/backups`.
8. Скопировать systemd unit-файлы из `deploy/systemd/`.
9. Настроить firewall (ufw): только 22, 80, 443.

**Критерий:** `systemctl list-units bersoncarebot-*` показывает все юниты, статус inactive.

### 18.2 Перенос данных

**Задача:** перенести обе БД и код.

**Действия:**
1. На старом сервере: `pg_dump -Fc tgcarebot > /opt/backups/tgcarebot_migration.dump`.
2. На старом сервере: `pg_dump -Fc bcb_webapp_prod > /opt/backups/bcb_webapp_prod_migration.dump`.
3. Перенести дампы на новый сервер (scp/rsync).
4. Восстановить: `pg_restore -d tgcarebot ...`, `pg_restore -d bcb_webapp_prod ...`.
5. Клонировать репозиторий, `pnpm install --frozen-lockfile`, `pnpm run build`.
6. Скопировать env-файлы (с обновлением DATABASE_URL если нужно).
7. Запустить миграции: `pnpm run db:migrate:prod`.
8. Поднять сервисы: `systemctl start bersoncarebot-*-prod`.

**Критерий:** `curl http://127.0.0.1:3200/health` → 200, `curl http://127.0.0.1:6200` → 200.

### 18.3 DNS и SSL

**Задача:** перенаправить домены на новый IP.

**Действия:**
1. Настроить nginx vhosts (из текущих конфигов).
2. Установить certbot, получить сертификаты.
3. Уменьшить TTL DNS записей до 60 сек (за 24ч до переезда).
4. Сменить A-записи для `tgcarebot.bersonservices.ru` и `webapp.bersonservices.ru`.
5. Дождаться propagation.
6. Проверить HTTPS.
7. Обновить webhook URL в Telegram Bot API и Max Bot API.

**Критерий:** `https://tgcarebot.bersonservices.ru/health` → 200, SSL валиден.

### 18.4 Бэкапы на несколько серверов

**Задача:** автоматические ежедневные бэкапы на 2+ хранилища.

**Действия:**
1. Создать скрипт `/opt/backups/scripts/daily-backup.sh`:
   - `pg_dump -Fc` для обеих БД.
   - Ротация: хранить 7 ежедневных, 4 еженедельных, 3 ежемесячных.
2. Настроить rsync/rclone на удалённое хранилище (S3-compatible: Selectel, Yandex Object Storage).
3. Добавить в cron: `0 3 * * * /opt/backups/scripts/daily-backup.sh`.
4. Настроить уведомление при сбое бэкапа (email или Telegram через integrator).
5. Провести тест восстановления из бэкапа.

**Критерий:** бэкапы создаются ежедневно, копируются на удалённое хранилище, тест восстановления успешен.

### 18.5 Мониторинг

**Задача:** автоматическое обнаружение сбоев.

**Действия:**
1. Внешний healthcheck (UptimeRobot / аналог) на `https://tgcarebot.bersonservices.ru/health`.
2. Systemd auto-restart: `Restart=on-failure` уже в unit-файлах.
3. Настроить logrotate для логов.
4. Скрипт мониторинга: проверка свободного места, RAM, CPU.

**Критерий:** при падении сервиса — автоматический рестарт + уведомление.
