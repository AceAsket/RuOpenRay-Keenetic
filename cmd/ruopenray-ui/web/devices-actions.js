export function createDevicesActions({
  state,
  render,
  normalizeDeviceIp,
  proxyInboundTags,
  routeRules,
  setRoutingDraft
}) {
  function addDeviceRule() {
    const ip = normalizeDeviceIp(state.deviceIp);
    if (!ip) {
      state.message = 'Укажите IP устройства в LAN, например 192.168.50.42';
      render();
      return;
    }
    const rule = {
      type: 'field',
      outboundTag: state.deviceMode,
      source: [ip]
    };
    const inbounds = proxyInboundTags();
    if (inbounds) rule.inboundTag = inbounds;
    setRoutingDraft([rule, ...routeRules()]);
    state.deviceIp = '';
    state.deviceName = '';
    state.message = `Правило для устройства ${ip} добавлено в черновик`;
    render();
  }

  function updateDeviceRule(index, outboundTag) {
    const rules = routeRules().map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, outboundTag } : rule));
    setRoutingDraft(rules);
    state.message = 'Режим устройства изменен в черновике';
    render();
  }

  function removeDeviceRule(index) {
    const rules = routeRules().filter((_, ruleIndex) => ruleIndex !== index);
    setRoutingDraft(rules);
    state.message = 'Правило устройства удалено из черновика';
    render();
  }


  return {
    addDeviceRule,
    updateDeviceRule,
    removeDeviceRule
  };
}
