# #915 mobile PWA live acceptance — final report

Date: 2026-09-09. Candidate HEAD: `67ac7956e2cb447e4f03f289f8829d16dd2938f5` (contains PWA landing `66ef65468`).

## Verdict

The live acceptance is **BLOCKED**. No product code, database state, TEST/PROD, shared port 5200, credentials, cookies, screenshots, or runtime logs were committed or retained in Git.

The isolated candidate checkout has no usable DEV environment file:

```bash
for f in .env apps/webapp/.env apps/webapp/.env.dev apps/webapp/.env.local apps/webapp/.env.development.local; do test -f "$f" && echo "$f: present" || echo "$f: absent"; done
```

Output: all five paths were `absent`. After the normal offline dependency setup and the two required local workspace builds, the allowed direct candidate command still exited before readiness:

```bash
pnpm install --offline --frozen-lockfile
pnpm --dir packages/shared-contracts run build && pnpm --dir packages/db-principal run build
cd apps/webapp && npx next dev -H 127.0.0.1 -p 5210
```

The candidate log (kept only under `/tmp`) says `injected env (0) from .env.dev`, `injected env (0) from .env`, then `Development requires SESSION_COOKIE_SECRET (min 16 chars) in env. Use .env or .env.local.` Supplying or reading the named DEV env to obtain that secret is forbidden by this acceptance brief. The readiness loop observed the process exit on attempt 4; `ss -ltn 'sport = :5210'` after the cleanup printed no listener. The process group was terminated by the same foreground probe command.

| Point | Binary verdict | Exact HTTP evidence / required observation |
| --- | --- | --- |
| 1. Default patient | **BLOCKED** | `curl --max-time 30 -H 'Host: therapygo.ru' http://127.0.0.1:5210/app` and `/manifest.webmanifest` both returned HTTP `000`; therefore no runtime title, manifest, apple-touch, `id=/app`, `scope=/app`, `start_url=/app/patient`, Therapy Go 192/512, or maskable field was observable. |
| 2. Staff | **BLOCKED** | `curl --max-time 30 -H 'Host: therapysto.ru' http://127.0.0.1:5210/app` and `/manifest-staff.webmanifest` both returned HTTP `000`; no Therapysto metadata, staff manifest, or `start_url=/app/doctor` was observable. |
| 3. Platform admin exclusion | **BLOCKED** | `curl --max-time 30 -H 'Host: admin.therapysto.ru' http://127.0.0.1:5210/app/admin`, `/manifest.webmanifest`, and `/manifest-staff.webmanifest` all returned HTTP `000`; neither absence of install metadata nor both required non-installable route responses can be accepted. |
| 4. Published branded patient | **BLOCKED** | `curl --max-time 30 -H 'Host: app.bersoncare.ru' http://127.0.0.1:5210/app` returned HTTP `000`. `app.bersoncare.ru` was taken only from the current domain-map candidate, not asserted as a DEV binding; the real resolver/application behavior could not execute, so effective clinic name, legacy icons, absence of Therapy Go, and absence of a false maskable icon are unproven. |
| 5. Install URLs / redirect | **BLOCKED** | `curl --max-time 30 -H 'Host: therapygo.ru' http://127.0.0.1:5210/app/patient/install` and `curl --max-time 30 -H 'Host: therapysto.ru' http://127.0.0.1:5210/app/doctor/install` both returned HTTP `000`; the compatible doctor redirect and absence of `/setup` cannot be accepted from runtime. |

The HTTP probes did not follow redirects and would have recorded each status, `Location`, content type, page metadata, and manifest fields. They recorded no metadata or manifest body because the candidate never listened. This is not a builder-function simulation.

## Scope and remaining work

`M1-04` remains open and BLOCKED pending this same named-DEV runtime evidence. `M7-03` remains open: this blocked pass did not accept the install-metadata/default-patient/staff/platform-admin/branded slice; the explicitly out-of-scope browser/PWA checks for standards-based file fallback and iframe Jitsi also remain open. APK-variant evidence remains governed by the rest of M7-03.

## Fault injection

**убито 0 / непойманных 0.** This is a one-time HTTP/HTML/manifest live inspection. There is no applicable automated fault injection without creating a prohibited test of launch circumstances or substituting a direct builder call for runtime.

## Validation

```bash
git diff --check
```

Passed before staging this report. Candidate server cleanup was verified with:

```bash
ss -ltn 'sport = :5210'
```

It returned no listener.
