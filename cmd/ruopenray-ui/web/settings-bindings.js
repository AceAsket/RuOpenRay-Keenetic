export function bindSettingsControls({
  state,
  render,
  setUiTheme,
  installPasswordStorageKey,
  githubInstallCommand,
}) {
  document.querySelectorAll('[data-logging-level]').forEach((button) => {
    button.addEventListener('click', () => {
      state.loggingLevel = button.dataset.loggingLevel;
      render();
    });
  });

  document.querySelector('#profileName')?.addEventListener('input', (event) => {
    state.profileName = event.target.value;
  });
  document.querySelector('#coreBackup')?.addEventListener('change', (event) => {
    state.coreBackup = event.target.checked;
  });
  document.querySelector('#appBackup')?.addEventListener('change', (event) => {
    state.appBackup = event.target.checked;
    render();
  });
  document.querySelector('#settingsCurrentPassword')?.addEventListener('input', (event) => {
    state.settingsCurrentPassword = event.target.value;
  });
  document.querySelector('#settingsNewPassword')?.addEventListener('input', (event) => {
    state.settingsNewPassword = event.target.value;
  });
  document.querySelector('#settingsConfirmPassword')?.addEventListener('input', (event) => {
    state.settingsConfirmPassword = event.target.value;
  });
  document.querySelectorAll('[data-ui-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setUiTheme === 'function') {
        setUiTheme(button.dataset.uiTheme);
        return;
      }
      state.uiTheme = button.dataset.uiTheme === 'light' ? 'light' : 'dark';
      render();
    });
  });
  document.querySelector('#installPassword')?.addEventListener('input', (event) => {
    state.installPassword = event.target.value;
    globalThis.sessionStorage?.setItem(installPasswordStorageKey, state.installPassword);
    globalThis.localStorage?.removeItem(installPasswordStorageKey);
    const basic = document.querySelector('#installCommandBasic');
    const withXray = document.querySelector('#installCommandWithXray');
    if (basic) basic.textContent = githubInstallCommand(false);
    if (withXray) withXray.textContent = githubInstallCommand(true);
  });
  document.querySelector('#loggingAccessLog')?.addEventListener('change', (event) => {
    state.loggingAccessLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingErrorLog')?.addEventListener('change', (event) => {
    state.loggingErrorLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingDnsLog')?.addEventListener('change', (event) => {
    state.loggingDnsLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingAccessPath')?.addEventListener('input', (event) => {
    state.loggingAccessPath = event.target.value;
  });
  document.querySelector('#loggingErrorPath')?.addEventListener('input', (event) => {
    state.loggingErrorPath = event.target.value;
  });
  document.querySelector('#loggingMaxSizeMb')?.addEventListener('input', (event) => {
    state.loggingMaxSizeMb = event.target.value;
  });
  document.querySelector('#loggingRotateCopies')?.addEventListener('input', (event) => {
    state.loggingRotateCopies = event.target.value;
  });
  document.querySelector('#loggingClearOnRestart')?.addEventListener('change', (event) => {
    state.loggingClearOnRestart = event.target.checked;
    render();
  });
  document.querySelector('#loggingRestart')?.addEventListener('change', (event) => {
    state.loggingRestart = event.target.checked;
    render();
  });
  document.querySelector('#serviceStartupDelaySec')?.addEventListener('input', (event) => {
    state.serviceStartupDelaySec = event.target.value;
  });
  document.querySelector('#serviceApplyDelaySec')?.addEventListener('input', (event) => {
    state.serviceApplyDelaySec = event.target.value;
  });
  document.querySelector('#serviceGoMemLimit')?.addEventListener('input', (event) => {
    state.serviceGoMemLimit = event.target.value;
  });
  document.querySelector('#serviceGoGC')?.addEventListener('input', (event) => {
    state.serviceGoGC = event.target.value;
  });
  document.querySelector('#serviceDownloadMirror')?.addEventListener('change', (event) => {
    state.serviceDownloadMirror = event.target.value;
    render();
  });
  document.querySelector('#serviceMirrorPrefix')?.addEventListener('input', (event) => {
    state.serviceMirrorPrefix = event.target.value;
  });
}
