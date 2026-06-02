// Navigation labels and routing presets are kept separate from the renderer so app.js stays navigable.

export const nav = [
  ['dashboard', 'Панель'],
  ['setup', 'Мастер'],
  ['servers', 'Серверы'],
  ['routing', 'Маршрутизация'],
  ['dns', 'DNS'],
  ['diagnostics', 'Диагностика'],
  ['profiles', 'Профили'],
  ['settings', 'Настройки']
];

export const tabTitles = {
  ...Object.fromEntries(nav),
  sni: 'SNI',
  geo: 'Geo-файлы',
  devices: 'Устройства',
  firewall: 'Файрвол',
  logs: 'Логи'
};

export const labels = {
  running: 'Работает',
  stopped: 'Остановлен',
  available: 'Доступно',
  missing: 'Не найден',
  active: 'активен',
  stored: 'сохранен'
};

export const routeKinds = {
  domain: 'Сайт или домен',
  ip: 'IP или подсеть',
  source: 'Устройство LAN',
  port: 'Порт',
  inboundTag: 'Входящий поток',
  default: 'Остальной трафик'
};

export const managedRouteTags = {
  'ruopenray-api': 'Xray API / статистика',
  ruopenray_dns_in: 'DNS через RuOpenRay',
  transparent_ipv4: 'Перехват LAN-трафика',
  'dns-out': 'DNS-выход Xray'
};

export const routePlaceholders = {
  domain: 'domain:youtube.com, geosite:youtube',
  ip: '8.8.8.8, 1.1.1.0/24, geoip:telegram',
  source: '192.168.50.157',
  port: '443 или 50000-65535',
  inboundTag: 'transparent_ipv4',
  default: ''
};

// Route scenarios are intentionally loaded from user/Git sources instead of being baked into the binary.
export const routePresets = {};
export const routeBundles = {};
export const hiddenBuiltinRoutePresetKeys = new Set();
