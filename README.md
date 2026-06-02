# RuOpenRay Keenetic

RuOpenRay Keenetic — редакция RuOpenRay UI для роутеров Keenetic с Entware.

Автор и владелец проекта: AceAsket.

Репозиторий: <https://github.com/AceAsket/RuOpenRay-Keenetic>

## Возможности

- веб-панель RuOpenRay UI для Keenetic/Entware
- установка панели в `/opt`
- запуск через `/opt/etc/init.d/S99ruopenray-ui`
- установка Xray-core из GitHub releases через веб-панель
- запуск Xray через `/opt/etc/init.d/S99ruopenray-xray`
- сборка release asset `ruopenray-ui-linux-arm64`
- ссылка из панели в Keenetic Web UI

## Требования

```text
KeeneticOS
Entware
OPKG disk
aarch64 / linux arm64
```

Штатный SSH Keenetic открывает CLI KeeneticOS. Для установки нужен Entware shell с доступом к `/opt`, `opkg` и `/opt/etc/init.d/`.

## Пути

```text
/opt/sbin/ruopenray-ui
/opt/etc/ruopenray-ui/
/opt/etc/init.d/S99ruopenray-ui
/opt/sbin/xray
/opt/etc/init.d/S99ruopenray-xray
/opt/etc/xray/configs/
/opt/etc/xray/dat/
/opt/var/log/ruopenray-ui/
```

## Установка

Запуск в Entware shell:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Или через `wget`:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Пароль панели:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Адрес панели:

```text
http://192.168.1.1:9090/
```

Установщик записывает:

```text
/opt/etc/ruopenray-ui/ruopenray-ui.env
/opt/etc/init.d/S99ruopenray-ui
/opt/etc/init.d/S99ruopenray-xray
```

Свой бинарник панели:

```sh
RUOPENRAY_BINARY_URL='https://example.com/ruopenray-ui-linux-arm64' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Конкретный релиз панели:

```sh
RUOPENRAY_VERSION='v0.1.0-keenetic.10' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

## Xray-core

Xray-core устанавливается из веб-панели. Выберите релиз GitHub, после чего backend скачает подходящий `linux/arm64` архив и положит бинарник в `/opt/sbin/xray`.

Установка Xray через `opkg` на Keenetic не используется.

## Keenetic UI

В панели есть ссылка `Keenetic`, которая открывает родной веб-интерфейс роутера:

```text
http://192.168.1.1/
```

Для внешнего доступа можно использовать KeenDNS:

```text
ruopenray.<ваш-домен>.keenetic.pro -> 192.168.1.1:9090
```

## Настройки Keenetic

В разделе `Настройки -> Keenetic` доступны:

- режим IPv6
- режим native policy KeeneticOS
- проксирование Entware-загрузок
- FD watchdog
- DSCP для TPROXY
- количество повторов загрузок
- offline install mode
- IP exclude для firewall hook
- дополнительные proxy-порты
- порты-исключения

Сохраненные списки применяются при preview/apply firewall и попадают в Keenetic hook.

## Прозрачный режим

Поддерживаемые режимы:

```text
REDIRECT: TCP через nat REDIRECT
TPROXY: TCP/UDP через mangle TPROXY и route table 111
```

Файлы hook:

```text
/opt/etc/ndm/netfilter.d/90-ruopenray-redirect.sh
/opt/etc/ruopenray-ui/disable-keenetic-redirect.sh
/opt/etc/ruopenray-ui/keenetic-firewall.json
```

Зависимости:

```sh
opkg install iptables
```

Для TPROXY нужны модули KeeneticOS:

```text
/lib/modules/$(uname -r)/xt_socket.ko
/lib/modules/$(uname -r)/xt_TPROXY.ko
```

Панель сама записывает hook, подгружает модули TPROXY и применяет правила. По умолчанию используется LAN-интерфейс `br0` и Xray inbound `transparent_ipv4` на порту `52345`.

Поддерживается ограничение перехвата:

```text
RUOPENRAY_PORTS='80 443'    # список портов
RUOPENRAY_PORTS='all'       # все TCP для REDIRECT, TCP/UDP для TPROXY
RUOPENRAY_DEVICE_MODE=all   # весь LAN
RUOPENRAY_DEVICE_MODE=selected RUOPENRAY_DEVICES='192.168.1.50'
RUOPENRAY_DEVICE_MODE=exclude  RUOPENRAY_DEVICES='192.168.1.60'
```

Ручной запуск REDIRECT:

```sh
RUOPENRAY_ROUTER_MODE=redirect RUOPENRAY_PORTS='80 443' /opt/etc/ndm/netfilter.d/90-ruopenray-redirect.sh
```

Ручной запуск TPROXY:

```sh
RUOPENRAY_ROUTER_MODE=tproxy RUOPENRAY_PORTS='80 443' RUOPENRAY_BLOCK_QUIC=0 /opt/etc/ndm/netfilter.d/90-ruopenray-redirect.sh
```

Откат:

```sh
/opt/etc/ruopenray-ui/disable-keenetic-redirect.sh
```

## Проверка

```sh
/opt/etc/init.d/S99ruopenray-ui status
/opt/etc/init.d/S99ruopenray-xray status
/opt/sbin/xray run -test -config /opt/etc/xray/configs/99_ruopenray.json
```

Проверка выхода через локальный SOCKS:

```sh
curl -4 --socks5-hostname 127.0.0.1:10808 https://api.ipify.org
```

## План

- подключить чтение DHCP leases KeeneticOS для списка LAN-устройств
- добавить UI для проверки и восстановления TPROXY modules, ip rule и route table 111
- включить управление IPv6 hook из настроек Keenetic
- подключить Entware proxy и download retries к загрузчикам Xray, geo и обновлений
- добавить watchdog deleted FD и лимитов Xray
- расширить диагностику transparent proxy счетчиками hook, Xray и выборкой по клиентам
- добавить импорт/экспорт Keenetic профиля настроек

## Локальная разработка

```sh
npm install
node tools/dev-server/index.js
```

```sh
go test ./...
npm run test:frontend
```

## Репозиторий

Go module:

```text
github.com/AceAsket/RuOpenRay-Keenetic
```

Release repository:

```text
AceAsket/RuOpenRay-Keenetic
```
