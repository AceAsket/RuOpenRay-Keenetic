export function createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress,
  activeProxyOutbound,
}) {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  
  function ipParts(ip = '') {
    const parts = String(ip).split('.').map((part) => Number(part));
    return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
  }

  function activeProxySniTarget() {
    const outbound = activeProxyOutbound?.();
    const address = outboundAddress(outbound || {});
    return String(address || '').split(':')[0].trim();
  }
  
  function sniRadar(results, scan) {
    const targetIp = scan?.targetIp || '';
    const targetParts = ipParts(targetIp);
    const visible = results.filter((item) => item.ip !== targetIp).slice(0, 12);
    const slots = [
      [16, 18], [50, 14], [84, 18], [8, 40], [92, 40], [8, 60],
      [92, 60], [16, 82], [50, 86], [84, 82], [30, 12], [70, 88]
    ];
    const points = visible.map((item, index) => {
      const proximity = clamp(Number(item.proximity || 0), 0, 100);
      const [x, y] = slots[index % slots.length];
      const near = proximity >= 90;
      const shortName = String(item.domain || item.ip).replace(/^\*\./, '').split('.')[0].slice(0, 10);
      return `<button class="sni-map-point ${near ? 'near' : ''}" data-sni-map="${index}" style="left:${x}%; top:${y}%; --delay:${index * 70}ms; --z:${30 - index}" title="${escapeHtml(item.domain || item.ip)} · ${escapeHtml(item.proximity)}%">
        <span>${escapeHtml(item.proximity)}%</span>
        <small>${escapeHtml(shortName)}</small>
      </button>`;
    }).join('');
    const radiusLabel = targetParts ? `${targetParts[0]}.${targetParts[1]}.${targetParts[2]}.x` : scan?.network || 'диапазон';
    return `
      <section class="panel sni-map-panel">
        <div class="panel-title">
          <div><h2>Карта близости SNI</h2><span>Центр — ваш адрес, ближе к центру — выше шанс, что SNI живет рядом с сервером.</span></div>
        </div>
        <div class="sni-map">
          <div class="sni-map-grid"></div>
          <div class="sni-map-ring ring-a"></div>
          <div class="sni-map-ring ring-b"></div>
          <div class="sni-map-center">
            <strong>${escapeHtml(targetIp || scan?.target || 'цель')}</strong>
            <span>${escapeHtml(radiusLabel)}</span>
          </div>
          ${points || '<div class="sni-map-empty">После поиска здесь появятся ближайшие SNI-точки</div>'}
        </div>
      </section>
    `;
  }
  
  function sniPanel() {
    const targetIp = state.sniScan?.targetIp || '';
    const results = (state.sniScan?.results || []).filter((item) => item.ip !== targetIp);
    const best = results[0];
    const activeTarget = activeProxySniTarget();
    const targetHint = activeTarget || 'example.com или 1.1.1.1';
    return `
      <section class="route-hero">
        <div>
          <h2>SNI-поисковик</h2>
          <p>Ищет TLS-хосты рядом с IP или доменом, снимает сертификат и показывает домены, которые могут быть полезны для REALITY/SNI-настроек.</p>
        </div>
        <div class="route-score">
          <strong>${results.length}</strong>
          <span>кандидатов</span>
        </div>
      </section>
  
      <section class="panel">
        <div class="panel-title">
          <div><h2>Поиск рядом с адресом</h2><span>По умолчанию ограничиваем поиск /24 и 256 адресами, чтобы не перегружать роутер.</span></div>
          <button class="btn" data-action="scanSni" ${state.sniScanning ? 'disabled' : ''}>${state.sniScanning ? 'Ищу...' : 'Начать поиск'}</button>
        </div>
        <div class="sni-form">
          <div class="form-row">
            <label>IP или домен</label>
            <input id="sniTarget" value="${escapeHtml(state.sniTarget)}" placeholder="${escapeHtml(targetHint)}" />
          </div>
          <div class="form-row">
            <label>CIDR</label>
            <select id="sniCidr">
              ${[24, 25, 26, 27, 28, 29, 30, 32].map((cidr) => `<option value="${cidr}" ${state.sniCidr === String(cidr) ? 'selected' : ''}>/${cidr}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Таймаут, мс</label>
            <input id="sniTimeout" type="number" min="500" max="8000" step="100" value="${escapeHtml(state.sniTimeout)}" />
          </div>
          <div class="form-row">
            <label>Потоков</label>
            <input id="sniThreads" type="number" min="1" max="128" step="1" value="${escapeHtml(state.sniThreads)}" />
          </div>
          <div class="form-row">
            <label>Лимит IP</label>
            <input id="sniLimit" type="number" min="1" max="1024" step="1" value="${escapeHtml(state.sniLimit)}" />
          </div>
        </div>
        <p class="muted">Сканируйте только свои адреса или диапазоны, где у вас есть разрешение. Это активная проверка TCP/443.</p>
        ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>
  
      ${state.sniScan ? `<section class="stats route-stats">
        ${stat('Диапазон', state.sniScan.network || '-', `${state.sniScan.scanned || 0} IP проверено`)}
        ${stat('Найдено', results.length, 'ответили TLS-сертификатом')}
        ${stat('Ближайший', best?.ip || '-', best?.domain || 'нет результатов')}
        ${stat('Цель', state.sniScan.targetIp || '-', state.sniScan.target || '')}
      </section>` : ''}
  
      ${sniRadar(results, state.sniScan || { target: state.sniTarget || activeTarget || 'цель поиска' })}
  
      <section class="panel">
        <div class="panel-title">
          <div><h2>Кандидаты SNI</h2><span>Сортировка по близости к целевому IP. Клик по точке на карте перематывает к строке в списке.</span></div>
        </div>
        <div class="sni-results">
          ${results
            .map((item, index) => `<article class="sni-row ${state.sniFocusedIndex === index ? 'focused' : ''}" data-sni-result="${index}">
              <div class="sni-proximity"><strong>${escapeHtml(item.proximity)}%</strong><span>близость</span></div>
              <div class="sni-main">
                <strong>${escapeHtml(item.domain || item.ip)}</strong>
                <span>${escapeHtml(item.ip)} · ${escapeHtml(item.issuer || 'issuer не указан')} · ${escapeHtml(item.latencyMs || 0)} мс</span>
              </div>
            </article>`)
            .join('') || '<p class="muted">Пока нет результатов. Запустите поиск по IP или домену вашего сервера.</p>'}
        </div>
      </section>
    `;
  }

  return {
    clamp,
    ipParts,
    activeProxySniTarget,
    sniRadar,
    sniPanel,
  };
}
