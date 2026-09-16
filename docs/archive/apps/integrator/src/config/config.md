# config

Процессные bootstrap-переменные окружения (`DATABASE_URL`, `NODE_ENV`, host/port/logging) и DB-backed настройки приложения. Интеграционные ключи и credentials не читаются из env. Restricted SMTP доступен только через закрытую DB capability в email delivery path.
