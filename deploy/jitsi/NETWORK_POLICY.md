# Network policy, ports, DNS/TLS prerequisites

This package has **two deployment profiles**, selected by `JITSI_DEPLOYMENT` and resolved once in
[`bin/lib/profile.sh`](bin/lib/profile.sh). There is no default: an absent or unknown value is a fatal
error in every script under `bin/`.

| | `JITSI_DEPLOYMENT=test` | `JITSI_DEPLOYMENT=prod` |
| --- | --- | --- |
| Host | `151.241.228.122` (DEV/RELAY/TEST) | `135.106.187.95` (new production) |
| Meet host | `meet.test.therapysto.ru` | `meet.therapysto.ru` |
| TURN host | `turn.test.therapysto.ru` | `turn.therapysto.ru` |
| Package root | `/etc/bersoncarebot/jitsi-test` | `/etc/therapysto/jitsi-prod` |
| Jitsi env file | `/opt/env/bersoncarebot/jitsi.test` | `/opt/therapysto/env/jitsi.prod` |
| coturn env file | `/opt/env/bersoncarebot/jitsi-coturn.test` | `/opt/therapysto/env/jitsi-coturn.prod` |
| nftables objects | own table `inet bcb_jitsi_test` | chains `therapysto_jitsi_prod_in` / `therapysto_jitsi_prod_fwd` inside the host's own `inet filter` table — no table of its own |
| nftables source | `nftables-bcb-jitsi-test.conf` | `nftables-therapysto-jitsi-prod.conf` |
| Boot unit | `../systemd/bersoncarebot-jitsi-test-network-policy.service` | `../systemd/therapysto-jitsi-prod-network-policy.service` |
| nginx template | `nginx/meet-test.vhost.template.conf` | `nginx/meet-prod.vhost.template.conf` |
| ACME lineage | `/etc/letsencrypt/live/bcb-jitsi-test` | `/etc/letsencrypt/live/therapysto-jitsi-prod` |
| Compose project | `bcb-jitsi-test` | `therapysto-jitsi-prod` |
| coturn container | `bcb-jitsi-test-coturn` | `therapysto-jitsi-prod-coturn` |
| JWT app id / issuer / audience | `bcb-video-meetings-test` | `therapysto-video-meetings` |
| Log tag | `[jitsi-test]` | `[jitsi-prod]` |

**Nothing the prod profile installs carries a `bersoncarebot`/`bcb` name.** That is the owner's ruling of
10.09.2026, recorded in [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md)
§"Именование на новом проде" (roots, systemd units, docker networks and compose projects, images, nginx
files, tables). The TEST host keeps the historical names it already runs under — the same document says so
explicitly — which is why the two columns above are not string-for-string mirrors. The one naming trap that
document also records, the 15-character kernel limit on *interface* names (IFNAMSIZ), does not apply here:
this stack's compose file asks for no bridge name, so docker names the bridge `br-<hash>`, and
`therapysto-jitsi-prod` is a compose project/network name, never an interface name.

