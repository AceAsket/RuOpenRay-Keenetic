import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, copyFile, stat, statfs, unlink, truncate, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { connect } from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import {
  activeConfigPath,
  appVersion,
  backupDir,
  contentTypes,
  dataDir,
  defaultAccessLogPath,
  defaultConfig,
  defaultErrorLogPath,
  domainMonitorStatePath,
  geoDir,
  geoSchedulePath,
  geoSourcesPath,
  host,
  loggingSettingsPath,
  port,
  profilesDir,
  publicDir,
  serviceName,
  serviceSettingsPath
} from './context.js';

let authSecret = process.env.RUOPENRAY_PASSWORD || process.env.RUOPENRAY_TOKEN || process.env.OPENRAY_PASSWORD || process.env.OPENRAY_TOKEN || 'admin';
const sessions = new Set();
let previousCpuSample = null;

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf('=');
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function authed(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const cookies = parseCookies(req);
  return Boolean((bearer && sessions.has(bearer)) || (cookies.openray_session && sessions.has(cookies.openray_session)));
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function command(bin, args, timeout = 5000) {
  return new Promise((resolveCommand) => {
    execFile(bin, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      resolveCommand({
        ok: !error,
        code: error?.code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        message: error?.message || ''
      });
    });
  });
}

async function ensureData() {
  await mkdir(profilesDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });
  await mkdir(geoDir, { recursive: true });
  try {
    await stat(activeConfigPath);
  } catch {
    await writeFile(activeConfigPath, JSON.stringify(defaultConfig, null, 2));
    await writeFile(join(profilesDir, 'default.json'), JSON.stringify(defaultConfig, null, 2));
  }
}

function profilePath(name) {
  const clean = basename(profileNameFallback(name)).replace(/[^a-zA-Z0-9._-]/g, '-') || 'profile';
  return join(profilesDir, clean.endsWith('.json') ? clean : `${clean}.json`);
}

function profileNameFallback(...values) {
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (clean && clean !== '<nil>' && clean !== 'undefined' && clean !== 'null') return clean;
  }
  return 'profile';
}

function profileNameFromUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    if (last) return basename(last, extname(last));
    return parsed.hostname.replace(/^www\./, '').split('.')[0] || '';
  } catch {
    return '';
  }
}

async function readActiveConfig() {
  return JSON.parse(await readFile(activeConfigPath, 'utf8'));
}

async function listProfiles() {
  const names = (await readdir(profilesDir)).filter((file) => file.endsWith('.json'));
  const activeConfig = JSON.stringify(await readActiveConfig());
  const profiles = [];
  for (const name of names) {
    const path = join(profilesDir, name);
    const info = await stat(path);
    let active = false;
    try {
      active = JSON.stringify(JSON.parse(await readFile(path, 'utf8'))) === activeConfig;
    } catch {
      active = false;
    }
    profiles.push({
      name: name.replace(/\.json$/, ''),
      file: name,
      size: info.size,
      updatedAt: info.mtime.toISOString(),
      active
    });
  }
  return profiles.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

async function serviceAction(action) {
  if (!['start', 'stop', 'restart', 'enable', 'disable'].includes(action)) {
    return { ok: false, stderr: 'Неподдерживаемое действие сервиса' };
  }
  const logMaintenance = ['start', 'restart'].includes(action) ? await maintainLogFiles(true) : null;
  const delay = await waitBeforeXrayAction(action);
  if (process.platform === 'win32') {
    return { ok: true, stdout: `dev-mode: был бы выполнен сервис ${serviceName} ${action}`, logMaintenance, delay };
  }
  const result = await command('/etc/init.d/' + serviceName, [action], 15000);
  if (logMaintenance) result.logMaintenance = logMaintenance;
  if (delay) {
    result.delay = delay;
    result.stdout = concatOutput(delay, result);
  }
  return result;
}

async function changePassword(payload) {
  const current = String(payload.currentPassword || '');
  const next = String(payload.newPassword || '').trim();
  const confirm = String(payload.confirmPassword || '').trim();
  if (!safeEqual(current, authSecret)) return { ok: false, stderr: 'Текущий пароль не подошел' };
  if (next.length < 8) return { ok: false, stderr: 'Новый пароль должен быть не короче 8 символов' };
  if (next !== confirm) return { ok: false, stderr: 'Пароли не совпадают' };

  const steps = [];
  let persisted = process.platform === 'win32';
  if (process.platform !== 'win32' && await commandExists('uci')) {
    const set = await command('uci', ['set', `ruopenray-ui.main.password=${next}`], 10000);
    const commit = await command('uci', ['commit', 'ruopenray-ui'], 10000);
    steps.push(set, commit);
    persisted = Boolean(set.ok && commit.ok);
  }
  if (process.platform !== 'win32' && !persisted) return { ok: false, stderr: 'Не удалось сохранить пароль в UCI', steps };

  authSecret = next;
  sessions.clear();
  return { ok: true, persisted, steps, stdout: 'Пароль панели изменен. Войдите заново.' };
}

function validLogLevel(value) {
  const level = String(value || '').trim().toLowerCase();
  return ['none', 'error', 'warning', 'info', 'debug'].includes(level) ? level : 'warning';
}

function cleanLogPath(value, fallback) {
  const clean = String(value || '').trim();
  if (!clean || clean === '<nil>') return fallback;
  if (process.platform !== 'win32' && !clean.startsWith('/')) return fallback;
  return clean;
}

async function fileSize(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

async function readLoggingRuntimeSettings() {
  const defaults = { maxSizeMb: 2, rotateCopies: 1, clearOnRestart: false };
  try {
    return { ...defaults, ...JSON.parse(await readFile(loggingSettingsPath, 'utf8')) };
  } catch {
    return defaults;
  }
}

async function writeLoggingRuntimeSettings(settings) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(loggingSettingsPath, JSON.stringify(settings, null, 2));
}

function clampNumber(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed)));
}

function cleanMirrorPrefix(value = '') {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

async function serviceSettings() {
  const defaults = {
    ok: true,
    startupDelaySec: 0,
    applyDelaySec: 0,
    downloadMirror: 'direct',
    mirrorPrefix: '',
    uci: { available: process.platform !== 'win32', package: 'ruopenray-ui' }
  };
  try {
    const saved = JSON.parse(await readFile(serviceSettingsPath, 'utf8'));
    const merged = { ...defaults, ...saved };
    merged.startupDelaySec = clampNumber(merged.startupDelaySec, 0, 180);
    merged.applyDelaySec = clampNumber(merged.applyDelaySec, 0, 60);
    merged.mirrorPrefix = cleanMirrorPrefix(merged.mirrorPrefix);
    if (merged.downloadMirror !== 'custom' || !merged.mirrorPrefix) {
      merged.downloadMirror = 'direct';
      merged.mirrorPrefix = '';
    }
    return merged;
  } catch {
    return defaults;
  }
}

async function writeServiceRuntimeSettings(settings) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(serviceSettingsPath, JSON.stringify(settings, null, 2));
}

async function saveServiceSettings(payload = {}) {
  const settings = {
    startupDelaySec: clampNumber(payload.startupDelaySec, 0, 180),
    applyDelaySec: clampNumber(payload.applyDelaySec, 0, 60),
    downloadMirror: payload.downloadMirror === 'custom' ? 'custom' : 'direct',
    mirrorPrefix: cleanMirrorPrefix(payload.mirrorPrefix)
  };
  if (settings.downloadMirror !== 'custom' || !settings.mirrorPrefix) {
    settings.downloadMirror = 'direct';
    settings.mirrorPrefix = '';
  }
  await writeServiceRuntimeSettings(settings);
  return { ok: true, settings: await serviceSettings(), persisted: process.platform === 'win32', stdout: 'Настройки сервиса сохранены' };
}

async function applyDelay() {
  const settings = await serviceSettings();
  return Number(settings.applyDelaySec || 0);
}

async function waitBeforeXrayAction(action) {
  if (!['start', 'restart'].includes(action)) return null;
  const seconds = await applyDelay();
  if (seconds <= 0) return null;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, seconds * 1000));
  return { ok: true, stdout: `Задержка перед ${action}: ${seconds} сек` };
}

async function mirrorUrl(rawUrl) {
  const settings = await serviceSettings();
  if (settings.downloadMirror !== 'custom' || !settings.mirrorPrefix) return rawUrl;
  if (settings.mirrorPrefix.includes('{url}')) return settings.mirrorPrefix.replaceAll('{url}', encodeURIComponent(rawUrl));
  return settings.mirrorPrefix.endsWith('/') ? `${settings.mirrorPrefix}${rawUrl}` : `${settings.mirrorPrefix}${rawUrl}`;
}

async function loggingSettings() {
  const config = await readActiveConfig();
  const logConfig = config.log || {};
  const runtimeSettings = await readLoggingRuntimeSettings();
  const accessRaw = String(logConfig.access || '').trim();
  const errorRaw = String(logConfig.error || '').trim();
  const accessPath = cleanLogPath(accessRaw, defaultAccessLogPath);
  const errorPath = cleanLogPath(errorRaw, defaultErrorLogPath);
  return {
    ok: true,
    level: validLogLevel(logConfig.loglevel),
    accessLog: Boolean(accessRaw),
    accessPath,
    accessSize: await fileSize(accessPath),
    errorLog: Boolean(errorRaw),
    errorPath,
    errorSize: await fileSize(errorPath),
    dnsLog: Boolean(logConfig.dnsLog),
    maxSizeMb: Number(runtimeSettings.maxSizeMb || 2),
    rotateCopies: Number(runtimeSettings.rotateCopies ?? 1),
    clearOnRestart: Boolean(runtimeSettings.clearOnRestart),
    maintenanceEvery: '15 мин'
  };
}

async function saveLoggingSettings(payload) {
  const config = await readActiveConfig();
  const logConfig = config.log || {};
  const accessLog = boolPayload(payload, 'accessLog', false);
  const errorLog = boolPayload(payload, 'errorLog', false);
  const accessPath = cleanLogPath(payload.accessPath, defaultAccessLogPath);
  const errorPath = cleanLogPath(payload.errorPath, defaultErrorLogPath);
  logConfig.loglevel = validLogLevel(payload.level);
  if (accessLog) {
    logConfig.access = accessPath;
    await mkdir(dirname(accessPath), { recursive: true }).catch(() => {});
  } else {
    delete logConfig.access;
  }
  if (errorLog) {
    logConfig.error = errorPath;
    await mkdir(dirname(errorPath), { recursive: true }).catch(() => {});
  } else {
    delete logConfig.error;
  }
  logConfig.dnsLog = boolPayload(payload, 'dnsLog', false);
  config.log = logConfig;

  const runtimeSettings = await readLoggingRuntimeSettings();
  runtimeSettings.maxSizeMb = Math.min(200, Math.max(1, Number(payload.maxSizeMb || runtimeSettings.maxSizeMb || 2)));
  runtimeSettings.rotateCopies = Math.min(5, Math.max(0, Number(payload.rotateCopies ?? runtimeSettings.rotateCopies ?? 1)));
  runtimeSettings.clearOnRestart = boolPayload(payload, 'clearOnRestart', false);
  const test = await validateConfig(config);
  if (!test.ok) return { ok: false, stderr: 'Конфигурация Xray не прошла проверку', test, settings: await loggingSettings() };
  const backup = await backupActive('logging-before-apply');
  await writeFile(activeConfigPath, JSON.stringify(config, null, 2));
  await writeLoggingRuntimeSettings(runtimeSettings);
  const maintenance = await maintainLogFiles(false);
  const restart = boolPayload(payload, 'restart', true) ? await serviceAction('restart') : { ok: true, stdout: 'Настройки сохранены без перезапуска Xray' };
  return { ok: restart.ok, test, backup, restart, maintenance, settings: await loggingSettings(), stdout: 'Настройки логирования сохранены' };
}

