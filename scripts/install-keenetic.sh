#!/bin/sh
set -eu

# RuOpenRay Keenetic installer
# Author: AceAsket

APP_NAME="ruopenray-ui"
APP_SERVICE="S99ruopenray-ui"
XRAY_SERVICE="${RUOPENRAY_XRAY_SERVICE:-S99ruopenray-xray}"
INSTALL_DIR="${RUOPENRAY_INSTALL_DIR:-/opt/sbin}"
INIT_DIR="${RUOPENRAY_INIT_DIR:-/opt/etc/init.d}"
DATA_DIR="${RUOPENRAY_DATA_DIR:-/opt/etc/ruopenray-ui}"
BACKUP_DIR="${RUOPENRAY_BACKUP_DIR:-$DATA_DIR/backups}"
GEO_DIR="${RUOPENRAY_GEO_DIR:-/opt/etc/xray/dat}"
XRAY_CONFIG_DIR="${RUOPENRAY_XRAY_CONFIG_DIR:-/opt/etc/xray/configs}"
ACTIVE_CONFIG="${RUOPENRAY_ACTIVE_CONFIG:-$XRAY_CONFIG_DIR/99_ruopenray.json}"
LOG_DIR="${RUOPENRAY_LOG_DIR:-/opt/var/log/ruopenray-ui}"
RUN_DIR="${RUOPENRAY_RUN_DIR:-/opt/var/run}"
TMP_DIR="${RUOPENRAY_TMP_DIR:-/opt/tmp}"
HOST="${RUOPENRAY_HOST:-0.0.0.0}"
PORT="${RUOPENRAY_PORT:-9090}"
PASSWORD="${RUOPENRAY_PASSWORD:-}"
VERSION="${RUOPENRAY_VERSION:-}"
if [ -n "$VERSION" ] && [ -z "${RUOPENRAY_RELEASE_BASE_URL:-}" ]; then
	RELEASE_BASE_URL="https://github.com/AceAsket/RuOpenRay-Keenetic/releases/download/$VERSION"
else
	RELEASE_BASE_URL="${RUOPENRAY_RELEASE_BASE_URL:-https://github.com/AceAsket/RuOpenRay-Keenetic/releases/latest/download}"
fi
KEEP_BINARY_BACKUPS="${RUOPENRAY_KEEP_BINARY_BACKUPS:-2}"
ENV_FILE="$DATA_DIR/ruopenray-ui.env"

log() {
	printf '%s\n' "$*"
}

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

need_root() {
	[ "$(id -u)" = "0" ] || die "run as root"
}

detect_entware() {
	[ -d /opt ] || die "/opt not found; install Entware on Keenetic first"
	command -v opkg >/dev/null 2>&1 || die "opkg not found; install Entware first"
	mkdir -p "$INSTALL_DIR" "$INIT_DIR" "$DATA_DIR" "$BACKUP_DIR" "$GEO_DIR" "$XRAY_CONFIG_DIR" "$LOG_DIR" "$RUN_DIR" "$TMP_DIR"
}

detect_arch() {
	uname_arch="$(uname -m)"
	case "$uname_arch" in
		aarch64|arm64) ASSET_NAME="ruopenray-ui-linux-arm64" ;;
		*) die "unsupported architecture: $uname_arch; RuOpenRay Keenetic currently publishes only ruopenray-ui-linux-arm64" ;;
	esac
	log "Architecture: $uname_arch -> $ASSET_NAME"
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

current_password() {
	[ -r "$ENV_FILE" ] || return 0
	sed -n "s/^RUOPENRAY_PASSWORD='\\(.*\\)'/\\1/p" "$ENV_FILE" | tail -1
}

ensure_password() {
	if [ -z "$PASSWORD" ]; then
		existing="$(current_password)"
		if [ -n "$existing" ] && [ "$existing" != "admin" ]; then
			PASSWORD="$existing"
		else
			PASSWORD="$(generate_password)"
			PASSWORD_GENERATED=1
		fi
	fi
	[ -n "$PASSWORD" ] || die "could not generate password"
	case "$PASSWORD" in
		*"'"*) die "RUOPENRAY_PASSWORD must not contain a single quote" ;;
	esac
}

