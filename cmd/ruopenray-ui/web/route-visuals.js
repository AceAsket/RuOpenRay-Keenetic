const presetIcons = {
  aiDev: ['AI', 'ai'],
  antifilterFull: ['AF', 'runet'],
  chatgpt: ['AI', 'ai'],
  claude: ['CL', 'ai'],
  directLan: ['LAN', 'direct'],
  discord: ['DS', 'discord'],
  discordFull: ['DS', 'discord'],
  discordRtc: ['RTC', 'discord'],
  discordVoice: ['VO', 'discord'],
  facebook: ['F', 'facebook'],
  familyDirect: ['LAN', 'direct'],
  geminiAi: ['G', 'google'],
  github: ['GH', 'dev'],
  cloudflareCdn: ['CF', 'media'],
  googleFull: ['G', 'google'],
  googleNetwork: ['G', 'google'],
  googleWebRtcFallback: ['RTC', 'google'],
  instagram: ['IG', 'meta'],
  intel: ['IN', 'intel'],
  kinopubIps: ['KP', 'media'],
  linkedin: ['IN', 'linkedin'],
  mediaComms: ['M', 'media'],
  meta: ['M', 'meta'],
  metaFull: ['M', 'meta'],
  microsoftFull: ['MS', 'microsoft'],
  netflix: ['NF', 'media'],
  nintendoEshop: ['N', 'nintendo'],
  openaiIps: ['AI', 'ai'],
  patreon: ['PT', 'media'],
  ruMinimal: ['RU', 'runet'],
  speedtestOokla: ['ST', 'speedtest'],
  telegram: ['TG', 'telegram'],
  telegramCalls: ['CALL', 'telegram'],
  telegramFull: ['TG', 'telegram'],
  telegramMtproto: ['MT', 'telegram'],
  tiktok: ['TT', 'media'],
  torrentTrackers: ['TR', 'torrent'],
  tuya: ['TY', 'tuya'],
  tuyaSmartLife: ['TY', 'tuya'],
  whatsapp: ['WA', 'meta'],
  xTwitter: ['X', 'media'],
  xrayuiBasic: ['XR', 'runet'],
  youtube: ['YT', 'youtube'],
};

const titleIconHints = [
  [/youtube|ютуб/i, ['YT', 'youtube']],
  [/discord|дискорд/i, ['DS', 'discord']],
  [/telegram|телеграм/i, ['TG', 'telegram']],
  [/instagram|инстаграм/i, ['IG', 'meta']],
  [/whatsapp|ватсап/i, ['WA', 'meta']],
  [/facebook|фейсбук/i, ['F', 'facebook']],
  [/meta/i, ['M', 'meta']],
  [/linkedin/i, ['IN', 'linkedin']],
  [/patreon/i, ['PT', 'media']],
  [/speedtest|ookla/i, ['ST', 'speedtest']],
  [/microsoft|windows|xbox/i, ['MS', 'microsoft']],
  [/intel/i, ['IN', 'intel']],
  [/google|gemini/i, ['G', 'google']],
  [/github/i, ['GH', 'dev']],
  [/twitter|\bx\b/i, ['X', 'media']],
  [/tiktok/i, ['TT', 'media']],
  [/torrent|tracker|rutracker|rutor|kinozal|nnm|lostfilm|tapochek/i, ['TR', 'torrent']],
  [/tuya|smart life/i, ['TY', 'tuya']],
  [/netflix/i, ['NF', 'media']],
  [/cloudflare|cdn/i, ['CF', 'media']],
  [/claude|anthropic/i, ['CL', 'ai']],
  [/chatgpt|openai|ai|dev/i, ['AI', 'ai']],
  [/nintendo|eshop/i, ['N', 'nintendo']],
  [/kino|media|кино|медиа/i, ['KP', 'media']],
  [/direct|lan|локаль|семейн/i, ['LAN', 'direct']],
  [/ru|рф|runet|antifilter/i, ['RU', 'runet']],
];

function presetIconPair(key, preset = {}) {
  if (presetIcons[key]) return presetIcons[key];
  const title = `${preset.title || ''} ${preset.detail || ''}`;
  const found = titleIconHints.find(([pattern]) => pattern.test(title));
  return found ? found[1] : ['R', 'default'];
}

export function routePresetExportIcon(key, preset = {}) {
  const objectIcon = preset.icon && typeof preset.icon === 'object' && !Array.isArray(preset.icon) ? preset.icon : null;
  if (objectIcon?.type === 'svg' && safeInlineSvg(objectIcon.svg)) {
    const icon = {
      type: 'svg',
      svg: String(objectIcon.svg)
    };
    const { background, foreground } = routePresetIconColors(key, preset, objectIcon);
    if (background) icon.background = background;
    if (foreground) icon.foreground = foreground;
    return icon;
  }
  const iconify = normalizeIconifyIcon(objectIcon?.name || preset.icon || preset.iconify || preset.iconUrl || '');
  if (iconify) return iconify;
  const [, tone] = presetIconPair(key, preset);
  const fallbackSvg = presetIconSvg(String(key || '').replace(/^(custom|external):/, ''), tone);
  return fallbackSvg && safeInlineSvg(fallbackSvg) ? { type: 'svg', svg: fallbackSvg } : '';
}