async function configuredLogPaths() {
  const settings = await loggingSettings();
  return [...new Set([
    cleanLogPath(settings.accessPath, defaultAccessLogPath),
    cleanLogPath(settings.errorPath, defaultErrorLogPath),
    defaultAccessLogPath,
    defaultErrorLogPath,
    join(dataDir, 'access.log'),
    join(dataDir, 'error.log')
  ])];
}

async function clearLogFiles() {
  const cleared = [];
  const errors = [];
  for (const path of await configuredLogPaths()) {
    try {
      const info = await stat(path);
      if (!info.isFile()) continue;
      await truncate(path, 0);
      cleared.push({ path, previousSize: info.size });
    } catch (error) {
      if (error?.code !== 'ENOENT') errors.push(`${path}: ${error.message}`);
    }
  }
  return { ok: errors.length === 0, cleared, errors, settings: await loggingSettings(), stdout: `Очищено файлов логов: ${cleared.length}`, stderr: errors.join('\n') };
}

async function rotateLogFile(path, copies) {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  if (copies < 1) return truncate(path, 0);
  await unlink(`${path}.${copies}`).catch(() => {});
  for (let i = copies - 1; i >= 1; i -= 1) {
    await rename(`${path}.${i}`, `${path}.${i + 1}`).catch(() => {});
  }
  await rename(path, `${path}.1`);
  return writeFile(path, '');
}

async function maintainLogFiles(restart = false) {
  const settings = await loggingSettings();
  if (restart && settings.clearOnRestart) {
    const result = await clearLogFiles();
    result.action = 'clear';
    return result;
  }
  const maxBytes = Number(settings.maxSizeMb || 2) * 1024 * 1024;
  const copies = Number(settings.rotateCopies ?? 1);
  if (maxBytes <= 0 || copies <= 0) return { ok: true, rotated: [] };
  const rotated = [];
  const errors = [];
  for (const path of await configuredLogPaths()) {
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size <= maxBytes) continue;
      await rotateLogFile(path, copies);
      rotated.push({ path, previousSize: info.size });
    } catch (error) {
      if (error?.code !== 'ENOENT') errors.push(`${path}: ${error.message}`);
    }
  }
  return { ok: errors.length === 0, rotated, errors, stderr: errors.join('\n') };
}

async function enableXrayServiceConfig() {
  if (process.platform === 'win32') return { ok: true, stdout: 'dev-mode: enable xray service config' };
  const steps = [];
  if (await commandExists('uci')) {
    steps.push(await command('uci', ['set', 'xray.enabled.enabled=1'], 10000));
    steps.push(await command('uci', ['commit', 'xray'], 10000));
  }
  if (await commandExists('/etc/init.d/xray')) {
    steps.push(await command('/etc/init.d/xray', ['enable'], 10000));
  }
  return {
    ok: steps.every((step) => step.ok),
    steps,
    stdout: concatOutput(...steps)
  };
}

async function commandExists(name) {
  const result = await command(process.platform === 'win32' ? 'where' : 'which', [name], 3000);
  return result.ok;
}

function firstLine(value, fallback) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || fallback;
}

function byteSize(size = 0) {
  const n = Number(size || 0);
  if (n >= 1024 * 1024 * 1024) return `${Math.round((n / 1024 / 1024 / 1024) * 10) / 10} GB`;
  if (n >= 1024 * 1024) return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}

function concatOutput(...items) {
  return items
    .flatMap((item) => [item?.stdout, item?.stderr])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function xrayAssetName() {
  const arch = os.arch();
  if (arch === 'x64') return 'Xray-linux-64.zip';
  if (arch === 'ia32') return 'Xray-linux-32.zip';
  if (arch === 'arm64') return 'Xray-linux-arm64-v8a.zip';
  if (arch === 'arm') return 'Xray-linux-arm32-v7a.zip';
  return `Xray-linux-${arch}.zip`;
}

function ruOpenRayAssetName() {
  switch (os.arch()) {
    case 'x64':
      return 'ruopenray-ui-linux-amd64';
    case 'arm64':
      return 'ruopenray-ui-linux-arm64';
    case 'arm':
      return 'ruopenray-ui-linux-armv7';
    case 'mipsel':
      return 'ruopenray-ui-linux-mipsle-softfloat';
    case 'mips':
      return 'ruopenray-ui-linux-mips-softfloat';
    default:
      return `ruopenray-ui-linux-${os.arch()}`;
  }
}

async function packageArchitecture(manager) {
  if (manager === 'apk') {
    const result = await command('apk', ['--print-arch'], 5000);
    return firstLine(result.stdout, '');
  }
  if (manager === 'opkg') {
    const result = await command('opkg', ['print-architecture'], 5000);
    return String(result.stdout || '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts[0] === 'arch' && parts[1] && !['all', 'noarch'].includes(parts[1]))
      .map((parts) => parts[1])
      .pop() || '';
  }
  return '';
}

async function packageInstalled(manager, pkg) {
  if (process.platform === 'win32' || manager === 'dev-mode') return true;
  if (manager === 'apk') return (await command('apk', ['info', '-e', pkg], 5000)).ok;
  if (manager === 'opkg') return (await command('opkg', ['status', pkg], 5000)).ok;
  return false;
}

async function tproxyModuleStatus(manager) {
  const required = ['kmod-nf-tproxy', 'kmod-nft-tproxy', 'kmod-nft-socket'];
  const installed = [];
  const missing = [];
  for (const pkg of required) {
    if (await packageInstalled(manager, pkg)) installed.push(pkg);
    else missing.push(pkg);
  }
  let detail = installed.length ? `установлены: ${installed.join(', ')}` : 'не установлены';
  if (process.platform === 'win32' || manager === 'dev-mode') detail = 'проверяется на OpenWrt';
  else if (missing.length) detail = `не хватает: ${missing.join(', ')}`;
  return { ok: missing.length === 0, required, installed, missing, detail };
}

async function systemArchitecture(manager) {
  const uname = process.platform === 'win32'
    ? { stdout: os.arch() }
    : await command('uname', ['-m'], 5000);
  return {
    platform: process.platform,
    arch: os.arch(),
    uname: firstLine(uname.stdout, os.arch()),
    packageManager: manager,
    packageArch: await packageArchitecture(manager),
    githubAsset: xrayAssetName()
  };
}

async function coreReleases() {
  const response = await fetch('https://api.github.com/repos/XTLS/Xray-core/releases?per_page=50', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'RuOpenRay UI' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`GitHub releases HTTP ${response.status}`);
  const asset = xrayAssetName();
  const items = await response.json();
  return {
    ok: true,
    asset,
    arch: await systemArchitecture('github-release'),
    releases: items.map((item) => {
      const match = (item.assets || []).find((releaseAsset) => releaseAsset.name === asset);
      return {
        tag: item.tag_name,
        name: item.name || item.tag_name,
        publishedAt: item.published_at,
        asset,
        assetUrl: match?.browser_download_url || '',
        prerelease: Boolean(item.prerelease)
      };
    })
  };
}

async function appRelease() {
  const asset = ruOpenRayAssetName();
  const response = await fetch('https://api.github.com/repos/AceAsket/RuOpenRay-Keenetic/releases?per_page=1', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'RuOpenRay UI' },
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 404) {
    return {
      ok: true,
      version: appVersion,
      asset,
      arch: await systemArchitecture('github-release'),
      release: { tag: '', name: 'релизов пока нет', asset, assetUrl: '', assetSize: 0, current: appVersion, update: false }
    };
  }
  if (!response.ok) throw new Error(`GitHub release HTTP ${response.status}`);
  const items = await response.json();
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) {
    return {
      ok: true,
      version: appVersion,
      asset,
      arch: await systemArchitecture('github-release'),
      release: { tag: '', name: 'релизов пока нет', asset, assetUrl: '', assetSize: 0, current: appVersion, update: false }
    };
  }
  const match = (item.assets || []).find((releaseAsset) => releaseAsset.name === asset);
  const tag = item.tag_name || '';
  return {
    ok: true,
    version: appVersion,
    asset,
    arch: await systemArchitecture('github-release'),
    release: {
      tag,
      name: item.name || tag,
      publishedAt: item.published_at,
      prerelease: Boolean(item.prerelease),
      htmlUrl: item.html_url,
      asset,
      assetUrl: match?.browser_download_url || '',
      assetSize: match?.size || 0,
      current: appVersion,
      update: Boolean(tag && tag !== appVersion)
    }
  };
}

async function updateApp(version = '', keepBackup = false) {
  const release = await appRelease();
  return {
    ok: true,
    version: version || release.release.tag || appVersion,
    previous: appVersion,
    release: release.release,
    backupEnabled: keepBackup,
    stdout: 'dev-mode: на OpenWrt будет скачан и заменен бинарник RuOpenRay UI, затем сервис перезапустится'
  };
}

async function updateCore(version = '', keepBackup = false) {
  const beforeVersion = await command('xray', ['version'], 3000);
  const before = firstLine(beforeVersion.stdout, 'xray не найден');
  if (version) {
    return {
      ok: true,
      packageManager: 'github-release',
      version,
      backupEnabled: keepBackup,
      arch: await systemArchitecture('github-release'),
      before,
      after: before,
      stdout: `dev-mode: на OpenWrt будет скачан официальный релиз ${version} (${xrayAssetName()})`
    };
  }
  if (process.platform === 'win32') {
    return {
      ok: true,
      packageManager: 'dev-mode',
      before,
      after: before,
      stdout: 'dev-mode: на OpenWrt будет выполнено обновление пакета xray-core'
    };
  }

  let packageManager = '';
  let update;
  let install;
  if (await commandExists('apk')) {
    packageManager = 'apk';
    update = await command('apk', ['update'], 90000);
    install = await command('apk', ['add', '--upgrade', 'xray-core', 'kmod-nf-tproxy', 'kmod-nft-tproxy', 'kmod-nft-socket'], 180000);
  } else if (await commandExists('opkg')) {
    packageManager = 'opkg';
    update = await command('opkg', ['update'], 90000);
    install = await command('opkg', ['install', 'xray-core', 'kmod-nf-tproxy', 'kmod-nft-tproxy', 'kmod-nft-socket'], 180000);
  } else {
    return { ok: false, stderr: 'Не найден пакетный менеджер apk или opkg' };
  }

  const afterVersion = await command('xray', ['version'], 3000);
  const enable = await enableXrayServiceConfig();
  const restart = await serviceAction('restart');
  return {
    ok: Boolean(update.ok && install.ok && enable.ok && restart.ok),
    packageManager,
    arch: await systemArchitecture(packageManager),
    before,
    after: firstLine(afterVersion.stdout, 'xray не найден'),
    update,
    install,
    enable,
    restart,
    stdout: concatOutput(update, install, enable, restart)
  };
}

