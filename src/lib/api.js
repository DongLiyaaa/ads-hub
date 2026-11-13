export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers.set('X-ShareScope-Request', '1');
  if (options.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith('/api/auth/login')) window.dispatchEvent(new Event('sharescope:unauthorized'));
  if (!response.ok) throw new ApiError(body.error || `请求失败（${response.status}）`, response.status);
  return body;
}
