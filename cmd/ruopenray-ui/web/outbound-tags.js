export const fragmentOutboundTagPrefix = 'ruopenray-fragment-';

export function isFragmentOutboundTag(tag) {
  return String(tag || '').startsWith(fragmentOutboundTagPrefix);
}

export function isBuiltinOutboundTag(tag) {
  return ['direct', 'block', 'dns-out', 'ruopenray-api'].includes(String(tag || '')) || isFragmentOutboundTag(tag);
}

export function isServiceOutbound(outbound) {
  const tag = String(outbound?.tag || '');
  if (isBuiltinOutboundTag(tag)) return true;
  return ['freedom', 'blackhole', 'dns'].includes(String(outbound?.protocol || ''));
}

function decodeRawUrlBase64(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  return atob(padded);
}

export function fragmentOutboundDetail(tag) {
  if (!isFragmentOutboundTag(tag)) return '';
  try {
    const raw = decodeRawUrlBase64(String(tag).slice(fragmentOutboundTagPrefix.length));
    const [length, interval, packets] = raw.split(',').map((item) => item.trim()).filter(Boolean);
    return [
      packets || 'tlshello',
      length ? `длина ${length}` : '',
      interval ? `интервал ${interval}` : ''
    ].filter(Boolean).join(' · ');
  } catch {
    return 'параметры fragment';
  }
}

export function serviceOutboundLabel(outbound) {
  const tag = String(outbound?.tag || '');
  const protocol = String(outbound?.protocol || '');
  if (isFragmentOutboundTag(tag)) return 'Фрагментация TLS';
  if (tag === 'direct' || protocol === 'freedom') return 'Напрямую';
  if (tag === 'block' || protocol === 'blackhole') return 'Блокировка';
  if (tag === 'dns-out' || protocol === 'dns') return 'DNS-выход Xray';
  if (tag === 'ruopenray-api') return 'Xray API';
  return tag || 'Служебный выход';
}