async function installPlan() {
  let manager = 'не найден';
  if (process.platform === 'win32') manager = 'dev-mode';
  else if (await commandExists('apk')) manager = 'apk';
  else if (await commandExists('opkg')) manager = 'opkg';
  const core = await command('xray', ['version'], 3000);
  const geo = await geoStatus();
  const system = await systemMetrics();
  const free = Number(system?.disk?.free || 0);
  const tproxyModules = await tproxyModuleStatus(manager);
  return {
    ok: true,
    packageManager: manager,
    arch: await systemArchitecture(manager),
    core,
    geo,
    tproxyModules,
    disk: system.disk,
    installable: process.platform === 'win32' || manager === 'apk' || manager === 'opkg',
    steps: [
      { id: 'manager', title: 'Пакетный менеджер', ok: manager !== 'не найден', detail: manager },
      { id: 'arch', title: 'Архитектура', ok: true, detail: `${os.arch()} / ${xrayAssetName()}` },
      { id: 'space', title: 'Свободное место', ok: !free || free >= 12 * 1024 * 1024, detail: byteSize(free) },
      { id: 'xray', title: 'Xray-core', ok: core.ok, detail: firstLine(core.stdout, 'не найден') },
      { id: 'geo', title: 'Geo-файлы', ok: Boolean(geo.geoip?.exists && geo.geosite?.exists), detail: `geoip.dat: ${Boolean(geo.geoip?.exists)} · geosite.dat: ${Boolean(geo.geosite?.exists)}` },
      { id: 'tproxy', title: 'TPROXY-модули', ok: tproxyModules.ok, detail: tproxyModules.detail },
      { id: 'service', title: 'Сервис', ok: true, detail: `/etc/init.d/${serviceName}` }
    ]
  };
}

function geoPresets() {
  return [
    {
      id: 'loyalsoldier',
      name: 'Loyalsoldier',
      purpose: 'универсальный набор',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 32 * 1024 * 1024,
      detail: 'Базовый набор geoip.dat/geosite.dat для маршрутизации Xray.',
      geoipUrl: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
      geositeUrl: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat'
    },
    {
      id: 'loyalsoldier-cdn',
      name: 'Loyalsoldier CDN',
      purpose: 'универсальный набор через CDN',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 32 * 1024 * 1024,
      detail: 'То же содержимое через jsDelivr, удобно если GitHub с роутера открывается нестабильно.',
      geoipUrl: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat',
      geositeUrl: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat'
    },
    {
      id: 'runetfreedom',
      name: 'RUNET Freedom',
      purpose: 'российские блокировки',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 28 * 1024 * 1024,
      detail: 'Набор для российского сегмента: заблокированные домены, IP-диапазоны и популярные сервисы для обхода.',
      ruleHint: 'domain(geosite:ru-blocked) -> proxy',
      geoipUrl: 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geoip.dat',
      geositeUrl: 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geosite.dat'
    },
    {
      id: 'nidelon',
      name: 'Nidelon',
      purpose: 'российские блокировки',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 8 * 1024 * 1024,
      detail: 'Компактный набор блокировок РКН. В оригинальном проекте используется как отдельные ext-файлы, но здесь может заменить базовые geoip/geosite.',
      ruleHint: 'ext:geosite_RU.dat:ru-block / ext:geoip_RU.dat:ru-block',
      geoipUrl: 'https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geoip.dat',
      geositeUrl: 'https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geosite.dat'
    },
    {
      id: 'dustinwin',
      name: 'DustinWin',
      purpose: 'Китай и CDN',
      mode: 'replace',
      compat: 'mihomo/Xray DAT',
      installable: true,
      estimatedBytes: 30 * 1024 * 1024,
      detail: 'Китайский ruleset/geodata набор с категориями для CN, CDN, медиа и популярных сервисов.',
      geoipUrl: 'https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geoip.dat',
      geositeUrl: 'https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geosite.dat'
    },
    {
      id: 'chocolate4u',
      name: 'Chocolate4U',
      purpose: 'Иран',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 24 * 1024 * 1024,
      detail: 'Иранский набор: локальные домены, sanctioned, ads, malware, phishing и другие категории.',
      geoipUrl: 'https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geoip.dat',
      geositeUrl: 'https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geosite.dat'
    },
    {
      id: 'antifilter-community',
      name: 'antifilter-community',
      purpose: 'РФ блокировки',
      mode: 'extra-geosite',
      compat: 'Xray ext DAT',
      installable: true,
      estimatedBytes: 256 * 1024,
      detail: 'Дополнительный geosite-файл для правил ext по спискам community.antifilter.download.',
      target: 'LoyalsoldierSite.dat',
      ruleHint: 'domain(ext:"LoyalsoldierSite.dat:antifilter-community") -> proxy',
      geositeUrl: 'https://github.com/1andrevich/antifilter-domain/releases/latest/download/geosite.dat'
    },
    {
      id: 'metacubex',
      name: 'MetaCubeX',
      purpose: 'AI/CDN/Discord',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 24 * 1024 * 1024,
      detail: 'Альтернативный rules-dat с актуальными категориями для mihomo/Clash.Meta и Xray DAT.',
      geoipUrl: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
      geositeUrl: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat'
    },
    {
      id: 'sagernet',
      name: 'SagerNet',
      purpose: 'OpenWrt/sing-box',
      mode: 'reference',
      compat: 'sing-box DB',
      installable: false,
      detail: 'Справочные sing-box базы geoip.db/geosite.db. Xray не читает этот формат напрямую.',
      geoipUrl: 'https://github.com/SagerNet/sing-geoip/releases/latest/download/geoip.db',
      geositeUrl: 'https://github.com/SagerNet/sing-geosite/releases/latest/download/geosite.db'
    },
    {
      id: 'blockcheck',
      name: 'blockcheck',
      purpose: 'диагностика DPI',
      mode: 'diagnostic',
      compat: 'zapret',
      installable: false,
      detail: 'Диагностический сценарий zapret для подбора DPI-стратегий; это не geo-файл Xray.',
      sourceUrl: 'https://github.com/bol-van/zapret/blob/master/blockcheck.sh'
    },
    {
      id: 'official',
      name: 'XTLS/Xray-core official',
      purpose: 'официальный набор',
      mode: 'replace',
      compat: 'Xray DAT',
      installable: true,
      estimatedBytes: 16 * 1024 * 1024,
      detail: 'Официальные geo-файлы из последнего релиза Xray-core.',
      geoipUrl: 'https://github.com/XTLS/Xray-core/releases/latest/download/geoip.dat',
      geositeUrl: 'https://github.com/XTLS/Xray-core/releases/latest/download/geosite.dat'
    }
  ];
}

function visibleGeoPresets() {
  return geoPresets().filter((preset) => !['reference', 'diagnostic'].includes(preset.mode));
}

async function geoFileInfo(path) {
  try {
    const info = await stat(path);
    return { exists: true, path, size: info.size, modifiedAt: info.mtime.toISOString() };
  } catch {
    return { exists: false, path };
  }
}

async function diskInfo(path) {
  try {
    await mkdir(path, { recursive: true });
    const info = await statfs(path);
    const free = Number(info.bavail) * Number(info.bsize);
    const total = Number(info.blocks) * Number(info.bsize);
    const used = total - free;
    return { ok: true, path, total, used, free, usedPercent: total ? `${Math.round((used / total) * 100)}%` : '0%' };
  } catch (error) {
    return { ok: false, path, error: error.message };
  }
}

async function geoStatus() {
  const extras = await Promise.all(
    geoPresets()
      .filter((preset) => preset.target)
      .map(async (preset) => ({
        id: preset.id,
        name: preset.name,
        file: await geoFileInfo(join(geoDir, preset.target)),
        ruleHint: preset.ruleHint
      }))
  );
  return {
    ok: true,
    dir: geoDir,
    disk: await diskInfo(geoDir),
    presets: visibleGeoPresets(),
    extras,
    customSources: await geoCustomSources(),
    geoip: await geoFileInfo(join(geoDir, 'geoip.dat')),
    geosite: await geoFileInfo(join(geoDir, 'geosite.dat')),
    schedule: await geoSchedule()
  };
}

function cleanGeoSourceId(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean.startsWith('custom-') ? clean : `custom-${clean || Date.now()}`;
}

function cleanGeoTarget(value) {
  const name = basename(String(value || '').trim()).replace(/\\/g, '');
  if (!name || name === '.') return '';
  return name.toLowerCase().endsWith('.dat') ? name : `${name}.dat`;
}

function normalizeGeoSource(raw = {}, index = 0) {
  const name = String(raw.name || `Custom source ${index + 1}`).trim();
  const kind = raw.kind === 'extra' ? 'extra' : 'base';
  const source = {
    id: cleanGeoSourceId(raw.id || name),
    name,
    kind,
    enabled: raw.enabled !== false,
    estimatedBytes: kind === 'extra' ? 512 * 1024 : 24 * 1024 * 1024
  };
  if (kind === 'extra') {
    source.target = cleanGeoTarget(raw.target);
    source.url = String(raw.url || '').trim();
  } else {
    source.geoipUrl = String(raw.geoipUrl || '').trim();
    source.geositeUrl = String(raw.geositeUrl || '').trim();
  }
  return source;
}

async function geoCustomSources() {
  try {
    const raw = JSON.parse(await readFile(geoSourcesPath, 'utf8'));
    return Array.isArray(raw) ? raw.map(normalizeGeoSource) : [];
  } catch {
    return [];
  }
}

async function saveGeoCustomSources(payload = {}) {
  const raw = Array.isArray(payload.sources) ? payload.sources : [];
  const seen = new Set();
  const sources = raw.map((source, index) => {
    const next = normalizeGeoSource(source, index);
    if (seen.has(next.id)) next.id = `${next.id}-${index + 1}`;
    seen.add(next.id);
    return next;
  });
  await mkdir(dataDir, { recursive: true });
  await writeFile(geoSourcesPath, JSON.stringify(sources, null, 2));
  return { ok: true, sources, status: await geoStatus(), stdout: 'Свои источники geodata сохранены' };
}