download() {
	url="$1"
	target="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 15 --max-time 180 -o "$target" "$url"
	elif command -v wget >/dev/null 2>&1; then
		wget -O "$target" "$url"
	else
		die "curl or wget is required"
	fi
}

prune_binary_backups() {
	index=0
	for backup in $(ls -1t "$INSTALL_DIR/$APP_NAME".backup-* 2>/dev/null || true); do
		index=$((index + 1))
		[ "$index" -le "$KEEP_BINARY_BACKUPS" ] && continue
		rm -f "$backup" || true
	done
}

install_binary() {
	if [ -n "${RUOPENRAY_BINARY_URL:-}" ]; then
		url="$RUOPENRAY_BINARY_URL"
	else
		url="$RELEASE_BASE_URL/$ASSET_NAME"
	fi
	tmp="$TMP_DIR/$APP_NAME.$$"
	log "Downloading RuOpenRay UI: $url"
	if ! download "$url" "$tmp"; then
		rm -f "$tmp"
		die "could not download RuOpenRay UI. If this repository has no release yet, set RUOPENRAY_BINARY_URL to a built binary."
	fi
	[ -s "$tmp" ] || die "downloaded binary is empty"
	chmod 0755 "$tmp"
	if [ -x "$INSTALL_DIR/$APP_NAME" ]; then
		cp "$INSTALL_DIR/$APP_NAME" "$INSTALL_DIR/$APP_NAME.backup-$(date +%Y%m%d-%H%M%S)" || true
	fi
	mv "$tmp" "$INSTALL_DIR/$APP_NAME"
	prune_binary_backups
}

write_env() {
	cat > "$ENV_FILE" <<EOF
RUOPENRAY_PLATFORM='keenetic'
RUOPENRAY_HOST='$HOST'
RUOPENRAY_PORT='$PORT'
RUOPENRAY_PASSWORD='$PASSWORD'
RUOPENRAY_DATA_DIR='$DATA_DIR'
RUOPENRAY_PROFILES_DIR='$DATA_DIR/profiles'
RUOPENRAY_BACKUP_DIR='$BACKUP_DIR'
RUOPENRAY_GEO_DIR='$GEO_DIR'
RUOPENRAY_ACTIVE_CONFIG='$ACTIVE_CONFIG'
RUOPENRAY_XRAY_SERVICE='$XRAY_SERVICE'
GOMEMLIMIT='48MiB'
GOGC='60'
EOF
	chmod 0600 "$ENV_FILE"
}

write_ui_init() {
	cat > "$INIT_DIR/$APP_SERVICE" <<'EOF'
#!/bin/sh

PATH="/opt/bin:/opt/sbin:/sbin:/bin:/usr/sbin:/usr/bin"
NAME="ruopenray-ui"
PROG="/opt/sbin/ruopenray-ui"
ENV_FILE="/opt/etc/ruopenray-ui/ruopenray-ui.env"
PID_FILE="/opt/var/run/ruopenray-ui.pid"
LOG_FILE="/opt/var/log/ruopenray-ui/ruopenray-ui.log"

if [ -r "$ENV_FILE" ]; then
	set -a
	. "$ENV_FILE"
	set +a
fi

is_running() {
	[ -r "$PID_FILE" ] || return 1
	pid="$(cat "$PID_FILE" 2>/dev/null || true)"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start() {
	if is_running; then
		echo "$NAME already running"
		return 0
	fi
	mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"
	[ -x "$PROG" ] || {
		echo "$PROG is not executable" >&2
		return 1
	}
	start-stop-daemon -S -b -m -p "$PID_FILE" -x "$PROG" -O "$LOG_FILE"
	echo "$NAME started"
}

stop() {
	if is_running; then
		start-stop-daemon -K -p "$PID_FILE" 2>/dev/null || kill "$(cat "$PID_FILE")" 2>/dev/null || true
		sleep 1
	fi
	rm -f "$PID_FILE"
	echo "$NAME stopped"
}

status() {
	if is_running; then
		echo "$NAME running pid $(cat "$PID_FILE")"
	else
		echo "$NAME stopped"
		return 1
	fi
}

case "$1" in
	start) start ;;
	stop) stop ;;
	restart) stop; start ;;
	status) status ;;
	*) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
