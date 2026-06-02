# RuOpenRay Keenetic

RuOpenRay Keenetic — отдельная редакция RuOpenRay UI для роутеров Keenetic с Entware. Автор и владелец проекта: AceAsket.

Репозиторий намеренно вынесен отдельно от `AceAsket/RuOpenRay`: у Keenetic другая модель запуска, другая файловая структура, другие сервисные скрипты и отдельная логика firewall/DNS. Так можно быстро адаптировать панель под Keenetic, не превращая основную OpenWrt-версию в набор условных веток.

Репозиторий: <https://github.com/AceAsket/RuOpenRay-Keenetic>

## Статус

Это ранняя Keenetic-адаптация RuOpenRay UI. Базовый слой уже есть: Entware-установщик, дефолтные пути `/opt`, init-скрипты для панели и Xray, сборка только `linux/arm64`, установка Xray-core из релизов GitHub через веб-панель.

OpenWrt-only действия для DNS/firewall на Keenetic пока не считаются готовой интеграцией. Их нужно заменить отдельным адаптером KeeneticOS.

Текущий тестовый стенд:

```text
Keenetic WBR3000UAX (KN-4110)
KeeneticOS 5.0.11
CPU architecture: aarch64
OPKG component: installed
OPKG disk: storage:/
```

Целевой release asset: `ruopenray-ui-linux-arm64`.

Штатный SSH Keenetic открывает CLI KeeneticOS, а не shell Entware. Для установки на роутере сначала нужен Entware, чтобы были доступны `/opt`, `opkg` и `/opt/etc/init.d/`.

## Пути Keenetic

Редакция для Keenetic использует Entware layout:

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

Первая цель проекта — веб-панель, которая управляет конфигурацией Xray, профилями, подписками, geo-файлами, логами и рестартами через сервисные скрипты Keenetic/Entware.

## Установка на Keenetic

Команду нужно запускать в Entware shell на роутере:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Или через `wget`:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Пароль панели можно задать явно:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Панель запускается по адресу:

```text
http://192.168.1.1:9090/
```

Установщик записывает:

```text
/opt/etc/ruopenray-ui/ruopenray-ui.env
/opt/etc/init.d/S99ruopenray-ui
/opt/etc/init.d/S99ruopenray-xray
```

Установщик панели скачивает `ruopenray-ui-linux-arm64` из последнего GitHub release. Если нужен свой бинарник, передайте URL вручную:

```sh
RUOPENRAY_BINARY_URL='https://example.com/ruopenray-ui-linux-arm64' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay-Keenetic/main/scripts/install-keenetic.sh)"
```

Xray-core ставится из самой веб-панели: выберите релиз GitHub, после чего backend скачает подходящий `linux/arm64` архив и положит бинарник в `/opt/sbin/xray`. Установка Xray через `opkg` на Keenetic в этой редакции не используется.

## Интеграция с Keenetic UI

В панели добавлена быстрая ссылка `Keenetic`, которая открывает родной веб-интерфейс роутера `http://192.168.1.1/` в новой вкладке. Это безопасная интеграция без патча внутреннего веба KeeneticOS.

Для внешнего доступа лучше использовать штатный KeenDNS:

```text
ruopenray.<ваш-домен>.keenetic.pro -> 192.168.1.1:9090
```

Рекомендуемый путь — создать в KeeneticOS отдельное веб-приложение или проброс через KeenDNS на порт панели `9090`. Встраивать RuOpenRay прямо в меню KeeneticOS или править файлы штатной панели пока не стоит: такой способ зависит от версии KeeneticOS и может сломаться после обновления.

## XKeen как референс

XKeen полезен как источник Keenetic-специфичных деталей, но RuOpenRay Keenetic не должен зависеть от XKeen для веб-панели. Основная цель — собственное веб-управление и аккуратная интеграция с KeeneticOS/Entware.

Что стоит изучать при реализации Keenetic-адаптера:

- `/opt/etc/init.d/S99xkeen`
- `/opt/etc/ndm/netfilter.d/proxy.sh`
- `iptables` и `ip6tables`
- TProxy, Redirect и Mixed modes
- policy marks Keenetic
- внешние списки в `/opt/etc/xkeen/`

Сначала RuOpenRay Keenetic должен стать рабочей веб-панелью управления, затем можно добавлять собственные безопасные адаптеры для firewall, DNS, политик и сервисов.

## Ближайший план

1. Добавить адаптер KeeneticOS для firewall/DNS.
2. Добавить веб-управление политиками Keenetic и хуками `/opt/etc/ndm/netfilter.d/`.
3. Довести установку Xray-core для `/opt/sbin/xray`.
4. Добавить smoke-тесты против реального Keenetic-стенда.
5. Скрыть или отключить OpenWrt-only DNS/firewall действия до появления Keenetic-адаптеров.
6. Добавить проверки Entware, `opkg`, `iptables`, `ndm` hooks и файлов XKeen.

## Локальная разработка

```sh
npm install
node tools/dev-server/index.js
```

```sh
go test ./...
npm run test:frontend
```

## Идентичность репозитория

Go module:

```text
github.com/AceAsket/RuOpenRay-Keenetic
```

Release repository:

```text
AceAsket/RuOpenRay-Keenetic
```