function arrayPayload(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function boolPayload(payload, key, fallback) {
  if (!(key in payload)) return fallback;
  const value = payload[key];
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

async function geoSchedule() {
  const defaults = { enabled: false, interval: 'weekly', weekday: '0', time: '04:20', preset: 'loyalsoldier', presets: ['loyalsoldier'], customSourceIds: [], backup: true };
  try {
    const saved = JSON.parse(await readFile(geoSchedulePath, 'utf8'));
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function cleanScheduleTime(value) {
  const [rawHour, rawMinute] = String(value || '04:20').split(':');
  const hour = Math.min(23, Math.max(0, Number.parseInt(rawHour, 10) || 4));
  const minute = Math.min(59, Math.max(0, Number.parseInt(rawMinute, 10) || 20));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function saveGeoSchedule(payload = {}) {
  const presets = arrayPayload(payload.presets).length ? arrayPayload(payload.presets) : [payload.preset || 'loyalsoldier'];
  const schedule = {
    enabled: boolPayload(payload, 'enabled', false),
    interval: String(payload.interval || 'weekly'),
    weekday: String(Math.min(6, Math.max(0, Number.parseInt(payload.weekday, 10) || 0))),
    time: cleanScheduleTime(payload.time),
    preset: presets[0],
    presets,
    customSourceIds: arrayPayload(payload.customSourceIds),
    backup: boolPayload(payload, 'backup', true),
    geoipUrl: String(payload.geoipUrl || '').trim(),
    geositeUrl: String(payload.geositeUrl || '').trim()
  };
  await writeFile(geoSchedulePath, JSON.stringify(schedule, null, 2));
  return { ok: true, schedule, status: await geoStatus(), stdout: 'dev-mode: расписание сохранено без установки cron' };
}

async function downloadGeoFile(name, url, keepBackup = true) {
  const downloadUrl = await mirrorUrl(url);
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) return { ok: false, stderr: `download HTTP ${response.status}`, url: downloadUrl, sourceUrl: url };
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1024) return { ok: false, stderr: 'файл слишком маленький, похоже на ошибку загрузки', url: downloadUrl, sourceUrl: url };
  const target = join(geoDir, name);
  await mkdir(geoDir, { recursive: true });
  if (keepBackup) {
    try {
      await mkdir(backupDir, { recursive: true });
      const current = await readFile(target);
      await writeFile(join(backupDir, `${name}-${Date.now()}`), current);
    } catch {
      // No previous file to back up.
    }
  }
  await writeFile(target, body);
  return { ok: true, stdout: `${name} обновлен: ${Math.round((body.length / 1024 / 1024) * 10) / 10} MB`, url: downloadUrl, sourceUrl: url, size: body.length };
}

async function updateGeo(payload = {}) {
  let geoipUrl = String(payload.geoipUrl || '').trim();
  let geositeUrl = String(payload.geositeUrl || '').trim();
  const backup = boolPayload(payload, 'backup', true);
  const selected = arrayPayload(payload.presets);
  if (!selected.length && payload.preset) selected.push(String(payload.preset));
  const updates = [];
  let baseCount = 0;
  for (const presetId of selected) {
    if (presetId === 'custom') continue;
    const preset = geoPresets().find((item) => item.id === presetId);
    if (!preset) return { ok: false, stderr: `Неизвестный geo-источник: ${presetId}` };
    if (!preset.installable) return { ok: false, stderr: 'Этот источник справочный и не устанавливается в Xray автоматически' };
    if (preset.mode === 'extra-geosite') {
      if (!preset.geositeUrl || !preset.target) return { ok: false, stderr: 'Для дополнительного geosite-файла не задана ссылка или имя файла' };
      updates.push(await downloadGeoFile(preset.target, preset.geositeUrl, backup));
      continue;
    }
    baseCount += 1;
    if (baseCount > 1) return { ok: false, stderr: 'Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним.' };
    updates.push(await downloadGeoFile('geoip.dat', preset.geoipUrl, backup));
    updates.push(await downloadGeoFile('geosite.dat', preset.geositeUrl, backup));
  }
  const customSourceIds = arrayPayload(payload.customSourceIds);
  if (customSourceIds.length) {
    const sources = await geoCustomSources();
    for (const sourceId of customSourceIds) {
      const source = sources.find((item) => item.id === sourceId);
      if (!source) return { ok: false, stderr: `Неизвестный пользовательский geodata-источник: ${sourceId}` };
      if (source.enabled === false) return { ok: false, stderr: `Источник geodata выключен: ${sourceId}` };
      if (source.kind === 'extra') {
        if (!source.url || !source.target) return { ok: false, stderr: `Для дополнительного dat-источника не задан URL или имя файла: ${sourceId}` };
        updates.push(await downloadGeoFile(source.target, source.url, backup));
        continue;
      }
      baseCount += 1;
      if (baseCount > 1) return { ok: false, stderr: 'Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним.' };
      if (!source.geoipUrl || !source.geositeUrl) return { ok: false, stderr: `Для базового geodata-источника не заданы обе ссылки: ${sourceId}` };
      updates.push(await downloadGeoFile('geoip.dat', source.geoipUrl, backup));
      updates.push(await downloadGeoFile('geosite.dat', source.geositeUrl, backup));
    }
  }
  if ((!selected.length && !customSourceIds.length) || selected.includes('custom')) {
    if (!geoipUrl || !geositeUrl) return { ok: false, stderr: 'Укажите ссылки на geoip.dat и geosite.dat' };
    updates.push(await downloadGeoFile('geoip.dat', geoipUrl, backup));
    updates.push(await downloadGeoFile('geosite.dat', geositeUrl, backup));
  }
  const okDownloads = updates.length > 0 && updates.every((item) => item.ok);
  let restart = { ok: true, stdout: '' };
  if (okDownloads) restart = await serviceAction('restart');
  return {
    ok: Boolean(okDownloads && restart.ok),
    backup,
    updates,
    restart,
    status: await geoStatus(),
    stdout: concatOutput(...updates, restart)
  };
}

async function updateGeoLegacy(payload = {}) {
  let geoipUrl = String(payload.geoipUrl || '').trim();
  let geositeUrl = String(payload.geositeUrl || '').trim();
  let mode = 'custom';
  let target = '';
  const preset = geoPresets().find((item) => item.id === payload.preset);
  if (preset) {
    if (!preset.installable) return { ok: false, stderr: 'Этот источник добавлен как справочный и не устанавливается в Xray автоматически' };
    mode = preset.mode || 'replace';
    target = preset.target || '';
    geoipUrl = preset.geoipUrl;
    geositeUrl = preset.geositeUrl;
  }
  if (mode === 'extra-geosite') {
    if (!geositeUrl || !target) return { ok: false, stderr: 'Для дополнительного geosite-файла не задана ссылка или имя файла' };
    const geosite = await downloadGeoFile(target, geositeUrl);
    let restart = { ok: true, stdout: '' };
    if (geosite.ok) restart = await serviceAction('restart');
    return {
      ok: Boolean(geosite.ok && restart.ok),
      geosite,
      restart,
      status: await geoStatus(),
      stdout: concatOutput(geosite, restart)
    };
  }
  if (!geoipUrl || !geositeUrl) return { ok: false, stderr: 'Укажите ссылки на geoip.dat и geosite.dat' };
  const geoip = await downloadGeoFile('geoip.dat', geoipUrl);
  const geosite = await downloadGeoFile('geosite.dat', geositeUrl);
  let restart = { ok: true, stdout: '' };
  if (geoip.ok && geosite.ok) restart = await serviceAction('restart');
  return {
    ok: Boolean(geoip.ok && geosite.ok && restart.ok),
    geoip,
    geosite,
    restart,
    status: await geoStatus(),
    stdout: concatOutput(geoip, geosite, restart)
  };
}

async function cleanupGeoBackups() {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const prefixes = ['geoip.dat-', 'geosite.dat-', ...geoPresets().map((preset) => preset.target).filter(Boolean).map((target) => `${target}-`)];
  let deleted = 0;
  let freed = 0;
  for (const entry of entries) {
    if (entry.isDirectory() || !prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    const path = join(backupDir, entry.name);
    try {
      const info = await stat(path);
      await unlink(path);
      deleted += 1;
      freed += info.size;
    } catch {
      // Ignore files that disappeared between listing and deletion.
    }
  }
  return {
    ok: true,
    deleted,
    freed,
    status: await geoStatus(),
    stdout: `Удалено geo-бэкапов: ${deleted}, освобождено ${Math.round((freed / 1024 / 1024) * 10) / 10} MB`
  };
}

async function status() {
  const version = await command('xray', ['version'], 3000);
  const config = await readActiveConfig();
  const profileCount = (await listProfiles()).length;
  let service = { running: false, detail: 'команда управления сервисом недоступна' };

  if (process.platform === 'win32') {
    service = { running: true, detail: 'dev-mode: имитация сервиса' };
  } else {
    const procd = await command('/etc/init.d/' + serviceName, ['status'], 3000);
    const running = procd.ok && /running|active/i.test(`${procd.stdout} ${procd.stderr}`);
    service = {
      running,
      detail: procd.stdout || procd.stderr || procd.message
    };
    if (running) {
      const processUptime = await xrayProcessUptimeSeconds();
      if (processUptime.uptime > 0) {
        service.uptime = processUptime.uptime;
        service.pid = processUptime.pid;
      }
    }
  }

  return {
    app: {
      version: appVersion,
      asset: ruOpenRayAssetName(),
      arch: await systemArchitecture('github-release')
    },
    service,
    core: {
      available: version.ok,
      version: version.stdout.split('\n')[0] || 'xray не найден',
      detail: version.stderr || version.message
    },
    config: {
      path: activeConfigPath,
      inbounds: Array.isArray(config.inbounds) ? config.inbounds.length : 0,
      outbounds: Array.isArray(config.outbounds) ? config.outbounds.length : 0,
      routingRules: Array.isArray(config.routing?.rules) ? config.routing.rules.length : 0
    },
    profiles: profileCount,
    system: await systemMetrics(),
    uptime: process.uptime(),
    now: new Date().toISOString()
  };
}

function parseCpuLine(line = '') {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== 'cpu' || fields.length < 5) return null;
  const nums = fields.slice(1).map((field) => Number(field) || 0);
  const total = nums.reduce((sum, value) => sum + value, 0);
  const idle = (nums[3] || 0) + (nums[4] || 0);
  return { total, idle };
}

async function cpuMetrics() {
  const load = os.loadavg();
  const metric = {
    load1: load[0]?.toFixed?.(2) || '0.00',
    load5: load[1]?.toFixed?.(2) || '0.00',
    load15: load[2]?.toFixed?.(2) || '0.00',
    percent: null
  };
  try {
    const firstLine = (await readFile('/proc/stat', 'utf8')).split('\n')[0];
    const sample = parseCpuLine(firstLine);
    if (sample && previousCpuSample && sample.total > previousCpuSample.total) {
      const totalDelta = sample.total - previousCpuSample.total;
      const idleDelta = sample.idle - previousCpuSample.idle;
      metric.percent = Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
    }
    if (sample) previousCpuSample = sample;
  } catch {
    const cpus = os.cpus();
    metric.percent = null;
    if (!previousCpuSample && cpus.length) previousCpuSample = { total: 0, idle: 0 };
  }
  return metric;
}

async function memoryMetrics() {
  try {
    const values = {};
    const meminfo = await readFile('/proc/meminfo', 'utf8');
    for (const line of meminfo.split('\n')) {
      const match = line.match(/^([^:]+):\s+(\d+)/);
      if (match) values[match[1]] = Number(match[2]) * 1024;
    }
    const total = values.MemTotal || os.totalmem();
    const available = values.MemAvailable || values.MemFree || os.freemem();
    const used = Math.max(0, total - available);
    return { total, available, used, usedPercent: total ? Math.round((used / total) * 100) : 0 };
  } catch {
    const total = os.totalmem();
    const available = os.freemem();
    const used = Math.max(0, total - available);
    return { total, available, used, usedPercent: total ? Math.round((used / total) * 100) : 0 };
  }
}

async function tcpMetrics() {
  const readTcp = async (file) => {
    try {
      const lines = (await readFile(file, 'utf8')).trim().split('\n').slice(1);
      return {
        total: lines.filter(Boolean).length,
        established: lines.filter((line) => line.trim().split(/\s+/)[3] === '01').length
      };
    } catch {
      return { total: 0, established: 0 };
    }
  };
  const tcp4 = await readTcp('/proc/net/tcp');
  const tcp6 = await readTcp('/proc/net/tcp6');
  return { total: tcp4.total + tcp6.total, established: tcp4.established + tcp6.established };
}

async function conntrackMetrics() {
  const readConntrack = async (file) => {
    const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim());
    let tcp = 0;
    let udp = 0;
    for (const line of lines) {
      const protocol = line.trim().split(/\s+/)[2];
      if (protocol === 'tcp') tcp += 1;
      if (protocol === 'udp') udp += 1;
    }
    return { ok: true, path: file, total: lines.length, tcp, udp };
  };
  try {
    return await readConntrack('/proc/net/nf_conntrack');
  } catch {
    try {
      return await readConntrack('/proc/net/ip_conntrack');
    } catch {
      return { ok: false, path: '', total: 0, tcp: 0, udp: 0 };
    }
  }
}

async function trafficMetrics() {
  try {
    const dev = await readFile('/proc/net/dev', 'utf8');
    let rxBytes = 0;
    let txBytes = 0;
    for (const line of dev.split('\n')) {
      const [rawName, rawValues] = line.split(':');
      const name = rawName?.trim();
      if (!rawValues || !name || name === 'lo') continue;
      const values = rawValues.trim().split(/\s+/).map((value) => Number(value) || 0);
      rxBytes += values[0] || 0;
      txBytes += values[8] || 0;
    }
    return { rxBytes, txBytes };
  } catch {
    return { rxBytes: 0, txBytes: 0 };
  }
}

async function systemDiskMetrics() {
  const path = process.platform === 'win32' ? '.' : '/overlay';
  try {
    await stat(path);
    const info = await diskInfo(path);
    return { ...info, label: path === '/overlay' ? 'overlay' : path };
  } catch {
    const info = await diskInfo(process.platform === 'win32' ? '.' : '/');
    return { ...info, label: process.platform === 'win32' ? 'workspace' : '/' };
  }
}

async function routerUptimeMetrics() {
  try {
    const uptime = await readFile('/proc/uptime', 'utf8');
    return Number(uptime.trim().split(/\s+/)[0]) || 0;
  } catch {
    return os.uptime();
  }
}

async function processStartTicks(pid) {
  try {
    const line = await readFile(`/proc/${pid}/stat`, 'utf8');
    const end = line.lastIndexOf(')');
    if (end < 0) return 0;
    const fields = line.slice(end + 2).trim().split(/\s+/);
    return Number(fields[19] || 0);
  } catch {
    return 0;
  }
}

async function clockTicksPerSecond() {
  const result = await command('getconf', ['CLK_TCK'], 1000);
  const value = Number(String(result.stdout || '').trim());
  return value > 0 ? value : 100;
}

async function xrayProcessUptimeSeconds() {
  if (process.platform === 'win32') return { uptime: 0, pid: '' };
  const [entries, now, ticks] = await Promise.all([
    readdir('/proc', { withFileTypes: true }).catch(() => []),
    routerUptimeMetrics(),
    clockTicksPerSecond()
  ]);
  const names = new Set(['xray', serviceName].filter(Boolean));
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      const comm = (await readFile(`/proc/${entry.name}/comm`, 'utf8')).trim();
      if (!names.has(comm)) continue;
      const start = await processStartTicks(entry.name);
      const uptime = now - start / ticks;
      if (uptime > 0) return { uptime, pid: entry.name };
    } catch {
      // process exited between /proc reads
    }
  }
  return { uptime: 0, pid: '' };
}

