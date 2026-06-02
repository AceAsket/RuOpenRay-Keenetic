export function configTestFailureDetails(result = {}, analysis = {}, forMessage = '') {
  if (result.ok) return null;
  const technical = uniqueTextBlocks([result.stdout, result.stderr, result.message]).join('\n').trim();
  const line = primaryConfigErrorLine(result, analysis);
  const explanation = explainConfigError(line, technical);
  const geoLines = geoAuditLines(result.geoAudit);
  const analysisLines = [
    ...geoLines,
    ...(Array.isArray(analysis.errors) ? analysis.errors.map((item) => `Ошибка анализа: ${analysisText(item)}`) : []),
    ...(Array.isArray(analysis.warnings) ? analysis.warnings.map((item) => `Предупреждение: ${analysisText(item)}`) : [])
  ];
  return {
    forMessage,
    summary: 'Показать причину',
    title: explanation.title,
    body: explanation.body,
    technical: [technical, analysisLines.join('\n')].filter(Boolean).join('\n\n')
  };
}

export function configTestLogDetails(log = {}, forMessage = '') {
  if (!log || log.ok !== false) return null;
  return configTestFailureDetails(log, {}, forMessage);
}

function primaryConfigErrorLine(result = {}, analysis = {}) {
  const geoProblem = Array.isArray(result.geoAudit?.items)
    ? result.geoAudit.items.find((item) => item?.severity === 'danger')
    : null;
  if (geoProblem) {
    return `${geoProblem.kind || 'geo'}:${geoProblem.code || ''} ${geoProblem.message || ''}`.trim();
  }
  const lines = uniqueTextBlocks([result.stdout, result.stderr, result.message]).join('\n').split(/\r?\n/);
  const failed = lines.find((line) => /failed|error|invalid|cannot|no such file|address already in use|bind:|not found/i.test(line));
  if (failed) return failed.trim();
  const firstAnalysisError = Array.isArray(analysis.errors) ? analysis.errors[0] : null;
  if (firstAnalysisError) return analysisText(firstAnalysisError);
  return '';
}

function geoAuditLines(audit = null) {
  if (!audit || !Array.isArray(audit.items)) return [];
  return audit.items
    .filter((item) => item?.severity === 'danger')
    .map((item) => `Geo Doctor: ${item.kind || 'geo'}:${item.code || ''} - ${item.message || 'проблема geo-ссылки'}`);
}

function uniqueTextBlocks(values = []) {
  const seen = new Set();
  const blocks = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(text);
  }
  return blocks;
}

function explainConfigError(line = '', technical = '') {
  const source = `${line}\n${technical}`;
  const clean = humanizeXrayLine(line || technical);
  const portMatch = source.match(/listen\s+(tcp|udp)\s+([^\s:]+|\[[^\]]+\]):(\d+):\s*bind:\s*address already in use/i)
    || source.match(/address already in use.*?(\d+)/i);
  if (portMatch) {
    const protocol = portMatch[1] ? portMatch[1].toUpperCase() : 'TCP/UDP';
    const host = portMatch[2] || 'локальном адресе';
    const port = portMatch[3] || portMatch[1];
    return {
      title: 'Порт уже занят',
      body: `Xray не смог запуститься, потому что ${protocol} ${host}:${port} уже слушает другой процесс. Выберите другой порт в настройках RuOpenRay или освободите занятый порт.`
    };
  }
  if (/failed to load GeoIP:\s*private|code not found in geoip\.dat:\s*PRIVATE/i.test(source)) {
    return {
      title: 'geoip.dat не содержит PRIVATE',
      body: 'В правилах есть geoip:private, но текущий geoip.dat не содержит список PRIVATE. Обновите geoip.dat на источник с PRIVATE или вручную замените правило на локальные CIDR-подсети.'
    };
  }
  const missingGeoCode = source.match(/code not found in (geoip|geosite)\.dat:\s*([a-z0-9_-]+)/i)
    || source.match(/failed to load (GeoIP|GeoSite):\s*([a-z0-9_-]+)/i);
  if (missingGeoCode) {
    const fileKind = missingGeoCode[1].toLowerCase().includes('site') ? 'geosite' : 'geoip';
    const file = `${fileKind}.dat`;
    const code = String(missingGeoCode[2] || '').toUpperCase();
    return {
      title: `${file} не содержит ${code}`,
      body: `В правилах есть ${fileKind}:${code.toLowerCase()}, но установленный ${file} не содержит такой список. Выберите другой источник geodata или замените правило на список, который есть в текущем dat-файле.`
    };
  }
  if (/geoip\.dat/i.test(source) && /no such file|failed to load|open .*geoip\.dat/i.test(source)) {
    return {
      title: 'Не найден geoip.dat',
      body: 'В конфигурации есть правила geoip, но Xray не нашел geoip.dat в каталоге geo-файлов. Обновите geo-файлы в разделе Geo или укажите правильный каталог.'
    };
  }
  if (/geosite\.dat/i.test(source) && /no such file|failed to load|open .*geosite\.dat/i.test(source)) {
    return {
      title: 'Не найден geosite.dat',
      body: 'В конфигурации есть правила geosite, но Xray не нашел geosite.dat в каталоге geo-файлов. Обновите geo-файлы в разделе Geo или укажите правильный каталог.'
    };
  }
  if (/outboundTag/i.test(source) && /not found|не найден/i.test(source)) {
    return {
      title: 'Правило ведет в несуществующее направление',
      body: 'В маршрутизации есть правило с outboundTag, которого нет в списке исходящих направлений Xray. Выберите существующий сервер, direct, block или группу серверов.'
    };
  }
  if (/balancerTag/i.test(source) && /not found|не найден/i.test(source)) {
    return {
      title: 'Правило ведет в несуществующую группу серверов',
      body: 'В маршрутизации есть правило с balancerTag, но такой группы серверов нет в routing.balancers. Создайте группу или переназначьте правило.'
    };
  }
  if (/invalid field rule|failed to build routing configuration/i.test(source)) {
    return {
      title: 'Ошибка в правилах маршрутизации',
      body: clean || 'Xray не смог собрать routing.rules. Проверьте последние добавленные правила, цель правила и формат domain/ip/port/source.'
    };
  }
  if (/exit status \d+/i.test(clean) && technical) {
    return {
      title: 'Xray вернул ошибку проверки',
      body: 'Команда проверки Xray завершилась с ошибкой. Ниже есть полный технический вывод, по нему можно понять конкретный файл, порт или правило.'
    };
  }
  return {
    title: 'Ошибка проверки Xray',
    body: clean || 'Xray вернул ошибку при проверке черновика конфигурации. Ниже показан полный технический вывод.'
  };
}

function humanizeXrayLine(line = '') {
  return String(line)
    .replace(/^Failed to start:\s*/i, '')
    .replace(/^main:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function analysisText(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.message || item.text || item.detail || JSON.stringify(item);
}
