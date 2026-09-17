/**
 * Account session handling.
 *
 * The token lives in localStorage so a refresh does not sign the user out. It
 * is sent as a bearer header on every API call; nothing else in the app should
 * build that header by hand.
 *
 * When the server rejects a token (expired, revoked, or the account is gone)
 * the session is cleared and `onUnauthorized` fires, so the app can return to
 * the login screen instead of rendering empty data as if it were real.
 */

const TOKEN_KEY = 'fingrow_token';
const USER_KEY = 'fingrow_user';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api');

let unauthorizedHandler = null;

/** Register the callback fired when the server rejects our session. */
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Private browsing or blocked storage — the session simply won't persist
    // across a refresh, which is degraded but not broken.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Bearer header for the current session, or an empty object when signed out. */
export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Called by the API layer whenever a request comes back 401.
 * Clears the dead session and lets the app react once.
 */
export function handleUnauthorized() {
  if (!getToken()) return;
  clearSession();
  if (unauthorizedHandler) unauthorizedHandler();
}

/**
 * FastAPI returns `detail` as a plain string for errors we raise ourselves,
 * but as a list of field objects for schema validation failures. Passing the
 * list straight to new Error() renders "[object Object]" to the user, so pull
 * out the first readable message instead.
 */
function readableDetail(detail, status) {
  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : null;
    const message = first?.msg || 'is not valid';
    // "body" is FastAPI's wrapper, not a field the user filled in.
    return field && field !== 'body'
      ? `${String(field).replace(/_/g, ' ')}: ${message}`
      : message;
  }

  return `Request failed (${status}).`;
}

async function sendJson(path, body, method = 'POST') {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when the request never reached a server: the backend
    // is not running, the machine is offline, or CORS blocked it. "Failed to
    // fetch" means nothing to the person trying to sign up.
    const error = new Error(
      `Cannot reach the server at ${API_BASE}. Check that the backend is running.`,
    );
    error.status = 0;
    error.offline = true;
    throw error;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    // Messages we raise server-side are written for the user ("Password must
    // be at least 6 characters"), so surface those as they are.
    const error = new Error(readableDetail(payload?.detail, res.status));
    error.status = res.status;
    throw error;
  }
  return payload;
}

export async function signup({ phone, password, name, profile }) {
  const data = await sendJson('/auth/signup', { phone, password, name, profile });
  storeSession(data.token, data.user);
  return data.user;
}

export async function login({ phone, password }) {
  const data = await sendJson('/auth/login', { phone, password });
  storeSession(data.token, data.user);
  return data.user;
}

export async function logout() {
  try {
    await sendJson('/auth/logout', {});
  } catch {
    // Signing out locally matters more than the server acknowledging it.
  }
  clearSession();
}

/**
 * Re-check the stored session against the server on startup.
 * Returns the user, or null when there is no valid session.
 */
export async function fetchMe() {
  if (!getToken()) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (res.status === 401) {
      clearSession();
      return null;
    }
    if (!res.ok) {
      // Server trouble rather than a bad session — keep the stored user so the
      // app still works offline instead of bouncing to login.
      return getStoredUser();
    }
    const data = await res.json();
    storeSession(getToken(), data.user);
    return data.user;
  } catch {
    // Offline: trust the stored session until the server says otherwise.
    return getStoredUser();
  }
}

export async function updateProfile({ name, profile }) {
  const data = await sendJson('/auth/profile', { name, profile }, 'PATCH');
  storeSession(getToken(), data.user);
  return data.user;
}