export function routePresetIconView(escapeHtml, key, preset = {}, className = '') {
  const objectIcon = preset.icon && typeof preset.icon === 'object' && !Array.isArray(preset.icon) ? preset.icon : null;
  if (objectIcon?.type === 'svg' && safeInlineSvg(objectIcon.svg)) {
    const svg = String(objectIcon.svg);
    const brandClass = svg.includes('brand-icon') ? 'route-preset-icon-brand' : '';
    const { background, foreground } = routePresetIconColors(key, preset, objectIcon);
    const framedClass = brandClass && background ? 'route-preset-icon-framed' : '';
    const style = [
      background ? `--route-icon-bg:${escapeHtml(background)}` : '',
      foreground ? `--route-icon-fg:${escapeHtml(foreground)}` : ''
    ].filter(Boolean).join(';');
    return `<span class="route-preset-icon route-preset-inline-svg ${brandClass} ${framedClass} ${className}" ${style ? `style="${style}"` : ''} aria-hidden="true">${svg}</span>`;
  }
  const iconify = normalizeIconifyIcon(objectIcon?.name || preset.icon || preset.iconify || preset.iconUrl || '');
  if (iconify) {
    return `<span class="route-preset-icon route-preset-iconify ${className}" style="--route-icon-url: url('https://api.iconify.design/${escapeHtml(iconify)}.svg')" aria-hidden="true"><span class="route-preset-iconify-glyph"></span></span>`;
  }
  const [label, tone] = presetIconPair(key, preset);
  const icon = presetIconSvg(key, tone);
  const brandClass = icon && icon.includes('brand-icon') ? 'route-preset-icon-brand' : '';
  return `<span class="route-preset-icon tone-${escapeHtml(tone)} ${brandClass} ${className}" aria-hidden="true">${icon || `<span class="route-preset-text">${escapeHtml(label)}</span>`}</span>`;
}

function safeInlineSvg(value = '') {
  const svg = String(value || '');
  return svg.length <= 20000
    && /<svg[\s>]/i.test(svg)
    && !/<\s*(script|iframe|object|embed|foreignObject|audio|video|canvas|link|meta|style)\b/i.test(svg)
    && !/on[a-z]+\s*=|javascript:/i.test(svg);
}

function safeIconColor(value = '') {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(color) || /^[a-zA-Z][a-zA-Z0-9_-]{0,24}$/.test(color) ? color : '';
}

function routePresetIconColors(key, preset = {}, objectIcon = {}) {
  const background = safeIconColor(objectIcon.background);
  const foreground = safeIconColor(objectIcon.foreground);
  const hint = `${key || ''} ${preset.title || ''} ${preset.detail || ''}`.toLowerCase();
  if (/chatgpt|openai/.test(hint)) {
    return {
      background: background || '#10a37f',
      foreground: foreground || '#ffffff'
    };
  }
  return { background, foreground };
}

export function normalizeIconifyIcon(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
  if (direct) return `${direct[1].toLowerCase()}:${direct[2].toLowerCase()}`;
  try {
    const url = new URL(raw);
    if (url.hostname !== 'icon-sets.iconify.design') return '';
    const parts = url.pathname.split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const [prefix, name] = parts;
    if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) return '';
    return `${prefix.toLowerCase()}:${name.toLowerCase()}`;
  } catch {
    return '';
  }
  return '';
}

function presetIconSvg(key, tone) {
  const group = key.toLowerCase();
  if (group.includes('youtube')) return iconYoutube();
  if (group.includes('discord')) return iconDiscord();
  if (group.includes('telegram')) return iconTelegram();
  if (group.includes('instagram')) return iconCamera();
  if (group.includes('whatsapp')) return iconChat();
  if (group.includes('facebook')) return iconFacebook();
  if (group.includes('meta')) return iconMeta();
  if (group.includes('linkedin')) return iconLinkedIn();
  if (group.includes('patreon')) return iconPatreon();
  if (group.includes('speedtest') || group.includes('ookla')) return iconSpeedtest();
  if (group.includes('microsoft')) return iconMicrosoft();
  if (group.includes('intel')) return iconIntel();
  if (group.includes('github')) return iconGitHub();
  if (group.includes('xtwitter')) return iconX();
  if (group.includes('tiktok')) return iconTikTok();
  if (group.includes('torrent') || group.includes('tracker') || tone === 'torrent') return iconTorrentTrackers();
  if (group.includes('tuya')) return iconTuya();
  if (group.includes('netflix')) return iconNetflix();
  if (group.includes('cloudflare')) return iconCloudflare();
  if (group.includes('google') || group.includes('gemini')) return iconGoogle();
  if (group.includes('claude')) return iconClaude();
  if (group.includes('chatgpt') || group.includes('openai') || tone === 'ai') return iconAi();
  if (group.includes('nintendo')) return iconGamepad();
  if (group.includes('direct') || group.includes('family') || tone === 'direct') return iconLan();
  if (group.includes('ruminimal')) return iconRussiaFlag();
  if (group.includes('antifilter') || group.includes('r minimal') || tone === 'runet') return iconRunet();
  if (group.includes('kino')) return iconKinoPub();
  if (tone === 'media') return iconMedia();
  return '';
}

function svg(body) {
  return `<svg viewBox="0 0 24 24" focusable="false">${body}</svg>`;
}

