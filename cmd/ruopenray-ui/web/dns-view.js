import { noticeView } from './notice-view.js';

export function createDnsView(deps) {
  const {
    activeProxyTag,
    configInbounds,
    currentDnsMode,
    describeDnsServer,
    dnsAnswerText,
    dnsConfig,
    dnsStats,
    escapeHtml,
    lanDnsModeLabel,
    routeRules,
    state,
    stat,
  } = deps;

function dnsModeSection() {
  const dnsMode = currentDnsMode();
  return `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>DNS-режим</h2><span>Обычный DNS подходит большинству. FakeDNS помогает transparent proxy лучше сопоставлять IP с доменами, но требует аккуратной DNS/TProxy схемы.</span></div>
      </div>
      <div class="advanced-grid two">
        <button type="button" class="advanced-card ${dnsMode === 'normal' ? 'active' : ''}" data-dns-mode="normal">
          <strong>Обычный DNS</strong>
          <span>Без FakeDNS. Дефолтный и самый предсказуемый режим.</span>
        </button>
        <button type="button" class="advanced-card ${dnsMode === 'fakedns' ? 'active' : ''}" data-dns-mode="fakedns">
          <strong>FakeDNS для transparent proxy</strong>
          <span>Добавит fakeDNS pool, fakedns DNS-сервер и безопасный sniffing routeOnly.</span>
        </button>
      </div>
    </section>
  `;
}

function dnsLeakChecklist(dns, stats) {
  const servers = dns.servers || [];
  const hasDns = servers.length > 0;
  const encrypted = stats.doh + stats.tcp;
  const hasPlain = servers.some((server) => {
    const address = typeof server === 'string' ? server : server?.address || '';
    const network = typeof server === 'object' ? server?.network : '';
    return address && !String(address).startsWith('https://') && network !== 'tcp';
  });
  const checked = Boolean(state.dnsCheckResult);
  const udpRule = routeRules().some((rule) => String(rule.network || '').includes('udp') && (rule.balancerTag || ['proxy', activeProxyTag(), 'block'].includes(rule.outboundTag)));
  const dnsInbound = configInbounds().some((item) => item?.tag === 'ruopenray_dns_in');
  const dnsRouting = routeRules().some((rule) => {
    const inbound = Array.isArray(rule.inboundTag) && rule.inboundTag.includes('ruopenray_dns_in');
    return inbound || String(rule.port || '') === '53' || rule.outboundTag === 'dns-out';
  });
  const lanDns = state.lanDnsStatus || {};
  const readiness = lanDns.readiness || {};
  const dnsPortConflict = Boolean(lanDns.dnsPortConflict || readiness.udpConflict);
  const dnsConflictOwner = lanDns.dnsPortConflictOwner || readiness.udpOwner || '';
  const xrayDnsTarget = readiness.target || lanDns.xrayTarget || lanDns.suggestedXrayTarget || '127.0.0.1#10535';
  const suggestedDnsTarget = lanDns.suggestedXrayTarget || '127.0.0.1#10535';
  const leakTargets = dnsLeakProtectionTargets();
  const hasDomainProtection = state.firewallKillSwitchEnabled && leakTargets.domainLike > 0;
  const lanUsesXrayDns = lanDns.mode === 'xray' || lanDns.plan?.mode === 'xray';
  const dnsGuardReady = Boolean(state.firewallDnsIntercept || lanUsesXrayDns);
  const items = [
    {
      ok: hasDns,
      title: 'DNS задан в Xray',
      detail: hasDns ? `${servers.length} серверов в dns.servers` : 'Добавьте DoH/TCP DNS, чтобы не полагаться на системный resolver.'
    },
    {
      ok: encrypted > 0,
      warn: encrypted === 0 && hasDns,
      title: 'Есть защищенный канал',
      detail: encrypted ? `${encrypted} DoH/TCP серверов` : 'UDP DNS может уходить наружу без шифрования.'
    },
    {
      ok: !hasPlain,
      warn: hasPlain,
      title: 'Обычный DNS без шифрования',
      detail: hasPlain ? 'Найден DNS по UDP/53. Такие запросы может видеть провайдер: оставляйте его только для локального DNS, Pi-hole или аварийного резерва.' : 'Обычный UDP DNS не найден: запросы идут через защищенный DNS или специальные маршруты.'
    },
    {
      ok: checked,
      warn: !checked,
      title: 'Резолв проверен',
      detail: checked ? `Последняя проверка: ${dnsAnswerText(state.dnsCheckResult)}` : 'Запустите проверку домена после изменения DNS.'
    },
    {
      ok: dnsInbound && dnsRouting,
      warn: dnsInbound || dnsRouting,
      title: 'DNS устройств перехватывается',
      detail: dnsInbound && dnsRouting
        ? `Есть DNS inbound и правило на dns-out. Осталось направить dnsmasq на ${xrayDnsTarget}.`
        : 'Для LAN-устройств нужен DNS inbound и маршрут на dns-out, иначе часть клиентов может обходить Xray DNS.',
      action: dnsInbound && dnsRouting ? '' : 'prepareDnsInbound',
      actionLabel: 'Подготовить inbound'
    },
    {
      ok: udpRule,
      warn: !udpRule,
      title: udpRule ? 'UDP/QUIC направлен правилами' : 'UDP/QUIC не закрыт',
      detail: udpRule ? 'В маршрутизации есть UDP-правило в proxy или block.' : 'Добавьте правило для UDP/443 или нужных UDP-диапазонов, чтобы трафик не обходил DNS-настройки через QUIC.',
      action: udpRule ? '' : 'dnsWizardStrict',
      actionLabel: 'Добавить UDP/443'
    },
    {
      ok: !hasDomainProtection || dnsGuardReady,
      warn: hasDomainProtection && !dnsGuardReady,
      title: hasDomainProtection ? 'Доменная защита зависит от DNS' : 'Защита доменов не включена',
      detail: hasDomainProtection
        ? dnsGuardReady
          ? `В защите от утечек есть ${leakTargets.domainLike} доменных/geo целей, DNS клиентов направляется через контролируемый путь.`
          : `В защите от утечек есть ${leakTargets.domainLike} доменных/geo целей, но DNS клиентов может идти мимо роутера. Тогда домены не будут надежно блокироваться.`
        : 'Когда включите защиту доменов в маршрутизации, здесь появится проверка DNS-пути.',
      action: hasDomainProtection && !dnsGuardReady ? 'previewLanDnsUpstream' : '',
      actionLabel: 'Настроить LAN DNS'
    }
  ];
  if (items[2]) {
    items[2].title = hasPlain ? 'Обычный UDP DNS как запасной вариант' : 'Обычный UDP DNS не используется';
    items[2].detail = hasPlain
      ? 'В списке есть DNS без шифрования. Оставляйте его для локального DNS, Pi-hole или аварийного резерва; основным лучше держать DoH/TCP.'
      : 'В основном DNS-пути нет обычного UDP/53, который легко увидеть провайдеру.';
  }
  if (items[4] && dnsPortConflict) {
    items[4].ok = false;
    items[4].warn = true;
    items[4].title = 'Порт DNS inbound занят';
    items[4].detail = `Xray не сможет принять DNS на ${xrayDnsTarget}: порт уже держит ${dnsConflictOwner || 'другой процесс'}. Подготовьте DNS inbound заново, RuOpenRay выберет ${suggestedDnsTarget}.`;
    items[4].action = 'prepareDnsInbound';
    items[4].actionLabel = 'Перевыбрать порт';
  }
  if (items[4] && dnsInbound && dnsRouting && !dnsPortConflict) {
    items[4].detail = `Xray готов принимать DNS на ${xrayDnsTarget.replace('#', ':')}. Если хотите вести LAN через него, откройте вкладку LAN DNS и примените режим DNS через Xray.`;
  }
  return `
    <section class="panel dns-guard-panel">
      <div class="panel-title">
        <div><h2>Защита от утечек DNS</h2><span>Проверяем, куда пойдут DNS-запросы LAN-устройств и где может появиться открытый UDP/53.</span></div>
        <button class="btn secondary ${state.busyAction === 'checkDns' ? 'is-busy' : ''}" data-action="checkDns" ${state.busyAction === 'checkDns' ? 'disabled' : ''}>${state.busyAction === 'checkDns' ? 'Проверяю...' : 'Проверить DNS'}</button>
      </div>
      <div class="dns-wizard">
        <button class="wizard-card" data-action="dnsWizardSecure">
          <strong>Защищенный DNS</strong>
          <span>Добавить DoH Google и AdGuard без изменения маршрутов.</span>
        </button>
        <button class="wizard-card" data-action="dnsWizardRu">
          <strong>RU-friendly DNS</strong>
          <span>Добавить Yandex DoH и AdGuard для российских сценариев.</span>
        </button>
        <button class="wizard-card" data-action="dnsWizardStrict">
          <strong>DoH + QUIC guard</strong>
          <span>Добавить DoH и правило UDP/443 через активный proxy.</span>
        </button>
      </div>
      <div class="guard-list">
        ${items.map((item) => `<article class="guard-item ${item.ok ? 'ok' : item.warn ? 'warn' : 'bad'}">
          <span>${item.ok ? '✓' : item.warn ? '!' : '×'}</span>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.detail)}</small>
            ${item.action ? `<button class="guard-action" type="button" data-action="${escapeHtml(item.action)}">${escapeHtml(item.actionLabel)}</button>` : ''}
          </div>
        </article>`).join('')}
      </div>
      ${dnsDiagnosticsSection()}
    </section>
  `;
}

