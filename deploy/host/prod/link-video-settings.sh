#!/usr/bin/env bash
# Связывает стек видео и приложение на новом проде: пять записей system_settings, из которых
# приложение собирает ссылку на конференцию и подписывает JWT для входа в комнату.
#
# Почему отдельный скрипт, а не часть пакета deploy/jitsi: пакет принципиально не знает про базу
# приложения — он получает JWT_APP_SECRET снаружи и нигде его не хранит (deploy/jitsi/README.md,
# «Design decisions»). Шов между двумя половинами — здесь, на стороне приложения.
#
# Секрет НЕ передаётся аргументом и не печатается: он читается из уже отрендеренного env-файла
# стека видео и уходит в базу через параметр psql. Единственное место, где он лежит, — этот env-файл
# (0600) и строка system_settings, как и задумано контрактом.
#
# Запускать на хосте прода от root ПОСЛЕ deploy/jitsi/bin/install.sh --apply (иначе секрета ещё нет).
set -uo pipefail

die() { echo "FATAL: link-video-settings: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac

DB=bersoncarebot_test
ENV_FILE=/opt/therapysto/env/jitsi.prod
PUBLIC_URL=https://meet.therapysto.ru
XMPP_DOMAIN=meet.therapysto.ru

[ -r "$ENV_FILE" ] || die "нет $ENV_FILE — сначала разверните стек видео"

secret=$(sed -n 's/^JWT_APP_SECRET=//p' "$ENV_FILE" | tail -1)
app_id=$(sed -n 's/^JWT_APP_ID=//p' "$ENV_FILE" | tail -1)
[ -n "$secret" ] || die "в $ENV_FILE нет JWT_APP_SECRET"
[ -n "$app_id" ] || die "в $ENV_FILE нет JWT_APP_ID"
case "$secret" in
  __*__) die "JWT_APP_SECRET всё ещё плейсхолдер — стек видео не разворачивался" ;;
esac

# Приложение отказывается работать, если issuer не равен application_id (infra/video/jitsiVideoMeetingProvider.ts),
# поэтому обе записи заполняются одним значением из env, а не двумя независимыми.
apply() {
  local key="$1" value="$2"
  runuser -u postgres -- psql -d "$DB" -v ON_ERROR_STOP=1 -q \
    -v key="$key" -v val="$value" <<'SQL' || die "не удалось записать настройку"
-- Уникальность глобальных настроек задана ЧАСТИЧНЫМ индексом
-- system_settings_global_key_scope_uidx ON (key, scope) WHERE organization_id IS NULL.
-- Предикат обязателен в ON CONFLICT: без него Postgres не выберет этот индекс, а перечислять
-- organization_id в списке колонок бесполезно — NULL в уникальном индексе не совпадает сам с собой,
-- и вместо обновления появился бы дубль настройки.
INSERT INTO system_settings (key, scope, value_json, updated_at, organization_id)
VALUES (:'key', 'admin', jsonb_build_object('value', :'val'), now(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();
SQL
  echo "    $key записан"
}

echo "==> связываю видео с приложением в базе $DB"
apply jitsi_public_url          "$PUBLIC_URL"
apply jitsi_xmpp_domain         "$XMPP_DOMAIN"
apply jitsi_jwt_application_id  "$app_id"
apply jitsi_jwt_issuer          "$app_id"
apply jitsi_jwt_signing_secret  "$secret"

echo "==> проверка (секрет не печатается, только длина)"
runuser -u postgres -- psql -d "$DB" -Atc "
  select key || ' = ' ||
    case when key = 'jitsi_jwt_signing_secret'
         then '<' || length(value_json->>'value') || ' символов>'
         else value_json->>'value' end
  from system_settings
  where key like 'jitsi%' and scope = 'admin' and organization_id is null
  order by key" | sed 's/^/    /'

echo
echo "Дальше: рантайм читает эти значения при следующем запросе — перезапуск приложения не нужен."
