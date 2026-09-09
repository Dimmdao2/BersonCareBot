# #915 Android emulator network recovery — final ops report

Candidate baseline: `72aa826f5e408874fe26e2e1037cdd1d9be91ac2` (`wt/mobile-emulator-network-recovery-20260909`).

Verdict: **BLOCKED — this is not M7-04 acceptance.** The DEV host and the guest network path are usable after a complete cold start, but the existing `bcb-api36` image still produces a visible `com.android.systemui` ANR. It prevents a stable, repeatable visible TEST-URL response in the application WebViews. No product code, AVD base file, database, shared port, cache, TEST/PROD service, credential, or initiative plan was changed.

## Host and AVD preconditions

The host resolution/HTTPS probe was:

```bash
for host in test.therapygo.ru test.therapysto.ru; do
  getent ahostsv4 "$host" | awk 'NR==1 {print $1; exit}'
  curl --noproxy '*' --connect-timeout 10 --max-time 20 -sS -o /dev/null \
    -w 'http=%{http_code} remote=%{remote_ip}\n' "https://$host"
done
```

Both names resolved to `151.241.228.122`; TherapyGo returned HTTPS `302`, Therapysto `200`, both from that IP. This is the documented DEV/TEST host, not PROD.

`id dev`, `getent group kvm`, and `ls -l /dev/kvm` confirmed that `dev` is in group `kvm` and `/dev/kvm` is `root:kvm 0660`. The installed toolchain was loaded only with:

```bash
source /home/dev/.local/share/bcb-android/env.sh
```

`emulator -list-avds` and `avdmanager list avd` reported the existing API 36 Google APIs x86_64 `bcb-api36` AVD.

## Repeatable cold-start command

This pass started only the following AVD, using no snapshot and no persistent configuration edits:

```bash
source /home/dev/.local/share/bcb-android/env.sh
sg kvm -c "$ANDROID_HOME/emulator/emulator @bcb-api36 -port 5558 \
  -no-snapshot -no-snapshot-save -no-boot-anim \
  -gpu swiftshader_indirect -dns-server 1.1.1.1,8.8.8.8 \
  -memory 2048 -cores 2 -no-audio -no-window"
```

The emulator log reported a full startup and `Boot completed in 76797 ms`. `adb -s emulator-5558 shell getprop sys.boot_completed` returned `1`; package manager listed `com.android.systemui`.

## Network diagnosis

Immediately after `sys.boot_completed`, the guest had no reported route/DNS properties and both of these probes failed:

```bash
adb -s emulator-5558 shell ip route
adb -s emulator-5558 shell getprop | rg '\[net\\.dns|\[net\\.rmnet|\[dhcp\\..*dns'
adb -s emulator-5558 shell ping -c 1 -W 5 test.therapygo.ru
adb -s emulator-5558 shell ping -c 1 -W 5 test.therapysto.ru
```

After allowing the fully booted guest to settle and applying only reversible runtime Wi-Fi enable requests:

```bash
adb -s emulator-5558 shell svc wifi enable
adb -s emulator-5558 shell cmd wifi set-wifi-enabled enabled
```

the guest exposed `eth0` at `10.0.2.15/24`, and both TEST-host ping probes passed. Wi-Fi itself still reported no associated SSID/IP (`isConnected=false`), so the usable path is the emulator Ethernet/NAT path, not a Wi-Fi association. The explicit DNS and SwiftShader flags are retained in the repeatable command above; no base AVD setting was edited.

This proves the earlier `ERR_INTERNET_DISCONNECTED` is not caused by current host DNS/HTTPS and is not an irrecoverable KVM/NAT absence. It occurs while the cold guest has not yet reached a stable usable state. A bare guest ping does **not** substitute for the required visible WebView result.

## Remaining blocker: System UI instability

The installed `ru.therapygo.app.test` package was launched normally. Its captured screen visibly showed:

- `https://test.therapygo.ru/app/patient`
- `net::ERR_INTERNET_DISCONNECTED`
- Android dialog: `System UI isn't responding`

The three pre-launch System UI samples did not produce a reliable focus window; restarting System UI with the transient command below did not yield a stable application surface (the following screen capture was blank except for the status bar):

```bash
adb -s emulator-5558 shell am force-stop com.android.systemui
```

Therefore neither TherapyGo nor Therapysto can currently supply the required stable, visible TEST URL response. No attempt was made to bypass the ordinary app path, inject an intent/bridge action, alter the AVD image, or claim M7-04 acceptance.

## Cleanup

The pass stopped only its own `emulator-5558` process with `adb -s emulator-5558 emu kill`; `ps -eo pid,args | rg '[q]emu-system-x86_64-headless'` then returned no emulator process. The temporary emulator log and screenshots were removed after extracting the non-secret observations above. `git diff --check` was clean before this report was staged.