EOF
	chmod 0755 "$INIT_DIR/$APP_SERVICE"
}

write_xray_init() {
	cat > "$INIT_DIR/$XRAY_SERVICE" <<'EOF'
#!/bin/sh

PATH="/opt/bin:/opt/sbin:/sbin:/bin:/usr/sbin:/usr/bin"
NAME="xray"
PROG="/opt/sbin/xray"
ENV_FILE="/opt/etc/ruopenray-ui/ruopenray-ui.env"
PID_FILE="/opt/var/run/ruopenray-xray.pid"
LOG_FILE="/opt/var/log/ruopenray-ui/xray.log"

if [ -r "$ENV_FILE" ]; then
	set -a
	. "$ENV_FILE"
	set +a
fi
XRAY_LOCATION_ASSET="${RUOPENRAY_GEO_DIR:-/opt/etc/xray/dat}"
V2RAY_LOCATION_ASSET="$XRAY_LOCATION_ASSET"
export XRAY_LOCATION_ASSET V2RAY_LOCATION_ASSET
CONFIG="${RUOPENRAY_ACTIVE_CONFIG:-/opt/etc/xray/configs/99_ruopenray.json}"

is_running() {
	[ -r "$PID_FILE" ] || return 1
	pid="$(cat "$PID_FILE" 2>/dev/null || true)"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start() {
	if is_running; then
		echo "$NAME already running"
		return 0
	fi
	mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")" "$(dirname "$CONFIG")" "$XRAY_LOCATION_ASSET"
	[ -x "$PROG" ] || {
		echo "$PROG is not executable; install Xray first" >&2
		return 1
	}
	[ -r "$CONFIG" ] || {
		echo "$CONFIG not found; open RuOpenRay UI once to create config" >&2
		return 1
	}
	start-stop-daemon -S -b -m -p "$PID_FILE" -x "$PROG" -O "$LOG_FILE" -- run -config "$CONFIG"
	echo "$NAME started"
}

stop() {
	if is_running; then
		start-stop-daemon -K -p "$PID_FILE" 2>/dev/null || kill "$(cat "$PID_FILE")" 2>/dev/null || true
		sleep 1
	fi
	rm -f "$PID_FILE"
	echo "$NAME stopped"
}

status() {
	if is_running; then
		echo "$NAME running pid $(cat "$PID_FILE")"
	else
		echo "$NAME stopped"
		return 1
	fi
}

case "$1" in
	start) start ;;
	stop) stop ;;
	restart) stop; start ;;
	status) status ;;
	*) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
EOF
	chmod 0755 "$INIT_DIR/$XRAY_SERVICE"
}

uninstall() {
	"$INIT_DIR/$APP_SERVICE" stop >/dev/null 2>&1 || true
	"$INIT_DIR/$XRAY_SERVICE" stop >/dev/null 2>&1 || true
	rm -f "$INIT_DIR/$APP_SERVICE" "$INIT_DIR/$XRAY_SERVICE" "$INSTALL_DIR/$APP_NAME"
	if [ "${RUOPENRAY_PURGE:-0}" = "1" ]; then
		rm -rf "$DATA_DIR" "$LOG_DIR"
	fi
	log "RuOpenRay Keenetic removed. Xray binary and configs are left intact unless RUOPENRAY_PURGE=1 was used."
}

main() {
	case "${1:-install}" in
		uninstall|remove)
			need_root
			uninstall
			exit 0
			;;
	esac
	need_root
	detect_entware
	detect_arch
	ensure_password
	install_binary
	write_env
	write_ui_init
	write_xray_init
	"$INIT_DIR/$APP_SERVICE" restart >/dev/null 2>&1 || "$INIT_DIR/$APP_SERVICE" start >/dev/null 2>&1 || true
	log "RuOpenRay Keenetic installed."
	log "Panel: http://192.168.1.1:$PORT/"
	if [ "${PASSWORD_GENERATED:-0}" = "1" ]; then
		log "Generated password: $PASSWORD"
	fi
	log "Xray service script: $INIT_DIR/$XRAY_SERVICE"
}

main "$@"