function brandSvg(viewBox, body) {
  return `<svg class="brand-icon" viewBox="${viewBox}" focusable="false">${body}</svg>`;
}

function iconYoutube() {
  return brandSvg('0 0 256 180', '<path fill="red" d="M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134"></path><path fill="#fff" d="m102.421 128.06l66.328-38.418l-66.328-38.418z"></path>');
}

function iconGitHub() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#181717"></rect><path fill="#fff" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2c-3.14.68-3.8-1.35-3.8-1.35c-.51-1.3-1.25-1.65-1.25-1.65c-1.02-.7.08-.68.08-.68c1.13.08 1.73 1.16 1.73 1.16c1 .1 1.72.06 2.24-.32c.1-.73.4-1.23.72-1.52c-2.5-.28-5.14-1.25-5.14-5.57c0-1.23.44-2.24 1.16-3.03c-.12-.29-.5-1.44.11-3c0 0 .95-.3 3.1 1.16A10.7 10.7 0 0 1 12 5.02c.96 0 1.93.13 2.83.38c2.15-1.46 3.1-1.16 3.1-1.16c.61 1.56.23 2.71.11 3a4.35 4.35 0 0 1 1.16 3.03c0 4.33-2.64 5.28-5.15 5.56c.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8z"></path>');
}

function iconX() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#050505"></rect><path fill="#fff" d="M13.86 10.47L20.82 2.5h-1.65l-6.04 6.91L8.3 2.5H2.74l7.3 10.44l-7.3 8.56h1.65l6.38-7.49l5.1 7.49h5.56zm-2.26 2.64l-.74-1.04L4.98 3.72H7.5l4.75 6.76l.74 1.04l6.18 8.8h-2.52z"></path>');
}

function iconTikTok() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#050505"></rect><path fill="#25f4ee" d="M14.6 2.2c.35 2.42 1.7 3.86 4.05 4.01v2.75a7.1 7.1 0 0 1-4.01-1.24v6.64c0 8.43-9.2 8.05-10.83 3.66c-1.05-2.8.4-6.97 5.37-7.14v2.9c-.82.13-1.7.43-2.17 1.02c-1.03 1.27-.72 3.55 1.1 4.02c3.28.85 3.77-2.6 3.77-4.44V2.2z"></path><path fill="#fe2c55" d="M15.35 2.2c.35 2.42 1.7 3.86 4.05 4.01v2.75a7.1 7.1 0 0 1-4.01-1.24v6.64c0 8.43-9.2 8.05-10.83 3.66c-.27-.72-.34-1.52-.2-2.28c.36 1.22 1.25 2.21 2.5 2.54c3.28.85 3.77-2.6 3.77-4.44V2.2z"></path>');
}

function iconTorrentTrackers() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#17b26a"></rect><path fill="#062319" d="M13.684 23.94a12.01 12.01 0 0 0 9.599-7.79c-.118.044-.26.096-.432.147c-2 .59-3.404-.466-3.687-.649c-.283-.18-.587-.48-.643-.464c-.183 1.132-1.218 2.706-3.58 3.42c-1.295.391-2.687.4-3.681-.157l.328.822c.13.328.351.866.488 1.192c0 0 .858 2.044 1.608 3.48M2.723 7.153l3.54-.66c.323-.059.68.124.794.407l2.432 6.07c.332.633.399.773.615 1.043c0 0 1.68 2.398 4.24 1.812c1.726-.394 2.532-1.69 2.587-2.612c.057-.296-.032-.669-.185-1.016L13.832 5.61c-.117-.266.022-.527.306-.581l2.953-.55a.69.69 0 0 1 .706.376l3.227 6.91c.13.276.394.712.588.966c0 0 .671.964 1.747.78c.266 0 .569-.143.569-.143q.071-.645.072-1.31c0-6.627-5.373-12-12.002-12C5.372.06 0 5.433 0 12.06c0 5.319 3.46 9.827 8.252 11.402a25 25 0 0 1-.919-2.121L2.298 7.808c-.111-.297.083-.59.425-.654"></path>');
}

function iconTuya() {
  return brandSvg('0 0 24 24', '<circle cx="12" cy="12" r="12" fill="#22c7a6"></circle><path fill="#031010" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m2.611 14.365a1.7 1.7 0 0 1-.626.059a6.7 6.7 0 0 1-1.187-.051a3.17 3.17 0 0 1-2.003-1.241a3.3 3.3 0 0 1-.632-2.05c.02-.603.045-1.206.066-1.808h-.887a.81.81 0 0 1-.766-.72a.884.884 0 0 1 .813-.964h.897c.014-.384.022-.768.041-1.151a.884.884 0 0 1 .941-.795a.813.813 0 0 1 .749.803c-.008.382-.025.764-.037 1.147h2.4a.81.81 0 0 1 .782.721a.884.884 0 0 1-.835.97h-2.41l-.067 1.758a1.65 1.65 0 0 0 .429 1.205a1.56 1.56 0 0 0 1.105.494c.342.006.685 0 1.027 0a.81.81 0 0 1 .746.717a.88.88 0 0 1-.546.906m1.479-6.427a.33.33 0 0 1-.274-.059a.34.34 0 0 1-.144-.22a.8.8 0 0 0-.081-.502a.63.63 0 0 0-.542-.321h-.036a.7.7 0 0 0-.233.052a.4.4 0 0 1-.217.034a.33.33 0 0 1-.248-.181a.33.33 0 0 1-.014-.301c.077-.183.301-.241.526-.284a1.34 1.34 0 0 1 1.082.309a1.36 1.36 0 0 1 .455 1.174a.35.35 0 0 1-.277.298Zm1.847-.324a.345.345 0 0 1-.414.277a.35.35 0 0 1-.277-.383a2.11 2.11 0 0 0-2.093-2.382a2 2 0 0 0-.589.086a2 2 0 0 0-.201.073a.45.45 0 0 1-.375.051a.35.35 0 0 1-.089-.597a2.5 2.5 0 0 1 .883-.282a2.802 2.802 0 0 1 3.152 3.158Z"></path>');
}

