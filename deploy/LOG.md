# Deploy — operational log

Журнал подтверждённых изменений на production-хосте и связанных правок в `deploy/`, `deploy/host/`, nginx-шаблонах, CI deploy job. Канон путей и vhost — [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md).

---

## 2026-06-08 — nginx maintenance page (рестарт webapp)

### Продуктовое решение

- Вместо «Internal Server Error» при кратком простое webapp — статическая страница «Сервер обновляется…».
- **Без** флага на весь `deploy-prod.sh`: страница только при недоступности upstream (502/503/504).

### Репозиторий

- `apps/webapp/public/maintenance.html` — статика (RU, авто-refresh 20 с).
- `deploy/nginx/webapp-maintenance-pages.example.conf` — фрагмент `error_page` + `location = /maintenance.html`.
- `deploy/HOST_DEPLOY_README.md` — раздел «Страница „идёт обновление“».
- Удалены: `deploy/host/deploy-maintenance.sh`, строки sudoers для флага `deploy-maintenance.on`, вызов maintenance on/off из `deploy-prod.sh`.
- `.github/workflows/ci.yml`: `webfactory/ssh-agent@v0.9.1` (fix post-job cleanup «file argument undefined» на v0.8.0).

### Production (подтверждено оператором)

1. Фрагмент nginx внесён в **`/etc/nginx/sites-available/bersoncarebot-webapp`** (перед `location /`), `sudo nginx -t && sudo systemctl reload nginx`.
2. После деплоя `main` (`73aab59e` и новее) файл на диске: `/opt/projects/bersoncarebot/apps/webapp/public/maintenance.html`.
3. Проверка: `systemctl stop bersoncarebot-webapp-prod.service` → `curl https://bersoncare.ru/app` → HTML с `<title>BersonCare — обновление</title>` → `systemctl start …`.

### Не в scope

- Blue-green / Docker cutover.
- In-app patient maintenance (`patient_app_maintenance_*`) — без изменений.