function dnsDiagnosticsSection() {
  const diagnostics = state.dnsDiagnostics;
  const probeText = (probe) => {
    if (!probe) return 'не проверялся';
    if (probe.skipped) return 'не требуется';
    if (probe.ok) {
      const addresses = Array.isArray(probe.addresses) ? probe.addresses.length : 0;
      return `отвечает за ${probe.durationMs || 0} мс · ${addresses} адресов`;
    }
    return probe.error || 'не отвечает';
  };
  const autoProbes = Array.isArray(diagnostics?.autoProbes) ? diagnostics.autoProbes : [];
  return `
    <div class="dns-diagnostics-card">
      <div>
        <strong>DNS роутера</strong>
        <span>${diagnostics ? escapeHtml(diagnostics.summary || 'Проверка выполнена') : 'Проверяет системный DNS OpenWrt, WAN DNS и Xray DNS inbound.'}</span>
      </div>
      <button class="btn secondary ${state.busyAction === 'checkDnsDiagnostics' ? 'is-busy' : ''}" data-action="checkDnsDiagnostics" ${state.busyAction === 'checkDnsDiagnostics' ? 'disabled' : ''}>${state.busyAction === 'checkDnsDiagnostics' ? 'Проверяю...' : 'Проверить DNS роутера'}</button>
      ${diagnostics ? `<div class="dns-diagnostics-grid">
        <article class="${diagnostics.system?.ok ? 'ok' : 'warn'}"><span>Системный DNS</span><strong>${escapeHtml(probeText(diagnostics.system))}</strong></article>
        <article class="${autoProbes.some((item) => item.ok) ? 'ok' : 'warn'}"><span>WAN DNS OpenWrt</span><strong>${escapeHtml(autoProbes.length ? autoProbes.map((item) => `${item.server}: ${probeText(item)}`).join(' · ') : 'не найден')}</strong></article>
        <article class="${diagnostics.xrayDns?.ok || diagnostics.xrayDns?.skipped ? 'ok' : 'warn'}"><span>Xray DNS</span><strong>${escapeHtml(probeText(diagnostics.xrayDns))}</strong></article>
      </div>` : ''}
      ${(diagnostics?.warnings || []).length ? `<div class="settings-warning"><strong>Что важно</strong><span>${escapeHtml(diagnostics.warnings.join(' '))}</span></div>` : ''}
    </div>
  `;
}

