import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const publicDir = join(root, 'cmd', 'ruopenray-ui', 'web');
export const dataDir = resolve(process.env.RUOPENRAY_DATA_DIR || process.env.OPENRAY_DATA_DIR || join(root, 'data'));
export const profilesDir = resolve(process.env.RUOPENRAY_PROFILES_DIR || process.env.OPENRAY_PROFILES_DIR || join(dataDir, 'profiles'));
export const backupDir = resolve(process.env.RUOPENRAY_BACKUP_DIR || process.env.OPENRAY_BACKUP_DIR || join(dataDir, 'backups'));
export const activeConfigPath = resolve(process.env.RUOPENRAY_ACTIVE_CONFIG || process.env.OPENRAY_ACTIVE_CONFIG || join(dataDir, 'config.json'));
export const geoDir = resolve(process.env.RUOPENRAY_GEO_DIR || process.env.OPENRAY_GEO_DIR || join(dataDir, 'geo'));
export const geoSchedulePath = join(dataDir, 'geo-schedule.json');
export const geoSourcesPath = join(dataDir, 'geo-sources.json');
export const domainMonitorStatePath = join(dataDir, 'domain-monitor.enabled');
export const serviceSettingsPath = join(dataDir, 'service-settings.json');
export const loggingSettingsPath = join(dataDir, 'logging-settings.json');
export const defaultAccessLogPath = '/var/log/xray/access.log';
export const defaultErrorLogPath = '/var/log/xray/error.log';
export const serviceName = process.env.RUOPENRAY_XRAY_SERVICE || process.env.OPENRAY_XRAY_SERVICE || 'xray';
export const host = process.env.RUOPENRAY_HOST || process.env.OPENRAY_HOST || '127.0.0.1';
export const port = Number(process.env.RUOPENRAY_PORT || process.env.OPENRAY_PORT || 9090);
export const appVersion = process.env.RUOPENRAY_VERSION || 'dev';

export const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon']
]);

export const defaultConfig = {
  log: {
    loglevel: 'warning'
  },
  inbounds: [
    {
      tag: 'socks-in',
      port: 10808,
      listen: '127.0.0.1',
      protocol: 'socks',
      settings: { udp: true }
    }
  ],
  outbounds: [
    {
      tag: 'direct',
      protocol: 'freedom'
    },
    {
      tag: 'block',
      protocol: 'blackhole'
    }
  ],
  routing: {
    domainStrategy: 'AsIs',
    rules: []
  }
};
