export function bindConfigControls({ state, scheduleServerDraftSave }) {
  const jsonDraftNode = document.querySelector('#jsonDraft');
  jsonDraftNode?.addEventListener('input', (event) => {
    state.jsonDraft = event.target.value;
    state.configScrollTop = event.target.scrollTop;
    try {
      state.config = JSON.parse(event.target.value);
      if (typeof scheduleServerDraftSave === 'function') scheduleServerDraftSave(state.config);
    } catch {
      // Keep the draft text editable until the user fixes JSON.
    }
  });
  jsonDraftNode?.addEventListener('scroll', (event) => {
    state.configScrollTop = event.target.scrollTop;
  }, { passive: true });
}
