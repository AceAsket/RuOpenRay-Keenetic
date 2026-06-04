#!/bin/sh
set -eu

APP_NAME="ruopenray-ui"
SERVICE_NAME="ruopenray-ui"
INSTALL_DIR="/usr/bin"
DATA_DIR="${RUOPENRAY_DATA_DIR:-/etc/ruopenray-ui}"
BACKUP_DIR="${RUOPENRAY_BACKUP_DIR:-$DATA_DIR/backups}"
GEO_DIR="${RUOPENRAY_GEO_DIR:-/usr/share/xray}"
PORT="${RUOPENRAY_PORT:-9090}"
HOST="${RUOPENRAY_HOST:-0.0.0.0}"
PASSWORD="${RUOPENRAY_PASSWORD:-}"
PASSWORD_GENERATED=0
PASSWORD_REUSED=0
ACTIVE_CONFIG="${RUOPENRAY_ACTIVE_CONFIG:-/etc/xray/config.json}"
XRAY_SERVICE="${RUOPENRAY_XRAY_SERVICE:-xray}"
RELEASE_BASE_URL="${RUOPENRAY_RELEASE_BASE_URL:-https://github.com/AceAsket/RuOpenRay-Keenetic/releases/latest/download}"
SCENARIOS_URL="${RUOPENRAY_SCENARIOS_URL:-https://raw.githubusercontent.com/AceAsket/RuOpenRay-scenarios/main/scenarios.json}"
SCENARIOS_NAME="${RUOPENRAY_SCENARIOS_NAME:-RuOpenRay scenarios}"
INSTALL_SCENARIOS="${RUOPENRAY_INSTALL_SCENARIOS:-1}"
SCENARIOS_AUTO_UPDATE="${RUOPENRAY_SCENARIOS_AUTO_UPDATE:-0}"
INSTALL_XRAY="${RUOPENRAY_INSTALL_XRAY:-0}"
MIN_FREE_KB="${RUOPENRAY_MIN_FREE_KB:-12288}"
START_DELAY="${RUOPENRAY_START_DELAY:-0}"
APPLY_DELAY="${RUOPENRAY_APPLY_DELAY:-0}"
DOWNLOAD_MIRROR="${RUOPENRAY_DOWNLOAD_MIRROR:-direct}"
MIRROR_PREFIX="${RUOPENRAY_MIRROR_PREFIX:-}"
KEEP_BINARY_BACKUPS="${RUOPENRAY_KEEP_BINARY_BACKUPS:-2}"

log() {
	printf '%s\n' "$*"
}

die() {
	printf 'Ошибка: %s\n' "$*" >&2
	exit 1
}

generate_password() {
	if [ -r /dev/urandom ] && command -v hexdump >/dev/null 2>&1; then
		dd if=/dev/urandom bs=12 count=1 2>/dev/null | hexdump -v -e '/1 "%02x"' | cut -c1-16
	elif [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
		dd if=/dev/urandom bs=12 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n' | cut -c1-16
	else
		printf 'ruopenray%s' "$(date +%s)"
	fi
}

current_panel_password() {
	command -v uci >/dev/null 2>&1 || return 0
	uci -q get ruopenray-ui.main.password 2>/dev/null || true
}

ensure_password() {
	if [ -z "$PASSWORD" ]; then
		existing_password="$(current_panel_password)"
		if [ -n "$existing_password" ] && [ "$existing_password" != "admin" ]; then
			PASSWORD="$existing_password"
			PASSWORD_REUSED=1
		else
			PASSWORD="$(generate_password)"
			PASSWORD_GENERATED=1
		fi
	fi
	[ -n "$PASSWORD" ] || die "не удалось сгенерировать пароль"
	case "$PASSWORD" in
		*"'"*) die "RUOPENRAY_PASSWORD не должен содержать одинарную кавычку" ;;
	esac
}

