export function createApiClient({ getToken = () => '', onUnauthorized = () => {} } = {}) {
  function authHeaders(extra = {}) {
    const token = getToken();
    return {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra
    };
  }

  async function parseResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (response.status === 204 || response.status === 205) return {};
    const text = await response.text();
    if (!text.trim()) return type.includes('application/json') ? {} : '';
    if (!type.includes('application/json')) return text;
    try {
      return JSON.parse(text);
    } catch (error) {
      return { error: text || error.message };
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...authHeaders(options.headers || {})
      }
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const message = typeof payload === 'string'
        ? payload
        : payload.error || payload.message || response.statusText;
      throw new Error(message);
    }
    return payload;
  }

  async function upload(path, formData, options = {}) {
    const response = await fetch(path, {
      ...options,
      method: options.method || 'POST',
      body: formData,
      headers: authHeaders(options.headers || {})
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const message = typeof payload === 'string'
        ? payload
        : payload.error || payload.message || response.statusText;
      throw new Error(message);
    }
    return payload;
  }

  async function text(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: authHeaders(options.headers || {})
    });
    if (response.status === 401) {
      onUnauthorized();
      throw new Error('Требуется авторизация');
    }
    if (!response.ok) {
      throw new Error(response.statusText || `HTTP ${response.status}`);
    }
    return await response.text();
  }

  return { authHeaders, request, text, upload };
}