**The LEGACY production host `135.106.162.170` is refused under BOTH profiles.** `jitsi_require_host()`
fails with its own distinct message whenever `hostname -I` contains that address, before it even looks at
whether the profile's own address is present — so no combination of `JITSI_DEPLOYMENT` and env files can
make this package act on the legacy production box. Every script that previously compared `hostname -I`
against the literal `151.241.228.122` now calls that one function; the check itself did not get weaker,
only its expected value became profile-derived. Same idiom `deploy/host/deploy-test.sh` already uses, per
[`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md).

**Nothing in the prod profile has been run on `135.106.187.95` yet.** The prod artifacts below are
reviewed and syntax-checked in the repository only; there is no host evidence for any of them.

## Two base policies, two policy shapes

The two hosts do not have the same base firewall policy, so they cannot share one shape.

* **`151.x` (test) — base policy `ACCEPT`.** Nothing is closed, so the package's job is to *narrow*.
  `nftables-bcb-jitsi-test.conf` registers its own `table inet bcb_jitsi_test` at priority `filter + 10`
  (i.e. AFTER the main filter chain), accepts the media ports from the trusted sources and then `reject`s
  those same ports from everything else.
* **`135.106.187.95` (prod) — `/etc/nftables.conf` declares `table inet filter` whose `input` and
  `forward` chains are `policy drop`.** Everything is already closed, so a *reject* table would be
  pointless — and, less obviously, so would an additive *accept* table.

**An `accept` in a separate base chain does NOT bypass a later drop-policy chain.** In nftables an
`accept` verdict ends evaluation of the chain it was reached in, not of the hook: the packet is still
handed to every other base chain registered on the same hook, including the drop-policy one at priority
`filter`. An earlier-priority accept-table therefore cannot open a port on a drop-policy host — it is not
"necessary but not sufficient", it is simply invisible to the outcome. An earlier revision of this package
shipped exactly that shape for prod, plus a heuristic in `bin/apply-network-policy.sh` that read the live
main chain and refused unless the ports were already named there. Both are gone: the heuristic existed
only to paper over a design that could not open a port, and a design that opens the ports needs no
heuristic.

**What the prod profile installs instead.** `nftables-therapysto-jitsi-prod.conf` re-opens the host's OWN
`table inet filter` and adds to it two REGULAR (non-base) chains plus one `jump` into each from the
existing base chains:

```
table inet filter {
    chain therapysto_jitsi_prod_in  { …coturn accepts…  }
    chain therapysto_jitsi_prod_fwd { …jvb accepts…     }
    chain input   { jump therapysto_jitsi_prod_in  }
    chain forward { jump therapysto_jitsi_prod_fwd }
}
```

Re-declaring `chain input`/`chain forward` without a type/hook/priority/policy line is a plain "add chain":
nftables leaves the existing chain's hook, priority and policy untouched and only appends the jump. Nothing
in the file flushes, re-policies or deletes anything, and Docker's separately managed `table ip filter`
(iptables-nft) is never touched.

**Two components, two chains — because they travel different paths.** The TEST file does not distinguish
them, because on an accept-policy host it does not have to:

| Component | Path | Why | Ports |
| --- | --- | --- | --- |
| coturn | `input` | runs `network_mode: host` (see `docker-compose.override.test.yml`), so its listeners are on the host itself | udp 3478, tcp 3478, tcp 5349, udp 49152-49252 |
| jvb | `forward` | bridged with published ports, so its traffic is DNAT'd to the container address and never reaches `input` | udp 10000, tcp 4443 |

An input-only policy would leave every JVB media packet dropped by the `forward` chain while `ss` on the
host still showed the published port — the "looks applied, nothing connects" failure this shape exists to
avoid. The forward rules match the stack's subnet `172.30.110.0/24` rather than an interface name because
compose names that bridge `br-<hash>`, which is not knowable before the network is created.

**Source scoping: the media ports are open to ANY source, deliberately.** The trial allow-list
(`151.241.228.122` + loopback) gates the *web* vhost in nginx — that is what keeps the trial private:
without loading the app from that vhost and holding a valid short-lived JWT, nobody gets a room. It is the
wrong tool for the media ports. Real WebRTC clients and TURN peers arrive from arbitrary addresses (a
mobile network, a hotel wifi, the other participant's ISP), so scoping 3478/5349/10000/4443 and the relay
range to the trial list would make a call impossible for anyone but the owner's own browser on the dev box
— including the owner's own phone. What protects those ports is not the source address:

* coturn requires credentials (`use-auth-secret`, short-lived XEP-0215 REST credentials derived from the
  HMAC secret) — an open 3478 is not an open relay;
* its relay targets deny loopback/link-local/RFC1918 (`TURN_DENY_PEER_RANGES`), so it cannot be used to
  reach anything else on this host or its neighbours, and `TURN_MAX_ALLOCATIONS` caps concurrency;
* the relay range is 101 ports, not coturn's ~16k default (see below);
* jvb accepts media only for conferences Jicofo created for an authenticated (JWT) participant.

During the trial this means: the meeting **page** is reachable only from the owner's VPN exit, while the
**media/TURN ports** answer the whole internet, the way any public TURN/JVB deployment must. Narrowing
them is a deliberate owner decision — and would break every client that is not the dev box — not a
hardening step to apply quietly.

**Persistence: this package never rewrites `/etc/nftables.conf`.** The host loads its own ruleset from
that file at boot, which is where the `inet filter` table and its base chains come from; the chains this
package adds live in memory and disappear with that flush. `../systemd/therapysto-jitsi-prod-network-policy.service`
is what puts them back: `After=nftables.service` + `Requires=nftables.service` (run after the base ruleset
is loaded, and fail loudly if it never was) and `Before=docker.service` (the forward policy must exist
before a media container can start). The unit has no `ExecStop`/`ExecStartPre` teardown on purpose — the
TEST unit can afford `nft delete table inet bcb_jitsi_test` because that table is entirely its own, while
here the same shape would name the host's `inet filter` table and delete the whole firewall. Removing or
re-applying the policy on a running host means deleting the two jump rules **by handle first** and only
then the two chains (nftables refuses to delete a chain that is still a jump target); that logic lives in
`bin/apply-network-policy.sh --apply`, which then verifies both chains and both jumps exist and fails
loudly if either is missing. That verification proves the rules are *installed*, not that they are
*reached*: the jumps are appended to the host's chains, so a terminal `drop`/`reject` rule added ahead of
them would silence the policy without the check noticing. Only a live packet proves reachability
(`RUNBOOK.md`).

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
| 443                                                                      | tcp     | existing host nginx   | public (allowlisted, see below) | new vhost for the profile's meet host, TLS terminated by nginx                                                                                                                              |
| `${HTTP_PORT}` (default `8000`)                                          | tcp     | Jitsi `web` container | `127.0.0.1` only                          | plain HTTP — with `DISABLE_HTTPS=1` the container never opens a TLS listener at all (verified against the pinned tag's own nginx template); not exposed beyond loopback, nginx proxies to it |
| `${JVB_COLIBRI_PORT}` (default `8080`)                                   | tcp     | JVB Colibri REST API  | `127.0.0.1` only                          | `COLIBRI_REST_ENABLED=1`; upstream's own base compose already binds this to loopback — `bin/health-check.sh` uses `GET /about/health` on it, never a new public surface                      |
| `${JVB_PORT}` (default `10000`)                                          | udp     | JVB                   | public                                    | media fallback path; must be reachable without NAT surprises — `JVB_ADVERTISE_IPS` below                                                                                                     |
| `${JVB_TCP_PORT}` (default `4443`)                                       | tcp     | JVB                   | public                                    | TCP harvester fallback for UDP-hostile networks; low priority path, kept for completeness per plan's "TLS TURN fallback" intent                                                              |
| 3478                                                                     | udp+tcp | coturn                | public                                    | STUN + TURN, UDP first                                                                                                                                                                       |
| 5349                                                                     | tcp     | coturn                | public                                    | TURN over TLS, the "TLS fallback for limited networks" the plan asks for                                                                                                                     |
| `${TURN_RELAY_MIN}-${TURN_RELAY_MAX}` (default `49152-49252`, 101 ports) | udp     | coturn                | public                                    | relay allocations; kept deliberately narrow (see below), not coturn's 49152-65535 default                                                                                                    |

The port table is identical for both profiles — nothing about it is profile-specific except which host the
ports are opened on and by which nftables shape. The TEST webapp port (`:6300`) and integrator (`:3300`)
are unrelated to this package and are not touched by it.

### Why the relay range is narrowed to 101 ports, not coturn's default ~16k

coturn's out-of-box default (`min-port=49152 max-port=65535`) is sized for many concurrent multi-party calls.
This deployment only ever has exactly one active 1:1 room needing relay at a time in the TEST proof scenarios
(plan explicitly caps occupancy at 2), so a 101-port range is already generous headroom for the couple of
synthetic runbook sessions this package needs to prove and keeps the exposed UDP surface an order of magnitude
smaller. Widening it is a one-line change in `coturn/turnserver.conf.template` if a later real load test needs
more concurrent relayed calls — not something to pre-provision speculatively.

## Applied nftables boundary

The profile decides which conf, unit, table and backup root are used; the host gate decides whether the run
is allowed at all:

```bash
JITSI_DEPLOYMENT=test sudo -E bash deploy/jitsi/bin/apply-network-policy.sh --check
JITSI_DEPLOYMENT=test sudo -E bash deploy/jitsi/bin/apply-network-policy.sh --apply
```

(and the same two commands with `JITSI_DEPLOYMENT=prod` on `135.106.187.95` — never run, see the status
note at the top of this file. When the profile is already declared in the host's env file, the
`JITSI_DEPLOYMENT=` prefix is unnecessary: `bin/lib/profile.sh` reads it from there.)

The TEST unit removes only its own table (`bcb_jitsi_test`) before applying the versioned file; the prod
unit removes nothing (see "Persistence" above) and its teardown lives in `bin/apply-network-policy.sh`.
Neither flushes the host ruleset. On `151.x`, `awg0` (PROD Telegram relay) remains allowed and otherwise
untouched.

Adopting this means a real patient guest link would also need to come from a VPN-trusted subnet, which
matches the plan's own statement that TEST has no real external users. If a later stage needs the guest link
reachable from an arbitrary public IP (a real external patient test), this diff must be relaxed for 443 and
for coturn/JVB specifically — an explicit owner decision, not something to default into silently.

## Prod prerequisites this package does not own

None of these is created, checked in, or applied by anything under `deploy/jitsi/`. Each has to exist on
`135.106.187.95` before `bin/install.sh --check` (prod profile) can pass, and none of them exists yet as
far as this package knows:

1. **DNS A records** `meet.therapysto.ru` and `turn.therapysto.ru` → `135.106.187.95`, created at the DNS
   provider. `bin/install.sh --check` reports a missing record but cannot create one.
2. **A certificate lineage `/etc/letsencrypt/live/therapysto-jitsi-prod`** whose SANs cover **both**
   `meet.therapysto.ru` and `turn.therapysto.ru` — nginx reads it directly, and `bin/sync-coturn-tls.sh`
   stages the `0600` deploy-owned copy coturn mounts. `bin/apply-nginx.sh` and `bin/sync-coturn-tls.sh`
   both fail closed on a lineage that does not cover every name in the profile's SAN set.
3. **The host's own `table inet filter`, with `input` and `forward` base chains, loaded from
   `/etc/nftables.conf` at boot.** This is what the prod policy adds its chains to. No edit to
   `/etc/nftables.conf` is required or performed — the earlier "pairing" prerequisite is gone with the
   additive table that needed it. `bin/apply-network-policy.sh --check` runs `nft -c -f` against the
   **live** ruleset (not a flushed one), so a missing table or base chain fails there.
4. **`/etc/therapysto` writable by the account that runs `bin/install.sh`** (the prod package root is
   `/etc/therapysto/jitsi-prod`), the same one-time root bootstrap the TEST host needed under its own name
   (`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §mTLS).
