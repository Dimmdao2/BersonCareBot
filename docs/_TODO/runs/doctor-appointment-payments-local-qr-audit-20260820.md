# Doctor appointment payments — local QR re-audit (2026-08-20)

## Scope and authority

- Re-audit target: commit `542c1eb35` over accepted backend fixer `992cd85d4`.
- Product oracle: `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-1d — the QR visualizes the exact same server-authorized payment link.
- Lead finding: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` — no external hardcoded QR provider or disclosure of the payment URL to a third party.
- The accepted backend findings and the original eight payment kill classes were not repeated.

## Test or view

- `TEST`: repeatable QR decodability, exact UTF-8 URL identity, realistic long confirmation URLs, supported-version boundary, and stale appointment identity.
- `VIEW/static`: no external QR request/provider, new dependency, or undocumented runtime host binary.
- Existing stale-link UI oracle was reused only for the new QR context.

## Blind kill-set

Fixed before reading `localQrCode.ts` or its test:

- `QR-K1 undecodable`: the emitted square cannot be decoded as QR at all.
- `QR-K2 exact-utf8`: the decoded payload is not the exact input UTF-8 URL.
- `QR-K3 length-boundary`: a short URL appears valid but a realistic long YooKassa-shaped confirmation URL or the supported version-10 boundary fails.
- `QR-K4 qr-structure`: wrong ECC block groups/interleaving/remainder/format/version bits make a square but invalid symbol.
- `QR-K5 local-only`: generation performs an external request, contains a hardcoded QR provider, adds a dependency, or requires an undocumented host binary.
- `QR-K6 stale-identity`: changing the link/appointment leaves the previous QR identity visible.

## Independent decoder/reference discovery

No package was installed. `/usr/bin/qrencode` 4.1.1 is an independent generator/reference, not a decoder.

Exact searches:

```bash
command -v zbarimg; command -v zxing; command -v qrdecode; command -v dmtxread
compgen -c | sort -u | rg -i '(^|[-_])(zbar|zxing|qr|barcode|opencv|decode|dmtx)'
python3 - <<'PY'
import importlib.util
for name in ('cv2', 'pyzbar', 'zxingcpp', 'zxing', 'qreader', 'PIL'):
    print(f'{name}: {importlib.util.find_spec(name)}')
PY
node - <<'JS'
for (const name of ['@zxing/library', '@zxing/browser', 'jsqr', 'qrcode-reader', 'sharp', 'playwright', 'playwright-core', 'puppeteer']) {
  try { console.log(`${name}: ${require.resolve(name)}`); } catch { console.log(`${name}: unavailable`); }
}
JS
dpkg-query -W -f='${binary:Package}\n' | rg -i 'zbar|zxing|opencv|dmtx|quirc|barcode|chromium'
rg --files --hidden --no-ignore node_modules apps/webapp/node_modules /usr/share/java /usr/local/lib/node_modules /home/dev/.local/share/pnpm /home/dev/.cache 2>/dev/null | rg -i '(^|/)(@zxing|zxing|javase|jsqr|qrcode-reader|opencv|quirc|zbar|pyzbar|barcode-detector)(/|[-._])'
find /usr /opt /home/dev/.local -type f \( -iname '*zxing*.jar' -o -iname '*javase*.jar' -o -iname 'zbarimg' -o -iname '*quirc*' \) -print 2>/dev/null
timeout 30s chromium-browser --headless --no-sandbox --disable-gpu --dump-dom 'data:text/html,<body><script>document.body.textContent=typeof%20BarcodeDetector%2b%22%7c%22%2b(%22BarcodeDetector%22%20in%20globalThis)%3b</script>'
```

Results: no decoder binary/JAR/module; Python decoder imports are absent; Node decoder packages are unavailable; Chromium 151 returned `<body>undefined|false</body>`. The filesystem search returned no relevant decoder (only unrelated names containing `quirc`, such as `squircle`).

Therefore structural/reference evidence could never justify `PASS` for a repaired encoder without later independent decode evidence. The current commit fails earlier: its matrices disagree with independent QR Model 2 references.

## Reference method and current defect

`localQrCodeDataUri()` was executed to produce its SVG data URI. Chromium rendered the current SVG into a 1200×1200 PNG successfully:

