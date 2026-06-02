import { fragmentOutboundDetail, isFragmentOutboundTag } from './outbound-tags.js';

export function createXrayConfigModel(state) {
  function configInbounds() {
    if (!Array.isArray(state.config.inbounds)) state.config.inbounds = [];
    return state.config.inbounds;
  }
  
  function configOutbounds() {
    if (!Array.isArray(state.config.outbounds)) state.config.outbounds = [];
    return state.config.outbounds;
  }
  
  function advancedInbounds() {
    const inbounds = configInbounds();
    const transparent = inbounds.filter((item) => {
      const tag = String(item?.tag || '').toLowerCase();
      return tag.includes('transparent') || item?.streamSettings?.sockopt?.tproxy || item?.protocol === 'dokodemo-door';
    });
    return transparent.length ? transparent : inbounds;
  }
  
  function currentSnifferSettings() {
    const inbound = advancedInbounds().find((item) => item?.sniffing?.enabled) || advancedInbounds()[0] || {};
    const sniffing = inbound?.sniffing || {};
    const overrides = Array.isArray(sniffing.destOverride) ? sniffing.destOverride : [];
    const mode = !sniffing.enabled
      ? 'off'
      : overrides.includes('quic')
        ? 'http-tls-quic'
        : 'http-tls';
    return {
      mode,
      routeOnly: sniffing.routeOnly !== false,
      excluded: Array.isArray(sniffing.domainsExcluded) ? sniffing.domainsExcluded.join('\n') : '',
      targets: advancedInbounds().length
    };
  }
  
  function tcpFastOpenDraftEnabled() {
    return [...configOutbounds(), ...advancedInbounds()].some((item) => item?.streamSettings?.sockopt?.tcpFastOpen === true);
  }
  
  function currentDnsMode() {
    const dns = state.config?.dns || {};
    const fakeDNS = Array.isArray(dns.fakeDNS) && dns.fakeDNS.length;
    return fakeDNS ? 'fakedns' : 'normal';
  }
  
  function outboundAddress(outbound) {
    if (isFragmentOutboundTag(outbound?.tag)) return fragmentOutboundDetail(outbound?.tag) || 'фрагментация TLS';
    const protocol = outbound?.protocol;
    if (protocol === 'vless' || protocol === 'vmess') {
      const vnext = outbound?.settings?.vnext?.[0];
      return [vnext?.address, vnext?.port].filter(Boolean).join(':') || 'адрес не задан';
    }
    if (protocol === 'trojan' || protocol === 'shadowsocks') {
      const server = outbound?.settings?.servers?.[0];
      return [server?.address, server?.port].filter(Boolean).join(':') || 'адрес не задан';
    }
    if (protocol === 'dns') {
      return [outbound?.settings?.address, outbound?.settings?.port].filter(Boolean).join(':') || 'DNS';
    }
    if (protocol === 'freedom') return 'напрямую';
    if (protocol === 'blackhole') return 'блокировка';
    return outbound?.sendThrough || 'служебное направление';
  }
  
  function outboundTransport(outbound) {
    const stream = outbound?.streamSettings || {};
    const network = stream.network || 'tcp';
    const security = stream.security || 'none';
    if (isFragmentOutboundTag(outbound?.tag)) return 'fragment';
    if (outbound?.protocol === 'freedom') return 'direct';
    if (outbound?.protocol === 'blackhole') return 'block';
    if (outbound?.protocol === 'dns') return 'dns';
    return `${network} / ${security}`;
  }

  return {
    configInbounds,
    configOutbounds,
    advancedInbounds,
    currentSnifferSettings,
    tcpFastOpenDraftEnabled,
    currentDnsMode,
    outboundAddress,
    outboundTransport
  };
}