uninstall_openwrt() {
	need_root
	if [ -x "/etc/init.d/$SERVICE_NAME" ]; then
		/etc/init.d/$SERVICE_NAME disable >/dev/null 2>&1 || true
		/etc/init.d/$SERVICE_NAME stop >/dev/null 2>&1 || true
	fi
	rm -f "/etc/init.d/$SERVICE_NAME"
	rm -f /usr/share/luci/menu.d/luci-app-ruopenray.json
	rm -f /usr/share/rpcd/acl.d/luci-app-ruopenray.json
	rm -rf /usr/share/ucode/luci/template/ruopenray
	rm -rf /www/luci-static/resources/view/ruopenray
	rm -f "$INSTALL_DIR/$APP_NAME"
	if command -v uci >/dev/null 2>&1; then
		uci -q delete ruopenray-ui.main || true
		uci -q commit ruopenray-ui || true
	fi
	if [ -f /etc/crontabs/root ]; then
		grep -v 'RuOpenRay geo update' /etc/crontabs/root > /tmp/ruopenray-cron.$$ || true
		grep -v 'RuOpenRay route preset sources update' /tmp/ruopenray-cron.$$ > /tmp/ruopenray-cron2.$$ || true
		mv /tmp/ruopenray-cron2.$$ /tmp/ruopenray-cron.$$
		cat /tmp/ruopenray-cron.$$ > /etc/crontabs/root
		rm -f /tmp/ruopenray-cron.$$
		[ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
	fi
	if [ "${RUOPENRAY_PURGE:-0}" = "1" ]; then
		rm -rf "$DATA_DIR"
	fi
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
	log "RuOpenRay UI удален. Xray и geo-файлы не тронуты. Для удаления данных запустите с RUOPENRAY_PURGE=1."
}

need_root() {
	[ "$(id -u)" = "0" ] || die "запустите скрипт от root"
}

detect_openwrt() {
	[ -r /etc/openwrt_release ] || die "это не похоже на OpenWrt: /etc/openwrt_release не найден"
	. /etc/openwrt_release
	OPENWRT_VERSION="${DISTRIB_RELEASE:-unknown}"
	case "$OPENWRT_VERSION" in
		24.*|25.*|SNAPSHOT|unknown) ;;
		*) log "Предупреждение: OpenWrt $OPENWRT_VERSION не проверялся, продолжаю аккуратно." ;;
	esac
}

detect_manager() {
	if command -v apk >/dev/null 2>&1; then
		PKG_MANAGER="apk"
	elif command -v opkg >/dev/null 2>&1; then
		PKG_MANAGER="opkg"
	else
		die "не найден apk или opkg"
	fi
}

detect_arch() {
	UNAME_ARCH="$(uname -m)"
	case "$UNAME_ARCH" in
		x86_64) ASSET_ARCH="amd64"; ASSET_NAME="ruopenray-ui-linux-amd64" ;;
		aarch64|arm64) ASSET_ARCH="arm64"; ASSET_NAME="ruopenray-ui-linux-arm64" ;;
		armv7*|armv7l) ASSET_ARCH="armv7"; ASSET_NAME="ruopenray-ui-linux-armv7" ;;
		mipsel|mipsle) ASSET_ARCH="mipsle"; ASSET_NAME="ruopenray-ui-linux-mipsle-softfloat" ;;
		mips) ASSET_ARCH="mips"; ASSET_NAME="ruopenray-ui-linux-mips-softfloat" ;;
		*) die "неподдерживаемая архитектура $UNAME_ARCH" ;;
	esac
	log "Архитектура: $UNAME_ARCH -> $ASSET_ARCH"
}

pkg_update() {
	case "$PKG_MANAGER" in
		apk) apk update ;;
		opkg) opkg update ;;
	esac
}

pkg_install() {
	case "$PKG_MANAGER" in
		apk) apk add "$@" ;;
		opkg) opkg install "$@" ;;
	esac
}

pkg_install_oneof() {
	for pkg in "$@"; do
		if pkg_install "$pkg"; then
			return 0
		fi
	done
	return 1
}

check_space() {
	free_kb="$(df -Pk /usr 2>/dev/null | awk 'NR==2 {print $4}')"
	[ -n "$free_kb" ] || free_kb="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
	if [ -n "$free_kb" ] && [ "$free_kb" -lt "$MIN_FREE_KB" ]; then
		die "свободно меньше $MIN_FREE_KB KB. Освободите место или переопределите RUOPENRAY_MIN_FREE_KB"
	fi
}