5. **The two env files**, copied from `env/jitsi-prod.env.example` / `env/coturn-prod.env.example` to
   `/opt/therapysto/env/jitsi.prod` and `/opt/therapysto/env/jitsi-coturn.prod` at mode `0600`, with
   `JWT_APP_SECRET` filled in from the application's `system_settings`.
6. **A Selectel Security Group review.** `135.106.187.95` sits behind a Selectel SG in the current canon
   (`151.x` does not). This package does not touch the SG and makes no claim about its current contents —
   whoever runs the prod trial must confirm the same UDP/TCP ports are permitted there too.

## DNS and TLS state — TEST profile (2026-09-08)

| Name                         | Type | Target            | Status                                                   |
| ---------------------------- | ---- | ----------------- | -------------------------------------------------------- |
| `meet.test.therapysto.ru`    | A    | `151.241.228.122` | canonical, resolves, trusted certificate SAN             |
| `turn.test.therapysto.ru`    | A    | `151.241.228.122` | canonical, resolves, trusted certificate SAN             |
| `meet.test.therapygo.ru`     | A    | `151.241.228.122` | temporary compatibility alias, certificate SAN           |
| `turn.test.therapygo.ru`     | A    | `151.241.228.122` | temporary compatibility alias, certificate SAN           |
| `meet.test.bersoncare.ru`    | A    | `151.241.228.122` | legacy alias retained during transition, certificate SAN |
| `turn.test.bersoncare.ru`    | A    | `151.241.228.122` | legacy alias retained during transition, certificate SAN |