async function tcpFastOpenStatus() {
  try {
    const raw = await readFile('/proc/sys/net/ipv4/tcp_fastopen', 'utf8');
    const value = Number(raw.trim() || 0);
    return {
      ok: true,
      available: true,
      enabled: (value & 1) === 1,
      serverEnabled: (value & 2) === 2,
      value,
      path: '/proc/sys/net/ipv4/tcp_fastopen',
      persistentPath: '/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf',
      recommendedValue: 3
    };
  } catch (error) {
    return { ok: false, available: false, enabled: false, value: 0, error: error.message };
  }
}

async function setTcpFastOpen(enabled = true) {
  if (process.platform === 'win32') {
    return { ok: true, available: true, enabled, stdout: 'dev-mode: TCP Fast Open будет настроен через sysctl на OpenWrt' };
  }
  const value = enabled ? '3' : '0';
  try {
    await writeFile('/proc/sys/net/ipv4/tcp_fastopen', `${value}\n`);
    const persistentPath = '/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf';
    await mkdir(dirname(persistentPath), { recursive: true });
    await writeFile(persistentPath, `net.ipv4.tcp_fastopen=${value}\n`);
    return { ...(await tcpFastOpenStatus()), ok: true, stdout: 'TCP Fast Open настроен в системе' };
  } catch (error) {
    return { ok: false, stderr: error.message, status: await tcpFastOpenStatus() };
  }
}

async function systemMetrics() {
  const [cpu, memory, tcp, conntrack, disk, traffic, uptime] = await Promise.all([
    cpuMetrics(),
    memoryMetrics(),
    tcpMetrics(),
    conntrackMetrics(),
    systemDiskMetrics(),
    trafficMetrics(),
    routerUptimeMetrics()
  ]);
  return { cpu, memory, tcp, conntrack, disk, traffic, uptime };
}

async function validateConfig(config = null) {
  const payload = config || (await readActiveConfig());
  JSON.stringify(payload);
  if (process.platform === 'win32') {
    return { ok: true, stdout: 'dev-mode: JSON корректен; бинарник xray на Windows не проверялся' };
  }
  const tmp = join(dataDir, `.test-${Date.now()}.json`);
  await writeFile(tmp, JSON.stringify(payload, null, 2));
  return command('xray', ['run', '-test', '-config', tmp], 10000);
}

async function fileExists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

function extDatFile(value = '') {
  const raw = String(value).trim().replace(/^ext:/, '').replace(/^"|"$/g, '');
  return raw.split(':')[0].trim();
}

