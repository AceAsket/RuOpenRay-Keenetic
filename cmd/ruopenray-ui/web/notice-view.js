import { configTestLogDetails } from './xray-error-details.js';

export function noticeView(state, escapeHtml, { className = '', style = '' } = {}) {
  if (!state.message) return '';
  const details = state.messageDetails?.forMessage === state.message
    ? state.messageDetails
    : configTestLogDetails(state.configTestLog, state.message);
  const classes = ['notice', className].filter(Boolean).join(' ');
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  return `
    <div class="${classes}"${styleAttr}>
      <div>${escapeHtml(state.message)}</div>
      ${details ? noticeDetails(details, escapeHtml) : ''}
    </div>
  `;
}

function noticeDetails(details, escapeHtml) {
  const summary = details.summary || 'Показать подробности';
  const title = details.title || '';
  const body = details.body || '';
  const technical = details.technical || '';
  return `
    <details class="notice-details">
      <summary>${escapeHtml(summary)}</summary>
      <div class="notice-details-body">
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
        ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        ${technical ? `<pre>${escapeHtml(technical)}</pre>` : ''}
      </div>
    </details>
  `;
}