install_dependencies() {
	pkg_update || log "Предупреждение: не удалось обновить индекс пакетов"
	pkg_install_oneof ca-bundle ca-certificates || log "Предупреждение: CA certificates не установлены через пакетный менеджер"
	if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
		pkg_install_oneof curl wget-ssl wget || die "нужен curl или wget для скачивания RuOpenRay UI"
	fi
	pkg_install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket || die "не удалось установить TPROXY-модули: kmod-nf-tproxy, kmod-nft-tproxy, kmod-nft-socket"
	if [ "$INSTALL_XRAY" = "1" ] && ! command -v xray >/dev/null 2>&1; then
		log "Xray не найден, устанавливаю xray-core..."
		pkg_install_oneof xray-core xray || die "не удалось установить Xray"
	fi
}

download_binary() {
	mkdir -p "$INSTALL_DIR"
	tmp="/tmp/${APP_NAME}.$$"
	if [ -n "${RUOPENRAY_BINARY_URL:-}" ]; then
		url="$RUOPENRAY_BINARY_URL"
	else
		url="${RELEASE_BASE_URL}/${ASSET_NAME}"
	fi
	log "Скачиваю RuOpenRay UI: $url"
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 15 --max-time 180 -o "$tmp" "$url"
	elif command -v wget >/dev/null 2>&1; then
		wget -O "$tmp" "$url"
	else
		die "нужен curl или wget для скачивания бинарника"
	fi
	[ -s "$tmp" ] || die "скачанный файл пустой"
	chmod 0755 "$tmp"
	mv "$tmp" "$INSTALL_DIR/$APP_NAME"
	prune_binary_backups
}

prune_binary_backups() {
	index=0
	for backup in $(ls -1t "$INSTALL_DIR/$APP_NAME".backup-* 2>/dev/null || true); do
		index=$((index + 1))
		[ "$index" -le "$KEEP_BINARY_BACKUPS" ] && continue
		rm -f "$backup" || true
	done
}

write_uci_file() {
	mkdir -p /etc/config
	cat > /etc/config/ruopenray-ui <<EOF
config ruopenray-ui 'main'
	option enabled '1'
	option host '$HOST'
	option port '$PORT'
	option password '$PASSWORD'
	option data_dir '$DATA_DIR'
	option backup_dir '$BACKUP_DIR'
	option geo_dir '$GEO_DIR'
	option active_config '$ACTIVE_CONFIG'
	option xray_service '$XRAY_SERVICE'
	option start_delay '$START_DELAY'
	option apply_delay '$APPLY_DELAY'
	option go_memlimit '48MiB'
	option go_gc '60'
	option download_mirror '$DOWNLOAD_MIRROR'
	option mirror_prefix '$MIRROR_PREFIX'
EOF
}

write_uci_via_cli() {
	mkdir -p /etc/config
	touch /etc/config/ruopenray-ui
	uci -q delete ruopenray-ui.main 2>/dev/null || true
	uci -q set ruopenray-ui.main=ruopenray-ui
	uci -q set ruopenray-ui.main.enabled=1
	uci -q set "ruopenray-ui.main.host=$HOST"
	uci -q set "ruopenray-ui.main.port=$PORT"
	uci -q set "ruopenray-ui.main.password=$PASSWORD"
	uci -q set "ruopenray-ui.main.data_dir=$DATA_DIR"
	uci -q set "ruopenray-ui.main.backup_dir=$BACKUP_DIR"
	uci -q set "ruopenray-ui.main.geo_dir=$GEO_DIR"
	uci -q set "ruopenray-ui.main.active_config=$ACTIVE_CONFIG"
	uci -q set "ruopenray-ui.main.xray_service=$XRAY_SERVICE"
	uci -q set "ruopenray-ui.main.start_delay=$START_DELAY"
	uci -q set "ruopenray-ui.main.apply_delay=$APPLY_DELAY"
	uci -q set ruopenray-ui.main.go_memlimit=48MiB
	uci -q set ruopenray-ui.main.go_gc=60
	uci -q set "ruopenray-ui.main.download_mirror=$DOWNLOAD_MIRROR"
	uci -q set "ruopenray-ui.main.mirror_prefix=$MIRROR_PREFIX"
	uci -q commit ruopenray-ui
}

