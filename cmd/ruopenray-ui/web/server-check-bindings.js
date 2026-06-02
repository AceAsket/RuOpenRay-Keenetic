export function bindServerCheckControls({ state, render }) {
  document.querySelector('#serverCheckTimeout')?.addEventListener('input', (event) => {
    state.serverCheckTimeout = event.target.value;
  });
  document.querySelector('#serverCheckAttempts')?.addEventListener('input', (event) => {
    state.serverCheckAttempts = event.target.value;
  });
  document.querySelector('#serverCheckMode')?.addEventListener('change', (event) => {
    state.serverCheckMode = event.target.value;
    render();
  });
  document.querySelector('#serverCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#serverCheckHistoryLimit')?.addEventListener('input', (event) => {
    state.serverCheckHistoryLimit = event.target.value;
  });
  document.querySelector('#serverCheckHistoryRetentionHours')?.addEventListener('input', (event) => {
    state.serverCheckHistoryRetentionHours = event.target.value;
  });
  document.querySelector('#observatoryCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#observatoryInterval')?.addEventListener('input', (event) => {
    state.observatoryInterval = event.target.value;
  });
  document.querySelectorAll('[data-subscription-candidate-search]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const tag = event.target.dataset.subscriptionCandidateSearch || '';
      const query = String(event.target.value || '').trim().toLowerCase();
      state.subscriptionCandidateSearch = {
        ...(state.subscriptionCandidateSearch || {}),
        [tag]: event.target.value
      };
      const selector = `[data-subscription-candidate-row="${CSS.escape(tag)}"]`;
      let visible = 0;
      let total = 0;
      document.querySelectorAll(selector).forEach((row) => {
        total += 1;
        const matched = !query || String(row.dataset.subscriptionCandidateText || '').includes(query);
        row.hidden = !matched;
        if (matched) visible += 1;
      });
      const counter = document.querySelector(`[data-subscription-candidate-count="${CSS.escape(tag)}"]`);
      if (counter) counter.textContent = `Показано ${visible} из ${total}`;
    });
  });
}
