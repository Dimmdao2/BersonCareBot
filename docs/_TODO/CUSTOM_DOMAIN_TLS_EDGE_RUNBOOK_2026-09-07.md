# Custom-domain TLS edge — repository-managed infrastructure (B7/B8/C5a)

Status: **repository correction ready; no host, DNS, firewall, service, TEST, or PROD operation was
performed.** The application now owns the binding/readiness/verifier/permission path; React UI and
owner-authorized live edge cutover remain separate gates.

## Delivered contract

The edge is one Caddy process on the new production host `135.106.187.95`; it is the sole public
listener on 80/443 after an owner-authorized cutover. The existing nginx blue/green switch remains
the downstream application frontend, but its listener becomes loopback-only. Caddy asserts the
external Host, `https` scheme, direct client identity and forwarding chain; nginx preserves those
headers exactly. The loopback-only nginx listener is therefore the explicit trusted-proxy boundary.

The only supported binary is reproducibly built with these pins:

| Component | Pin |
| --- | --- |
| Caddy | `v2.11.2`, без плагинов |
| xcaddy | `v0.4.5` |
| temporary Go toolchain | `1.27.1`, SHA-256 recorded in `deploy/caddy/build-caddy-edge.sh` |

`deploy/caddy/validate-caddy-edge-config.sh` builds that exact binary under `mktemp -d`, FAILS if
the binary carries any DNS provider module at all, and runs `caddy validate` with placeholders only.
It installs no binary or Go toolchain. The cutover builds the same binary at
`/usr/local/bin/bcb-caddy`.

## TLS policy

🔴 **РЕДАКЦИЯ 12.09.2026: WILDCARD СНЯТ ВЛАДЕЛЬЦЕМ.** Дословно: «Зачем тебе рег ру апи? Ты охренел?
Не будет у тебя их». Wildcard Let's Encrypt выдаёт только по DNS-01, то есть по праву писать в зону
регистратора, — поэтому DNS-01, модуль REG.RU и wildcard-блок убраны из репозитория целиком.
Цена, названная прямо: имя, сертификата к которому мы не выпускали (выдуманный поддомен), рвёт
TLS-рукопожатие в браузере ДО выполнения нашего кода; вежливую страницу там даёт только wildcard.

- **B7 (новая редакция):** апекс `therapygo.ru` — обычный HTTP-01 отдельным блоком. Отдельным
  потому, что на нём живёт сам endpoint разрешения, и он не имеет права зависеть от вызова,
  который сначала должен до него достучаться.
- **Platform hosts other than the apex:** ordinary automatic HTTP-01/TLS-ALPN certificates.
- **Каждое имя клиники — и её собственный домен, и `<slug>.therapygo.ru`:** одна и та же
  on-demand-дверь. Before issuance Caddy calls
  `GET https://therapygo.ru/api/public/domains/ask?domain=<host>` using built-in
  `on_demand_tls { permission http <endpoint> }`. A timeout, unavailable endpoint, redirect, or
  non-2xx response denies issuance. The stable Therapygo origin makes this permission check
  independent of the candidate hostname's not-yet-issued certificate.

There is no per-clinic nginx edit, Certbot work, reload, or static Caddy hostname registration, and
no DNS-01 anywhere. Правило, по которому дверь одобряет имя, одно и лежит в
`apps/webapp/src/app-layer/surface/onDemandTlsAuthorization.ts`: апекс — да; `<label>.therapygo.ru`
— да ровно тогда, когда метка разрешается в активную опубликованную организацию ТЕМ ЖЕ резолвером,
что открывает страницу; всё остальное — существующая проверка привязки собственного домена.

## Prerequisite

Учётных данных регистратора больше не требуется — их нет ни в одном файле. Перед cutover нужен
только root-owned `/opt/therapysto/env/caddy.prod` (`root:caddy`, `0640`) с четырьмя ключами:
`CADDY_ACME_EMAIL`, `CADDY_PLATFORM_DOMAINS`, `CADDY_ASK_URL`, `CADDY_UPSTREAM`.

🔴 Путь именно `/opt/therapysto/env/caddy.prod`. Прежняя редакция этого документа (и пример
`deploy/env/.env.caddy.prod.example`) называла `/opt/bersoncarebot/env/caddy.prod`, а установленный
на хосте скрипт читает первый — по старому адресу cutover падает с `missing …/caddy.prod`.

🔴 На проде сейчас лежит СТАРАЯ, wildcard-версия файлов края. Её обязан обновить деплой ДО cutover,
иначе Caddy потребует несуществующие креды REG.RU и не поднимется.

## DNS instructions source

The B8 settings lifecycle reads its public values from the webapp runtime template:

- `CUSTOM_DOMAIN_EDGE_IP=135.106.187.95` renders `A @ → 135.106.187.95` for an apex app domain.
- `CUSTOM_DOMAIN_CNAME_TARGET=edge.therapygo.ru` renders `CNAME app → edge.therapygo.ru` when a
  clinic already has a site at its apex.

They are intentionally absent from Caddy's env: the edge does not consume them.

## Installed pipeline and scheduler

`setup-docker-bluegreen.sh` and `tools/deploy-prod-from-dev.sh` install/update every edge asset under
`/opt/bersoncarebot/pipeline`: Caddyfile, build script, internal nginx template, cutover/rollback,
health probe and systemd unit templates. The cutover never relies on source-relative `../../` paths.

The cutover installs, enables and verifies:

- `bersoncarebot-caddy-edge.service`;
- `bersoncarebot-caddy-edge-health.timer`, hourly and persistent;
- `bersoncarebot-caddy-edge-health.service`, which runs the certificate-store/process/socket probe.

This timer is independent of the application's external per-domain monitor. It does not use
crontab. Rollback disables and stops both the Caddy service and the timer before restoring the saved
public nginx configuration.

## Repository validation

Run only locally, without a real `caddy.prod`:

```bash
bash deploy/caddy/validate-caddy-edge-config.sh
bash -n deploy/caddy/build-caddy-edge.sh deploy/caddy/validate-caddy-edge-config.sh \
  deploy/host/prod/cutover-edge-to-caddy.sh deploy/host/prod/rollback-edge-to-nginx.sh \
  deploy/host/prod/check-caddy-edge-health.sh deploy/host/prod/setup-docker-bluegreen.sh \
  tools/deploy-prod-from-dev.sh
```

The nginx template is rendered with a placeholder loopback port and passed to `nginx -t` when nginx
is available on the validation host. This only proves template syntax; it is not a production probe.

## Remaining live gates

With explicit owner authorization on `135.106.187.95`: обновить файлы края деплоем, положить
root-owned env, выполнить cutover, проверить таймер, выпустить сертификат апекса, доказать
ОБА on-demand случая — собственный домен клиники И поддомен `<slug>.therapygo.ru` той клиники,
которой заведомо нет в текущем именном сертификате, — через DNS → доверенный TLS → точный роутинг,
один раз прогнать rollback и увидеть продление. No such live gate is claimed complete by this repository correction.