write_uci() {
	mkdir -p "$DATA_DIR/profiles" "$BACKUP_DIR" "$GEO_DIR" "$(dirname "$ACTIVE_CONFIG")"
	if command -v uci >/dev/null 2>&1; then
		if ! write_uci_via_cli; then
			log "Предупреждение: UCI не принял настройки через CLI, записываю /etc/config/ruopenray-ui напрямую."
			write_uci_file
		fi
	else
		write_uci_file
	fi
	saved_password="$(current_panel_password)"
	if [ "$saved_password" != "$PASSWORD" ]; then
		log "Предупреждение: пароль не читается через UCI после записи, пересоздаю /etc/config/ruopenray-ui."
		write_uci_file
		saved_password="$(current_panel_password)"
	fi
	if [ "$saved_password" != "$PASSWORD" ]; then
		die "пароль панели не записался в UCI. Ожидался новый пароль, в конфиге осталось: ${saved_password:-пусто}"
	fi
}

write_init() {
	cat > /etc/init.d/$SERVICE_NAME <<'EOF'
#!/bin/sh /etc/rc.common

START=92
STOP=15
USE_PROCD=1

PROG=/usr/bin/ruopenray-ui

load_config() {
	config_load ruopenray-ui
	config_get_bool enabled main enabled 1
	config_get host main host '0.0.0.0'
	config_get port main port '9090'
	config_get password main password 'admin'
	config_get data_dir main data_dir '/etc/ruopenray-ui'
	config_get backup_dir main backup_dir "$data_dir/backups"
	config_get geo_dir main geo_dir '/usr/share/xray'
	config_get active_config main active_config '/etc/xray/config.json'
	config_get xray_service main xray_service 'xray'
	config_get start_delay main start_delay '0'
	config_get go_memlimit main go_memlimit '48MiB'
	config_get go_gc main go_gc '60'
}

start_service() {
	load_config
	[ "$enabled" = "1" ] || return 0
	[ -x "$PROG" ] || return 1
	[ "${start_delay:-0}" -gt 0 ] 2>/dev/null && sleep "$start_delay"

	procd_open_instance
	procd_set_param command "$PROG"
	procd_set_param env \
		"RUOPENRAY_HOST=$host" \
		"RUOPENRAY_PORT=$port" \
		"RUOPENRAY_PASSWORD=$password" \
		"RUOPENRAY_DATA_DIR=$data_dir" \
		"RUOPENRAY_PROFILES_DIR=$data_dir/profiles" \
		"RUOPENRAY_BACKUP_DIR=$backup_dir" \
		"RUOPENRAY_GEO_DIR=$geo_dir" \
		"RUOPENRAY_ACTIVE_CONFIG=$active_config" \
		"RUOPENRAY_XRAY_SERVICE=$xray_service" \
		"GOMEMLIMIT=$go_memlimit" \
		"GOGC=$go_gc"
	procd_set_param respawn 3600 5 5
	procd_set_param limits nofile="4096 4096"
	procd_close_instance
}
EOF
	chmod 0755 /etc/init.d/$SERVICE_NAME
}