No `meet.therapysto.ru` / `turn.therapysto.ru` record has been observed by this package; the prod rows of
that table do not exist yet and are deliberately not invented here.

Detection probe (safe, read-only, run from anywhere — substitute the profile's own names):

```bash
getent ahostsv4 meet.test.therapysto.ru
getent ahostsv4 turn.test.therapysto.ru
```

Empty output on either of the profile's canonical names blocks `bin/install.sh --check`. On TEST a single
ACME lineage `/etc/letsencrypt/live/bcb-jitsi-test` covers the canonical and transition names; the prod
profile expects the same arrangement under `/etc/letsencrypt/live/therapysto-jitsi-prod` for `meet.therapysto.ru`
and `turn.therapysto.ru`, which does not exist yet. Before Jitsi apply, its renewal
owner copies
`fullchain.pem` and `privkey.pem` into `${CONFIG}/coturn/tls/`; that directory is `0700` and both files are
`0600`, owned by TEST deploy UID/GID `1000:1000`. Coturn mounts only this private copy read-only as the same
non-root numeric user; it never mounts or needs read access to the root-owned ACME source directory. The
versioned root-only `bin/sync-coturn-tls.sh` is both the initial staging command and the certbot deploy hook:
it validates every SAN in the profile's required set (`JITSI_CERT_HOSTS`) and expiry before replacing either
destination file, then restarts only that profile's own coturn container when it is already running.

This package does not touch production `*.therapygo.ru`; TEST patient surfaces use `test.therapygo.ru` and
`*.test.therapygo.ru`.

## No-third-party-endpoint proof

`bin/probe-no-foreign-endpoints.sh` captures DNS queries and outbound connections made by a running call and
asserts every destination is in the profile's trusted set (`151.241.228.122` + loopback on test;
`135.106.187.95`, the trial client `151.241.228.122`, and loopback on prod) or belongs to the browser
clients' own loopback/RFC1918 media stack — see `RUNBOOK.md` scenario 6 for how it's invoked against a live
call.
