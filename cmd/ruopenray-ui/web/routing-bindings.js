export function bindRoutingControls({
  state,
  render,
  addRoutingPreset,
  editRoutingPreset,
  deleteCustomRoutePreset,
  deleteRoutePresetSource,
  toggleRoutePresetSource,
  updateRoutePresetSources,
  removeRoutingRule,
  removeRoutingRuleRange,
  disableRoutingRule,
  disableRoutingRuleRange,
  restoreDisabledRouteRule,
  deleteDisabledRouteRule,
  moveRoutingRule,
  moveRoutingRuleInsideGroup,
  reorderRoutingRuleInsideGroup,
  moveRoutingRuleRange,
  toggleRouteRuleSelection,
  groupRoutingRuleWithNext,
  renameRoutingRuleGroup,
  openRoutingRuleEditor,
  openRouteBalancerDialog,
  removeRouteBalancer,
  setFirewallBypassMode,
  setFirewallRouterMode,
  setFirewallDeviceMode,
  toggleFirewallDevice,
  setFirewallKillSwitchDeviceMode,
  toggleFirewallKillSwitchDevice,
  reorderRoutingRule,
  reorderRoutingRuleRange,
  routeRules,
  describeRouteRule,
  routeTargetFlagMarkup,
  routeTargetStatus,
  updateRoutingTarget,
  updateRoutingTargetRange,
  removeOutbound,
  openServerEditor,
  setServerEditCountry,
  updateServerEditField,
  routeAllToOutbound,
  checkServers,
  setSnifferDraft,
  setQuicPolicy,
  currentSnifferSettings,
  setFirewallPortMode,
  setFirewallBlockQuic,
  setFirewallKillSwitchEnabled,
  setFirewallKillSwitchDomainMode,
  setFirewallKillSwitchTargets,
  applyLeaseSearch,
  setRouteBalancerSelector,
  moveRouteBalancerSelector,
  balancerOptions,
}) {
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => addRoutingPreset(button.dataset.preset));
  });
  document.querySelectorAll('[data-route-preset-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.routePresetCheck;
      const selected = new Set(state.selectedRoutePresets);
      if (checkbox.checked) selected.add(key);
      else selected.delete(key);
      state.selectedRoutePresets = [...selected];
      checkbox.closest('.preset-check')?.classList.toggle('active', checkbox.checked);
      const applyButton = document.querySelector('[data-action="applyRoutePresets"]');
      if (applyButton) applyButton.disabled = state.selectedRoutePresets.length === 0;
    });
  });
  document.querySelectorAll('[data-route-preset-edit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      editRoutingPreset(button.dataset.routePresetEdit);
    });
  });
  document.querySelectorAll('[data-route-preset-delete]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteCustomRoutePreset(button.dataset.routePresetDelete);
    });
  });
  document.querySelectorAll('[data-route-preset-source-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteRoutePresetSource(button.dataset.routePresetSourceDelete));
  });
  document.querySelectorAll('[data-route-preset-source-update]').forEach((button) => {
    button.addEventListener('click', () => updateRoutePresetSources(button.dataset.routePresetSourceUpdate));
  });
  document.querySelectorAll('[data-route-preset-source-enabled]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleRoutePresetSource(checkbox.dataset.routePresetSourceEnabled, event.target.checked));
  });
  document.querySelectorAll('[data-route-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRoutingRule(Number(button.dataset.routeDelete)));
  });
  document.querySelectorAll('[data-route-disable]').forEach((button) => {
    button.addEventListener('click', () => disableRoutingRule(Number(button.dataset.routeDisable)));
  });
  document.querySelectorAll('[data-route-group-delete-start]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeRoutingRuleRange(
        Number(button.dataset.routeGroupDeleteStart),
        Number(button.dataset.routeGroupDeleteEnd),
        button.dataset.routeGroupTitle || ''
      );
    });
  });
  document.querySelectorAll('[data-route-group-disable-start]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      disableRoutingRuleRange(
        Number(button.dataset.routeGroupDisableStart),
        Number(button.dataset.routeGroupDisableEnd),
        button.dataset.routeGroupTitle || ''
      );
    });
  });
  document.querySelectorAll('[data-route-restore]').forEach((button) => {
    button.addEventListener('click', () => restoreDisabledRouteRule(button.dataset.routeRestore));
  });
  document.querySelectorAll('[data-route-disabled-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteDisabledRouteRule(button.dataset.routeDisabledDelete));
  });
  document.querySelectorAll('[data-route-move]').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRule(Number(button.dataset.routeMove), Number(button.dataset.direction)));
  });
  document.querySelectorAll('[data-route-group-child-move]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveRoutingRuleInsideGroup(
        Number(button.dataset.routeGroupChildMove),
        Number(button.dataset.routeGroupChildStart),
        Number(button.dataset.routeGroupChildEnd),
        Number(button.dataset.direction)
      );
    });
  });
  document.querySelectorAll('[data-route-group-move-start]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveRoutingRuleRange(
        Number(button.dataset.routeGroupMoveStart),
        Number(button.dataset.routeGroupMoveEnd),
        Number(button.dataset.direction)
      );
    });
  });
  document.querySelectorAll('[data-route-select]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', (event) => {
      toggleRouteRuleSelection(Number(checkbox.dataset.routeSelect), event.target.checked);
    });
  });
  document.querySelectorAll('[data-route-group-rename-start]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      renameRoutingRuleGroup(
        Number(button.dataset.routeGroupRenameStart),
        Number(button.dataset.routeGroupRenameEnd)
      );
    });
  });
  document.querySelectorAll('[data-route-edit]').forEach((button) => {
    button.addEventListener('click', () => openRoutingRuleEditor(Number(button.dataset.routeEdit)));
  });
  document.querySelectorAll('[data-route-balancer-edit]').forEach((button) => {
    button.addEventListener('click', () => openRouteBalancerDialog(Number(button.dataset.routeBalancerEdit)));
  });
  document.querySelectorAll('[data-route-balancer-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRouteBalancer(Number(button.dataset.routeBalancerDelete)));
  });
  document.querySelectorAll('[data-firewall-bypass-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallBypassMode(button.dataset.firewallBypassMode));
  });
  document.querySelectorAll('[data-firewall-router-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallRouterMode(button.dataset.firewallRouterMode));
  });
  document.querySelectorAll('[data-firewall-device-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallDeviceMode(button.dataset.firewallDeviceMode));
  });
  document.querySelectorAll('[data-firewall-device]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleFirewallDevice(checkbox.dataset.firewallDevice, event.target.checked));
  });
  document.querySelectorAll('[data-kill-switch-device-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallKillSwitchDeviceMode(button.dataset.killSwitchDeviceMode));
  });
  document.querySelectorAll('[data-kill-switch-device]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleFirewallKillSwitchDevice(checkbox.dataset.killSwitchDevice, event.target.checked));
  });
  const clearRouteDragState = () => {
    document.querySelectorAll('.route-row.dragging, .route-row.drag-over, .route-row.drop-before, .route-row.drop-after, .route-preset-group-row.dragging, .route-preset-group-row.drag-over, .route-preset-group-row.drop-before, .route-preset-group-row.drop-after')
      .forEach((item) => item.classList.remove('dragging', 'drag-over', 'drop-before', 'drop-after'));
  };
  const isRouteGroupChildDrag = (event) => [...(event.dataTransfer?.types || [])].includes('application/x-ruopenray-route-child');
  document.querySelectorAll('[data-route-group-child-index]').forEach((row) => {
    row.addEventListener('pointerdown', (event) => {
      row.dataset.dragHandle = event.target.closest('.route-drag-handle') ? '1' : '0';
    });
    row.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (row.dataset.dragHandle !== '1') {
        event.preventDefault();
        return;
      }
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      const payload = JSON.stringify({
        index: Number(row.dataset.routeGroupChildIndex),
        start: Number(row.dataset.routeGroupChildStart),
        end: Number(row.dataset.routeGroupChildEnd)
      });
      event.dataTransfer.setData('application/x-ruopenray-route-child', payload);
      event.dataTransfer.setData('text/plain', payload);
    });
    row.addEventListener('dragend', (event) => {
      event.stopPropagation();
      clearRouteDragState();
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      document.querySelectorAll('.route-preset-group-children .route-row.drag-over, .route-preset-group-children .route-row.drop-before, .route-preset-group-children .route-row.drop-after')
        .forEach((item) => {
          if (item !== row) item.classList.remove('drag-over', 'drop-before', 'drop-after');
        });
      row.classList.add('drag-over');
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
    });
    row.addEventListener('dragleave', (event) => {
      event.stopPropagation();
      row.classList.remove('drag-over', 'drop-before', 'drop-after');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rawPayload = event.dataTransfer.getData('application/x-ruopenray-route-child') || event.dataTransfer.getData('text/plain');
      let payload = null;
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = null;
      }
      const fromIndex = Number(payload?.index);
      const fromStart = Number(payload?.start);
      const fromEnd = Number(payload?.end);
      const groupStart = Number(row.dataset.routeGroupChildStart);
      const groupEnd = Number(row.dataset.routeGroupChildEnd);
      if (fromStart !== groupStart || fromEnd !== groupEnd) {
        clearRouteDragState();
        return;
      }
      const toIndex = Number(row.dataset.routeGroupChildIndex);
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.remove('drag-over', 'drop-before', 'drop-after');
      reorderRoutingRuleInsideGroup(fromIndex, groupStart, groupEnd, before ? toIndex : toIndex + 1);
    });
  });
  document.querySelectorAll('[data-route-range-start]').forEach((row) => {
    row.addEventListener('pointerdown', (event) => {
      row.dataset.dragHandle = event.target.closest('.route-drag-handle') ? '1' : '0';
    });
    row.addEventListener('dragstart', (event) => {
      if (row.dataset.dragHandle !== '1') {
        event.preventDefault();
        return;
      }
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      const payload = JSON.stringify({
        start: Number(row.dataset.routeRangeStart),
        end: Number(row.dataset.routeRangeEnd || Number(row.dataset.routeRangeStart) + 1)
      });
      event.dataTransfer.setData('application/x-ruopenray-route-range', payload);
      event.dataTransfer.setData('text/plain', payload);
    });
    row.addEventListener('dragend', () => {
      clearRouteDragState();
    });
    row.addEventListener('dragover', (event) => {
      if (isRouteGroupChildDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      document.querySelectorAll('.route-row.drag-over, .route-row.drop-before, .route-row.drop-after, .route-preset-group-row.drag-over, .route-preset-group-row.drop-before, .route-preset-group-row.drop-after')
        .forEach((item) => {
          if (item !== row) item.classList.remove('drag-over', 'drop-before', 'drop-after');
        });
      row.classList.add('drag-over');
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over', 'drop-before', 'drop-after'));
    row.addEventListener('drop', (event) => {
      if (isRouteGroupChildDrag(event)) {
        clearRouteDragState();
        return;
      }
      event.preventDefault();
      const rawPayload = event.dataTransfer.getData('application/x-ruopenray-route-range') || event.dataTransfer.getData('text/plain');
      let payload = null;
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        const index = Number(rawPayload);
        payload = { start: index, end: index + 1 };
      }
      const fromStart = Number(payload?.start);
      const fromEnd = Number(payload?.end);
      const toStart = Number(row.dataset.routeRangeStart);
      const toEnd = Number(row.dataset.routeRangeEnd || toStart + 1);
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.remove('drag-over', 'drop-before', 'drop-after');
      const moveRange = reorderRoutingRuleRange || ((start, end, target) => reorderRoutingRule(start, target));
      moveRange(fromStart, fromEnd, before ? toStart : toEnd);
    });
  });
  document.querySelectorAll('[data-route-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.routeFocus);
      const rule = routeRules()[index];
      const info = rule ? describeRouteRule(rule) : null;
      state.routeSearch = info?.value || '';
      state.tab = 'routing';
      render();
    });
  });
  const routeTargetOptionLabel = (option) => String(option?.textContent || '')
    .replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '')
    .replace(/^[A-Z]{2}\s+(?=\S)/, '')
    .trim();

  const routeTargetEncodedValue = (select, value) => {
    if (select?.dataset?.routeOutboundPicker !== undefined) return `outbound:${value}`;
    return value;
  };

  const routeTargetStatusClass = (status) => {
    if (!status) return '';
    if (status.tone === 'ok') return 'ok';
    if (status.tone === 'bad') return 'bad';
    return 'unknown';
  };

  const closeRouteTargetPickers = (except = null) => {
    document.querySelectorAll('.route-target-picker.open').forEach((picker) => {
      if (picker === except) return;
      picker.classList.remove('open');
      picker.querySelector('.route-target-trigger')?.setAttribute('aria-expanded', 'false');
      const menu = picker.querySelector('.route-target-menu');
      if (menu) menu.hidden = true;
    });
  };

  const decorateRouteTargetSelect = (select, encodedValue) => {
    const flagMarkup = typeof routeTargetFlagMarkup === 'function' ? routeTargetFlagMarkup(encodedValue) : '';
    let wrapper = select.closest('.route-target-select');
    let flag = wrapper?.querySelector('.route-target-flag');
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.className = 'route-target-select route-target-picker';
      flag = document.createElement('span');
      flag.className = 'route-target-flag';
      select.parentNode?.insertBefore(wrapper, select);
      wrapper.append(flag, select);
    }
    if (wrapper) {
      wrapper.classList.toggle('has-flag', Boolean(flagMarkup));
      if (flag) flag.innerHTML = flagMarkup;
    }
    wrapper?.classList.add('route-target-picker');
    select.hidden = true;
    let trigger = wrapper?.querySelector('.route-target-trigger');
    let menu = wrapper?.querySelector('.route-target-menu');
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'route-target-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      select.after(trigger);
    }
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'route-target-menu';
      menu.setAttribute('role', 'listbox');
      menu.hidden = true;
      trigger.after(menu);
    }
    const selectedOption = [...select.options].find((option) => option.selected) || select.options[0];
    const selectedText = routeTargetOptionLabel(selectedOption);
    const selectedStatus = typeof routeTargetStatus === 'function' ? routeTargetStatus(encodedValue) : null;
    const selectedStatusClass = routeTargetStatusClass(selectedStatus);
    trigger.textContent = '';
    const triggerFlag = document.createElement('span');
    triggerFlag.className = 'route-target-trigger-flag';
    triggerFlag.innerHTML = flagMarkup || '';
    const triggerStatus = document.createElement('span');
    triggerStatus.className = `route-target-status ${selectedStatusClass}`;
    triggerStatus.title = selectedStatus?.label || '';
    triggerStatus.hidden = !selectedStatusClass;
    const triggerText = document.createElement('span');
    triggerText.className = 'route-target-trigger-text';
    triggerText.textContent = selectedText || selectedOption?.value || '';
    const triggerCaret = document.createElement('span');
    triggerCaret.className = 'route-target-trigger-caret';
    triggerCaret.setAttribute('aria-hidden', 'true');
    triggerCaret.textContent = '▾';
    trigger.append(triggerFlag, triggerStatus, triggerText, triggerCaret);
    trigger.disabled = select.disabled;
    menu.textContent = '';
    [...select.options].forEach((option) => {
      const optionEncoded = routeTargetEncodedValue(select, option.value);
      const optionFlag = typeof routeTargetFlagMarkup === 'function' ? routeTargetFlagMarkup(optionEncoded) : '';
      const optionStatus = typeof routeTargetStatus === 'function' ? routeTargetStatus(optionEncoded) : null;
      const optionStatusClass = routeTargetStatusClass(optionStatus);
      const active = option.value === select.value;
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = `route-target-option ${active ? 'active' : ''}`;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('aria-selected', active ? 'true' : 'false');
      optionButton.dataset.routeTargetChoice = option.value;
      const optionFlagNode = document.createElement('span');
      optionFlagNode.className = 'route-target-option-flag';
      optionFlagNode.innerHTML = optionFlag || '';
      const optionStatusNode = document.createElement('span');
      optionStatusNode.className = `route-target-status ${optionStatusClass}`;
      optionStatusNode.title = optionStatus?.label || '';
      optionStatusNode.hidden = !optionStatusClass;
      const optionText = document.createElement('span');
      optionText.className = 'route-target-option-text';
      optionText.textContent = routeTargetOptionLabel(option) || option.value;
      optionButton.append(optionFlagNode, optionStatusNode, optionText);
      menu.append(optionButton);
    });
    trigger.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (trigger.disabled) return;
      const open = !wrapper.classList.contains('open');
      closeRouteTargetPickers(open ? wrapper : null);
      wrapper.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.hidden = !open;
    };
    menu.querySelectorAll('[data-route-target-choice]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.value = button.dataset.routeTargetChoice || '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeRouteTargetPickers();
      });
    });
  };
  document.querySelectorAll('[data-route-target], [data-route-group-target]').forEach((select) => {
    decorateRouteTargetSelect(select, select.value);
    if (select.dataset.routeGroupTarget !== undefined) {
      const picker = select.closest('.route-target-picker');
      picker?.addEventListener('click', (event) => event.stopPropagation());
      picker?.addEventListener('mousedown', (event) => event.stopPropagation());
      picker?.addEventListener('keydown', (event) => event.stopPropagation());
    }
    select.addEventListener('change', (event) => {
      if (select.dataset.routeGroupTarget !== undefined) {
        updateRoutingTargetRange(
          Number(select.dataset.routeGroupTargetStart),
          Number(select.dataset.routeGroupTargetEnd),
          event.target.value
        );
        return;
      }
      updateRoutingTarget(Number(select.dataset.routeTarget), event.target.value);
    });
  });
  document.querySelectorAll('[data-route-values-panel]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const width = 340;
      const gap = 8;
      const margin = 12;
      const preferredMaxHeight = 420;
      const clickX = Number.isFinite(event.clientX) ? event.clientX : button.getBoundingClientRect().right;
      const clickY = Number.isFinite(event.clientY) ? event.clientY : button.getBoundingClientRect().top;
      const fitsRight = clickX + gap + width + margin <= window.innerWidth;
      const left = fitsRight ? clickX + gap : Math.max(margin, clickX - width - gap);
      const top = Math.min(
        Math.max(margin, clickY - 18),
        Math.max(margin, window.innerHeight - 220 - margin)
      );
      const maxHeight = Math.min(preferredMaxHeight, Math.max(220, window.innerHeight - top - margin));
      state.routeValuesDrawerAnchor = { top, maxHeight, left };
      state.routeValuesDrawerIndex = Number(button.dataset.routeValuesPanel);
      render();
    });
  });
  document.querySelectorAll('[data-route-values-panel-close]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.routeValuesDrawerIndex = null;
      state.routeValuesDrawerAnchor = null;
      render();
    });
  });
  const closeRouteValuesDrawer = () => {
    if (state.routeValuesDrawerIndex === null || state.routeValuesDrawerIndex === undefined || state.routeValuesDrawerIndex === '') return false;
    state.routeValuesDrawerIndex = null;
    state.routeValuesDrawerAnchor = null;
    render();
    return true;
  };
  if (typeof document.addEventListener === 'function' && !document.__routeValuesDrawerCloseBound) {
    document.__routeValuesDrawerCloseBound = true;
    document.addEventListener('click', (event) => {
      if (state.routeValuesDrawerIndex === null || state.routeValuesDrawerIndex === undefined || state.routeValuesDrawerIndex === '') return;
      if (event.target.closest?.('.route-values-drawer') || event.target.closest?.('[data-route-values-panel]')) return;
      closeRouteValuesDrawer();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeRouteValuesDrawer();
    });
    document.addEventListener('scroll', (event) => {
      if (event.target?.closest?.('.route-values-list')) return;
      closeRouteValuesDrawer();
    }, true);
    window.addEventListener('resize', closeRouteValuesDrawer);
  }
  document.querySelectorAll('[data-route-outbound-picker]').forEach((select) => {
    decorateRouteTargetSelect(select, `outbound:${select.value}`);
    select.addEventListener('change', (event) => {
      state.routeOutbound = event.target.value;
      state.routeRuleTestResult = null;
      decorateRouteTargetSelect(select, `outbound:${event.target.value}`);
    });
  });
  if (typeof document.addEventListener === 'function' && !document.__routeTargetPickerCloseBound) {
    document.__routeTargetPickerCloseBound = true;
    document.addEventListener('click', () => closeRouteTargetPickers());
  }
  document.querySelectorAll('[data-outbound-delete]').forEach((button) => {
    button.addEventListener('click', () => removeOutbound(Number(button.dataset.outboundDelete)));
  });
  document.querySelectorAll('[data-server-edit]').forEach((button) => {
    button.addEventListener('click', () => openServerEditor(Number(button.dataset.serverEdit)));
  });
  document.querySelector('#serverEditJson')?.addEventListener('input', (event) => {
    state.serverEditJson = event.target.value;
  });
  document.querySelectorAll('[data-server-edit-field]').forEach((field) => {
    field.addEventListener('input', (event) => {
      updateServerEditField(field.dataset.serverEditField, event.target.value);
    });
    field.addEventListener('change', (event) => {
      updateServerEditField(field.dataset.serverEditField, event.target.value, { rerender: true });
    });
  });
  document.querySelector('#serverEditCountrySearch')?.addEventListener('input', (event) => {
    const query = String(event.target.value || '').trim().toLowerCase();
    state.serverEditCountrySearch = event.target.value;
    const picker = event.target.closest('.country-picker');
    let visible = 0;
    picker?.querySelectorAll('.country-option[data-country-search-text]').forEach((item) => {
      const match = !query || String(item.dataset.countrySearchText || '').includes(query);
      item.hidden = !match;
      if (match) visible += 1;
    });
    const counter = picker?.querySelector('[data-country-visible-count]');
    if (counter) counter.textContent = String(visible);
    const empty = picker?.querySelector('.country-empty');
    if (empty) empty.hidden = visible > 0;
  });
  document.querySelectorAll('[data-country-pick][data-country-target="serverEdit"]').forEach((button) => {
    button.addEventListener('click', () => setServerEditCountry(button.dataset.countryPick || ''));
  });
  document.querySelector('[data-country-clear="serverEdit"]')?.addEventListener('click', () => setServerEditCountry(''));
  document.querySelectorAll('[data-route-all]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.routeAll);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-dashboard-connect]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.dashboardConnect);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-dashboard-select]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dashboardSelectedServerTag = button.dataset.dashboardSelect || '';
      render();
    });
  });
  document.querySelectorAll('[data-server-check]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.serverChecking) return;
      try {
        await checkServers([button.dataset.serverCheck]);
      } catch (error) {
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = error.message;
        render();
      }
    });
  });

  document.querySelectorAll('[data-sniffer-mode]').forEach((button) => {
    button.addEventListener('click', () => setSnifferDraft(button.dataset.snifferMode));
  });
  document.querySelectorAll('[data-quic-policy]').forEach((button) => {
    button.addEventListener('click', () => setQuicPolicy(button.dataset.quicPolicy));
  });
  document.querySelector('#snifferRouteOnly')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { routeOnly: event.target.checked });
  });
  document.querySelector('#snifferExcluded')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { excluded: event.target.value });
  });
  document.querySelector('#firewallPorts')?.addEventListener('input', (event) => {
    state.firewallSafetyAccepted = false;
    state.firewallPorts = event.target.value;
  });
  document.querySelectorAll('[data-firewall-port-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallPortMode(button.dataset.firewallPortMode));
  });
  document.querySelector('#firewallBlockQuic')?.addEventListener('change', (event) => setFirewallBlockQuic(event.target.checked));
  document.querySelector('#firewallDnsIntercept')?.addEventListener('change', (event) => {
    state.firewallSafetyAccepted = false;
    state.firewallDnsIntercept = event.target.checked;
    render();
  });
  document.querySelector('#firewallSafetyAccepted')?.addEventListener('change', (event) => {
    state.firewallSafetyAccepted = event.target.checked;
    render();
  });
  document.querySelector('#firewallKillSwitchEnabled')?.addEventListener('change', (event) => setFirewallKillSwitchEnabled(event.target.checked));
  document.querySelectorAll('[data-kill-switch-domain-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallKillSwitchDomainMode(button.dataset.killSwitchDomainMode));
  });
  document.querySelector('#firewallKillSwitchTargets')?.addEventListener('input', (event) => setFirewallKillSwitchTargets(event.target.value));

  document.querySelectorAll('#routeKind').forEach((input) => input.addEventListener('change', (event) => {
    state.routeKind = event.target.value;
    state.routeRuleTestResult = null;
    render();
  }));
  document.querySelectorAll('#routeName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeName = event.target.value;
  }));
  document.querySelector('#routePresetSourceUrl')?.addEventListener('input', (event) => {
    state.routePresetSourceUrl = event.target.value;
    state.routePresetSourceCheck = null;
  });
  document.querySelector('#routePresetSourceName')?.addEventListener('input', (event) => {
    state.routePresetSourceName = event.target.value;
  });
  document.querySelector('#routePresetSourceAutoUpdate')?.addEventListener('change', (event) => {
    state.routePresetSourceAutoUpdate = event.target.checked;
  });
  document.querySelectorAll('#routeValue').forEach((input) => input.addEventListener('input', (event) => {
    state.routeValue = event.target.value;
    state.routeRuleTestResult = null;
  }));
  document.querySelectorAll('[data-route-value-multiline]').forEach((button) => {
    button.addEventListener('click', () => {
      const enable = button.dataset.routeValueMultiline === '1';
      const values = String(state.routeValue || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      state.routeValueMultiline = enable;
      if (enable && values.length) state.routeValue = values.join('\n');
      if (!enable && values.length) state.routeValue = values.join(', ');
      state.routeRuleTestResult = null;
      render();
    });
  });
  document.querySelectorAll('[data-route-lease-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeValue = button.dataset.routeLeaseIp || '';
      if (!state.routeName.trim() && button.dataset.routeLeaseName) state.routeName = button.dataset.routeLeaseName;
      state.routeRuleTestResult = null;
      render();
    });
  });
  document.querySelectorAll('[data-lease-search]').forEach((input) => {
    applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, input.value);
    input.addEventListener('input', (event) => {
      state.leaseSearch = event.target.value;
      applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, event.target.value);
    });
  });
  document.querySelectorAll('#routeBalancer').forEach((input) => input.addEventListener('change', (event) => {
    state.routeBalancer = event.target.value;
    state.routeRuleTestResult = null;
  }));
  document.querySelector('#routeBalancerTag')?.addEventListener('input', (event) => {
    state.routeBalancerTag = event.target.value;
  });
  document.querySelector('#routeBalancerStrategy')?.addEventListener('change', (event) => {
    state.routeBalancerStrategy = event.target.value;
    render();
  });
  document.querySelectorAll('[data-balancer-selector]').forEach((input) => {
    input.addEventListener('change', (event) => {
      setRouteBalancerSelector(input.dataset.balancerSelector, event.target.checked);
      render();
    });
  });
  document.querySelectorAll('[data-balancer-selector-move]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      moveRouteBalancerSelector(button.dataset.balancerSelectorMove, Number(button.dataset.direction) || 0);
      render();
    });
  });
  document.querySelector('#routeBalancerFallback')?.addEventListener('change', (event) => {
    state.routeBalancerFallback = event.target.value;
  });
  document.querySelectorAll('[data-route-target-type]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeTargetType = button.dataset.routeTargetType;
      state.routeRuleTestResult = null;
      if (state.routeTargetType === 'balancer' && !state.routeBalancer) state.routeBalancer = balancerOptions()[0] || '';
      render();
    });
  });
  document.querySelectorAll('[data-route-rule-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeRuleMode = button.dataset.routeRuleMode;
      state.message = '';
      render();
    });
  });
  document.querySelector('#routeSearch')?.addEventListener('input', (event) => {
    state.routeSearch = event.target.value;
  });
  document.querySelector('#routeSearch')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') render();
  });
  document.querySelector('#routeReplaceFrom')?.addEventListener('change', (event) => {
    state.routeReplaceFrom = event.target.value;
    render();
  });
  document.querySelector('#routeReplaceTo')?.addEventListener('change', (event) => {
    state.routeReplaceTo = event.target.value;
    render();
  });
  document.querySelectorAll('input[name="routeReplaceScope"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (!event.target.checked) return;
      state.routeReplaceScope = event.target.value === 'selected' ? 'selected' : 'all';
      render();
    });
  });
  document.querySelectorAll('#routeDslName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDslName = event.target.value;
  }));
  document.querySelectorAll('#routeDsl').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDsl = event.target.value;
    state.routeDslPreview = null;
  }));
  document.querySelector('#routePresetEditTitle')?.addEventListener('input', (event) => {
    state.routePresetEditTitle = event.target.value;
  });
  document.querySelector('#routePresetEditDetail')?.addEventListener('input', (event) => {
    state.routePresetEditDetail = event.target.value;
  });
  document.querySelector('#routePresetEditIcon')?.addEventListener('input', (event) => {
    state.routePresetEditIcon = event.target.value;
  });
  document.querySelector('#routePresetEditIcon')?.addEventListener('change', render);
  document.querySelector('#routePresetEditDsl')?.addEventListener('input', (event) => {
    state.routePresetEditDsl = event.target.value;
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
  });
  document.querySelector('#routeGroupTitleInput')?.addEventListener('input', (event) => {
    state.routeGroupTitle = event.target.value;
  });
  document.querySelector('#routeGroupDetailInput')?.addEventListener('input', (event) => {
    state.routeGroupDetail = event.target.value;
  });
  document.querySelector('#routeGroupIconInput')?.addEventListener('input', (event) => {
    state.routeGroupIcon = event.target.value;
  });
  document.querySelector('#routeGroupIconInput')?.addEventListener('change', render);
}
