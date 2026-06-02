export function bindDnsControls({
  state,
  render,
  removeDnsServer,
  moveDnsServer,
  prioritizeDohDnsServers,
  editDnsHost,
  removeDnsHost,
  editDnsPolicy,
  setDnsModeDraft,
}) {
  document.querySelectorAll('[data-dns-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsServer(Number(button.dataset.dnsDelete)));
  });
  document.querySelectorAll('[data-dns-move]').forEach((button) => {
    button.addEventListener('click', () => moveDnsServer(Number(button.dataset.dnsMove), Number(button.dataset.direction) || 0));
  });
  document.querySelectorAll('[data-dns-prioritize-doh]').forEach((button) => {
    button.addEventListener('click', () => prioritizeDohDnsServers());
  });
  document.querySelectorAll('[data-dns-host-edit]').forEach((button) => {
    button.addEventListener('click', () => editDnsHost(button.dataset.dnsHostEdit || ''));
  });
  document.querySelectorAll('[data-dns-host-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsHost(button.dataset.dnsHostDelete || ''));
  });
  document.querySelectorAll('[data-dns-policy-edit]').forEach((button) => {
    button.addEventListener('click', () => editDnsPolicy(Number(button.dataset.dnsPolicyEdit)));
  });
  document.querySelectorAll('[data-dns-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dnsAddress = button.dataset.dnsPreset;
      render();
    });
  });
  document.querySelectorAll('[data-lan-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.lanDnsMode = button.dataset.lanDnsMode;
      state.lanDnsPreview = null;
      render();
    });
  });

  document.querySelectorAll('[data-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => setDnsModeDraft(button.dataset.dnsMode));
  });

  document.querySelector('#dnsAddress')?.addEventListener('input', (event) => {
    state.dnsAddress = event.target.value;
  });
  document.querySelector('#dnsAuthEnabled')?.addEventListener('change', (event) => {
    state.dnsAuthEnabled = event.target.checked;
    render();
  });
  document.querySelector('#dnsAuthUser')?.addEventListener('input', (event) => {
    state.dnsAuthUser = event.target.value;
  });
  document.querySelector('#dnsAuthPassword')?.addEventListener('input', (event) => {
    state.dnsAuthPassword = event.target.value;
  });
  document.querySelector('#dnsDomains')?.addEventListener('input', (event) => {
    state.dnsDomains = event.target.value;
  });
  document.querySelector('#dnsPolicyServer')?.addEventListener('change', (event) => {
    editDnsPolicy(Number(event.target.value));
  });
  document.querySelector('#dnsPolicyDomains')?.addEventListener('input', (event) => {
    state.dnsPolicyDomains = event.target.value;
  });
  document.querySelector('#dnsHostName')?.addEventListener('input', (event) => {
    state.dnsHostName = event.target.value;
  });
  document.querySelector('#dnsHostValue')?.addEventListener('input', (event) => {
    state.dnsHostValue = event.target.value;
  });
  document.querySelector('#dnsCheckHost')?.addEventListener('input', (event) => {
    state.dnsCheckHost = event.target.value;
  });
  document.querySelector('#lanDnsUpstream')?.addEventListener('input', (event) => {
    state.lanDnsUpstream = event.target.value;
    state.lanDnsPreview = null;
  });
  document.querySelector('#dnsInboundPort')?.addEventListener('input', (event) => {
    state.dnsInboundPort = event.target.value;
    state.lanDnsPreview = null;
  });
  document.querySelector('#lanDnsRestart')?.addEventListener('change', (event) => {
    state.lanDnsRestart = event.target.checked;
    state.lanDnsPreview = null;
    render();
  });
  document.querySelector('#setupLanDnsUpstream')?.addEventListener('input', (event) => {
    state.setupLanDnsUpstream = event.target.value;
  });
  document.querySelector('#setupRestartDnsmasq')?.addEventListener('change', (event) => {
    state.setupRestartDnsmasq = event.target.checked;
    render();
  });
}
