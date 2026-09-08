# Тест или взгляд — #1100 VM-09 owner VPN reconciler

## Канон и authority

Прочитай `AGENTS.md`: маршрут, §1/§1b, §7, §10/§10a/§10b и §24. Authority —
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, VM-09.

Источник оракула — `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Каноническая подсеть owner VPN `awg1` —
`172.31.9.0/24`».

## Проверка exact candidate

Это разовая механическая конфигурационная правка, поэтому проверяй взглядом/командами, постоянный тест на строки не
пиши. На committed candidate `af4e18e46` независимо проверь:

1. `deploy/host/apply-test-vpn-dns.sh` во всех фактических render/guard/DNAT местах использует awg1 gateway
   `172.31.9.1`, не `10.9.1.1`.
2. Все пять VM-09 источников согласованы между собой; легитимный `awg0`/`10.9.0.0/24` не изменён.
3. Exact code-search + `rg` не находят активного executable/reconciler источника, способного вернуть старую awg1
   сеть. Исторические audit logs не считать активным источником.
4. `bash -n` обоих apply scripts, их безопасный dry-run (без `--apply`) и `git diff --check` проходят. Никаких live
   `/etc`/systemd/nginx изменений не выполнять.

Если всё соответствует — создай один короткий artifact `docs/audit/video-vpn-reconciler-2026-09-08.md` с точными
командами и verdict PASS. Если найден реальный разрыв — verdict MUST FIX с достижимым сценарием. Production/config
не менять; временных fault-injection правок здесь не требуется. Закоммить только artifact явным staging, `git add -A`
запрещён. Назови SHA и не заканчивай ход ожиданием процесса. PROD/TEST runtime и taskdb вне scope.