async function analyzeConfig(config = null) {
  const payload = config || (await readActiveConfig());
  const outbounds = new Map((payload.outbounds || []).map((outbound) => [outbound.tag, outbound]));
  const rawBalancers = payload.routing?.balancers || [];
  const balancers = new Set(rawBalancers.map((balancer) => balancer.tag).filter(Boolean));
  const routingRules = payload.routing?.rules || [];
  const warnings = [];
  const errors = [];
  const info = [];
  const counts = { total: 0, proxy: 0, direct: 0, block: 0, other: 0 };
  const geoipPath = join(geoDir, 'geoip.dat');
  const geositePath = join(geoDir, 'geosite.dat');
  const geoipExists = await fileExists(geoipPath);
  const geositeExists = await fileExists(geositePath);
  const observatorySelectors = new Set(payload.observatory?.subjectSelector || []);
  for (const [index, balancer] of rawBalancers.entries()) {
    const strategy = balancer?.strategy?.type || 'random';
    const selectors = balancer?.selector || [];
    if (['leastPing', 'leastLoad'].includes(strategy) && !selectors.some((selector) => observatorySelectors.has(selector))) {
      warnings.push(`Балансировщик ${index + 1}: strategy ${strategy} требует observatory.subjectSelector`);
    }
  }
  for (const [index, rule] of routingRules.entries()) {
    counts.total += 1;
    const tag = String(rule.outboundTag || '').trim();
    const balancerTag = String(rule.balancerTag || '').trim();
    if (tag && balancerTag) errors.push(`Правило ${index + 1}: укажите outboundTag или balancerTag, но не оба сразу`);
    if (!tag && !balancerTag) warnings.push(`Правило ${index + 1}: не указан outboundTag или balancerTag`);
    else if (balancerTag && !balancers.has(balancerTag)) errors.push(`Правило ${index + 1}: balancerTag "${balancerTag}" не найден в routing.balancers`);
    else if (tag && !outbounds.has(tag)) errors.push(`Правило ${index + 1}: outboundTag "${tag}" не найден в outbounds`);
    if (balancerTag) counts.proxy += 1;
    else if (tag === 'direct') counts.direct += 1;
    else if (tag === 'block') counts.block += 1;
    else if (outbounds.has(tag) && !isSystemOutbound(outbounds.get(tag))) counts.proxy += 1;
    else counts.other += 1;
    if (rule.port === '0-65535' && !rule.domain && !rule.ip && !rule.source) info.push(`Правило ${index + 1}: default/catch-all идет в ${balancerTag ? `balancer:${balancerTag}` : (tag || 'не задано')}`);
    for (const domain of rule.domain || []) {
      const value = String(domain).trim();
      if (value.startsWith('geosite:') && !geositeExists) warnings.push(`Правило ${index + 1}: geosite требует ${geositePath}`);
      if (value.startsWith('ext:')) {
        const file = extDatFile(value);
        if (!file) warnings.push(`Правило ${index + 1}: ext-список указан без имени .dat файла`);
        else if (!(await fileExists(join(geoDir, file)))) warnings.push(`Правило ${index + 1}: ext-списку нужен ${join(geoDir, file)}`);
      }
    }
    for (const ip of rule.ip || []) {
      if (String(ip).trim().startsWith('geoip:') && !geoipExists) warnings.push(`Правило ${index + 1}: geoip требует ${geoipPath}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, info, counts };
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseShareLink(link) {
  const trimmed = String(link || '').trim();
  if (!trimmed) throw new Error('Пустая ссылка для импорта');
  const url = new URL(trimmed);
  if (url.protocol === 'vmess:') {
    const raw = JSON.parse(decodeBase64Url(url.pathname));
    return {
      tag: raw.ps || raw.add || 'vmess-out',
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: raw.add,
            port: Number(raw.port),
            users: [{ id: raw.id, alterId: Number(raw.aid || 0), security: raw.scy || 'auto' }]
          }
        ]
      },
      streamSettings: { network: raw.net || 'tcp', security: raw.tls || 'none' }
    };
  }

  const protocol = url.protocol.replace(':', '');
  if (!['vless', 'trojan', 'ss'].includes(protocol)) {
    throw new Error(`Неподдерживаемый протокол ссылки: ${protocol}`);
  }

  const tag = decodeURIComponent(url.hash.replace(/^#/, '')) || `${protocol}-out`;
  const address = url.hostname;
  const port = Number(url.port || 443);
  const query = Object.fromEntries(url.searchParams.entries());
  const network = query.type || 'tcp';
  const security = query.security || (protocol === 'trojan' ? 'tls' : 'none');

  if (protocol === 'trojan') {
    return {
      tag,
      protocol,
      settings: { servers: [{ address, port, password: decodeURIComponent(url.username) }] },
      streamSettings: { network, security }
    };
  }

  if (protocol === 'ss') {
    return {
      tag,
      protocol: 'shadowsocks',
      settings: {
        servers: [{ address, port, method: query.method || '2022-blake3-aes-128-gcm', password: decodeURIComponent(url.username) }]
      }
    };
  }

  return {
    tag,
    protocol,
    settings: {
      vnext: [
        {
          address,
          port,
          users: [{ id: decodeURIComponent(url.username), encryption: query.encryption || 'none', flow: query.flow || undefined }]
        }
      ]
    },
    streamSettings: {
      network,
      security,
      realitySettings: security === 'reality' ? { serverName: query.sni, publicKey: query.pbk, shortId: query.sid } : undefined,
      tlsSettings: security === 'tls' ? { serverName: query.sni || address } : undefined,
      wsSettings: network === 'ws' ? { path: query.path || '/', headers: query.host ? { Host: query.host } : undefined } : undefined
    }
  };
}

function outboundSummary(outbound) {
  const firstVnext = outbound?.settings?.vnext?.[0];
  const firstServer = outbound?.settings?.servers?.[0];
  return {
    tag: outbound.tag,
    protocol: outbound.protocol,
    address: firstVnext?.address || firstServer?.address || '',
    port: firstVnext?.port || firstServer?.port || '',
    network: outbound.streamSettings?.network || 'tcp',
    security: outbound.streamSettings?.security || 'none'
  };
}

function isSystemOutbound(outbound) {
  return ['direct', 'block', 'dns-out'].includes(outbound?.tag) || ['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
}

function tcpCheck(address, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = connect({ host: address, port: Number(port), timeout: timeoutMs }, () => {
      const latencyMs = Date.now() - started;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    socket.on('error', (error) => resolve({ ok: false, error: error.message }));
  });
}

async function checkOutbounds(payload = {}) {
  const config = await readActiveConfig();
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs) || 2500, 300), 15000);
  const attempts = Math.min(Math.max(Number(payload.attempts) || 1, 1), 5);
  const mode = ['endpoint', 'http'].includes(String(payload.mode || '').toLowerCase()) ? String(payload.mode).toLowerCase() : 'http';
  const url = String(payload.url || 'https://www.gstatic.com/generate_204');
  const filter = new Set(Array.isArray(payload.tags) ? payload.tags.map(String) : []);
  const results = [];
  for (const outbound of Array.isArray(config.outbounds) ? config.outbounds : []) {
    const summary = outboundSummary(outbound);
    if (filter.size && !filter.has(summary.tag)) continue;
    const result = { ...summary, checkedAt: new Date().toISOString(), port: Number(summary.port) || 0 };
    if (isSystemOutbound(outbound) || !summary.address || !result.port) {
      results.push({ ...result, ok: false, skipped: true, error: 'Нет TCP endpoint для проверки' });
      continue;
    }
    const samples = Math.max(attempts, 2);
    let best = null;
    let ok = false;
    let last = { ok: false, error: 'нет ответа' };
    for (let attempt = 0; attempt < samples; attempt += 1) {
      last = await tcpCheck(summary.address, result.port, timeoutMs);
      if (last.ok) {
        ok = true;
        best = best === null ? last.latencyMs : Math.min(best, last.latencyMs);
      }
    }
    results.push({ ...result, method: mode, endpointOk: ok, endpointLatencyMs: best ?? undefined, ok, latencyMs: best ?? undefined, error: ok ? undefined : last.error, url });
  }
  return { ok: true, timeoutMs, attempts, mode, url, results };
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function intToIp(value) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

async function resolveIPv4(value) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return value;
  const resolver = new Resolver();
  const ips = await resolver.resolve4(value);
  if (!ips.length) throw new Error(`IPv4 для ${value} не найден`);
  return ips[0];
}

function cidrHosts(targetIp, cidr, limit) {
  const bits = 32 - cidr;
  const mask = (0xffffffff << bits) >>> 0;
  const base = ipToInt(targetIp) & mask;
  const totalRaw = 2 ** bits;
  const total = Math.min(totalRaw, limit);
  const ips = [];
  for (let offset = 0; offset < total; offset += 1) {
    if (cidr < 31 && (offset === 0 || offset === totalRaw - 1)) continue;
    const ip = intToIp((base + offset) >>> 0);
    if (ip === targetIp) continue;
    ips.push(ip);
  }
  return { ips, network: `${intToIp(base)}/${cidr}` };
}

function proximity(ip, targetIp) {
  const diff = Math.abs(ipToInt(ip) - ipToInt(targetIp));
  return Math.max(0, 100 - Math.floor((diff * 100) / 256));
}

function probeSni(ip, targetIp, timeoutMs) {
  return new Promise((resolveProbe) => {
    const started = Date.now();
    const socket = tls.connect({
      host: ip,
      port: 443,
      timeout: timeoutMs,
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1']
    });
    const done = (result) => {
      socket.destroy();
      resolveProbe(result);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !Object.keys(cert).length) return done(null);
      const alt = String(cert.subjectaltname || '')
        .split(',')
        .map((item) => item.trim().replace(/^DNS:/, ''))
        .filter(Boolean);
      done({
        ip,
        domain: cert.subject?.CN || alt[0] || ip,
        issuer: cert.issuer?.CN || '',
        dnsNames: alt,
        latencyMs: Date.now() - started,
        proximity: proximity(ip, targetIp)
      });
    });
    socket.once('timeout', () => done(null));
    socket.once('error', () => done(null));
  });
}

async function scanSni(payload = {}) {
  const target = String(payload.target || '').trim();
  if (!target) throw new Error('Укажите IP или домен для поиска');
  const targetIp = await resolveIPv4(target);
  const cidr = Math.max(24, Math.min(32, Number(payload.cidr || 24)));
  const timeoutMs = Math.max(500, Math.min(8000, Number(payload.timeoutMs || 1500)));
  const threads = Math.max(1, Math.min(128, Number(payload.threads || 64)));
  const limit = Math.max(1, Math.min(1024, Number(payload.limit || 256)));
  const { ips, network } = cidrHosts(targetIp, cidr, limit);
  const results = [];
  for (let index = 0; index < ips.length; index += threads) {
    const chunk = ips.slice(index, index + threads);
    const found = await Promise.all(chunk.map((ip) => probeSni(ip, targetIp, timeoutMs)));
    results.push(...found.filter(Boolean));
  }
  results.sort((a, b) => b.proximity - a.proximity);
  return { ok: true, target, targetIp, cidr, network, scanned: ips.length, results };
}

function decodeSubscription(body) {
  const text = String(body || '').trim();
  if (!text) return [];
  const candidates = text.includes('://') ? [text] : [Buffer.from(text, 'base64').toString('utf8'), text];
  for (const candidate of candidates) {
    const links = candidate
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => /^(vless|vmess|trojan|ss):\/\//i.test(item));
    if (links.length) return links;
  }
  return [];
}

async function fetchSubscriptionLinks(rawUrl) {
  const parsed = new URL(String(rawUrl).trim());
  const headers = {};
  if (parsed.username || parsed.password) {
    const user = decodeURIComponent(parsed.username || '');
    const password = decodeURIComponent(parsed.password || '');
    parsed.username = '';
    parsed.password = '';
    headers.authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  const response = await fetch(parsed.toString(), { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Subscription HTTP ${response.status}`);
  return decodeSubscription(await response.text());
}

async function importPreview(payload) {
  if (payload.url) {
    const links = await fetchSubscriptionLinks(payload.url);
    const outbounds = [];
    const items = [];
    for (const link of links.slice(0, 50)) {
      const outbound = parseShareLink(link);
      outbounds.push(outbound);
      items.push(outboundSummary(outbound));
    }
    return {
      source: 'subscription',
      links: links.length,
      items,
      outbounds
    };
  }
  const outbound = parseShareLink(payload.link);
  return { source: 'link', links: 1, items: [outboundSummary(outbound)], outbound };
}

async function importLink(link, profileName = '') {
  const outbound = parseShareLink(link);
  const config = await readActiveConfig();
  config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  config.outbounds = config.outbounds.filter((item) => item.tag !== outbound.tag);
  config.outbounds.unshift(JSON.parse(JSON.stringify(outbound)));
  const path = profilePath(profileNameFallback(profileName, outbound.tag, 'server'));
  await writeFile(path, JSON.stringify(config, null, 2));
  return { outbound, profile: basename(path).replace(/\.json$/, '') };
}

async function importSubscription({ url, profileName = '' }) {
  const links = await fetchSubscriptionLinks(url);
  if (!links.length) throw new Error('В подписке не найдены поддерживаемые ссылки');
  const config = await readActiveConfig();
  config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  const imported = [];
  for (const link of links) {
    try {
      const outbound = parseShareLink(link);
      config.outbounds = config.outbounds.filter((item) => item.tag !== outbound.tag);
      config.outbounds.unshift(JSON.parse(JSON.stringify(outbound)));
      imported.push(outboundSummary(outbound));
    } catch {
      // Skip unsupported links and import the rest.
    }
  }
  if (!imported.length) throw new Error('Подписка есть, но поддерживаемых ссылок в ней не найдено');
  const path = profilePath(profileNameFallback(profileName, imported[0]?.tag, profileNameFromUrl(url), 'subscription'));
  await writeFile(path, JSON.stringify(config, null, 2));
  return { profile: basename(path).replace(/\.json$/, ''), imported };
}

async function dhcpLeases() {
  return (await dhcpLeaseReport()).leases;
}

async function dhcpLeaseReport() {
  const candidates = ['/tmp/dhcp.leases', '/var/dhcp.leases', join(dataDir, 'dhcp.leases')];
  for (const path of candidates) {
    try {
      const content = await readFile(path, 'utf8');
      const now = Math.floor(Date.now() / 1000);
      const leases = content
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts.length >= 4)
        .map(([expires, mac, ip, name]) => {
          const expiresAt = Number(expires || 0);
          return {
            expires: expiresAt,
            remaining: expiresAt > 0 ? Math.max(0, expiresAt - now) : 0,
            mac,
            ip,
            name: name === '*' ? '' : name,
            source: path
          };
        });
      return { ok: true, source: path, leases };
    } catch {
      // Try next lease location.
    }
  }
  return { ok: true, source: '', leases: [] };
}

async function checkDns({ server, host: checkHost = 'example.com' }) {
  const target = String(server || '').trim();
  const hostname = cleanDnsCheckHost(checkHost);
  const warnings = [];
  if (!target.startsWith('https://')) warnings.push('DNS не DoH: возможна видимость DNS-запросов у провайдера');
  try {
    const { a, aaaa } = await resolveViaDnsServer(target, hostname);
    return { ok: true, server: target, host: hostname, addresses: [...a, ...aaaa], a, aaaa, warnings };
  } catch (error) {
    return { ok: false, server: target, host: hostname, addresses: [], a: [], aaaa: [], warnings, error: error.message };
  }
}

function cleanDnsCheckHost(value = '') {
  let host = String(value || '').trim();
  if (!host) return 'example.com';
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Keep raw host fallback.
    }
  }
  host = host.trim().replace(/^\.+|\.+$/g, '');
  return host || 'example.com';
}

async function resolveViaDnsServer(server, host) {
  const target = String(server || '').trim();
  if (target.startsWith('https://')) {
    const [a, aaaa] = await Promise.all([
      dohLookup(target, host, 1).catch(() => []),
      dohLookup(target, host, 28).catch(() => [])
    ]);
    if (!a.length && !aaaa.length) throw new Error('DNS-сервер ответил, но A/AAAA-записей не найдено');
    return { a, aaaa };
  }
  const resolver = new Resolver();
  if (target && target !== 'system') {
    let address = target.replace(/^udp:\/\//i, '').replace(/^tcp:\/\//i, '');
    if (!address.includes(':')) address = `${address}:53`;
    resolver.setServers([address]);
  }
  const [a, aaaa] = await Promise.all([
    resolver.resolve4(host).catch(() => []),
    resolver.resolve6(host).catch(() => [])
  ]);
  if (!a.length && !aaaa.length) throw new Error('DNS-сервер ответил, но A/AAAA-записей не найдено');
  return { a, aaaa };
}

function dnsWireQuery(host, qtype) {
  const labels = host.replace(/\.$/, '').split('.');
  const parts = [Buffer.from([Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])];
  for (const label of labels) {
    const item = Buffer.from(label);
    if (!item.length || item.length > 63) throw new Error(`некорректный домен для DNS-проверки: ${host}`);
    parts.push(Buffer.from([item.length]), item);
  }
  const tail = Buffer.alloc(5);
  tail[0] = 0;
  tail.writeUInt16BE(qtype, 1);
  tail.writeUInt16BE(1, 3);
  parts.push(tail);
  return Buffer.concat(parts);
}

async function dohLookup(endpoint, host, qtype) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { accept: 'application/dns-message', 'content-type': 'application/dns-message' },
    body: dnsWireQuery(host, qtype),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`DoH HTTP ${response.status}`);
  return parseDnsWireAnswers(Buffer.from(await response.arrayBuffer()), qtype);
}

function skipDnsName(message, offset) {
  while (offset < message.length) {
    const length = message[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) return offset + 2;
    if ((length & 0xc0) !== 0) throw new Error('неподдерживаемое DNS-имя');
    offset += 1 + length;
  }
  throw new Error('поврежденное DNS-имя');
}