write_luci_launcher() {
	[ -d /usr/share/luci/menu.d ] || return 0
	mkdir -p /usr/share/luci/menu.d /usr/share/rpcd/acl.d /usr/share/ucode/luci/template/ruopenray
	cat > /usr/share/luci/menu.d/luci-app-ruopenray.json <<'EOF'
{
	"admin/services/ruopenray": {
		"title": "RuOpenRay UI",
		"order": 72,
		"action": {
			"type": "view",
			"path": "ruopenray/dashboard"
		},
		"depends": {
			"acl": [ "luci-app-ruopenray" ],
			"fs": { "/usr/bin/ruopenray-ui": "executable" }
		}
	}
}
EOF
	cat > /usr/share/rpcd/acl.d/luci-app-ruopenray.json <<'EOF'
{
	"luci-app-ruopenray": {
		"description": "Grant access to the RuOpenRay UI LuCI launcher",
		"read": {
			"ubus": {
				"session": [ "access" ],
				"uci": [ "get" ],
				"service": [ "list" ]
			},
			"uci": [ "ruopenray-ui" ]
		},
		"write": {
			"ubus": {
				"uci": [ "set", "commit", "apply", "confirm" ],
				"service": [ "setInitAction" ]
			},
			"uci": [ "ruopenray-ui" ]
		}
	}
}
EOF
	cat > /usr/share/ucode/luci/template/ruopenray/dashboard.ut <<'EOF'
{% include('header') %}

<h2 name="content">{{ _('RuOpenRay UI') }}</h2>

<style>
	.ruopenray-launch {
		display: inline-flex !important;
		align-items: center;
		gap: 8px;
		width: auto !important;
		min-width: 0 !important;
		max-width: max-content !important;
		margin-top: 10px !important;
		padding: 7px 12px !important;
		border: 1px solid #35bff0;
		border-radius: 4px;
		background: transparent !important;
		color: #35bff0 !important;
		font-size: 14px !important;
		line-height: 1.2 !important;
		text-decoration: none !important;
	}
	.ruopenray-launch:hover {
		background: rgba(53, 191, 240, 0.12) !important;
	}
</style>

<div class="cbi-map">
	<div class="cbi-map-descr">
		Отдельная панель управления Xray: серверы, маршруты, DNS, логи и обновление ядра.
	</div>
	<div class="cbi-section">
		<p>RuOpenRay работает на роутере как отдельный веб-сервис.</p>
		<p><strong>Панель:</strong> <a id="ruopenray-link" href="http://192.168.1.1:9090/" target="_blank" rel="noopener">http://192.168.1.1:9090/</a></p>
		<a id="ruopenray-open" class="ruopenray-launch" href="http://192.168.1.1:9090/" target="_blank" rel="noopener">Открыть RuOpenRay UI</a>
	</div>
</div>

<script>
	(function() {
		var url = window.location.protocol + '//' + window.location.hostname + ':9090/';
		var link = document.getElementById('ruopenray-link');
		var button = document.getElementById('ruopenray-open');
		if (link) {
			link.href = url;
			link.textContent = url;
		}
	if (button)
		button.href = url;
	})();
</script>

{% include('footer') %}
EOF
	mkdir -p /www/luci-static/resources/view/ruopenray
	cat > /www/luci-static/resources/view/ruopenray/dashboard.js <<'EOF'
'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

const callServiceAction = rpc.declare({
	object: 'service',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

function field(label, node, hint) {
	return E('div', { class: 'cbi-value' }, [
		E('label', { class: 'cbi-value-title' }, label),
		E('div', { class: 'cbi-value-field' }, hint ? [ node, E('div', { class: 'cbi-value-description' }, hint) ] : node)
	]);
}

function normalizeHost(host) {
	host = String(host || '').trim();
	return host || '0.0.0.0';
}

function normalizePort(port) {
	port = Number(port);
	return Number.isInteger(port) && port >= 1 && port <= 65535 ? String(port) : '';
}

function urlHost(host) {
	host = normalizeHost(host);
	if (host === '0.0.0.0' || host === '::') return window.location.hostname;
	return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function panelUrl(host, port) {
	return `${window.location.protocol}//${urlHost(host)}:${normalizePort(port) || '9090'}/`;
}

return view.extend({
	load() {
		return uci.load('ruopenray-ui');
	},

	render() {
		const host = normalizeHost(uci.get('ruopenray-ui', 'main', 'host'));
		const port = normalizePort(uci.get('ruopenray-ui', 'main', 'port')) || '9090';
		const url = panelUrl(host, port);

		const hostInput = E('input', {
			id: 'ruopenray-host',
			class: 'cbi-input-text',
			value: host,
			placeholder: '0.0.0.0'
		});
		const portInput = E('input', {
			id: 'ruopenray-port',
			class: 'cbi-input-text',
			value: port,
			inputmode: 'numeric',
			placeholder: '9090'
		});
		const link = E('a', {
			id: 'ruopenray-link',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, url);
		const openButton = E('a', {
			id: 'ruopenray-open',
			class: 'cbi-button cbi-button-apply',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, _('Открыть RuOpenRay UI'));

		const updatePreview = () => {
			const nextUrl = panelUrl(hostInput.value, portInput.value);
			link.href = nextUrl;
			link.textContent = nextUrl;
			openButton.href = nextUrl;
		};

		hostInput.addEventListener('input', updatePreview);
		portInput.addEventListener('input', updatePreview);

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('RuOpenRay UI')),
			E('div', { class: 'cbi-map-descr' }, _('Отдельная панель управления Xray: серверы, маршруты, DNS, логи и обновление ядра.')),
			E('div', { class: 'cbi-section' }, [
				E('p', {}, _('RuOpenRay работает на роутере как отдельный веб-сервис.')),
				E('p', {}, [ E('strong', {}, _('Панель: ')), link ]),
				E('p', {}, openButton)
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Доступ к сервису')),
				field(_('Bind address'), hostInput, _('Рекомендуется указать LAN-адрес роутера, например 192.168.1.1 или 192.168.50.1. 0.0.0.0 слушает все интерфейсы, 127.0.0.1 доступен только локально на роутере.')),
				field(_('Порт'), portInput, _('После сохранения сервис будет перезапущен. Если меняете порт, откройте панель по новой ссылке.')),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', {
						class: 'cbi-button cbi-button-save',
						click: ui.createHandlerFn(this, 'saveSettings', hostInput, portInput)
					}, _('Сохранить и перезапустить'))
				])
			])
		]);
	},

	saveSettings(hostInput, portInput) {
		const host = normalizeHost(hostInput.value);
		const port = normalizePort(portInput.value);
		if (!port) {
			ui.addNotification(null, E('p', {}, _('Порт должен быть числом от 1 до 65535.')), 'danger');
			return Promise.resolve();
		}

		uci.set('ruopenray-ui', 'main', 'host', host);
		uci.set('ruopenray-ui', 'main', 'port', port);

		return uci.save()
			.then(() => uci.apply())
			.then(() => callServiceAction('ruopenray-ui', 'restart'))
			.then(() => {
				ui.addNotification(null, E('p', {}, _('Настройки сохранены, RuOpenRay UI перезапускается.')), 'info');
				window.setTimeout(() => {
					const url = panelUrl(host, port);
					const link = document.getElementById('ruopenray-link');
					const button = document.getElementById('ruopenray-open');
					if (link) {
						link.href = url;
						link.textContent = url;
					}
					if (button) button.href = url;
				}, 1200);
			})
			.catch((error) => {
				ui.addNotification(null, E('p', {}, error.message || String(error)), 'danger');
			});
	}
});
EOF
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
}

