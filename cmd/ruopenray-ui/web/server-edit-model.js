function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

function ensureArrayItem(parent, key, index = 0) {
  if (!Array.isArray(parent[key])) parent[key] = [];
  if (!parent[key][index] || typeof parent[key][index] !== 'object') parent[key][index] = {};
  return parent[key][index];
}

function primaryEndpoint(outbound = {}) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') return outbound?.settings?.vnext?.[0] || {};
  if (protocol === 'trojan' || protocol === 'shadowsocks') return outbound?.settings?.servers?.[0] || {};
  return outbound?.settings || {};
}

function primaryUser(outbound = {}) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') return outbound?.settings?.vnext?.[0]?.users?.[0] || {};
  if (protocol === 'trojan' || protocol === 'shadowsocks') return outbound?.settings?.servers?.[0] || {};
  return {};
}

function stream(outbound = {}) {
  return outbound?.streamSettings || {};
}

function securitySettings(outbound = {}) {
  const s = stream(outbound);
  return s.realitySettings || s.tlsSettings || {};
}

export function parseServerEditJson(json) {
  try {
    const outbound = JSON.parse(json || '{}');
    if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) {
      return { outbound: null, error: 'Outbound должен быть JSON-объектом' };
    }
    return { outbound, error: '' };
  } catch (error) {
    return { outbound: null, error: `JSON не разобран: ${error.message}` };
  }
}

export function serverEditFields(outbound = {}) {
  const endpoint = primaryEndpoint(outbound);
  const user = primaryUser(outbound);
  const s = stream(outbound);
  const sec = securitySettings(outbound);
  return {
    tag: outbound?.tag || '',
    protocol: outbound?.protocol || 'vless',
    address: endpoint?.address || outbound?.settings?.address || '',
    port: endpoint?.port ?? outbound?.settings?.port ?? '',
    id: user?.id || '',
    password: user?.password || '',
    userSecurity: user?.security || user?.encryption || user?.method || '',
    flow: user?.flow || '',
    network: s?.network || 'tcp',
    security: s?.security || 'none',
    sni: sec?.serverName || '',
    fingerprint: sec?.fingerprint || '',
    publicKey: sec?.publicKey || '',
    shortId: Array.isArray(sec?.shortId) ? sec.shortId.join(', ') : (sec?.shortId || ''),
    spiderX: sec?.spiderX || '',
    path: s?.wsSettings?.path || s?.httpSettings?.path || s?.grpcSettings?.serviceName || ''
  };
}

export function patchServerEditField(outbound, field, value) {
  const next = clone(outbound);
  const raw = String(value ?? '').trim();
  const protocol = field === 'protocol' ? raw : (next.protocol || 'vless');
  const settings = ensureObject(next, 'settings');

  if (field === 'tag') next.tag = raw;
  if (field === 'protocol') next.protocol = raw || 'vless';

  if (['address', 'port', 'id', 'password', 'userSecurity', 'flow'].includes(field)) {
    if (protocol === 'trojan' || protocol === 'shadowsocks') {
      delete settings.vnext;
      const server = ensureArrayItem(settings, 'servers');
      if (field === 'address') server.address = raw;
      if (field === 'port') server.port = Number(raw) || raw;
      if (field === 'password') server.password = raw;
      if (field === 'userSecurity') server.method = raw;
    } else {
      delete settings.servers;
      const vnext = ensureArrayItem(settings, 'vnext');
      const user = ensureArrayItem(vnext, 'users');
      if (field === 'address') vnext.address = raw;
      if (field === 'port') vnext.port = Number(raw) || raw;
      if (field === 'id') user.id = raw;
      if (field === 'password') user.password = raw;
      if (field === 'userSecurity') {
        if (protocol === 'vmess') user.security = raw;
        else user.encryption = raw || 'none';
      }
      if (field === 'flow') {
        if (raw) user.flow = raw;
        else delete user.flow;
      }
    }
  }

  if (['network', 'security', 'sni', 'fingerprint', 'publicKey', 'shortId', 'spiderX', 'path'].includes(field)) {
    const streamSettings = ensureObject(next, 'streamSettings');
    if (field === 'network') streamSettings.network = raw || 'tcp';
    if (field === 'security') {
      if (!raw || raw === 'none') delete streamSettings.security;
      else streamSettings.security = raw;
      if (raw === 'reality') ensureObject(streamSettings, 'realitySettings');
      if (raw === 'tls') ensureObject(streamSettings, 'tlsSettings');
    }
    const secKey = (streamSettings.security || '') === 'reality' ? 'realitySettings' : 'tlsSettings';
    const sec = ensureObject(streamSettings, secKey);
    if (field === 'sni') {
      if (raw) sec.serverName = raw;
      else delete sec.serverName;
    }
    if (field === 'fingerprint') {
      if (raw) sec.fingerprint = raw;
      else delete sec.fingerprint;
    }
    if (field === 'publicKey') {
      if (raw) sec.publicKey = raw;
      else delete sec.publicKey;
    }
    if (field === 'shortId') {
      if (raw) sec.shortId = raw.includes(',') ? raw.split(',').map((item) => item.trim()).filter(Boolean) : raw;
      else delete sec.shortId;
    }
    if (field === 'spiderX') {
      if (raw) sec.spiderX = raw;
      else delete sec.spiderX;
    }
    if (field === 'path') {
      if ((streamSettings.network || '') === 'grpc') {
        const grpc = ensureObject(streamSettings, 'grpcSettings');
        if (raw) grpc.serviceName = raw;
        else delete grpc.serviceName;
      } else if ((streamSettings.network || '') === 'http') {
        const http = ensureObject(streamSettings, 'httpSettings');
        if (raw) http.path = raw;
        else delete http.path;
      } else {
        const ws = ensureObject(streamSettings, 'wsSettings');
        if (raw) ws.path = raw;
        else delete ws.path;
      }
    }
  }

  return next;
}

export function stringifyServerEditOutbound(outbound) {
  return JSON.stringify(outbound || {}, null, 2);
}