function parseDnsWireAnswers(message, qtype) {
  if (message.length < 12) throw new Error('короткий DNS-ответ');
  const qd = message.readUInt16BE(4);
  const an = message.readUInt16BE(6);
  let offset = 12;
  for (let i = 0; i < qd; i += 1) offset = skipDnsName(message, offset) + 4;
  const out = [];
  for (let i = 0; i < an; i += 1) {
    offset = skipDnsName(message, offset);
    if (offset + 10 > message.length) throw new Error('поврежденная DNS-запись');
    const type = message.readUInt16BE(offset);
    const klass = message.readUInt16BE(offset + 2);
    const rdlen = message.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + rdlen > message.length) throw new Error('поврежденные DNS-данные');
    const rdata = message.subarray(offset, offset + rdlen);
    if (klass === 1 && type === qtype) {
      if (type === 1 && rdlen === 4) out.push([...rdata].join('.'));
      if (type === 28 && rdlen === 16) {
        const chunks = [];
        for (let j = 0; j < 16; j += 2) chunks.push(rdata.readUInt16BE(j).toString(16));
        out.push(chunks.join(':'));
      }
    }
    offset += rdlen;
  }
  return out;
}

function parseLogTime(line = '') {
  const xrayStamp = line.match(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?/);
  if (xrayStamp) {
    const normalized = xrayStamp[0].replace(/\//g, '-').replace(' ', 'T').replace(/\.(\d{3})\d+$/, '.$1');
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  const systemStamp = line.slice(0, 24);
  const systemTime = Date.parse(systemStamp);
  if (Number.isFinite(systemTime)) return systemTime;
  return 0;
}

function filterLogLines(content, search = '', level = '', sort = 'asc', limit = 240) {
  const q = String(search || '').trim().toLowerCase();
  const lvl = String(level || '').trim().toLowerCase();
  const order = String(sort || 'asc').toLowerCase();
  const max = Math.min(2000, Math.max(20, Number(limit) || 240));
  const filtered = content.split(/\r?\n/)
    .map((line, index) => ({ line, index, when: parseLogTime(line), lower: line.toLowerCase() }))
    .filter((item) => {
      if (!item.line.trim()) return false;
      if (q && !item.lower.includes(q)) return false;
      if (lvl && lvl !== 'all' && !item.lower.includes(lvl)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.when === b.when) return b.index - a.index;
      if (!a.when) return 1;
      if (!b.when) return -1;
      return b.when - a.when;
    });
  const visible = filtered.slice(0, max);
  if (order !== 'desc') {
    visible.sort((a, b) => {
      if (a.when === b.when) return a.index - b.index;
      if (!a.when) return -1;
      if (!b.when) return 1;
      return a.when - b.when;
    });
  }
  return visible.map((item) => item.line).join('\n') || 'По выбранным фильтрам строки не найдены.';
}

async function logs({ kind = 'error', q = '', level = '', sort = 'asc', lines = 240 } = {}) {
  const candidates = [];
  const chunks = [];
  const settings = await loggingSettings().catch(() => ({}));
  if (kind === 'system' || kind === 'all') {
    const result = await command('logread', ['-e', 'xray'], 5000);
    if (result.stdout) {
      if (kind === 'system') return filterLogLines(result.stdout, q, level, sort, lines);
      chunks.push(result.stdout);
    }
  }
  if (kind === 'access' || kind === 'all') candidates.push(cleanLogPath(settings.accessPath, defaultAccessLogPath), defaultAccessLogPath, join(dataDir, 'access.log'));
  if (kind === 'error' || kind === 'all' || kind === 'system') candidates.push(cleanLogPath(settings.errorPath, defaultErrorLogPath), defaultErrorLogPath, join(dataDir, 'error.log'));
  for (const path of candidates) {
    try {
      const content = await readFile(path, 'utf8');
      chunks.push(content);
    } catch {
      // Try next log location.
    }
  }
  return chunks.length ? filterLogLines(chunks.join('\n'), q, level, sort, lines) : `Лог ${kind} пока не найден.`;
}

function cleanMonitorHost(value = '') {
  let host = String(value || '').trim().replace(/^[\[(]+|[\])"']+$/g, '').replace(/[.,;]+$/g, '');
  if (!host || host === '127.0.0.1' || host === '::1' || host.toLowerCase() === 'localhost') return '';
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Keep raw host fallback.
    }
  }
  if (host.includes(':')) host = splitHostPort(host).host;
  if (!host || /[/\\]/.test(host)) return '';
  return host.toLowerCase();
}

function splitHostPort(value = '') {
  const text = String(value || '').trim().replace(/^\[/, '').replace(/\]$/, '');
  const index = text.lastIndexOf(':');
  if (index <= 0 || index === text.length - 1) return { host: text, port: '' };
  return { host: text.slice(0, index).replace(/^\[/, '').replace(/\]$/, ''), port: text.slice(index + 1) };
}

function privateIp(value = '') {
  return /^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value);
}

function formatMonitorTime(timestamp, fallback = '') {
  if (timestamp) return new Date(timestamp).toLocaleTimeString('ru-RU', { hour12: false });
  return String(fallback || '').split('.')[0];
}

function parseB4sniTimestamp(value = '') {
  const match = String(value).match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return Date.now();
  const now = new Date();
  const stamp = new Date(now);
  stamp.setHours(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]));
  if (stamp.getTime() > Date.now() + 3600000) stamp.setDate(stamp.getDate() - 1);
  return stamp.getTime();
}

function parseB4sni(content = '', devices = new Map()) {
  return content.split(/\r?\n/).map((line) => {
    const parts = line.trim().split(',');
    if (parts.length < 5 || !/^\d{1,2}:\d{2}:\d{2}\.\d{3}$/.test(parts[0] || '')) return null;
    const protocol = String(parts[1] || '').trim().toUpperCase();
    if (!['TCP', 'UDP'].includes(protocol)) return null;
    const source = splitHostPort(parts[2]);
    const destination = splitHostPort(parts[3]);
    const host = cleanMonitorHost(parts.slice(4).join(','));
    if (!host) return null;
    const timestamp = parseB4sniTimestamp(parts[0]);
    return {
      time: formatMonitorTime(timestamp, parts[0]),
      timestamp,
      protocol,
      sourceIp: source.host,
      sourcePort: source.port,
      sourceDevice: devices.get(source.host) || '',
      destinationIp: destination.host,
      destinationPort: destination.port,
      host,
      source: 'b4sni',
      raw: line.trim()
    };
  }).filter(Boolean);
}

function parseXrayDomains(content = '', devices = new Map()) {
  const targetRe = /\b(tcp|udp):([^/\s,[\]()]+)(?::(\d+))?/gi;
  const privateRe = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::(\d+))?\b/;
  const outRe = /\[([A-Za-z0-9_.:-]+)\](?:\s|$)/;
  return content.split(/\r?\n/).map((line) => {
    const matches = [...line.matchAll(targetRe)];
    if (!matches.length) return null;
    let host = '';
    let port = '';
    let protocol = '';
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const candidate = cleanMonitorHost(matches[i][2]);
      if (!candidate || privateIp(candidate)) continue;
      host = candidate;
      port = matches[i][3] || '';
      protocol = String(matches[i][1] || '').toUpperCase();
      if (/[.-]/.test(candidate)) break;
    }
    if (!host) return null;
    const sourceMatch = line.match(privateRe);
    const source = splitHostPort(sourceMatch?.[0] || '');
    const timestamp = parseLogTime(line) || Date.now();
    return {
      time: formatMonitorTime(timestamp),
      timestamp,
      protocol,
      sourceIp: source.host,
      sourcePort: source.port,
      sourceDevice: devices.get(source.host) || '',
      destinationIp: /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : '',
      destinationPort: port,
      host,
      outbound: line.match(outRe)?.[1] || '',
      source: 'xray',
      raw: line
    };
  }).filter(Boolean);
}

function aggregateDomainMonitor(events = []) {
  const domains = new Map();
  const devices = new Map();
  for (const event of [...events].reverse()) {
    const domain = domains.get(event.host) || {
      host: event.host,
      hits: 0,
      tcp: 0,
      udp: 0,
      firstSeen: event.time,
      lastSeen: event.time,
      lastSeenTs: event.timestamp,
      protocols: new Set(),
      outbounds: new Set(),
      devices: new Map(),
      samples: []
    };
    domain.hits += 1;
    if (event.protocol === 'TCP') domain.tcp += 1;
    if (event.protocol === 'UDP') domain.udp += 1;
    if (event.protocol) domain.protocols.add(event.protocol);
    if (event.outbound) domain.outbounds.add(event.outbound);
    if (event.timestamp >= domain.lastSeenTs) {
      domain.lastSeenTs = event.timestamp;
      domain.lastSeen = event.time;
    }
    if (domain.samples.length < 3) domain.samples.push(event);
    const deviceKey = event.sourceIp || 'router';
    const device = domain.devices.get(deviceKey) || { ip: event.sourceIp, name: event.sourceDevice || event.sourceIp || 'router', hits: 0 };
    device.hits += 1;
    domain.devices.set(deviceKey, device);
    domains.set(event.host, domain);

    const deviceAgg = devices.get(deviceKey) || { ip: event.sourceIp, name: event.sourceDevice || event.sourceIp || 'router', hits: 0, protocols: new Set(), topDomains: new Map() };
    deviceAgg.hits += 1;
    if (event.protocol) deviceAgg.protocols.add(event.protocol);
    deviceAgg.topDomains.set(event.host, (deviceAgg.topDomains.get(event.host) || 0) + 1);
    devices.set(deviceKey, deviceAgg);
  }
  const domainRows = [...domains.values()].map((item) => ({
    host: item.host,
    hits: item.hits,
    tcp: item.tcp,
    udp: item.udp,
    firstSeen: item.firstSeen,
    lastSeen: item.lastSeen,
    lastSeenTs: item.lastSeenTs,
    protocols: [...item.protocols].sort(),
    outbounds: [...item.outbounds].sort(),
    devices: [...item.devices.values()].sort((a, b) => b.hits - a.hits),
    samples: item.samples
  })).sort((a, b) => b.hits - a.hits || b.lastSeenTs - a.lastSeenTs).slice(0, 160);
  const deviceRows = [...devices.values()].map((item) => ({
    ip: item.ip,
    name: item.name,
    hits: item.hits,
    protocols: [...item.protocols].sort(),
    topDomains: [...item.topDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([host, hits]) => ({ host, hits }))
  })).sort((a, b) => b.hits - a.hits);
  return { domains: domainRows, devices: deviceRows };
}

function monitorStats(events = [], domains = []) {
  const tcp = events.filter((event) => event.protocol === 'TCP').length;
  const udp = events.filter((event) => event.protocol === 'UDP').length;
  return {
    total: events.length,
    tcp,
    udp,
    uniqueDomains: domains.length,
    topDomain: domains[0]?.host || '',
    topHits: domains[0]?.hits || 0
  };
}

