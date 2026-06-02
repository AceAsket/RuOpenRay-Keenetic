# RuOpenRay Keenetic

RuOpenRay Keenetic is a Keenetic/Entware-focused edition of RuOpenRay UI by AceAsket.

The repository is intentionally separate from `AceAsket/RuOpenRay`: Keenetic uses another runtime model, another filesystem layout, and another firewall layer. This project can move quickly without forcing the OpenWrt codebase to carry every Keenetic-specific branch.

## Author

Author and repository owner: AceAsket.

Repository: <https://github.com/AceAsket/RuOpenRay-Keenetic>

## Status

Early porting baseline. The current source tree was split from RuOpenRay UI and still contains OpenWrt-oriented code paths. The Keenetic work will replace those paths with Entware/XKeen-compatible ones step by step.

Do not run the OpenWrt installer from this repository on Keenetic yet.

## Target Layout

The Keenetic edition should use Entware paths:

```text
/opt/sbin/ruopenray-ui
/opt/etc/ruopenray-ui/
/opt/etc/init.d/S99ruopenray-ui
/opt/etc/xray/configs/
/opt/etc/xray/dat/
/opt/var/log/ruopenray-ui/
```

The first runtime target is a web UI that manages Xray configuration, profiles, subscriptions, geo files, logs, and restarts through Keenetic/Entware service scripts.

## XKeen Integration

The first practical version should cooperate with XKeen instead of replacing its firewall logic immediately.

XKeen already handles the Keenetic-specific dangerous parts:

- `/opt/etc/init.d/S99xkeen`
- `/opt/etc/ndm/netfilter.d/proxy.sh`
- `iptables` and `ip6tables`
- TProxy, Redirect, and Mixed modes
- Keenetic policy marks
- external lists in `/opt/etc/xkeen/`

RuOpenRay Keenetic should first become the web control plane, then gradually absorb or wrap XKeen-compatible actions where it is safe.

## Initial Roadmap

1. Add `scripts/install-keenetic.sh`.
2. Add `/opt/etc/init.d/S99ruopenray-ui` packaging.
3. Change defaults from `/etc/...` and `/usr/...` to `/opt/...`.
4. Restart Xray through `S99xkeen` or a dedicated Entware service, not OpenWrt `procd`.
5. Hide or disable OpenWrt-only DNS/firewall actions until Keenetic adapters exist.
6. Add Keenetic status checks for Entware, `opkg`, `iptables`, `ndm` hooks, and XKeen files.

## Local Development

```sh
npm install
node tools/dev-server/index.js
```

```sh
go test ./...
npm run test:frontend
```

## Repository Identity

Go module:

```text
github.com/AceAsket/RuOpenRay-Keenetic
```

Release repository:

```text
AceAsket/RuOpenRay-Keenetic
```
