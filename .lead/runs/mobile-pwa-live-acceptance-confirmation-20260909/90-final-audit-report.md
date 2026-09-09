# #915 PWA named-DEV confirmation — final audit report

Date: 2026-09-09. Candidate HEAD: `bbd9892d3cb6a2f906a362aa58ed5318f968e53e`.

## Verdict

**BLOCKED.** This is the required one-time HTTP/HTML/manifest inspection, repeated only to correct the first pass's missing named-DEV environment. No product code or tests were changed.

The canonical named-DEV webapp file existed and was a regular `0640` file owned by `dev:dev`. Its contents were not read, printed, copied, parsed, or committed. It was exposed only temporarily as the gitignored `apps/webapp/.env.dev` symlink while the candidate process ran.

The candidate was started directly on isolated port `5210`, not through a dev wrapper. Readiness had an explicit 300-second deadline:

```bash
cd apps/webapp && setsid npx next dev -H 127.0.0.1 -p 5210
curl --connect-timeout 3 --max-time 10 -sS -o /dev/null -w '%{http_code}' \
  -H 'Host: therapysto.ru' http://127.0.0.1:5210/app
```

The first readiness probe returned `000`; attempts 2–25 returned HTTP `500`. The non-secret runtime failure was `native_push_token_keyring_unavailable`, thrown while loading middleware before a request surface could render. This report does not infer, inspect, or disclose any environment value, and no product fix is within this audit's authority.

## HTTP evidence

No named point can be accepted from a 500 pre-render response. The table records the exact intended real-HTTP command/Host for each point; probes after the readiness gate were deliberately not treated as evidence because no document or manifest body was rendered.

| Point | Host and command | Status | Observed fields | Binary verdict |
| --- | --- | --- | --- | --- |
| 1. Default Therapy Go metadata/manifest | `Host: therapygo.ru`; `curl --max-time 30 -H 'Host: therapygo.ru' http://127.0.0.1:5210/app`; `curl --max-time 30 -H 'Host: therapygo.ru' http://127.0.0.1:5210/manifest.webmanifest` | N/A — readiness gate failed before point probe | No HTML title/manifest/apple-touch fields; no `id=/app`, `scope=/app`, `start_url=/app/patient`, Therapy Go icons, or maskable icon could be observed. | **BLOCKED** |
| 2. Therapysto staff metadata/manifest | `Host: therapysto.ru`; readiness command above returned `500`; intended manifest command: `curl --max-time 30 -H 'Host: therapysto.ru' http://127.0.0.1:5210/manifest-staff.webmanifest` | `/app`: `500`; manifest: N/A | No Therapysto document metadata, staff manifest, or `start_url=/app/doctor` body was observable. | **BLOCKED** |
| 3. Platform-admin PWA exclusion | `Host: admin.therapysto.ru`; `curl --max-time 30 -H 'Host: admin.therapysto.ru' http://127.0.0.1:5210/app/admin`; then both manifest routes with that Host | N/A — readiness gate failed | Neither absence of manifest/apple-web-app/icons nor both required non-installable manifest-route responses was observable. | **BLOCKED** |
| 4. Published branded patient identity | `Host: app.bersoncare.ru`; `curl --max-time 30 -H 'Host: app.bersoncare.ru' http://127.0.0.1:5210/app`; then `/manifest.webmanifest` with that Host | N/A — readiness gate failed | `app.bersoncare.ru` is only a runtime candidate, not an asserted binding. The resolver could not render, so no effective clinic name, legacy icon set, absence of Therapy Go, or absence of maskable icon was observed. | **BLOCKED** |
| 5. Install URLs and doctor compatibility redirect | `Host: therapygo.ru`; `curl --max-time 30 -H 'Host: therapygo.ru' http://127.0.0.1:5210/app/patient/install`; `Host: therapysto.ru`; `curl --max-time 30 -H 'Host: therapysto.ru' http://127.0.0.1:5210/app/doctor/install` | N/A — readiness gate failed | No patient install response, staff redirect `Location`, or proof of the absence of `/setup` was observable. | **BLOCKED** |

## Cleanup and scope

Only the owned `setsid` process group was terminated. After cleanup, the following command returned only its header (no listeners):

```bash
ss -ltn '( sport >= :5210 and sport <= :5219 )'
```

The temporary `apps/webapp/.env.dev` symlink, temporary logs, HTTP bodies/headers, and all temporary workspace build output used only to make the candidate launchable were removed or remain gitignored; no cookies, screenshots, credentials, or logs were retained in Git.

`M1-04` remains open and BLOCKED on this named-DEV runtime evidence. `M7-03` remains open: browser file fallback and iframe Jitsi are explicitly left for the later integrated M7-03 pass, along with the unaccepted install-metadata/branded slice.

## Fault injection

**убито 0 / непойманных 0.** This is a one-time live HTTP inspection. No fault injection applies without adding a prohibited test of launch circumstances or substituting a direct builder call for runtime behavior.

## Validation

```bash
git diff --check
```

Run after creating this report and before explicit staging.
