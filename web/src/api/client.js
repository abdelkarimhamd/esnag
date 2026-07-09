import axios from 'axios';
const ORG_STORAGE_KEY = 'esnag.activeOrgId';
const AUTH_TOKEN_KEY = 'esnag.authToken';
export const ACTIVE_ORG_STORAGE_KEY = ORG_STORAGE_KEY;
// Bearer token issued by the web login (alongside the session cookie). Attaching it
// keeps the SPA authenticated across a full page reload even if the cookie session is
// dropped/clobbered — Sanctum falls back to the token when the session guard is empty.
export const setAuthToken = (token) => {
    if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
};
export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
export const api = axios.create({
    baseURL: '/',
    withCredentials: true,
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
    },
});
api.interceptors.request.use((config) => {
    const authToken = getAuthToken();
    if (authToken) {
        if (config.headers && 'set' in config.headers) {
            config.headers.set('Authorization', `Bearer ${authToken}`);
        }
        else {
            config.headers = config.headers ?? {};
            config.headers.Authorization = `Bearer ${authToken}`;
        }
    }
    const activeOrgId = localStorage.getItem(ORG_STORAGE_KEY);
    const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (activeOrgId) {
        if (config.headers && 'set' in config.headers) {
            config.headers.set('X-Organization-Id', activeOrgId);
            config.headers.set('X-Request-Id', requestId);
        }
        else {
            config.headers = config.headers ?? {};
            config.headers['X-Organization-Id'] = activeOrgId;
            config.headers['X-Request-Id'] = requestId;
        }
    }
    else if (config.headers && 'set' in config.headers) {
        config.headers.set('X-Request-Id', requestId);
    }
    else {
        config.headers = config.headers ?? {};
        config.headers['X-Request-Id'] = requestId;
    }
    return config;
});
// When an authenticated session lapses (401), the app would otherwise keep firing
// requests that each surface "Unauthenticated" — so bounce to the login screen once.
// Skipped for the auth/CSRF probes (AuthContext handles those) and when already on
// /login. A module-level flag de-dupes the many concurrent 401s into a single redirect.
let sessionRedirecting = false;
api.interceptors.response.use((response) => response, (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url ?? '');
    const isAuthProbe = url.includes('/api/auth/') || url.includes('/sanctum/');
    if (status === 401 && !isAuthProbe && !sessionRedirecting && typeof window !== 'undefined') {
        if (window.location.pathname !== '/login') {
            sessionRedirecting = true;
            try {
                localStorage.removeItem(ORG_STORAGE_KEY);
            }
            catch {
                // ignore storage access errors
            }
            window.location.assign('/login');
        }
    }
    return Promise.reject(error);
});
export const setActiveOrganizationId = (organizationId) => {
    if (!organizationId) {
        localStorage.removeItem(ORG_STORAGE_KEY);
        return;
    }
    localStorage.setItem(ORG_STORAGE_KEY, String(organizationId));
};
export const getActiveOrganizationId = () => {
    const value = localStorage.getItem(ORG_STORAGE_KEY);
    if (!value) {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};
export const ensureCsrfCookie = async () => {
    await api.get('/sanctum/csrf-cookie');
};