function iconNetflix() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#111"></rect><path fill="#e50914" d="M6.2 3h3.2l5.2 14.2V3h3.2v18h-3.25L9.4 6.9V21H6.2z"></path><path fill="#b00610" d="M9.4 3h3.15l5.25 18h-3.25z"></path>');
}

function iconCloudflare() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#f38020"></rect><path fill="#fff" d="M16.9 15.8H6.35a2.55 2.55 0 0 1-.26-5.09A4.8 4.8 0 0 1 15.3 8.9a3.25 3.25 0 0 1 4.18 3.11a2 2 0 0 1-.58 3.79z"></path><path fill="#faae40" d="M18.7 13.3h-8.25c-.32 0-.42-.42-.13-.57l8.86-4.2a3.24 3.24 0 0 0-3.88.37a4.8 4.8 0 0 0-9.2 1.81a2.55 2.55 0 0 0 .25 5.09h10.54a2 2 0 0 0 1.81-2.5z"></path>');
}

function iconDiscord() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#5865f2" rx="60"></rect><path fill="#fff" d="M197.308 64.797a165 165 0 0 0-40.709-12.627a.62.62 0 0 0-.654.31c-1.758 3.126-3.706 7.206-5.069 10.412c-15.373-2.302-30.666-2.302-45.723 0c-1.364-3.278-3.382-7.286-5.148-10.412a.64.64 0 0 0-.655-.31a164.5 164.5 0 0 0-40.709 12.627a.6.6 0 0 0-.268.23c-25.928 38.736-33.03 76.52-29.546 113.836a.7.7 0 0 0 .26.468c17.106 12.563 33.677 20.19 49.94 25.245a.65.65 0 0 0 .702-.23c3.847-5.254 7.276-10.793 10.217-16.618a.633.633 0 0 0-.347-.881c-5.44-2.064-10.619-4.579-15.601-7.436a.642.642 0 0 1-.063-1.064a86 86 0 0 0 3.098-2.428a.62.62 0 0 1 .646-.088c32.732 14.944 68.167 14.944 100.512 0a.62.62 0 0 1 .655.08a80 80 0 0 0 3.106 2.436a.642.642 0 0 1-.055 1.064a102.6 102.6 0 0 1-15.609 7.428a.64.64 0 0 0-.339.889a133 133 0 0 0 10.208 16.61a.64.64 0 0 0 .702.238c16.342-5.055 32.913-12.682 50.02-25.245a.65.65 0 0 0 .26-.46c4.17-43.141-6.985-80.616-29.571-113.836a.5.5 0 0 0-.26-.238M94.834 156.142c-9.855 0-17.975-9.047-17.975-20.158s7.963-20.158 17.975-20.158c10.09 0 18.131 9.127 17.973 20.158c0 11.111-7.962 20.158-17.973 20.158m66.456 0c-9.855 0-17.974-9.047-17.974-20.158s7.962-20.158 17.974-20.158c10.09 0 18.131 9.127 17.974 20.158c0 11.111-7.884 20.158-17.974 20.158"></path>');
}

function iconTelegram() {
  return brandSvg('0 0 256 256', '<path fill="#229ed9" d="M128 0C94.06 0 61.48 13.494 37.5 37.49A128.04 128.04 0 0 0 0 128c0 33.934 13.5 66.514 37.5 90.51C61.48 242.506 94.06 256 128 256s66.52-13.494 90.5-37.49c24-23.996 37.5-56.576 37.5-90.51s-13.5-66.514-37.5-90.51C194.52 13.494 161.94 0 128 0"></path><path fill="#fff" d="M57.94 126.648q55.98-24.384 74.64-32.152c35.56-14.786 42.94-17.354 47.76-17.441c1.06-.017 3.42.245 4.96 1.49c1.28 1.05 1.64 2.47 1.82 3.467c.16.996.38 3.266.2 5.038c-1.92 20.24-10.26 69.356-14.5 92.026c-1.78 9.592-5.32 12.808-8.74 13.122c-7.44.684-13.08-4.912-20.28-9.63c-11.26-7.386-17.62-11.982-28.56-19.188c-12.64-8.328-4.44-12.906 2.76-20.386c1.88-1.958 34.64-31.748 35.26-34.45c.08-.338.16-1.598-.6-2.262c-.74-.666-1.84-.438-2.64-.258c-1.14.256-19.12 12.152-54 35.686c-5.1 3.508-9.72 5.218-13.88 5.128c-4.56-.098-13.36-2.584-19.9-4.708c-8-2.606-14.38-3.984-13.82-8.41c.28-2.304 3.46-4.662 9.52-7.072"></path>');
}