function dnsLeakProtectionTargets() {
  const raw = String(state.firewallKillSwitchTargets || '');
  const values = raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  let domains = 0;
  let geo = 0;
  for (const value of values) {
    const clean = value.replace(/^\*\./, '');
    if (/^(geosite:|ext:)/i.test(value)) {
      geo += 1;
    } else if (/^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$/i.test(clean)) {
      domains += 1;
    }
  }
  return { domains, geo, domainLike: domains + geo };
}

function dnsServersSection(dns) {
  const isDohServer = (server) => String(describeDnsServer(server).address || '').toLowerCase().startsWith('https://');
  const dohCount = (dns.servers || []).filter((server) => isDohServer(server)).length;
  const presets = [
    ['Cloudflare DoH', 'https://cloudflare-dns.com/dns-query'],
    ['Google DoH', 'https://dns.google:443/dns-query'],
    ['Quad9 DoH', 'https://dns.quad9.net/dns-query'],
    ['AdGuard DoH', 'https://dns.adguard-dns.com/dns-query'],
    ['Yandex DoH', 'https://common.dot.dns.yandex.net/dns-query'],
    ['OpenDNS DoH', 'https://doh.opendns.com/dns-query'],
    ['Cloudflare TCP', 'tcp://1.1.1.1:53'],
    ['Quad9 TCP', 'tcp://9.9.9.9:53'],
    ['Cloudflare UDP', '1.1.1.1'],
    ['Google UDP', '8.8.8.8']
  ];
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Добавить DNS</h2><span>Обычный IP, tcp:// или DoH URL. Пресеты ниже только подставляют адрес в поле.</span></div>
      </div>
      <div class="dns-form">
        <div class="form-row">
          <label>DNS-сервер</label>
          <input id="dnsAddress" value="${escapeHtml(state.dnsAddress)}" placeholder="https://dns.google:443/dns-query" />
        </div>
        <label class="check-row">
          <input id="dnsAuthEnabled" type="checkbox" ${state.dnsAuthEnabled ? 'checked' : ''} />
          <span>Basic Auth для DoH</span>
        </label>
        ${state.dnsAuthEnabled ? `<div class="form-grid two">
          <div class="form-row">
            <label>Логин</label>
            <input id="dnsAuthUser" value="${escapeHtml(state.dnsAuthUser)}" autocomplete="username" placeholder="user" />
          </div>
          <div class="form-row">
            <label>Пароль</label>
            <input id="dnsAuthPassword" type="password" value="${escapeHtml(state.dnsAuthPassword)}" autocomplete="current-password" placeholder="password" />
          </div>
        </div>
        <p class="muted">Панель соберет DoH URL вида https://user:pass@host/dns-query. В списке DNS пароль будет скрыт.</p>` : ''}
        <div class="form-row">
          <label>Только для доменов</label>
          <input id="dnsDomains" value="${escapeHtml(state.dnsDomains)}" placeholder="dns.google, dns.opendns.com" />
        </div>
        <button class="btn" data-action="addDns">Добавить DNS</button>
      </div>
      <div class="preset-grid dns-presets">
        ${presets.map(([name, address]) => `<button class="preset" type="button" data-dns-preset="${escapeHtml(address)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(address)}</span></button>`).join('')}
      </div>
      <div class="dns-inline-check">
        <div>
          <strong>Проверка DNS</strong>
          <span>Проверяет текущий адрес из поля DNS-сервера. Для IP без порта используется 53.</span>
        </div>
        <div class="dns-check">
          <input id="dnsCheckHost" value="${escapeHtml(state.dnsCheckHost)}" placeholder="ya.ru" />
          <button class="btn secondary ${state.busyAction === 'checkDns' ? 'is-busy' : ''}" data-action="checkDns" ${state.busyAction === 'checkDns' ? 'disabled' : ''}>${state.busyAction === 'checkDns' ? 'Проверяю...' : 'Проверить DNS'}</button>
        </div>
        ${state.dnsCheckResult ? `<div class="notice dns-check-result">
          Ответ: ${escapeHtml(dnsAnswerText(state.dnsCheckResult))}
          ${state.dnsCheckResult.error ? `<br />Ошибка: ${escapeHtml(state.dnsCheckResult.error)}` : ''}
          ${(state.dnsCheckResult.warnings || []).length ? `<br />Предупреждение: ${escapeHtml(state.dnsCheckResult.warnings.join('; '))}` : ''}
        </div>` : ''}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>DNS-серверы</h2><span>Порядок важен: Xray обрабатывает список сверху вниз. Изменения остаются в черновике до применения.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-dns-prioritize-doh ${dohCount ? '' : 'disabled'}>DoH выше</button>
          <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
      </div>
      <div class="settings-warning compact">
        <strong>Порядок DNS</strong>
        <span>Сверху ставьте DoH/TCP, ниже оставляйте обычный UDP только как локальный или аварийный fallback. Xray читает этот список в таком же порядке, как он показан здесь.</span>
      </div>
      <div class="dns-list">
        ${dns.servers
          .map((server, index) => {
            const info = describeDnsServer(server);
            const doh = isDohServer(server);
            return `<article class="dns-server-row">
              <div class="dns-order-controls">
                <span class="dns-order-number">${index + 1}</span>
                <button class="icon-btn route-action-btn move-up" type="button" data-dns-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} title="Поднять выше" aria-label="Поднять DNS выше">↑</button>
                <button class="icon-btn route-action-btn move-down" type="button" data-dns-move="${index}" data-direction="1" ${index >= dns.servers.length - 1 ? 'disabled' : ''} title="Опустить ниже" aria-label="Опустить DNS ниже">↓</button>
              </div>
              <div class="server-protocol ${doh ? 'doh' : ''}">${doh ? 'DoH' : 'DNS'}</div>
              <div class="server-main">
                <strong>${escapeHtml(info.address)}</strong>
                <span>${escapeHtml(info.domains.length ? info.domains.join(', ') : 'для всех доменов')}</span>
              </div>
              <div class="server-meta">
                <span>${escapeHtml(info.network || (info.address.startsWith('https://') ? 'https' : 'udp/tcp'))}</span>
                <span>${escapeHtml(info.port ? `порт ${info.port}` : 'порт из адреса')}</span>
              </div>
              <button class="icon-btn route-action-btn danger" type="button" data-dns-delete="${index}" title="Удалить" aria-label="Удалить DNS">×</button>
            </article>`;
          })
          .join('') || '<p class="muted">DNS-серверы пока не заданы.</p>'}
      </div>
    </section>
  `;
}

function dnsPolicyKind(value) {
  const text = String(value || '').trim();
  if (/^geosite:/i.test(text)) return 'geosite';
  if (/^geoip:/i.test(text)) return 'geoip';
  if (/^ext:/i.test(text)) return 'ext';
  if (/^regexp:/i.test(text)) return 'regexp';
  if (/^domain:/i.test(text)) return 'domain';
  return text.includes('.') ? 'domain' : 'match';
}

function dnsPolicyDisplay(value) {
  return String(value || '').replace(/^(domain|geosite|geoip|regexp):/i, '');
}

function dnsPoliciesSection(dns) {
  const servers = dns.servers || [];
  const safeIndex = servers.length
    ? Math.max(0, Math.min(Number(state.dnsPolicyServerIndex) || 0, servers.length - 1))
    : 0;
  const selectedInfo = servers.length ? describeDnsServer(servers[safeIndex]) : { address: '', domains: [] };
  const editorValue = state.dnsPolicyDomains === null || typeof state.dnsPolicyDomains === 'undefined'
    ? (selectedInfo.domains || []).join('\n')
    : state.dnsPolicyDomains;
  const policyServers = servers
    .map((server, index) => ({ index, info: describeDnsServer(server) }))
    .filter(({ info }) => (info.domains || []).length);
  const policyCount = policyServers.reduce((sum, { info }) => sum + (info.domains || []).length, 0);
  const unscopedCount = Math.max(0, servers.length - policyServers.length);
  return `
    <section class="panel dns-policy-panel">
      <div class="panel-title">
        <div>
          <h2>DNS-политики</h2>
          <span>Можно указать, какой DNS использовать для отдельных доменов, geosite/geoip и ext-списков. Маршрутизация трафика после ответа DNS остается в обычных правилах Xray.</span>
        </div>
        <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
      </div>

      <div class="settings-info-grid dns-policy-summary">
        <article><span>Политики</span><strong>${policyCount}</strong><small>${policyServers.length} DNS-серверов с условиями</small></article>
        <article><span>Без условий</span><strong>${unscopedCount}</strong><small>fallback DNS по порядку списка</small></article>
        <article><span>Порядок</span><strong>сверху вниз</strong><small>как во вкладке «Серверы»</small></article>
      </div>

      <div class="settings-warning compact">
        <strong>Как это работает</strong>
        <span>Xray сначала ищет DNS-сервер, у которого в domains есть совпадение: domain:openai.com, geosite:youtube, geoip:ru или ext:"file.dat:list". Если совпадений нет, используется обычный порядок dns.servers.</span>
      </div>

      <div class="dns-policy-editor">
        <div class="form-row">
          <label>DNS-сервер</label>
          <select id="dnsPolicyServer" ${servers.length ? '' : 'disabled'}>
            ${servers.map((server, index) => {
              const info = describeDnsServer(server);
              return `<option value="${index}" ${index === safeIndex ? 'selected' : ''}>${index + 1}. ${escapeHtml(info.address)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-row dns-policy-domains-row">
          <label>Домены и категории для этого DNS</label>
          <textarea id="dnsPolicyDomains" ${servers.length ? '' : 'disabled'} placeholder="domain:openai.com&#10;geosite:youtube&#10;geoip:ru&#10;ext:&quot;custom.dat:list&quot;">${escapeHtml(editorValue || '')}</textarea>
        </div>
        <div class="dns-policy-actions">
          <button class="btn" data-action="saveDnsPolicy" ${servers.length ? '' : 'disabled'}>Сохранить политику</button>
          <button class="btn secondary" data-action="clearDnsPolicy" ${servers.length ? '' : 'disabled'}>Очистить для DNS</button>
        </div>
      </div>

      <div class="dns-policy-list">
        ${policyServers.map(({ index, info }) => `<article class="dns-policy-row">
          <div class="dns-policy-order">${index + 1}</div>
          <div class="dns-policy-main">
            <strong>${escapeHtml(info.address)}</strong>
            <span>${escapeHtml(info.network || (info.address.startsWith('https://') ? 'https' : 'dns'))}</span>
          </div>
          <div class="dns-policy-chips">
            ${(info.domains || []).slice(0, 8).map((domain) => `<span class="dns-policy-chip"><small>${escapeHtml(dnsPolicyKind(domain))}</small>${escapeHtml(dnsPolicyDisplay(domain))}</span>`).join('')}
            ${(info.domains || []).length > 8 ? `<span class="dns-policy-chip more">+${info.domains.length - 8}</span>` : ''}
          </div>
          <button class="btn secondary" type="button" data-dns-policy-edit="${index}">Править</button>
        </article>`).join('') || '<p class="muted">Пока нет DNS-политик. Все DNS-серверы работают как общий список fallback.</p>'}
      </div>
    </section>
  `;
}

function dnsHostsSection(dns) {
  const hosts = Object.entries(dns.hosts || {});
  return `
    <section class="panel dns-host-panel">
      <div class="panel-title">
        <div><h2>Hosts</h2><span>Локальные подмены доменов из dns.hosts. Удобно для роутера, NAS, Pi-hole и домашних сервисов.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
      </div>
      <div class="dns-host-form">
        <div class="form-row">
          <label>Домен</label>
          <input id="dnsHostName" value="${escapeHtml(state.dnsHostName)}" placeholder="example.lan" />
        </div>
        <div class="form-row">
          <label>Значение</label>
          <input id="dnsHostValue" value="${escapeHtml(state.dnsHostValue)}" placeholder="192.168.50.1 или domain:router.lan" />
        </div>
        <button class="btn secondary" data-action="saveDnsHost">${state.dnsHostName ? 'Сохранить host' : 'Добавить host'}</button>
      </div>
      <div class="dns-bootstrap-card">
        <div>
          <strong>Bootstrap для DoH</strong>
          <span>Чтобы Xray не пытался резолвить dns.google и dns.adguard-dns.com через них же, добавьте фиксированные hosts-записи.</span>
        </div>
        <button class="btn secondary" data-action="applyDnsBootstrapHosts">Добавить bootstrap</button>
      </div>
      <div class="dns-hosts">
        ${hosts
          .map(([host, value]) => `<article class="dns-row dns-host-row">
            <div class="dns-host-main">
              <strong>${escapeHtml(host)}</strong>
              <span>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</span>
            </div>
            <span class="dns-host-actions">
              <button class="btn secondary" data-dns-host-edit="${escapeHtml(host)}">Править</button>
              <button class="btn secondary" data-dns-host-delete="${escapeHtml(host)}">Удалить</button>
            </span>
          </article>`)
          .join('') || '<p class="muted">Локальных host-подмен нет.</p>'}
      </div>
    </section>
  `;
}

function dnsCheckSection() {
  return `
    <section class="panel dns-check-panel">
      <div class="panel-title">
        <div><h2>Проверка DNS</h2><span>Проверьте, отвечает ли выбранный DNS-сервер на конкретный домен.</span></div>
      </div>
      <div class="dns-form dns-check-form">
        <div class="form-row">
          <label>DNS-сервер</label>
          <input id="dnsAddress" value="${escapeHtml(state.dnsAddress)}" placeholder="https://dns.google:443/dns-query" />
        </div>
        <div class="form-row">
          <label>Домен для проверки</label>
          <input id="dnsCheckHost" value="${escapeHtml(state.dnsCheckHost)}" placeholder="ya.ru" />
        </div>
        <button class="btn secondary ${state.busyAction === 'checkDns' ? 'is-busy' : ''}" data-action="checkDns" ${state.busyAction === 'checkDns' ? 'disabled' : ''}>${state.busyAction === 'checkDns' ? 'Проверяю...' : 'Проверить DNS'}</button>
      </div>
      ${state.dnsCheckResult ? `<div class="notice dns-check-result">
        Ответ: ${escapeHtml(dnsAnswerText(state.dnsCheckResult))}
        ${state.dnsCheckResult.error ? `<br />Ошибка: ${escapeHtml(state.dnsCheckResult.error)}` : ''}
        ${(state.dnsCheckResult.warnings || []).length ? `<br />Предупреждение: ${escapeHtml(state.dnsCheckResult.warnings.join('; '))}` : ''}
      </div>` : '<p class="muted">Результат появится здесь после проверки.</p>'}
    </section>
  `;
}

function dnsAdvancedSection() {
  const target = state.lanDnsStatus?.xrayTarget || state.lanDnsStatus?.suggestedXrayTarget || `127.0.0.1#${state.dnsInboundPort || '10535'}`;
  const targetTcp = String(target).replace('#', ':');
  return `
    ${dnsModeSection()}
    <section class="panel dns-inbound-panel">
      <div class="panel-title">
        <div><h2>DNS inbound</h2><span>Xray принимает DNS на ${escapeHtml(targetTcp)}, а dnsmasq можно направить на этот порт.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.busyAction === 'prepareDnsInbound' ? 'is-busy' : ''}" data-action="prepareDnsInbound" ${state.busyAction === 'prepareDnsInbound' ? 'disabled' : ''}>${state.busyAction === 'prepareDnsInbound' ? 'Готовлю...' : 'Подготовить inbound'}</button>
          <button class="btn warning ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
      </div>
      <div class="settings-warning">
        <strong>dnsmasq</strong>
        <span>После применения черновика выберите схему в блоке DNS для LAN: направить dnsmasq на Xray, внешний Pi-hole или вернуть стандартный OpenWrt resolver.</span>
      </div>
    </section>
  `;
}

function lanDnsSection() {
  const status = state.lanDnsStatus || {};
  const servers = Array.isArray(status.servers) ? status.servers : [];
  const readiness = status.readiness || {};
  const plan = state.lanDnsPreview || status.plan || null;
  const commands = Array.isArray(plan?.commands) ? plan.commands : [];
  const warnings = Array.isArray(plan?.warnings) ? plan.warnings : [];
  const xrayNeedsReadiness = state.lanDnsMode === 'xray';
  const xrayReady = !xrayNeedsReadiness || readiness.ready;
  const applyDisabled = state.lanDnsSaving || status.available === false || !plan || !xrayReady;
  const current = status.available === false
    ? 'UCI недоступен'
    : servers.length
      ? servers.join(', ')
      : (status.noresolv ? 'серверы не заданы' : 'системный resolv.conf');
  const routerLan = status.routerLan || '192.168.1.1';
  const xrayTarget = status.xrayTarget || status.suggestedXrayTarget || '127.0.0.1#10535';
  const xrayPort = String(xrayTarget).split('#').pop() || '10535';
  const dnsPortConflict = status.dnsPortConflict || readiness.udpConflict;
  const conflictOwner = status.dnsPortConflictOwner || readiness.udpOwner || '';
  const suggestedTarget = status.suggestedXrayTarget || '127.0.0.1#10535';
  const draftMode = state.lanDnsMode || 'xray';
  const draftTarget = draftMode === 'xray'
    ? xrayTarget
    : draftMode === 'upstream'
      ? (state.lanDnsUpstream || 'адрес Pi-hole/DNS не задан')
      : 'системные настройки OpenWrt';
  const draftUpstream = String(state.lanDnsUpstream || '').trim();
  const currentMatchesDraft = status.mode === draftMode && (
    draftMode !== 'upstream' ||
    (draftUpstream && (
      servers.includes(draftUpstream) ||
      servers.includes(draftUpstream.includes('#') ? draftUpstream : `${draftUpstream}#53`)
    ))
  );
  return `
    <section class="panel settings-section lan-dns-panel">
      <div class="panel-title">
        <div>
          <h2>DNS для LAN</h2>
          <span>Настраивает, куда dnsmasq отправляет DNS-запросы домашних устройств. Это отдельный системный шаг после подготовки DNS inbound в Xray.</span>
        </div>
      </div>
      <div class="settings-info-grid">
        <article><span>Текущий режим</span><strong>${escapeHtml(lanDnsModeLabel(status.mode))}</strong></article>
        <article><span>Upstream dnsmasq</span><strong>${escapeHtml(current)}</strong></article>
        <article><span>Адрес роутера</span><strong>${escapeHtml(routerLan)}</strong></article>
        <article><span>Xray DNS inbound</span><strong>${escapeHtml(xrayTarget)}</strong></article>
      </div>
      <div class="apply-state-panel ${currentMatchesDraft ? 'ok' : 'warn'}">
        <div class="apply-state-head">
          <strong>${currentMatchesDraft ? 'LAN DNS применен' : 'LAN DNS отличается от черновика'}</strong>
          <span>${currentMatchesDraft ? 'dnsmasq уже настроен так, как выбрано ниже.' : 'Ниже видно текущий upstream dnsmasq и что будет применено после кнопки «Применить LAN DNS».'}</span>
        </div>
        <div class="apply-state-grid two">
          <article class="${currentMatchesDraft ? 'ok' : 'warn'}">
            <span>Сейчас в dnsmasq</span>
            <strong>${escapeHtml(lanDnsModeLabel(status.mode))}</strong>
            <small>${escapeHtml(current)}</small>
          </article>
          <article class="${currentMatchesDraft ? 'ok' : 'warn'}">
            <span>Черновик</span>
            <strong>${escapeHtml(lanDnsModeLabel(draftMode))}</strong>
            <small>${escapeHtml(draftTarget)}</small>
          </article>
        </div>
      </div>
      <div class="advanced-grid three lan-dns-modes">
        <button type="button" class="advanced-card ${state.lanDnsMode === 'xray' ? 'active' : ''}" data-lan-dns-mode="xray">
          <strong>DNS через Xray</strong>
          <span>LAN → dnsmasq → ${escapeHtml(xrayTarget)} → Xray DNS. Подходит, когда RuOpenRay управляет DNS-маршрутизацией.</span>
        </button>
        <button type="button" class="advanced-card ${state.lanDnsMode === 'upstream' ? 'active' : ''}" data-lan-dns-mode="upstream">
          <strong>Внешний DNS / Pi-hole</strong>
          <span>LAN → dnsmasq → Pi-hole или другой DNS. Укажите адрес ниже, порт 53 добавится автоматически.</span>
        </button>
        <button type="button" class="advanced-card ${state.lanDnsMode === 'system' ? 'active' : ''}" data-lan-dns-mode="system">
          <strong>Как в OpenWrt</strong>
          <span>Убрать переопределение server/noresolv и вернуть dnsmasq к системным настройкам WAN.</span>
        </button>
      </div>
      <div class="lan-dns-form">
        <div class="form-row">
          <label>Порт DNS inbound Xray</label>
          <input id="dnsInboundPort" type="number" min="1024" max="65535" value="${escapeHtml(state.dnsInboundPort || xrayPort || '10535')}" placeholder="10535" />
          <small>По умолчанию 10535. Порт 5353 на OpenWrt часто занят mDNS/umdns, из-за этого Xray не стартует.</small>
        </div>
        <div class="form-row">
          <label>Адрес внешнего DNS или Pi-hole</label>
          <input id="lanDnsUpstream" value="${escapeHtml(state.lanDnsUpstream)}" placeholder="192.168.1.10 или 192.168.1.10#53" ${state.lanDnsMode === 'upstream' ? '' : 'disabled'} />
        </div>
        <label class="settings-check compact ${state.lanDnsRestart ? 'active' : ''}">
          <input id="lanDnsRestart" type="checkbox" ${state.lanDnsRestart ? 'checked' : ''} />
          <span><strong>Перезапустить dnsmasq</strong><em>Изменения UCI начнут работать сразу после restart.</em></span>
        </label>
      </div>
      <div class="lan-dns-readiness">
        <article class="${readiness.inbound ? 'ok' : 'warn'}"><span>DNS inbound</span><strong>${readiness.inbound ? 'готов' : 'не найден'}</strong></article>
        <article class="${readiness.outbound ? 'ok' : 'warn'}"><span>dns-out</span><strong>${readiness.outbound ? 'готов' : 'не найден'}</strong></article>
        <article class="${readiness.rule ? 'ok' : 'warn'}"><span>Маршрут DNS</span><strong>${readiness.rule ? 'готов' : 'не найден'}</strong></article>
        <article class="${dnsPortConflict ? 'warn' : (readiness.port ? 'ok' : 'warn')}"><span>Порт ${escapeHtml(xrayPort)}</span><strong>${dnsPortConflict ? 'занят' : (readiness.port ? 'слушает' : 'закрыт')}</strong></article>
      </div>
      ${commands.length ? `<div class="lan-dns-preview">
        <strong>Будет выполнено</strong>
        <pre>${escapeHtml(commands.join('\n'))}</pre>
      </div>` : '<p class="muted">Сначала нажмите «Проверить и показать команды»: RuOpenRay ничего не изменит, только покажет план.</p>'}
      ${warnings.length ? `<div class="settings-warning"><strong>Важно</strong><span>${escapeHtml(warnings.join(' '))}</span></div>` : ''}
      ${dnsPortConflict ? `<div class="settings-warning"><strong>Порт DNS занят</strong><span>UDP ${escapeHtml(xrayTarget)} уже держит ${escapeHtml(conflictOwner || 'другой процесс')}. При подготовке черновика RuOpenRay выберет запасной порт ${escapeHtml(suggestedTarget)}, а dnsmasq нужно направить туда же.</span></div>` : ''}
      ${xrayNeedsReadiness && !readiness.ready ? `<div class="settings-warning"><strong>DNS через Xray пока не готов</strong><span>Сначала подготовьте DNS inbound, примените конфигурацию Xray и убедитесь, что порт ${escapeHtml(readiness.targetTCP || xrayTarget.replace('#', ':'))} слушает. Кнопка применения заблокирована, чтобы не оставить LAN без DNS.</span></div>` : ''}
      <div class="settings-warning">
        <strong>Если Pi-hole главный DNS</strong>
        <span>DHCP может выдавать клиентам Pi-hole напрямую. Тогда в Pi-hole upstream укажите ${escapeHtml(routerLan)}#${escapeHtml(xrayPort)}, а Xray DNS inbound должен быть доступен с LAN-адреса роутера. Не делайте цепочку Pi-hole → роутер → Pi-hole.</span>
      </div>
      <div class="toolbar">
        <button class="btn secondary ${state.lanDnsSaving && state.busyAction === 'previewLanDnsUpstream' ? 'is-busy' : ''}" data-action="previewLanDnsUpstream" ${state.lanDnsSaving || status.available === false ? 'disabled' : ''}>${state.lanDnsSaving && state.busyAction === 'previewLanDnsUpstream' ? 'Проверяю...' : 'Проверить и показать команды'}</button>
        <button class="btn warning ${state.lanDnsSaving && state.busyAction === 'applyLanDnsUpstream' ? 'is-busy' : ''}" data-action="applyLanDnsUpstream" ${applyDisabled ? 'disabled' : ''}>${state.lanDnsSaving && state.busyAction === 'applyLanDnsUpstream' ? 'Применяю LAN DNS...' : 'Применить LAN DNS'}</button>
        <button class="btn secondary ${state.busyAction === 'prepareDnsInbound' ? 'is-busy' : ''}" data-action="prepareDnsInbound" ${state.busyAction === 'prepareDnsInbound' ? 'disabled' : ''}>${state.busyAction === 'prepareDnsInbound' ? 'Готовлю...' : 'Подготовить DNS inbound'}</button>
      </div>
    </section>
  `;
}

function dnsPanel() {
  const dns = dnsConfig();
  const stats = dnsStats();
  const dnsTabs = [
    ['servers', 'Серверы'],
    ['policies', 'Политики'],
    ['hosts', 'Hosts'],
    ['lan', 'LAN DNS'],
    ['guard', 'Защита'],
    ['advanced', 'Режим']
  ];
  const view = dnsTabs.some(([value]) => value === state.dnsView) ? state.dnsView : 'servers';
  const views = {
    servers: () => dnsServersSection(dns),
    policies: () => dnsPoliciesSection(dns),
    hosts: () => dnsHostsSection(dns),
    lan: lanDnsSection,
    guard: () => dnsLeakChecklist(dns, stats),
    advanced: dnsAdvancedSection
  };
  return `
    <section class="route-hero dns-hero">
      <div>
        <h2>DNS Xray</h2>
        <p>DNS-серверы, защита от утечек, проверка резолва и advanced-режимы разделены по вкладкам.</p>
      </div>
      <div class="route-score">
        <strong>${stats.servers}</strong>
        <span>DNS-серверов</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('DoH', stats.doh, 'HTTPS DNS-серверы')}
      ${stat('TCP DNS', stats.tcp, 'Серверы через TCP')}
      ${stat('Hosts', stats.hosts, 'Локальные подмены')}
      ${stat('Всего', stats.servers, 'Записи в dns.servers')}
    </section>

    <section class="routing-nav-panel dns-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю DNS">
        ${dnsTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-dns-view="${value}">${label}</button>`).join('')}
      </div>
    </section>

    ${views[view]()}
    ${noticeView(state, escapeHtml, { className: 'dns-page-message' })}
  `;
}

  return {
    dnsPanel,
  };
}
