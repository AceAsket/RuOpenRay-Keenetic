# XrayUI structure notes for RuOpenRay UI

This is a structure map, not a visual clone. XrayUI is ASUSWRT-Merlin oriented, so RuOpenRay should keep OpenWrt-specific installation, LuCI entry, package manager, firewall and resource constraints.

## Source structure observed

XrayUI documentation describes a single-page app with these main conceptual areas:

- Configuration: service status, profiles manager, core uptime, import manager, general options, backups.
- Inbounds: editable inbound list, transport settings, sniffing, DOKODEMO special handling, reorder.
- Outbounds: editable outbound/proxy list with transports and subscription-backed items.
- DNS: Xray DNS rules, fallback servers, custom entries, blocklists.
- Routing: rules, bypass/redirect policy, GeoIP/GeoSite metadata update and local geodata.
- Logs: access/error logs, conditional visibility when logging is enabled.
- Update/version: visible module version, update notification and changelog entry point.

General Options is a modal with tabs:

- General: debug logs, start on boot, startup delays, connection check, GitHub proxy, skip xray test, client status checks.
- DNS: DNS bypass/ipset mode, prevent DNS leaks, block QUIC.
- Geodata: GeoIP/GeoSite URLs and auto-update.
- Hooks: shell snippets before/after firewall lifecycle.
- Logs: log types, log level, max size, clear logs on restart, external log integration.
- Subscriptions: source URLs, fetch, auto-refresh, auto-fallback, probe URL, rotation filters.

## What RuOpenRay should take

### Navigation shape

RuOpenRay should use a task-first shell:

1. Панель
   - service status
   - active server
   - core status/update
   - last health/log summary

2. Серверы
   - user proxy servers only
   - active server selection
   - health checks
   - subscription pool and auto-fallback
   - system outbounds in a secondary collapsed block

3. Импорт
   - link / subscription / JSON / file restore
   - preview first
   - actions: add to current profile, add and select, save as profile
   - optional complete setup wizard

4. Маршрутизация
   - simple scenario toggles first
   - device rules
   - domain/IP/source rules
   - advanced DSL/JSON as expert mode
   - GeoIP/GeoSite status row with update and schedule

5. DNS
   - presets
   - leak protection checklist
   - dedicated DNS inbound status
   - block QUIC toggle

6. SNI and диагностика
   - Reality TLS/SNI scanner
   - B4SNI-style logs grouped by device/domain/live stream
   - add selected domains to routing rules

7. Логи
   - live tail
   - access/error/system filters
   - quick filters for startup, DNS, routing, proxy connect

8. Профили and бэкапы
   - profiles list
   - activate/duplicate/delete
   - backup/restore

9. Настройки
   - panel password
   - startup behavior
   - GitHub proxy
   - resource limits
   - geodata schedule
   - log retention

### Feature ideas worth adapting

- Simple/Advanced mode: hide JSON/DSL/inbounds until advanced mode is enabled.
- Import advanced options: complete setup, keep existing rules, unblock presets, safe IoT mode.
- Subscription model: source URLs, fetched pool, per-server subscription marker, auto-refresh schedule.
- Auto-fallback: health check interval, probe URL, rotation filters, failure threshold before switching.
- DNS leak protection: require compatible DNS inbound before enabling leak prevention.
- Block QUIC: explicit firewall-level toggle with warning text.
- Geodata manager: custom domain-list files with tags, `url:` entries, recompile all, tag autocomplete.
- SNI logs views: by device, by domain, live stream, bulk add to rules.
- Hooks: advanced OpenWrt firewall hooks, hidden behind expert mode.
- Update/version entry point: show RuOpenRay UI version and update notice, not only Xray core.

## What not to copy directly

- Server-side/inbound management as a primary path. RuOpenRay is client/router-first; inbounds should be advanced.
- ASUS-specific paths, Entware assumptions, Scribe integration, Merlin UI constraints.
- Visual layout, labels and CSS. Only the workflow structure is useful.
- Too many raw Xray terms in primary UI. Prefer "Серверы", "Правила", "Устройства", "DNS", "Диагностика"; keep "inbounds/outbounds" for expert mode.

## Proposed next UI refactor

1. Merge current `SNI`, health checks and logs into a stronger `Диагностика` area.
2. Move route quick scenarios into a modal/wizard in `Маршрутизация`.
3. Add `Настройки -> Общие` with startup, GitHub proxy, xray test policy and resource budget.
4. Add `Настройки -> Подписки` with saved URLs, refresh schedule, probe URL and rotation filters.
5. Add `Маршрутизация -> Geo` custom lists manager with local files and `url:` sources.
6. Add `DNS -> Leak guard` checklist: DNS inbound, dnsmasq redirect, block QUIC, IPv6 warning.

## References

- XrayUI Interface Overview: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/interface
- XrayUI General Options: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/general-options
- XrayUI Importing Configuration: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/import-config
- XrayUI Subscriptions: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/subscriptions
- XrayUI Routing Rules: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/routing
- XrayUI Geodata Manager: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/custom-geodata
- XrayUI DNS Leak guide: https://daniellavrushin.github.io/asuswrt-merlin-xrayui/en/dns-leak