```bash
qr_tmp_dir=$(mktemp -d -p /home/dev/snap/chromium/common qr-audit.XXXXXX)
qr_uri=$(pnpm --silent --dir apps/webapp exec tsx --eval "import {localQrCodeDataUri} from './src/app/app/doctor/calendar/localQrCode.ts'; process.stdout.write(localQrCodeDataUri('https://pay.example.test/appointment-1?token=20'));" )
timeout 30s chromium-browser --headless --no-sandbox --disable-gpu --hide-scrollbars --run-all-compositor-stages-before-draw --virtual-time-budget=3000 --window-size=1200,1200 --screenshot="$qr_tmp_dir/payment-qr.png" "$qr_uri"
identify "$qr_tmp_dir/payment-qr.png"
```

Result: `PNG 1200x1200`, 7805 bytes. A renderable square is not evidence that it is a valid QR.

Fixed oracles were generated with `qrencode` 4.1.1, ECC L and forced byte mode. The short and UTF-8 inputs were chosen where the independent reference selected mask 0, exactly matching the product encoder's fixed mask. Version-10 references selected masks 2/1 and were normalized once to mask 0 by XORing only standard data modules and writing the corresponding BCH format bits. The frozen resulting hashes live in the acceptance test; the test does not run or require a host binary.

Direct short-vector command:

```bash
qrencode -s 1 -8 -l L -m 0 -t XPM -o - 'https://pay.example.test/appointment-1?token=20' | sed -n '/^"[FB][FB]*"[,]*$/s/[",]//gp' | tr FB 10 | sha256sum
```

Result: independent `f090959e38a652922347659368813ec5fbeb1d0c1b6641c42ea3759385d35869`; product `1b6490a6b47b1bb6b21539ce877f714aee4fee539a46756a6765b8bd2873c522`.

The implementation has three reachable structural defects:

1. `localQrCode.ts:140-145` reserves nine modules on the right and bottom format axes. QR Model 2 uses eight horizontal format modules and seven vertical modules plus the separate dark module. The extra `(size - 9, 8)` and `(8, size - 9)` reservations remove payload cells, so `localQrCode.ts:155-169` places the codeword stream on the wrong map.
2. `localQrCode.ts:173-174` writes the top-left horizontal format copy through `x = 6` and never writes `x = 0`; it overwrites a timing module and leaves one format bit wrong.
3. For version 10, `274 / 4` makes `dataPerBlock = 68.5` at `localQrCode.ts:85-99`. The loop emits 69 positions for every block although the required block groups have unequal data lengths; missing entries become zero bits and trailing ECC is dropped from the matrix.

## ID → verdict → evidence

- `QR-K1 → FAIL` → the short version-3/mask-0 product matrix disagrees with the unique independent byte-mode/L/mask-0 reference; the permanent acceptance is red. No decoder is available, but the invalid standard matrix already prevents a `BLOCKED`-only verdict.
- `QR-K2 → FAIL` → the independent UTF-8 reference expected `bad5099…`; product returned `7cd2c898…`. Exact UTF-8 identity is not encoded by the current standard layout.
- `QR-K3 → FAIL` → the 238-byte YooKassa-shaped and exact 271-byte version-10 inputs both select version 10 and disagree with normalized independent references: product `2a4f365a…` vs `b1236425…`, and `076e2660…` vs `2c54dc17…`. The fractional block split above is independently reachable.
- `QR-K4 → FAIL` → fixed reference failures plus the two format/function-map defects and the unequal version-10 block-group defect. The output is structurally square but not the QR Model 2 symbol for its input.
- `QR-K5 → PASS` → `localQrCode.ts` has no imports, request API, provider URL, child process, or host-binary call. `542c1eb35` changes no package manifest/lockfile. `AppointmentPaymentSection` uses a local data URI; its only `fetch` calls target its existing `apiBase`. Fault injection restoring `https://quickchart.io/...` made the UI oracle red on the expected `data:image/svg+xml` assertion.
- `QR-K6 → PASS` → the restored targeted UI oracle is green. Fault injection removing `setLink(null)` made it red because the old payment link and QR remained after the appointment changed.

## Fault-injection mapping

