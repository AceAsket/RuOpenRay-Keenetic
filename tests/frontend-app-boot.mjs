const storage = {
  data: new Map(),
  getItem(key) {
    return this.data.get(key) || null;
  },
  setItem(key, value) {
    this.data.set(key, String(value));
  },
  removeItem(key) {
    this.data.delete(key);
  },
  clear() {
    this.data.clear();
  }
};

function createStorage() {
  return {
    data: new Map(),
    getItem(key) {
      return this.data.get(key) || null;
    },
    setItem(key, value) {
      this.data.set(key, String(value));
    },
    removeItem(key) {
      this.data.delete(key);
    },
    clear() {
      this.data.clear();
    }
  };
}

class TestElement {
  constructor(selector = '') {
    this.selector = selector;
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.dataset = {};
    this.open = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.textContent = '';
    this.tagName = 'DIV';
    this.style = {};
    this.classList = {
      add() {},
      remove() {}
    };
  }

  addEventListener() {}
  focus() {}
  setSelectionRange() {}
  getAttribute(name) {
    if (name === 'data-details-key') return this.dataset.detailsKey || '';
    return '';
  }
  setAttribute() {}
  querySelector() {
    return new TestElement();
  }
  querySelectorAll() {
    return [];
  }
}

const app = new TestElement('#app');

globalThis.localStorage = storage;
globalThis.sessionStorage = createStorage();
globalThis.window = {
  addEventListener() {},
  localStorage: storage,
  sessionStorage: globalThis.sessionStorage,
  scrollY: 0,
  scrollTo() {}
};
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.document = {
  body: new TestElement('body'),
  activeElement: null,
  querySelector(selector) {
    if (selector === '#app') return app;
    return new TestElement(selector);
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {}
};
globalThis.prompt = () => '';

await import(`../cmd/ruopenray-ui/web/app.js?boot=${Date.now()}`);

if (!app.innerHTML.includes('login-card')) {
  throw new Error('app.js did not render login view on cold boot');
}

storage.clear();
globalThis.sessionStorage.clear();
storage.setItem('ruopenray_remember_login', '1');
app.innerHTML = '';
await import(`../cmd/ruopenray-ui/web/app.js?boot-remember=${Date.now()}`);
if (!app.innerHTML.includes('id="rememberPassword" type="checkbox" checked')) {
  throw new Error('app.js did not preserve remember-login checkbox without a token');
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function textResponse(payload = '') {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'text/plain' },
    async text() {
      return payload;
    }
  };
}

const config = {
  inbounds: [{ tag: 'socks-in', protocol: 'socks' }],
  outbounds: [
    { tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'example.com', port: 443 }] } },
    { tag: 'direct', protocol: 'freedom' }
  ],
  routing: { rules: [{ type: 'field', domain: ['domain:example.com'], outboundTag: 'proxy' }] }
};
globalThis.fetch = async (path) => {
  const url = String(path || '');
  if (url.startsWith('/api/logs')) return textResponse('');
  if (url === '/api/status') {
    return jsonResponse({
      service: { running: true, uptime: 120 },
      serverChecks: { results: {} },
      system: {},
      xrayStats: { enabled: false, outbounds: [] }
    });
  }
  if (url === '/api/profiles') return jsonResponse([]);
  if (url === '/api/config') return jsonResponse(config);
  if (url === '/api/config/draft') return jsonResponse({ ok: true, exists: false });
  if (url === '/api/dhcp/leases') return jsonResponse({ leases: [] });
  if (url === '/api/core/releases') return jsonResponse({ releases: [], asset: '' });
  if (url === '/api/app/releases') return jsonResponse({ release: null });
  if (url === '/api/geo/status') return jsonResponse(null);
  if (url.startsWith('/api/domain-monitor')) return jsonResponse(null);
  if (url === '/api/settings/logging') return jsonResponse(null);
  if (url === '/api/settings/service') return jsonResponse(null);
  if (url === '/api/network/tcp-fast-open') return jsonResponse(null);
  if (url === '/api/dns/lan-upstream') return jsonResponse(null);
  if (url === '/api/firewall/status') return jsonResponse(null);
  if (url === '/api/subscriptions') return jsonResponse({ pools: [] });
  if (url === '/api/routing/disabled') return jsonResponse({ rules: [] });
  if (url === '/api/routing/names') return jsonResponse({ names: {} });
  if (url === '/api/routing/presets') return jsonResponse({ presets: {} });
  if (url === '/api/server-meta') return jsonResponse({ items: {} });
  return jsonResponse({});
};

storage.clear();
globalThis.sessionStorage.clear();
storage.setItem('openray_token', 'token');
app.innerHTML = '';
await import(`../cmd/ruopenray-ui/web/app.js?boot-auth=${Date.now()}`);
if (!app.innerHTML.includes('shell')) {
  throw new Error('app.js did not render authenticated shell with remembered token');
}

console.log('Frontend app boot passed');
