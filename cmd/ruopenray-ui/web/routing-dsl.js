export function createRoutingDsl({ state, escapeHtml, resolveRoutingAlias, routeStatsFor }) {
  function stripDslComment(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return '';
    return line.replace(/\s+#.*$/, '').trim();
  }

  function addDslTarget(rule, key, value) {
    const target = value.trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
    if (!target) return false;
    if (key === 'network') {
      rule.network = target;
      return true;
    }
    if (key === 'port') {
      rule.port = target;
      return true;
    }
    if (['domain', 'ip', 'source', 'inboundTag'].includes(key)) {
      if (!Array.isArray(rule[key])) rule[key] = [];
      rule[key].push(target);
      return true;
    }
    return false;
  }

  function parseRoutingDsl(text) {
    const rules = [];
    const warnings = [];
    let defaultOutbound = '';

    String(text || '')
      .split(/\r?\n/)
      .forEach((rawLine, index) => {
        const lineNo = index + 1;
        const line = stripDslComment(rawLine);
        if (!line) return;

        const defaultMatch = line.match(/^default\s*:\s*([A-Za-z0-9_.:-]+)\s*$/i);
        if (defaultMatch) {
          defaultOutbound = resolveRoutingAlias(defaultMatch[1]);
          return;
        }

        const match = line.match(/^(.+?)\s*->\s*([A-Za-z0-9_.:-]+)\s*$/);
        if (!match) {
          warnings.push(`Строка ${lineNo}: не понял формат`);
          return;
        }

        const target = match[2].startsWith('balancer:') ? match[2].slice('balancer:'.length) : '';
        const rule = target
          ? { type: 'field', balancerTag: target }
          : { type: 'field', outboundTag: resolveRoutingAlias(match[2]) };
        let targets = 0;
        const parts = match[1].split(/\s*&&\s*/).map((part) => part.trim()).filter(Boolean);
        for (const part of parts) {
          const condition = part.match(/^([A-Za-z][A-Za-z0-9_]*)\((.*)\)$/);
          if (!condition) {
            warnings.push(`Строка ${lineNo}: не понял условие "${part}"`);
            continue;
          }
          if (addDslTarget(rule, condition[1], condition[2])) {
            if (condition[1] !== 'network') targets += 1;
            const normalized = condition[2].trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
            if (condition[1] === 'domain' && normalized.startsWith('ext:')) {
              warnings.push(`Строка ${lineNo}: ext-списку нужен .dat файл на роутере`);
            }
          } else {
            warnings.push(`Строка ${lineNo}: условие "${condition[1]}" пока не поддержано`);
          }
        }

        if (!targets && !rule.port) {
          warnings.push(`Строка ${lineNo}: нет домена, IP, источника или порта`);
          return;
        }
        rules.push(rule);
      });

    if (defaultOutbound) {
      rules.push(
        defaultOutbound.startsWith('balancer:')
          ? { type: 'field', balancerTag: defaultOutbound.slice('balancer:'.length), network: 'tcp,udp' }
          : { type: 'field', outboundTag: defaultOutbound, network: 'tcp,udp' }
      );
    }

    return {
      rules,
      warnings,
      defaultOutbound,
      proxyAlias: resolveRoutingAlias('proxy')
    };
  }

  function isDslDefaultRule(rule, preview) {
    const matchesTarget = rule.outboundTag === preview.defaultOutbound ||
      (preview.defaultOutbound?.startsWith('balancer:') && rule.balancerTag === preview.defaultOutbound.slice('balancer:'.length));
    const network = String(rule.network || '').replace(/\s+/g, '').toLowerCase();
    const noConditions = !rule.domain && !rule.ip && !rule.source && !rule.inboundTag && (!rule.network || network === 'tcp,udp' || network === 'udp,tcp');
    return Boolean(
      preview.defaultOutbound &&
        matchesTarget &&
        noConditions &&
        (!rule.port || rule.port === '0-65535')
    );
  }

  function dslPreviewStats(preview) {
    const explicitRules = preview.rules.filter((rule) => !isDslDefaultRule(rule, preview));
    const count = (tag) => explicitRules.filter((rule) => rule.outboundTag === tag).length;
    const proxy = count(preview.proxyAlias);
    const direct = count('direct');
    const block = count('block');
    const known = new Set([preview.proxyAlias, 'direct', 'block']);
    const other = explicitRules.filter((rule) => !known.has(rule.outboundTag)).length;
    return { explicit: explicitRules.length, proxy, direct, block, other, total: preview.rules.length };
  }

  function dslPreviewView(preview) {
    const stats = dslPreviewStats(preview);
    const listName = state.routeDslName.trim();
    return `
      <div class="dsl-preview">
        <div class="dsl-preview-head">
          <strong>${stats.total} правил распознано</strong>
          <span>proxy -> ${escapeHtml(preview.proxyAlias)}</span>
        </div>
        ${listName ? `<small>Название списка: ${escapeHtml(listName)}</small>` : ''}
        <div class="dsl-preview-stats">
          <div><strong>${stats.proxy}</strong><span>proxy</span></div>
          <div><strong>${stats.direct}</strong><span>direct</span></div>
          <div><strong>${stats.block}</strong><span>block</span></div>
          <div><strong>${stats.other}</strong><span>другое</span></div>
          <div class="default"><strong>${escapeHtml(preview.defaultOutbound || 'не задан')}</strong><span>default</span></div>
        </div>
        <small>${preview.defaultOutbound ? `Default добавит catch-all правило в ${escapeHtml(preview.defaultOutbound)}.` : 'Default не задан: Xray применит свое поведение после последнего правила.'}</small>
        ${preview.warnings.length ? `<small class="warn">${escapeHtml(preview.warnings.slice(0, 4).join(' · '))}${preview.warnings.length > 4 ? ' · ...' : ''}</small>` : '<small>Ошибок формата не найдено</small>'}
      </div>
    `;
  }

  return {
    stripDslComment,
    addDslTarget,
    parseRoutingDsl,
    isDslDefaultRule,
    dslPreviewStats,
    dslPreviewView
  };
}
