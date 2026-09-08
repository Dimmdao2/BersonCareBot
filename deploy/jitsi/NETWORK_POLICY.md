# Network policy, ports, DNS/TLS prerequisites

Target host: `151.241.228.122` (DEV/RELAY/TEST) only, per
[`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md). This package
never targets `135.106.162.170` or `135.106.187.95`; `bin/install.sh` and `bin/rollback.sh` both refuse to run
if `hostname -I` does not contain `151.241.228.122`, the same idiom `deploy/host/deploy-test.sh` already uses.

## Current firewall state on `151.x` (measured fact, not assumption)

Per `SERVER CONVENTIONS.md` §"Сетевой периметр": on `151.x`, `ufw` is inactive and `iptables -L INPUT -n` shows
policy `ACCEPT` with zero rules. Access restriction to `test.bersoncare.ru` today lives entirely inside
nginx's `allow`/`deny` server-block directives, not at the network layer. There is **no Selectel Security
Group** in front of `151.x` (SG is a `135.106.187.95`-only concept in the current canon) — a "Selectel SG
diff" for this host does not apply, and this document says so rather than inventing one.

Consequence: today, anything this package binds directly to a public port (JVB media, coturn) is reachable
from the open internet exactly like the rest of `151.x` is — nothing new is "opened" because nothing is
currently closed. The nftables diff below is a genuine hardening proposal (defense in depth, matching the new
PROD's policy-drop model), not a prerequisite the stack needs to function.

## Ports this package needs

| Port | Proto | Component | Exposure | Notes |
| --- | --- | --- | --- | --- |
| 443 | tcp | existing host nginx | public (VPN-trusted allowlist, see below) | new vhost `meet.${TEST_BASE_DOMAIN}`, TLS terminated by nginx |
| `${HTTP_PORT}` (default `8000`) | tcp | Jitsi `web` container | `127.0.0.1` only | plain HTTP — with `DISABLE_HTTPS=1` the container never opens a TLS listener at all (verified against the pinned tag's own nginx template); not exposed beyond loopback, nginx proxies to it |
| `${JVB_COLIBRI_PORT}` (default `8080`) | tcp | JVB Colibri REST API | `127.0.0.1` only | `COLIBRI_REST_ENABLED=1`; upstream's own base compose already binds this to loopback — `bin/health-check.sh` uses `GET /about/health` on it, never a new public surface |
| `${JVB_PORT}` (default `10000`) | udp | JVB | public | media fallback path; must be reachable without NAT surprises — `JVB_ADVERTISE_IPS` below |
| `${JVB_TCP_PORT}` (default `4443`) | tcp | JVB | public | TCP harvester fallback for UDP-hostile networks; low priority path, kept for completeness per plan's "TLS TURN fallback" intent |
| 3478 | udp+tcp | coturn | public | STUN + TURN, UDP first |
| 5349 | tcp | coturn | public | TURN over TLS, the "TLS fallback for limited networks" the plan asks for |
| `${TURN_RELAY_MIN}-${TURN_RELAY_MAX}` (default `49152-49252`, 101 ports) | udp | coturn | public | relay allocations; kept deliberately narrow (see below), not coturn's 49152-65535 default |

`test.bersoncare.ru`'s webapp port (`:6300`) and integrator (`:3300`) are unrelated to this package and are
not touched by it.

### Why the relay range is narrowed to 101 ports, not coturn's default ~16k

coturn's out-of-box default (`min-port=49152 max-port=65535`) is sized for many concurrent multi-party calls.
This deployment only ever has exactly one active 1:1 room needing relay at a time in the TEST proof scenarios
(plan explicitly caps occupancy at 2), so a 101-port range is already generous headroom for the couple of
synthetic runbook sessions this package needs to prove and keeps the exposed UDP surface an order of magnitude
smaller. Widening it is a one-line change in `coturn/turnserver.conf.template` if a later real load test needs
more concurrent relayed calls — not something to pre-provision speculatively.

## Proposed nftables diff (optional hardening, not yet applied)

Not applied by this worker (brief forbids modifying the firewall). Presented as an exact diff so the lead can
apply it with one command if adopted; until then the ports above are reachable the same way the rest of
`151.x` already is.

```nft
# /etc/nftables-bcb-jitsi-test.conf — additive table, does not touch the existing (absent) base policy.
# Apply:   nft -f /etc/nftables-bcb-jitsi-test.conf
# Remove:  nft delete table inet bcb_jitsi_test
table inet bcb_jitsi_test {
    chain input {
        type filter hook input priority filter + 10; policy accept;

        # VPN-trusted subnets, same allowlist nginx already uses for test.bersoncare.ru
        # (SERVER CONVENTIONS.md §"Доступы / VPN"): awg0 PROD relay, awg1 owner VPN, wg-easy laptop NAT.
        ip saddr { 10.9.0.0/24, 10.9.1.0/24, 172.17.0.0/16, 127.0.0.1 } udp dport 3478 accept
        ip saddr { 10.9.0.0/24, 10.9.1.0/24, 172.17.0.0/16, 127.0.0.1 } tcp dport { 3478, 5349 } accept
        ip saddr { 10.9.0.0/24, 10.9.1.0/24, 172.17.0.0/16, 127.0.0.1 } udp dport 49152-49252 accept
        ip saddr { 10.9.0.0/24, 10.9.1.0/24, 172.17.0.0/16, 127.0.0.1 } udp dport 10000 accept
        ip saddr { 10.9.0.0/24, 10.9.1.0/24, 172.17.0.0/16, 127.0.0.1 } tcp dport 4443 accept

        # Everything else to these specific ports: reject, don't silently drop (matches the plan's
        # "fail closed with a reason" spirit for infra, and avoids masking a real client misconfiguration
        # as a black hole).
        udp dport { 3478, 49152-49252, 10000 } reject
        tcp dport { 3478, 5349, 4443 } reject
    }
}
```

This restricts Jitsi/coturn to the same trust boundary as the rest of TEST (owner-only, VPN-reachable) instead
of leaving it open to the whole internet like the current unrestricted host default. It does **not** change
policy for any other port or service — `ufw`/base `iptables` state for the rest of the host is untouched, and
`awg0` (PROD's Telegram relay, "critical, do not touch") has its own subnet in the allowlist so it keeps
working unmodified.

Adopting this means a real patient guest link would also need to come from a VPN-trusted subnet, which
matches the plan's own statement that TEST has no real external users. If a later stage needs the guest link
reachable from an arbitrary public IP (a real external patient test), this diff must be relaxed for 443 and
for coturn/JVB specifically — an explicit owner decision, not something to default into silently.

## DNS and TLS prerequisites (not provisioned by this worker)

| Name | Type | Target | Status |
| --- | --- | --- | --- |
| `meet.test.bersoncare.ru` | A | `151.241.228.122` | **missing** — must be created at the DNS provider (reg.ru, per `SERVER CONVENTIONS.md`) before `bin/install.sh` can request a certificate |
| `turn.test.bersoncare.ru` | A | `151.241.228.122` | **missing** — same provider, same target |

Detection probe (safe, read-only, run from anywhere):

```bash
getent ahostsv4 meet.test.bersoncare.ru
getent ahostsv4 turn.test.bersoncare.ru
```

Empty output on either means the prerequisite is still missing; `bin/install.sh --check` runs the same probe
and stops with this exact message rather than guessing an address or falling back to a self-signed/placeholder
domain for anything the plan requires a trusted-by-browsers certificate for.

TLS: both new subdomains resolve to the same host as `test.bersoncare.ru`, so the existing ACME/ TLS
automation pattern (`deploy/host/setup-nginx-tls.sh` for the policy half; real certs are issued the same way
`test.bersoncare.ru`'s own certificate already is — see that vhost's host-managed TLS directives) is reused
for `meet.test.bersoncare.ru`. `turn.test.bersoncare.ru`'s certificate is requested directly for coturn's TLS
listener (5349) since coturn is not behind nginx.

Per the plan's own §7 caveat: this does **not** create or touch `*.therapygo.ru` (that wildcard currently
resolves to the new PROD `135.106.187.95`). The literal
`https://<clinic-slug>.therapygo.ru/live#<secret>` guest URL format is out of scope for this infra package —
that is stream D's surface-routing concern on the single-host TEST URL the plan already names as the
interim target.

## No-third-party-endpoint proof

`bin/probe-no-foreign-endpoints.sh` captures DNS queries and outbound connections made by a running call and
asserts every destination resolves to `151.241.228.122` (our own web/prosody/jicofo/jvb/coturn) or to the two
browser clients' own loopback/media stack — see `RUNBOOK.md` scenario 6 for how it's invoked against a live
call.
