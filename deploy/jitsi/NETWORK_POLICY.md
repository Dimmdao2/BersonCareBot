# Network policy, ports, DNS/TLS prerequisites

Target host: `151.241.228.122` (DEV/RELAY/TEST) only, per
[`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md). This package
never targets `135.106.162.170` or `135.106.187.95`; `bin/install.sh` and `bin/rollback.sh` both refuse to run
if `hostname -I` does not contain `151.241.228.122`, the same idiom `deploy/host/deploy-test.sh` already uses.

## Current firewall state on `151.x` (measured fact, not assumption)

Per `SERVER CONVENTIONS.md` §"Сетевой периметр": on `151.x`, `ufw` is inactive and the host base policy is
`ACCEPT`. Web access is restricted by nginx `allow`/`deny`. Raw Jitsi/coturn ports are additionally restricted
by the additive TEST-only nftables table `inet bcb_jitsi_test`. There is **no Selectel Security
Group** in front of `151.x` (SG is a `135.106.187.95`-only concept in the current canon) — a "Selectel SG
diff" for this host does not apply, and this document says so rather than inventing one.

The table accepts raw media/TURN traffic only from owner VPN, loopback, the TEST host and the internal Jitsi
network, then rejects other sources on those exact ports. Every unrelated host port and chain keeps the base
policy. Repository sources are `nftables-bcb-jitsi-test.conf`,
`../systemd/bersoncarebot-jitsi-test-network-policy.service` and `bin/apply-network-policy.sh`.

## Ports this package needs

| Port                                                                     | Proto   | Component             | Exposure                                  | Notes                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------- | --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 443                                                                      | tcp     | existing host nginx   | public (VPN-trusted allowlist, see below) | new vhost `meet.${TEST_BASE_DOMAIN}`, TLS terminated by nginx                                                                                                                                |
| `${HTTP_PORT}` (default `8000`)                                          | tcp     | Jitsi `web` container | `127.0.0.1` only                          | plain HTTP — with `DISABLE_HTTPS=1` the container never opens a TLS listener at all (verified against the pinned tag's own nginx template); not exposed beyond loopback, nginx proxies to it |
| `${JVB_COLIBRI_PORT}` (default `8080`)                                   | tcp     | JVB Colibri REST API  | `127.0.0.1` only                          | `COLIBRI_REST_ENABLED=1`; upstream's own base compose already binds this to loopback — `bin/health-check.sh` uses `GET /about/health` on it, never a new public surface                      |
| `${JVB_PORT}` (default `10000`)                                          | udp     | JVB                   | public                                    | media fallback path; must be reachable without NAT surprises — `JVB_ADVERTISE_IPS` below                                                                                                     |
| `${JVB_TCP_PORT}` (default `4443`)                                       | tcp     | JVB                   | public                                    | TCP harvester fallback for UDP-hostile networks; low priority path, kept for completeness per plan's "TLS TURN fallback" intent                                                              |
| 3478                                                                     | udp+tcp | coturn                | public                                    | STUN + TURN, UDP first                                                                                                                                                                       |
| 5349                                                                     | tcp     | coturn                | public                                    | TURN over TLS, the "TLS fallback for limited networks" the plan asks for                                                                                                                     |
| `${TURN_RELAY_MIN}-${TURN_RELAY_MAX}` (default `49152-49252`, 101 ports) | udp     | coturn                | public                                    | relay allocations; kept deliberately narrow (see below), not coturn's 49152-65535 default                                                                                                    |

The TEST webapp port (`:6300`) and integrator (`:3300`) are unrelated to this package and are
not touched by it.

### Why the relay range is narrowed to 101 ports, not coturn's default ~16k

coturn's out-of-box default (`min-port=49152 max-port=65535`) is sized for many concurrent multi-party calls.
This deployment only ever has exactly one active 1:1 room needing relay at a time in the TEST proof scenarios
(plan explicitly caps occupancy at 2), so a 101-port range is already generous headroom for the couple of
synthetic runbook sessions this package needs to prove and keeps the exposed UDP surface an order of magnitude
smaller. Widening it is a one-line change in `coturn/turnserver.conf.template` if a later real load test needs
more concurrent relayed calls — not something to pre-provision speculatively.

## Applied nftables boundary

Apply or reconcile it only on `151.241.228.122`:

```bash
sudo bash deploy/jitsi/bin/apply-network-policy.sh --check
sudo bash deploy/jitsi/bin/apply-network-policy.sh --apply
```

The systemd unit removes only `table inet bcb_jitsi_test` before applying the versioned file. It does **not**
flush the host ruleset. `awg0` (PROD Telegram relay) remains allowed and otherwise untouched.

Adopting this means a real patient guest link would also need to come from a VPN-trusted subnet, which
matches the plan's own statement that TEST has no real external users. If a later stage needs the guest link
reachable from an arbitrary public IP (a real external patient test), this diff must be relaxed for 443 and
for coturn/JVB specifically — an explicit owner decision, not something to default into silently.

## DNS and TLS state (2026-09-08)

| Name                         | Type | Target            | Status                                                   |
| ---------------------------- | ---- | ----------------- | -------------------------------------------------------- |
| `meet.test.therapysto.ru`    | A    | `151.241.228.122` | canonical, resolves, trusted certificate SAN             |
| `turn.test.therapysto.ru`    | A    | `151.241.228.122` | canonical, resolves, trusted certificate SAN             |
| `meet.test.therapygo.ru`     | A    | `151.241.228.122` | temporary compatibility alias, certificate SAN           |
| `turn.test.therapygo.ru`     | A    | `151.241.228.122` | temporary compatibility alias, certificate SAN           |
| `meet.test.bersoncare.ru`    | A    | `151.241.228.122` | legacy alias retained during transition, certificate SAN |
| `turn.test.bersoncare.ru`    | A    | `151.241.228.122` | legacy alias retained during transition, certificate SAN |

Detection probe (safe, read-only, run from anywhere):

```bash
getent ahostsv4 meet.test.therapysto.ru
getent ahostsv4 turn.test.therapysto.ru
```

Empty output on either canonical name blocks `bin/install.sh --check`. A single ACME lineage
`/etc/letsencrypt/live/bcb-jitsi-test` covers canonical and transition names. Before Jitsi apply, its renewal
owner copies
`fullchain.pem` and `privkey.pem` into `${CONFIG}/coturn/tls/`; that directory is `0700` and both files are
`0600`, owned by TEST deploy UID/GID `1000:1000`. Coturn mounts only this private copy read-only as the same
non-root numeric user; it never mounts or needs read access to the root-owned ACME source directory. The
versioned root-only `bin/sync-coturn-tls.sh` is both the initial staging command and the certbot deploy hook:
it validates both TEST SANs and expiry before replacing either destination file, then restarts only the
TEST coturn container when it is already running.

This package does not touch production `*.therapygo.ru`; TEST patient surfaces use `test.therapygo.ru` and
`*.test.therapygo.ru`.

## No-third-party-endpoint proof

`bin/probe-no-foreign-endpoints.sh` captures DNS queries and outbound connections made by a running call and
asserts every destination resolves to `151.241.228.122` (our own web/prosody/jicofo/jvb/coturn) or to the two
browser clients' own loopback/media stack — see `RUNBOOK.md` scenario 6 for how it's invoked against a live
call.
