// api.js — Fetch wrapper with Bearer token and SSE streaming
const BASE_URL = 'http://localhost:8001';

function getToken() {
  return sessionStorage.getItem('app_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    sessionStorage.clear();
    location.href = '/frontend/index.html?error=session_expired';
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  get:    (path)       => request(path, { method: 'GET' }),
  post:   (path, body) => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  (path, body) => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)       => request(path, { method: 'DELETE' }),

  // SSE streaming — returns { abort }
  stream(path, body, handlers = {}) {
    const token = getToken();
    const ctrl  = new AbortController();

    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[api.stream] non-OK response', res.status, text);
        handlers.error?.(new Error(`HTTP ${res.status}`));
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';
      let   doneFired = false;

      const fireDone = () => {
        if (doneFired) return;
        doneFired = true;
        try { handlers.done?.(); } catch (e) { console.error('[api.stream] done handler error:', e); }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) { fireDone(); break; }
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.trim()) continue;
          const eventLine = part.match(/^event: (.+)/m)?.[1]?.trim();
          const dataLine  = part.match(/^data: (.+)/m)?.[1]?.trim();
          if (dataLine && eventLine) {
            try {
              const payload = JSON.parse(dataLine);
              if (eventLine === 'done') { fireDone(); }
              else { handlers[eventLine]?.(payload); }
            } catch (e) {
              console.error('[api.stream] handler error for event', eventLine, e);
            }
          }
        }
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        console.error('[api.stream] fetch/stream error:', err);
        handlers.error?.(err);
      }
    });

    return { abort: () => ctrl.abort() };
  },
};