function iconCamera() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#e4405f" rx="60"></rect><path fill="#fff" d="M128.009 28c-27.158 0-30.567.119-41.233.604c-10.646.488-17.913 2.173-24.271 4.646c-6.578 2.554-12.157 5.971-17.715 11.531c-5.563 5.559-8.98 11.138-11.542 17.713c-2.48 6.36-4.167 13.63-4.646 24.271c-.477 10.667-.602 14.077-.602 41.236s.12 30.557.604 41.223c.49 10.646 2.175 17.913 4.646 24.271c2.556 6.578 5.973 12.157 11.533 17.715c5.557 5.563 11.136 8.988 17.709 11.542c6.363 2.473 13.631 4.158 24.275 4.646c10.667.485 14.073.604 41.23.604c27.161 0 30.559-.119 41.225-.604c10.646-.488 17.921-2.173 24.284-4.646c6.575-2.554 12.146-5.979 17.702-11.542c5.563-5.558 8.979-11.137 11.542-17.712c2.458-6.361 4.146-13.63 4.646-24.272c.479-10.666.604-14.066.604-41.225s-.125-30.567-.604-41.234c-.5-10.646-2.188-17.912-4.646-24.27c-2.563-6.578-5.979-12.157-11.542-17.716c-5.562-5.562-11.125-8.979-17.708-11.53c-6.375-2.474-13.646-4.16-24.292-4.647c-10.667-.485-14.063-.604-41.23-.604zm-8.971 18.021c2.663-.004 5.634 0 8.971 0c26.701 0 29.865.096 40.409.575c9.75.446 15.042 2.075 18.567 3.444c4.667 1.812 7.994 3.979 11.492 7.48c3.5 3.5 5.666 6.833 7.483 11.5c1.369 3.52 3 8.812 3.444 18.562c.479 10.542.583 13.708.583 40.396s-.104 29.855-.583 40.396c-.446 9.75-2.075 15.042-3.444 18.563c-1.812 4.667-3.983 7.99-7.483 11.488c-3.5 3.5-6.823 5.666-11.492 7.479c-3.521 1.375-8.817 3-18.567 3.446c-10.542.479-13.708.583-40.409.583c-26.702 0-29.867-.104-40.408-.583c-9.75-.45-15.042-2.079-18.57-3.448c-4.666-1.813-8-3.979-11.5-7.479s-5.666-6.825-7.483-11.494c-1.369-3.521-3-8.813-3.444-18.563c-.479-10.542-.575-13.708-.575-40.413s.096-29.854.575-40.396c.446-9.75 2.075-15.042 3.444-18.567c1.813-4.667 3.983-8 7.484-11.5s6.833-5.667 11.5-7.483c3.525-1.375 8.819-3 18.569-3.448c9.225-.417 12.8-.542 31.437-.563zm62.351 16.604c-6.625 0-12 5.37-12 11.996c0 6.625 5.375 12 12 12s12-5.375 12-12s-5.375-12-12-12zm-53.38 14.021c-28.36 0-51.354 22.994-51.354 51.355s22.994 51.344 51.354 51.344c28.361 0 51.347-22.983 51.347-51.344c0-28.36-22.988-51.355-51.349-51.355zm0 18.021c18.409 0 33.334 14.923 33.334 33.334c0 18.409-14.925 33.334-33.334 33.334s-33.333-14.925-33.333-33.334c0-18.411 14.923-33.334 33.333-33.334"></path>');
}

function iconChat() {
  return brandSvg('0 0 256 258', '<path fill="#1faf38" d="M5.463 127.456c-.006 21.677 5.658 42.843 16.428 61.499L4.433 252.697l65.232-17.104a123 123 0 0 0 58.8 14.97h.054c67.815 0 123.018-55.183 123.047-123.01c.013-32.867-12.775-63.773-36.009-87.025c-23.23-23.25-54.125-36.061-87.043-36.076c-67.823 0-123.022 55.18-123.05 123.004"></path><path fill="#fff" d="M1.07 127.416c-.007 22.457 5.86 44.38 17.014 63.704L0 257.147l67.571-17.717c18.618 10.151 39.58 15.503 60.91 15.511h.055c70.248 0 127.434-57.168 127.464-127.423c.012-34.048-13.236-66.065-37.3-90.15C194.633 13.286 162.633.014 128.536 0C58.276 0 1.099 57.16 1.071 127.416m40.24 60.376l-2.523-4.005c-10.606-16.864-16.204-36.352-16.196-56.363C22.614 69.029 70.138 21.52 128.576 21.52c28.3.012 54.896 11.044 74.9 31.06c20.003 20.018 31.01 46.628 31.003 74.93c-.026 58.395-47.551 105.91-105.943 105.91h-.042c-19.013-.01-37.66-5.116-53.922-14.765l-3.87-2.295l-40.098 10.513z"></path><path fill="#fff" d="M96.678 74.148c-2.386-5.303-4.897-5.41-7.166-5.503c-1.858-.08-3.982-.074-6.104-.074c-2.124 0-5.575.799-8.492 3.984c-2.92 3.188-11.148 10.892-11.148 26.561s11.413 30.813 13.004 32.94c1.593 2.123 22.033 35.307 54.405 48.073c26.904 10.609 32.379 8.499 38.218 7.967c5.84-.53 18.844-7.702 21.497-15.139c2.655-7.436 2.655-13.81 1.859-15.142c-.796-1.327-2.92-2.124-6.105-3.716s-18.844-9.298-21.763-10.361c-2.92-1.062-5.043-1.592-7.167 1.597c-2.124 3.184-8.223 10.356-10.082 12.48c-1.857 2.129-3.716 2.394-6.9.801c-3.187-1.598-13.444-4.957-25.613-15.806c-9.468-8.442-15.86-18.867-17.718-22.056c-1.858-3.184-.199-4.91 1.398-6.497c1.431-1.427 3.186-3.719 4.78-5.578c1.588-1.86 2.118-3.187 3.18-5.311c1.063-2.126.531-3.986-.264-5.579c-.798-1.593-6.987-17.343-9.819-23.64"></path>');
}

