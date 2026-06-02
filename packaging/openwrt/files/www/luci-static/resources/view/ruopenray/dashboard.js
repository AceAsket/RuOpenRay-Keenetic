'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

const callServiceAction = rpc.declare({
	object: 'service',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

function field(label, node, hint) {
	return E('div', { class: 'cbi-value' }, [
		E('label', { class: 'cbi-value-title' }, label),
		E('div', { class: 'cbi-value-field' }, hint ? [ node, E('div', { class: 'cbi-value-description' }, hint) ] : node)
	]);
}

function normalizeHost(host) {
	host = String(host || '').trim();
	return host || '0.0.0.0';
}

function normalizePort(port) {
	port = Number(port);
	return Number.isInteger(port) && port >= 1 && port <= 65535 ? String(port) : '';
}

function urlHost(host) {
	host = normalizeHost(host);
	if (host === '0.0.0.0' || host === '::') return window.location.hostname;
	return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function panelUrl(host, port) {
	return `${window.location.protocol}//${urlHost(host)}:${normalizePort(port) || '9090'}/`;
}

return view.extend({
	load() {
		return uci.load('ruopenray-ui');
	},

	render() {
		const host = normalizeHost(uci.get('ruopenray-ui', 'main', 'host'));
		const port = normalizePort(uci.get('ruopenray-ui', 'main', 'port')) || '9090';
		const url = panelUrl(host, port);

		const hostInput = E('input', {
			id: 'ruopenray-host',
			class: 'cbi-input-text',
			value: host,
			placeholder: '0.0.0.0'
		});
		const portInput = E('input', {
			id: 'ruopenray-port',
			class: 'cbi-input-text',
			value: port,
			inputmode: 'numeric',
			placeholder: '9090'
		});
		const link = E('a', {
			id: 'ruopenray-link',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, url);
		const openButton = E('a', {
			id: 'ruopenray-open',
			class: 'cbi-button cbi-button-apply',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, _('Открыть RuOpenRay UI'));

		const updatePreview = () => {
			const nextUrl = panelUrl(hostInput.value, portInput.value);
			link.href = nextUrl;
			link.textContent = nextUrl;
			openButton.href = nextUrl;
		};

		hostInput.addEventListener('input', updatePreview);
		portInput.addEventListener('input', updatePreview);

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('RuOpenRay UI')),
			E('div', { class: 'cbi-map-descr' }, _('Отдельная панель управления Xray: серверы, маршруты, DNS, логи и обновление ядра.')),
			E('div', { class: 'cbi-section' }, [
				E('p', {}, _('RuOpenRay работает на роутере как отдельный веб-сервис.')),
				E('p', {}, [ E('strong', {}, _('Панель: ')), link ]),
				E('p', {}, openButton)
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Доступ к сервису')),
				field(_('Bind address'), hostInput, _('Рекомендуется указать LAN-адрес роутера, например 192.168.1.1 или 192.168.50.1. 0.0.0.0 слушает все интерфейсы, 127.0.0.1 доступен только локально на роутере.')),
				field(_('Порт'), portInput, _('После сохранения сервис будет перезапущен. Если меняете порт, откройте панель по новой ссылке.')),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', {
						class: 'cbi-button cbi-button-save',
						click: ui.createHandlerFn(this, 'saveSettings', hostInput, portInput)
					}, _('Сохранить и перезапустить'))
				])
			])
		]);
	},

	saveSettings(hostInput, portInput) {
		const host = normalizeHost(hostInput.value);
		const port = normalizePort(portInput.value);
		if (!port) {
			ui.addNotification(null, E('p', {}, _('Порт должен быть числом от 1 до 65535.')), 'danger');
			return Promise.resolve();
		}

		uci.set('ruopenray-ui', 'main', 'host', host);
		uci.set('ruopenray-ui', 'main', 'port', port);

		return uci.save()
			.then(() => uci.apply())
			.then(() => callServiceAction('ruopenray-ui', 'restart'))
			.then(() => {
				ui.addNotification(null, E('p', {}, _('Настройки сохранены, RuOpenRay UI перезапускается.')), 'info');
				window.setTimeout(() => {
					const url = panelUrl(host, port);
					const link = document.getElementById('ruopenray-link');
					const button = document.getElementById('ruopenray-open');
					if (link) {
						link.href = url;
						link.textContent = url;
					}
					if (button) button.href = url;
				}, 1200);
			})
			.catch((error) => {
				ui.addNotification(null, E('p', {}, error.message || String(error)), 'danger');
			});
	}
});
