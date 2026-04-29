// auth.js — Google OAuth2 implicit flow + role routing
const CLIENT_ID  = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const REDIRECT_URI = `${location.origin}/frontend/callback.html`;
const SCOPE      = 'openid email profile';
const API_BASE   = 'http://localhost:8001'; // backend port

export function loginWithGoogle() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token id_token',
    scope: SCOPE,
    nonce: crypto.randomUUID(),
    prompt: 'select_account',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function saveTokens({ id_token, access_token }) {
  sessionStorage.setItem('id_token', id_token);
  sessionStorage.setItem('access_token', access_token);
}

export function getIdToken() {
  return sessionStorage.getItem('id_token');
}

export function getAccessToken() {
  return sessionStorage.getItem('access_token');
}

export function clearTokens() {
  sessionStorage.clear();
}

export function parseJwtPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Exchange Google tokens with backend to get app JWT
export async function exchangeToken(googleIdToken, googleAccessToken) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: googleIdToken, access_token: googleAccessToken }),
  });
  if (!res.ok) throw new Error('Token exchange failed');
  return res.json(); // { token, role, display_name }
}

export function routeByRole(role) {
  const routes = {
    learner: '/frontend/dashboard-chatter.html',
    parent:  '/frontend/dashboard-parent.html',
    teacher: '/frontend/dashboard-teacher.html',
    admin:   '/frontend/dashboard-teacher.html',
  };
  location.href = routes[role] ?? '/frontend/index.html';
}

// Handle Google OAuth2 implicit flow response (called from callback.html)
export async function handleCallback() {
  const hash        = new URLSearchParams(location.hash.slice(1));
  const idToken     = hash.get('id_token');
  const accessToken = hash.get('access_token');
  const error       = hash.get('error');

  if (error || !accessToken) {
    console.error('OAuth error:', error, 'hash:', location.hash);
    location.href = '/frontend/index.html?error=oauth_failed';
    return;
  }

  try {
    const { token, role, display_name } = await exchangeToken(idToken, accessToken);
    sessionStorage.setItem('app_token', token);
    sessionStorage.setItem('user_role', role);
    sessionStorage.setItem('display_name', display_name ?? '');
    const payload = parseJwtPayload(token);
    sessionStorage.setItem('user_email', payload?.email ?? '');
    routeByRole(role);
  } catch (err) {
    console.error('Token exchange error:', err);
    location.href = '/frontend/index.html?error=exchange_failed';
  }
}