function iconMeta() {
  return brandSvg('0 0 256 171', '<path fill="#0081fb" d="M27.651 112.136c0 9.775 2.146 17.28 4.95 21.82c3.677 5.947 9.16 8.466 14.751 8.466c7.211 0 13.808-1.79 26.52-19.372c10.185-14.092 22.186-33.874 30.26-46.275l13.675-21.01c9.499-14.591 20.493-30.811 33.1-41.806C161.196 4.985 172.298 0 183.47 0c18.758 0 36.625 10.87 50.3 31.257C248.735 53.584 256 81.707 256 110.729c0 17.253-3.4 29.93-9.187 39.946c-5.591 9.686-16.488 19.363-34.818 19.363v-27.616c15.695 0 19.612-14.422 19.612-30.927c0-23.52-5.484-49.623-17.564-68.273c-8.574-13.23-19.684-21.313-31.907-21.313c-13.22 0-23.859 9.97-35.815 27.75c-6.356 9.445-12.882 20.956-20.208 33.944l-8.066 14.289c-16.203 28.728-20.307 35.271-28.408 46.07c-14.2 18.91-26.324 26.076-42.287 26.076c-18.935 0-30.91-8.2-38.325-20.556C2.973 139.413 0 126.202 0 111.148z"></path><path fill="#0064e1" d="M21.802 33.206C34.48 13.666 52.774 0 73.757 0C85.91 0 97.99 3.597 110.605 13.897c13.798 11.261 28.505 29.805 46.853 60.368l6.58 10.967c15.881 26.459 24.917 40.07 30.205 46.49c6.802 8.243 11.565 10.7 17.752 10.7c15.695 0 19.612-14.422 19.612-30.927l24.393-.766c0 17.253-3.4 29.93-9.187 39.946c-5.591 9.686-16.488 19.363-34.818 19.363c-11.395 0-21.49-2.475-32.654-13.007c-8.582-8.083-18.615-22.443-26.334-35.352l-22.96-38.352C118.528 64.08 107.96 49.73 101.845 43.23c-6.578-6.988-15.036-15.428-28.532-15.428c-10.923 0-20.2 7.666-27.963 19.39z"></path><path fill="#0064e0" d="M73.312 27.802c-10.923 0-20.2 7.666-27.963 19.39c-10.976 16.568-17.698 41.245-17.698 64.944c0 9.775 2.146 17.28 4.95 21.82L9.027 149.482C2.973 139.413 0 126.202 0 111.148C0 83.772 7.514 55.24 21.802 33.206C34.48 13.666 52.774 0 73.757 0z"></path>');
}

function iconFacebook() {
  return brandSvg('0 0 128 128', '<rect width="118.35" height="118.35" x="4.83" y="4.83" fill="#3d5a98" rx="6.53" ry="6.53"></rect><path fill="#fff" d="M86.48 123.17V77.34h15.38l2.3-17.86H86.48v-11.4c0-5.17 1.44-8.7 8.85-8.7h9.46v-16A127 127 0 0 0 91 22.7c-13.62 0-23 8.3-23 23.61v13.17H52.62v17.86H68v45.83z"></path>');
}

function iconLinkedIn() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#0a66c2" rx="60"></rect><path fill="#fff" d="M184.715 217.685h29.27a4 4 0 0 0 4-3.999l.015-61.842c0-32.323-6.965-57.168-44.738-57.168c-14.359-.534-27.9 6.868-35.207 19.228a.32.32 0 0 1-.595-.161V101.66a4 4 0 0 0-4-4h-27.777a4 4 0 0 0-4 4v112.02a4 4 0 0 0 4 4h29.268a4 4 0 0 0 4-4v-55.373c0-15.657 2.97-30.82 22.381-30.82c19.135 0 19.383 17.916 19.383 31.834v54.364a4 4 0 0 0 4 4M38 59.628c0 11.864 9.767 21.626 21.632 21.626c11.862-.001 21.623-9.769 21.623-21.631C81.253 47.761 71.491 38 59.628 38C47.762 38 38 47.763 38 59.627m6.959 158.058h29.307a4 4 0 0 0 4-4V101.66a4 4 0 0 0-4-4H44.959a4 4 0 0 0-4 4v112.025a4 4 0 0 0 4 4"></path>');
}

