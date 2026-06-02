export function formatDurationCompact(seconds = 0, { showSeconds = false, emptyText = 'меньше минуты' } = {}) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const tailHours = hours % 24;
  const tailMinutes = minutes % 60;
  if (days) {
    return [
      `${days} д`,
      tailHours ? `${tailHours} ч` : '',
      tailMinutes ? `${tailMinutes} мин` : ''
    ].filter(Boolean).join(' ');
  }
  if (hours) return [`${hours} ч`, tailMinutes ? `${tailMinutes} мин` : ''].filter(Boolean).join(' ');
  if (minutes) return `${minutes} мин`;
  return showSeconds ? `${Math.floor(seconds)} с` : emptyText;
}

export function fmtUptime(seconds = 0) {
  return formatDurationCompact(Math.max(0, Number(seconds || 0)));
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Number(seconds || 0));
  return formatDurationCompact(total, { showSeconds: true, emptyText: '0 с' });
}

export function byteSize(size) {
  const n = Number(size || 0);
  if (n >= 1024 * 1024 * 1024) return `${Math.round((n / 1024 / 1024 / 1024) * 10) / 10} GB`;
  if (n >= 1024 * 1024) return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}

export function byteRate(size) {
  return `${byteSize(size)}/s`;
}

export function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
