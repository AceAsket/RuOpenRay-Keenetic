# RuOpenRay Keenetic

RuOpenRay Keenetic is a Keenetic/Entware-focused edition of RuOpenRay UI by AceAsket.

The repository is intentionally separate from `AceAsket/RuOpenRay`: Keenetic uses another runtime model, another filesystem layout, and another firewall layer. This project can move quickly without forcing the OpenWrt codebase to carry every Keenetic-specific branch.

## Author

Author and repository owner: AceAsket.

Repository: <https://github.com/AceAsket/RuOpenRay-Keenetic>

## Status

Early porting baseline. The current source tree was split from RuOpenRay UI and still contains OpenWrt-oriented code paths. The first Keenetic-native layer is now present: Entware installer, `/opt` defaults, and init scripts for the web UI and Xray.

Do not use OpenWrt-only DNS/firewall actions on Keenetic yet. They will be replaced with a KeeneticOS adapter.

Current test stand:

```text
Keenetic WBR3000UAX (KN-4110)
KeeneticOS 5.0.11
CPU architecture: aarch64
OPKG component: installed
OPKG disk: storage:/
```

Current release asset target: `ruopenray-ui-linux-arm64` only.

The built-in Keenetic SSH service exposes the Keenetic CLI, not an Entware shell. Router-side installation requires Entware to be deployed first so that `/opt`, `opkg`, and `/opt/etc/init.d/` are available from a shell session.

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

## Install On Keenetic

Run in the Keenetic Entware shell:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Or with `wget`:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Set a password explicitly:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

The panel starts at:

```text
http://192.168.1.1:9090/
```

The installer writes:

```text
/opt/etc/ruopenray-ui/ruopenray-ui.env
/opt/etc/init.d/S99ruopenray-ui
/opt/etc/init.d/S99ruopenray-xray
```

The installer downloads the web UI from the latest GitHub release. Until the first release is published, pass a built binary URL explicitly:

```sh
RUOPENRAY_BINARY_URL='https://example.com/ruopenray-ui-linux-arm64' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

It does not install Xray yet. If `/opt/sbin/xray` is missing, install or upload it before starting `S99ruopenray-xray`.

## XKeen Reference

XKeen is a useful reference for Keenetic-specific runtime details, but RuOpenRay Keenetic should not depend on XKeen for the core web UI. The immediate goal is native web management plus KeeneticOS/Entware integration.

The parts worth studying before implementing the Keenetic adapter:

- `/opt/etc/init.d/S99xkeen`
- `/opt/etc/ndm/netfilter.d/proxy.sh`
- `iptables` and `ip6tables`
- TProxy, Redirect, and Mixed modes
- Keenetic policy marks
- external lists in `/opt/etc/xkeen/`

RuOpenRay Keenetic should first become the web control plane, then add its own safe Keenetic adapters for firewall, DNS, policies, and service control.

## Initial Roadmap

1. Add KeeneticOS firewall/DNS adapter.
2. Add web controls for Keenetic policies and `/opt/etc/ndm/netfilter.d/` hooks.
3. Add guided Xray binary installation for `/opt/sbin/xray`.
4. Add router-side smoke tests against a real Keenetic stand.
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
