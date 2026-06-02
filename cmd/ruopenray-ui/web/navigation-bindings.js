export function bindNavigationControls({ state, render, configureLogTimer }) {
  function finishNavigation() {
    render();
    if (typeof configureLogTimer === 'function') configureLogTimer();
  }

  function closeDialogsForNavigation() {
    state.coreDialogOpen = false;
    state.installWizardOpen = false;
    state.setupWizardOpen = false;
    state.importDialog = '';
    state.routeRuleDialog = false;
    state.routeBalancerDialog = false;
    state.routePresetDialog = false;
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      state.mobileNavOpen = false;
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tabJump;
      if (button.dataset.routingViewJump) state.routingView = button.dataset.routingViewJump;
      if (button.dataset.diagnosticsJump) state.diagnosticsView = button.dataset.diagnosticsJump;
      state.mobileNavOpen = false;
      closeDialogsForNavigation();
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-diagnostics-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.diagnosticsView = button.dataset.diagnosticsView;
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-import-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      state.importDialog = button.dataset.importDialog;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-settings-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settingsView = button.dataset.settingsView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-routing-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routingView = button.dataset.routingView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-dns-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dnsView = button.dataset.dnsView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-servers-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.serversView = button.dataset.serversView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-setup-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.setupLanDnsMode = button.dataset.setupDnsMode;
      if (state.setupLanDnsMode === 'upstream' && !state.setupLanDnsUpstream) {
        state.setupLanDnsUpstream = state.lanDnsUpstream || state.lanDnsStatus?.servers?.[0] || '';
      }
      render();
    });
  });
  document.querySelectorAll('[data-setup-step]').forEach((button) => {
    button.addEventListener('click', () => {
      state.setupStep = button.dataset.setupStep || state.setupStep || 'environment';
      render();
    });
  });
}

export function bindModalControls() {
  document.querySelectorAll('.modal-backdrop[data-action]').forEach((backdrop) => {
    backdrop.addEventListener('pointerdown', (event) => {
      backdrop.dataset.pointerStartedInModal = event.target.closest('[data-modal]') ? '1' : '0';
    }, true);
  });
  document.querySelectorAll('[data-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => event.stopPropagation());
  });
}
