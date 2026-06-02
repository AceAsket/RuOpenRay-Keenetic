export function bindDeviceControls({
  state,
  render,
  updateDeviceRule,
  removeDeviceRule,
}) {
  document.querySelectorAll('[data-device-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceIp = button.dataset.deviceIp || '';
      state.tab = 'devices';
      render();
    });
  });

  document.querySelectorAll('[data-device-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceMode = button.dataset.deviceMode;
      render();
    });
  });
  document.querySelectorAll('[data-device-outbound]').forEach((select) => {
    select.addEventListener('change', (event) => updateDeviceRule(Number(select.dataset.deviceOutbound), event.target.value));
  });
  document.querySelectorAll('[data-device-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDeviceRule(Number(button.dataset.deviceDelete)));
  });
  document.querySelectorAll('[data-lease-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceIp = button.dataset.leaseIp;
      state.deviceName = button.dataset.leaseName || '';
      render();
    });
  });

  document.querySelector('#deviceName')?.addEventListener('input', (event) => {
    state.deviceName = event.target.value;
  });
  document.querySelector('#deviceIp')?.addEventListener('input', (event) => {
    state.deviceIp = event.target.value;
  });
  document.querySelector('#deviceMode')?.addEventListener('change', (event) => {
    state.deviceMode = event.target.value;
  });
}