function iconPatreon() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#ff6854"></rect><rect width="29" height="126" x="60" y="65" fill="#052d49"></rect><circle cx="146" cy="112" r="48" fill="#fff"></circle>');
}

function iconSpeedtest() {
  return brandSvg('0 0 24 24', '<path fill="#161b2e" d="M12 1.767c6.605 0 12 5.396 12 12c0 3.349-1.395 6.326-3.535 8.466l-1.674-1.675c1.674-1.767 2.79-4.186 2.79-6.79A9.57 9.57 0 0 0 12 4.184a9.57 9.57 0 0 0-9.581 9.581c0 2.698 1.023 5.024 2.79 6.791l-1.674 1.675C1.302 20.092 0 17.115 0 13.767c0-6.604 5.395-12 12-12"></path><path fill="#20b8ff" d="m11.628 16.186l-2.047-2.14l6.791-5.953l1.21 1.302z"></path>');
}

function iconMicrosoft() {
  return brandSvg('0 0 256 256', '<path fill="#f1511b" d="M121.666 121.666H0V0h121.666z"></path><path fill="#80cc28" d="M256 121.666H134.335V0H256z"></path><path fill="#00adef" d="M121.663 256.002H0V134.336h121.663z"></path><path fill="#fbbc09" d="M256 256.002H134.335V134.336H256z"></path>');
}

function iconIntel() {
  return brandSvg('0 0 24 24', '<rect width="24" height="24" rx="6" fill="#0068b5"></rect><path fill="#fff" d="M20.42 7.345v9.18h1.651v-9.18zM0 7.475v1.737h1.737V7.474zm9.78.352v6.053q0 .77.13 1.292q.131.511.44.828c.203.21.475.359.803.451q.502.138 1.255.136h.216v-1.533c-.24 0-.445-.012-.593-.037a.67.67 0 0 1-.39-.173a.7.7 0 0 1-.173-.377a4 4 0 0 1-.037-.606v-2.182h1.193v-1.416h-1.193V7.827zm-3.505 2.312c-.396 0-.76.08-1.082.241q-.49.242-.822.668l-.087.117v-.902H2.658v6.256h1.639v-3.214q.025-.881.433-1.299c.29-.297.642-.445 1.044-.445c.476 0 .841.149 1.082.433c.235.284.359.686.359 1.2v3.324h1.663V12.97c.006-.89-.229-1.595-.686-2.09s-1.1-.742-1.917-.742zm10.065.006a3.25 3.25 0 0 0-2.306.946c-.29.29-.525.637-.692 1.033a3.15 3.15 0 0 0-.254 1.273q0 .679.241 1.274c.161.395.39.742.674 1.032s.637.526 1.045.693c.408.173.86.26 1.342.26c1.397 0 2.262-.637 2.782-1.23l-1.187-.904c-.248.297-.841.699-1.583.699c-.464 0-.847-.105-1.138-.321a1.6 1.6 0 0 1-.593-.872l-.019-.056h4.915v-.587q-.001-.676-.235-1.267a3.4 3.4 0 0 0-.661-1.033a3 3 0 0 0-1.02-.692a3.35 3.35 0 0 0-1.311-.248m-16.297.118v6.256h1.651v-6.256zm16.278 1.286c1.132 0 1.664.797 1.664 1.255l-3.32.006c0-.458.525-1.255 1.656-1.261m7.073 3.814a.606.606 0 0 0-.606.606a.606.606 0 0 0 .606.606a.606.606 0 0 0 .606-.606a.606.606 0 0 0-.606-.606m-.008.105h.002a.5.5 0 0 1 .5.501a.5.5 0 0 1-.5.5a.5.5 0 0 1-.5-.5a.5.5 0 0 1 .498-.5zm-.233.155v.699h.13v-.285h.093l.173.285h.136l-.18-.297a.2.2 0 0 0 .118-.056c.03-.03.05-.074.05-.136q0-.1-.063-.154c-.037-.038-.105-.056-.185-.056zm.13.099h.154q.028.001.056.012a.06.06 0 0 1 .037.031c.013.013.012.031.012.056a.1.1 0 0 1-.012.055a.2.2 0 0 1-.037.031q-.028.011-.056.013h-.154Z"></path>');
}

function iconGoogle() {
  return brandSvg('0 0 48 48', '<path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"></path><path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"></path><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"></path><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"></path>');
}

function iconAi() {
  return brandSvg('0 0 16 16', '<path fill="#fff" d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273a4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2A4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948a4.04 4.04 0 0 0-1.158 1.753a4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731a3.94 3.94 0 0 0 .346 3.274a4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995c.526.231 1.095.35 1.67.346c1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68a4 4 0 0 0 1.14-1.253a3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054l3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237l-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207a2.96 2.96 0 0 1-.27 3.2a3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015l-.097-.057l-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303c.223.526.289 1.103.191 1.664zM5.503 8.575L4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054l-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577l1.758-1l1.762 1v2l-1.755 1l-1.762-1z"></path>');
}