async function domainMonitor({ limit = 1000 } = {}) {
  const max = Math.min(4000, Math.max(100, Number(limit) || 1000));
  const runtime = await domainMonitorRuntime();
  if (!runtime.running) {
    return { ok: true, source: 'stopped', sourcePath: '', ...runtime, updatedAt: new Date().toISOString(), events: [], domains: [], devices: [], stats: monitorStats([], []) };
  }
  const leases = await dhcpLeases();
  const devices = new Map(leases.filter((lease) => lease.ip && lease.name).map((lease) => [lease.ip, lease.name]));
  const b4paths = [join(dataDir, 'b4sni.log'), '/var/log/ruopenray/b4sni.log', '/usr/share/xrayui/logs/b4sni.log', '/opt/share/xrayui/logs/b4sni.log'];
  for (const path of b4paths) {
    try {
      const content = await readFile(path, 'utf8');
      const events = parseB4sni(content, devices).slice(-max).sort((a, b) => b.timestamp - a.timestamp);
      if (events.length) {
        const aggregated = aggregateDomainMonitor(events);
        return { ok: true, source: 'b4sni', sourcePath: path, ...runtime, updatedAt: new Date().toISOString(), events, ...aggregated, stats: monitorStats(events, aggregated.domains) };
      }
    } catch {
      // Try next b4sni-compatible location.
    }
  }
  const content = await logs({ kind: 'all', sort: 'desc', lines: max });
  const events = parseXrayDomains(content, devices).slice(-max).sort((a, b) => b.timestamp - a.timestamp);
  const aggregated = aggregateDomainMonitor(events);
  return { ok: true, source: 'xray-access', sourcePath: 'xray/logread', ...runtime, updatedAt: new Date().toISOString(), events, ...aggregated, stats: monitorStats(events, aggregated.domains) };
}

async function domainMonitorRuntime() {
  let enabled = true;
  try {
    enabled = (await readFile(domainMonitorStatePath, 'utf8')).trim() !== '0';
  } catch {
    enabled = true;
  }
  return {
    running: enabled,
    enabled,
    external: false,
    available: false,
    service: '',
    hint: 'Dev-режим: RuOpenRay читает b4sni-совместимые файлы и локальные Xray logs.'
  };
}

async function controlDomainMonitor(action = '') {
  if (action === 'clear') {
    let deleted = 0;
    let freed = 0;
    for (const path of [join(dataDir, 'b4sni.log'), '/var/log/ruopenray/b4sni.log', '/usr/share/xrayui/logs/b4sni.log', '/opt/share/xrayui/logs/b4sni.log']) {
      try {
        const info = await stat(path);
        await unlink(path);
        deleted += 1;
        freed += info.size;
      } catch {
        // Optional compatibility paths.
      }
    }
    return { ok: true, deleted, freed, status: await domainMonitorRuntime(), stdout: `Очищено b4sni-логов: ${deleted}` };
  }
  if (!['start', 'stop'].includes(action)) return { ok: false, stderr: 'Неизвестное действие монитора', status: await domainMonitorRuntime() };
  await mkdir(dataDir, { recursive: true });
  await writeFile(domainMonitorStatePath, action === 'start' ? '1\n' : '0\n');
  return { ok: true, status: await domainMonitorRuntime(), stdout: action === 'start' ? 'SNI-монитор включен' : 'SNI-монитор остановлен' };
}

async function backupActive(prefix = 'config') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(backupDir, { recursive: true });
  const path = join(backupDir, `${prefix}-${stamp}.json`);
  await copyFile(activeConfigPath, path);
  return path;
}

async function latestBackup() {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue;
    const path = join(backupDir, entry.name);
    const info = await stat(path);
    backups.push({ path, name: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() });
  }
  backups.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  if (!backups[0]) throw new Error('бэкапы конфигурации пока не найдены');
  return backups[0];
}

async function restoreBackup(requestedPath = '') {
  let backupPath = String(requestedPath || '').trim();
  if (!backupPath) backupPath = (await latestBackup()).path;
  if (!backupPath.startsWith(backupDir)) backupPath = join(backupDir, basename(backupPath));
  const normalizedBackupDir = normalize(backupDir);
  const normalizedBackupPath = normalize(backupPath);
  if (!normalizedBackupPath.startsWith(normalizedBackupDir)) return { ok: false, stderr: 'можно восстановить только файл из backup-каталога' };
  const payload = JSON.parse(await readFile(normalizedBackupPath, 'utf8'));
  const test = await validateConfig(payload);
  const analysis = await analyzeConfig(payload);
  if (!test.ok) return { ok: false, test, analysis, stderr: 'backup не прошел xray -test' };
  const before = await backupActive('config-before-restore');
  await writeFile(activeConfigPath, JSON.stringify(payload, null, 2));
  const restart = await serviceAction('restart');
  return { ok: Boolean(restart.ok), path: normalizedBackupPath, backup: before, test, analysis, restart };
}

async function api(req, res, pathname) {
  if (pathname === '/api/login' && req.method === 'POST') {
    const payload = await bodyJson(req);
    if (!safeEqual(payload.password || '', authSecret)) return json(res, 401, { ok: false, error: 'Неверный пароль' });
    const session = randomBytes(24).toString('hex');
    sessions.add(session);
    res.setHeader('set-cookie', `openray_session=${encodeURIComponent(session)}; HttpOnly; SameSite=Lax; Path=/`);
    return json(res, 200, { ok: true, token: session });
  }

  if (!authed(req)) return json(res, 401, { ok: false, error: 'Требуется авторизация' });

  if (pathname === '/api/status') return json(res, 200, await status());
  if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, await readActiveConfig());
  if (pathname === '/api/config/test' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await validateConfig(payload.config || null));
  }
  if (pathname === '/api/config/analyze' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await analyzeConfig(payload.config || null));
  }
  if (pathname === '/api/config/apply' && req.method === 'POST') {
    const payload = await bodyJson(req);
    const test = await validateConfig(payload.config || null);
    const analysis = await analyzeConfig(payload.config || null);
    if (!test.ok) return json(res, 422, { ok: false, test, analysis });
    const backup = await backupActive('config-before-apply');
    if (payload.config) await writeFile(activeConfigPath, JSON.stringify(payload.config, null, 2));
    const restart = await serviceAction('restart');
    return json(res, 200, { ok: restart.ok, test, analysis, restart, backup });
  }
  if (pathname === '/api/service' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await serviceAction(payload.action));
  }
  if (pathname === '/api/settings/password' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await changePassword(payload));
  }
  if (pathname === '/api/settings/logging' && req.method === 'GET') return json(res, 200, await loggingSettings());
  if (pathname === '/api/settings/logging' && req.method === 'POST') return json(res, 200, await saveLoggingSettings(await bodyJson(req)));
  if (pathname === '/api/settings/logging/clear' && req.method === 'POST') return json(res, 200, await clearLogFiles());
  if (pathname === '/api/settings/service' && req.method === 'GET') return json(res, 200, await serviceSettings());
  if (pathname === '/api/settings/service' && req.method === 'POST') return json(res, 200, await saveServiceSettings(await bodyJson(req)));
  if (pathname === '/api/install/plan' && req.method === 'GET') return json(res, 200, await installPlan());
  if (pathname === '/api/network/tcp-fast-open' && req.method === 'GET') return json(res, 200, await tcpFastOpenStatus());
  if (pathname === '/api/network/tcp-fast-open' && req.method === 'POST') return json(res, 200, await setTcpFastOpen(boolPayload(await bodyJson(req), 'enabled', true)));
  if (pathname === '/api/firewall/status' && req.method === 'GET') return json(res, 200, { ok: true, available: false, active: false, persistent: false, routerMode: 'dev-mode', nftPath: '/etc/nftables.d/ruopenray.nft', hotplugPath: '/etc/hotplug.d/iface/90-ruopenray-tproxy' });
  if (pathname === '/api/firewall/apply' && req.method === 'POST') return json(res, 200, { ok: false, available: false, error: 'dev-mode: firewall applies only on OpenWrt' });
  if (pathname === '/api/firewall/disable' && req.method === 'POST') return json(res, 200, { ok: true, available: false, active: false, persistent: false });
  if (pathname === '/api/core/releases' && req.method === 'GET') return json(res, 200, await coreReleases());
  if (pathname === '/api/core/update' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await updateCore(String(payload.version || '').trim(), boolPayload(payload, 'backup', false)));
  }
  if (pathname === '/api/app/releases' && req.method === 'GET') return json(res, 200, await appRelease());
  if (pathname === '/api/app/update' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await updateApp(String(payload.version || '').trim(), boolPayload(payload, 'backup', false)));
  }
  if (pathname === '/api/geo/status' && req.method === 'GET') return json(res, 200, await geoStatus());
  if (pathname === '/api/geo/sources' && req.method === 'POST') return json(res, 200, await saveGeoCustomSources(await bodyJson(req)));
  if (pathname === '/api/geo/update' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await updateGeo(payload));
  }
  if (pathname === '/api/geo/schedule' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await saveGeoSchedule(payload));
  }
  if (pathname === '/api/geo/cleanup' && req.method === 'POST') return json(res, 200, await cleanupGeoBackups());
  if (pathname === '/api/profiles' && req.method === 'GET') return json(res, 200, await listProfiles());
  if (pathname === '/api/profiles' && req.method === 'POST') {
    const payload = await bodyJson(req);
    const path = profilePath(payload.name || 'profile');
    await writeFile(path, JSON.stringify(payload.config || (await readActiveConfig()), null, 2));
    return json(res, 200, { ok: true, profile: basename(path).replace(/\.json$/, '') });
  }
  if (pathname === '/api/profiles/activate' && req.method === 'POST') {
    const payload = await bodyJson(req);
    await copyFile(profilePath(payload.name), activeConfigPath);
    return json(res, 200, { ok: true, active: payload.name });
  }
  if (pathname === '/api/import' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, { ok: true, ...(await importLink(payload.link, payload.profileName)) });
  }
  if (pathname === '/api/import/preview' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, { ok: true, ...(await importPreview(payload)) });
  }
  if (pathname === '/api/import/subscription' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, { ok: true, ...(await importSubscription(payload)) });
  }
  if (pathname === '/api/dhcp/leases') return json(res, 200, await dhcpLeaseReport());
  if (pathname === '/api/dns/check' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await checkDns(payload));
  }
  if (pathname === '/api/outbounds/check' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await checkOutbounds(payload));
  }
  if (pathname === '/api/sni/scan' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await scanSni(payload));
  }
  if (pathname === '/api/domain-monitor' && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await domainMonitor({ limit: Number(url.searchParams.get('limit') || 1000) }));
  }
  if (pathname === '/api/domain-monitor' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await controlDomainMonitor(String(payload.action || '').trim()));
  }
  if (pathname === '/api/logs') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return text(res, 200, await logs({
      kind: url.searchParams.get('kind') || 'error',
      q: url.searchParams.get('q') || '',
      level: url.searchParams.get('level') || '',
      sort: url.searchParams.get('sort') || 'asc',
      lines: Number(url.searchParams.get('lines') || 240)
    }));
  }
  if (pathname === '/api/backup' && req.method === 'POST') return json(res, 200, { ok: true, path: await backupActive() });
  if (pathname === '/api/backup/full' && req.method === 'POST') return json(res, 200, { ok: true, path: await backupActive('full-dev') });
  if (pathname === '/api/backup/latest' && req.method === 'GET') return json(res, 200, { ok: true, backup: await latestBackup() });
  if (pathname === '/api/backup/restore' && req.method === 'POST') {
    const payload = await bodyJson(req);
    return json(res, 200, await restoreBackup(payload.path || ''));
  }

  return json(res, 404, { ok: false, error: 'Неизвестный API-маршрут' });
}

async function staticFile(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const path = normalize(join(publicDir, requested));
  if (!path.startsWith(publicDir)) return text(res, 403, 'Forbidden');
  try {
    const type = contentTypes.get(extname(path)) || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    createReadStream(path).pipe(res);
  } catch {
    text(res, 404, 'Not found');
  }
}

await ensureData();

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    return await staticFile(req, res, pathname);
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}).listen(port, host, () => {
  console.log(`RuOpenRay UI listening on http://${host}:${port}`);
});