write_first_config() {
	[ -s "$ACTIVE_CONFIG" ] && return 0
	mkdir -p "$(dirname "$ACTIVE_CONFIG")"
	cat > "$ACTIVE_CONFIG" <<'EOF'
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "tag": "socks-in",
      "listen": "127.0.0.1",
      "port": 10808,
      "protocol": "socks",
      "settings": {
        "udp": true
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "domainStrategy": "AsIs",
    "rules": []
  }
}
EOF
	chmod 0600 "$ACTIVE_CONFIG"
}

install_route_scenarios() {
	[ "$INSTALL_SCENARIOS" = "1" ] || return 0
	[ -n "$SCENARIOS_URL" ] || return 0
	[ -x "$INSTALL_DIR/$APP_NAME" ] || return 0
	auto_arg="--no-auto-update"
	if [ "$SCENARIOS_AUTO_UPDATE" = "1" ]; then
		auto_arg="--auto-update"
	fi
	log "РџРѕРґРєР»СЋС‡Р°СЋ СЃС†РµРЅР°СЂРёРё RuOpenRay: $SCENARIOS_URL"
	if ! RUOPENRAY_DATA_DIR="$DATA_DIR" RUOPENRAY_GEO_DIR="$GEO_DIR" RUOPENRAY_BACKUP_DIR="$BACKUP_DIR" RUOPENRAY_XRAY_SERVICE="$XRAY_SERVICE" "$INSTALL_DIR/$APP_NAME" route-presets add-source "$SCENARIOS_URL" --name "$SCENARIOS_NAME" "$auto_arg" >/tmp/ruopenray-scenarios-install.log 2>&1; then
		log "РџСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ: РЅРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃС†РµРЅР°СЂРёРё. РС… РјРѕР¶РЅРѕ РїРѕРґРєР»СЋС‡РёС‚СЊ РїРѕР·Р¶Рµ РІ РІРµР±-РїР°РЅРµР»Рё. Р›РѕРі: /tmp/ruopenray-scenarios-install.log"
	fi
}