function iconClaude() {
  return brandSvg('0 0 16 16', '<path fill="#ff7043" d="m14.375 6.48l.49.28v.209l-.14.489l-5.937 1.397l-.558-1.387zm0 0"></path><path fill="#ff7043" d="m12.155 2.373l.683.143l.182.224l.173.535l-.072.342l-3.983 5.447L7.81 7.737l3.673-4.82z"></path><path fill="#ff7043" d="m8.719 1.522l.419-.28l.349.14l.349.49l-.957 5.748l-.65-.441l-.279-.769l.49-4.33z"></path><path fill="#ff7043" d="m4.239 1.614l.43-.55L4.95 1l.558.081l.275.216l2.004 4.442l.724 2.11l-.848.471l-3.231-5.864z"></path><path fill="#ff7043" d="m2.154 4.665l-.14-.56l.42-.488l.488.07h.14l2.933 2.165l.908.698l1.257.978l-.698 1.187l-.629-.489l-.419-.419l-4.05-2.863z"></path><path fill="#ff7043" d="M1.316 8.296L1 7.946v-.31l.316-.108l3.562.21l3.491.279l-.113.695l-6.66-.346z"></path><path fill="#ff7043" d="M3.411 11.931h-.698l-.278-.32v-.382l1.186-.838l4.82-3.068l.487.833z"></path><path fill="#ff7043" d="m4.738 13.883l-.28.07l-.418-.21l.07-.35l4.12-5.446l.558.768l-3.072 4.05z"></path><path fill="#ff7043" d="m8.23 14.581l-.21.28l-.419.14l-.349-.28l-.21-.42L8.09 8.646l.629.07z"></path><path fill="#ff7043" d="M11.791 13.045v.558l-.07.21l-.279.14l-.489-.066l-3.356-4.996l1.331-1.014l1.117 2.025l.105.733z"></path><path fill="#ff7043" d="m13.398 12.207l.07.349l-.21.279l-.21-.07l-1.187-.838l-1.815-1.606l-1.397-.978l.419-1.326l.698.419l.42.768z"></path><path fill="#ff7043" d="m12.49 8.645l1.746.14l.419.28l.279.418v.302l-.768.327l-3.911-.978l-1.606-.07l.419-1.466l1.117.838z"></path>');
}

function iconGamepad() {
  return brandSvg('0 0 16 16', '<path fill="#00a7e1" d="M9.34 8.005c0-4.38.01-7.972.023-7.982C9.373.01 10.036 0 10.831 0c1.153 0 1.51.01 1.743.05c1.73.298 3.045 1.6 3.373 3.326c.046.242.053.809.053 4.61c0 4.06.005 4.537-.123 4.976c-.022.076-.048.15-.08.242a4.14 4.14 0 0 1-3.426 2.767c-.317.033-2.889.046-2.978.013c-.05-.02-.053-.752-.053-7.979m4.675.269a1.62 1.62 0 0 0-1.113-1.034a1.61 1.61 0 0 0-1.938 1.073a1.9 1.9 0 0 0-.014.935a1.63 1.63 0 0 0 1.952 1.107c.51-.136.908-.504 1.11-1.028c.11-.285.113-.742.003-1.053"></path><path fill="#e60012" d="M3.71 3.317c-.208.04-.526.199-.695.348c-.348.301-.52.729-.494 1.232c.013.262.03.332.136.544c.155.321.39.556.712.715c.222.11.278.123.567.133c.261.01.354 0 .53-.06c.719-.242 1.153-.94 1.03-1.656c-.142-.852-.95-1.422-1.786-1.256"></path><path fill="#e60012" d="M3.425.053a4.14 4.14 0 0 0-3.28 3.015C0 3.628-.01 3.956.005 8.3c.01 3.99.014 4.082.08 4.39c.368 1.66 1.548 2.844 3.224 3.235c.22.05.497.06 2.29.07c1.856.012 2.048.009 2.097-.04c.05-.05.053-.69.053-7.94c0-5.374-.01-7.906-.033-7.952c-.033-.06-.09-.063-2.03-.06c-1.578.004-2.052.014-2.26.05Zm3 14.665l-1.35-.016c-1.242-.013-1.375-.02-1.623-.083a2.81 2.81 0 0 1-2.08-2.167c-.074-.335-.074-8.579-.004-8.907a2.85 2.85 0 0 1 1.716-2.05c.438-.176.64-.196 2.058-.2l1.282-.003v13.426Z"></path>');
}

function iconLan() {
  return svg('<rect x="5" y="5" width="14" height="9" rx="2"></rect><path d="M12 14v3"></path><path d="M8 19h8"></path>');
}

function iconRunet() {
  return svg('<circle cx="12" cy="12" r="8"></circle><path class="cut" d="M4.8 11h14.4v2H4.8z"></path><path class="cut" d="M11 4.8h2v14.4h-2z"></path>');
}

function iconRussiaFlag() {
  return brandSvg('0 0 36 36', '<path fill="#ce2028" d="M36 27a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-4h36z"></path><path fill="#22408c" d="M0 13h36v10H0z"></path><path fill="#eee" d="M32 5H4a4 4 0 0 0-4 4v4h36V9a4 4 0 0 0-4-4"></path>');
}

function iconMedia() {
  return svg('<rect x="5" y="5" width="14" height="14" rx="3"></rect><path class="cut" d="M10 8.5v7l5.8-3.5z"></path>');
}

function iconKinoPub() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#05070a" rx="52"></rect><text x="128" y="110" fill="#2087ff" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="950" letter-spacing="0" text-anchor="middle">KINO</text><text x="128" y="170" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="950" letter-spacing="0" text-anchor="middle">PUB</text>');
}