- `QR-K1/QR-K2`: current-product fixed short/UTF-8 reference assertions are red; no synthetic fault is needed when the acceptance already reproduces the defect.
- `QR-K3/QR-K4`: current-product long/boundary reference assertions are red; source inspection identifies the independent function-map and block-group failure paths.
- `QR-K5`: injected external QuickChart `src` → `keeps the QR...` failed at the local data-URI assertion.
- `QR-K6`: removed appointment-change `setLink(null)` → `keeps the QR...` failed because the old link remained in the DOM.

All temporary product mutations were reverted. `git diff --exit-code -- apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx apps/webapp/src/app/app/doctor/calendar/localQrCode.ts` returned exit 0.

Named classes: `6/6` killed or reproduced, `0` unhandled. Four classes expose current-product failures; two current safeguards pass and were mutation-proven.

```bash
awk '/^- `QR-K[1-6] [^`]+`:/{blind++} /^- `QR-K[1-6] → (PASS|FAIL|BLOCKED)` →/{handled++} END{printf "blind=%d handled=%d unhandled=%d\\n", blind, handled, blind-handled}' docs/_TODO/runs/doctor-appointment-payments-local-qr-audit-20260820.md
```

Result: `blind=6 handled=6 unhandled=0`.

## Exact validation commands/results

```bash
pnpm --dir apps/webapp exec vitest --run --project=unit src/app/app/doctor/calendar/localQrCode.unit.test.ts
```

`FAIL`: 1 file; 5 tests, 4 failed / 1 passed. Red vectors: short URL, UTF-8 URL, long YooKassa-shaped URL, and 271-byte version-10 boundary. The failing fixed-oracle acceptance remains for the worker.

```bash
pnpm --dir apps/webapp exec vitest --run --project=ui src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx -t 'keeps the QR on the server-returned URL'
```

After rollback: `PASS`, 1 selected / 7 skipped. Under the two fault injections above, the same command failed at the expected local-source and stale-identity assertions.

```bash
rg -n "fetch|XMLHttpRequest|WebSocket|https?://|child_process|spawn|exec|import |require\(" apps/webapp/src/app/app/doctor/calendar/localQrCode.ts apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx
git diff 542c1eb35^ 542c1eb35 -- package.json pnpm-lock.yaml apps/webapp/package.json
```

`VIEW PASS` for `QR-K5`: no QR request/provider/dependency/binary. The only URL in `localQrCode.ts` is the SVG XML namespace, which does not initiate a network request.

Full CI, dev server, DB, DEV/TEST, PROD, backend/payment acceptance, dependency installation and push were not run or touched.

## Final verdict

`FAIL — NOT FOR LAND` for `542c1eb35`. The local-only/privacy correction is present, and stale identity remains protected, but the emitted SVG matrices are not valid QR Model 2 encodings of the payment URLs. Product code was not fixed; the red fixed-oracle acceptance is committed for the worker.

## Fixer appendix (2026-08-20)

The local encoder now uses explicit Model 2/L Reed–Solomon block groups for every supported version, including version 10's `2 × 68` and `2 × 69` data blocks. It reserves only the standard format locations and dark module, and writes all 15 format bits without touching the timing module.

`pnpm --dir apps/webapp exec vitest --run --project=unit src/app/app/doctor/calendar/localQrCode.unit.test.ts` returned `FAIL`: 5 tests, 3 passed / 2 failed. The short and UTF-8 matrices now match. The version-10 product hashes remain `2df4054f6470743d895d06bc7ea35185c2ff72dc78e2ca4ccd4f744aedba393e` and `6b88fb0f2b5151338afff03daaefaa1bf04f6e6e52d2abbb7b434206054499cd`, versus frozen `b1236425…` and `2c54dc17…`.

For the realistic URL, a local `qrencode` 4.1.1 Model 2/L symbol whose selected mask 2 was normalized to mask 0 over the standard data-module map, then received fresh L/mask-0 BCH format bits, produced the same product hash `2df4054f…`. The frozen oracle was not changed.

`pnpm --dir apps/webapp exec vitest --run --project=ui src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx -t 'keeps the QR on the server-returned URL'` passed: 1 selected / 7 skipped. Scoped ESLint passed with 2 existing warnings in `AppointmentPaymentSection.tsx`; `git diff --check` passed. `pnpm --dir apps/webapp typecheck` failed outside QR scope because workspace packages `@bersoncare/db-principal`, `@bersoncare/platform-merge`, and `@bersoncare/operator-db-schema` are unavailable, followed by unrelated existing type errors.