enable_xray_service_config() {
	command -v xray >/dev/null 2>&1 || return 0
	[ -x "/etc/init.d/$XRAY_SERVICE" ] || return 0
	if command -v uci >/dev/null 2>&1 && uci -q get xray.enabled >/dev/null 2>&1; then
		uci -q set xray.config=xray || true
		uci -q set xray.enabled.enabled='1' || true
		uci -q set xray.config.conffiles="$ACTIVE_CONFIG" || true
		uci -q delete xray.config.confdir || true
		uci -q set xray.config.datadir="$GEO_DIR" || true
		uci -q set xray.config.format='json' || true
		uci -q commit xray || true
	fi
	"/etc/init.d/$XRAY_SERVICE" enable >/dev/null 2>&1 || true
}

start_service() {
	/etc/init.d/$SERVICE_NAME enable >/dev/null 2>&1 || true
	/etc/init.d/$SERVICE_NAME restart >/dev/null 2>&1 || /etc/init.d/$SERVICE_NAME start >/dev/null 2>&1 || true
	validate_service_password
}

service_env_value() {
	key="$1"
	pids="$(pidof "$APP_NAME" 2>/dev/null || true)"
	set -- $pids
	[ "$#" -gt 0 ] || return 1
	[ -r "/proc/$1/environ" ] || return 1
	tr '\0' '\n' < "/proc/$1/environ" | sed -n "s/^${key}=//p" | tail -n1
}

validate_service_password() {
	i=0
	while [ "$i" -lt 10 ]; do
		running_password="$(service_env_value RUOPENRAY_PASSWORD || true)"
		if [ "$running_password" = "$PASSWORD" ]; then
			return 0
		fi
		sleep 1
		i=$((i + 1))
	done
	saved_password="$(current_panel_password)"
	die "сервис запустился не с тем паролем. UCI: ${saved_password:-пусто}, process env: ${running_password:-пусто}"
}

print_summary() {
	ip_addr="$(uci -q get network.lan.ipaddr 2>/dev/null | sed 's,/.*,,')"
	[ -n "$ip_addr" ] || ip_addr="$(ip -4 addr show br-lan 2>/dev/null | sed -n 's/.*inet \([0-9.]*\).*/\1/p' | head -n1)"
	[ -n "$ip_addr" ] || ip_addr="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)"
	[ -n "$ip_addr" ] || ip_addr="192.168.1.1"
	log ""
	log "Готово."
	log "Панель: http://${ip_addr}:${PORT}/"
	log "Пароль: ${PASSWORD}"
	if [ "$PASSWORD_GENERATED" = "1" ]; then
		log "Пароль сгенерирован автоматически. Сохраните его; позже можно сменить в веб-панели: Настройки -> Пароль."
	elif [ "$PASSWORD_REUSED" = "1" ]; then
		log "Использован уже заданный пароль из /etc/config/ruopenray-ui."
	fi
	if ! command -v xray >/dev/null 2>&1; then
		log "Xray пока не найден. Его можно установить из веб-панели или повторить установку с RUOPENRAY_INSTALL_XRAY=1."
	fi
}

if [ "${1:-}" = "uninstall" ] || [ "${RUOPENRAY_UNINSTALL:-0}" = "1" ]; then
	uninstall_openwrt
	exit 0
fi

need_root
detect_openwrt
detect_manager
detect_arch
ensure_password
check_space
install_dependencies
download_binary
write_uci
write_init
write_luci_launcher
write_first_config
install_route_scenarios
enable_xray_service_config
start_service
print_summary
