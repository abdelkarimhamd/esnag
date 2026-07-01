import axios from 'axios';
const ORG_STORAGE_KEY = 'esnag.activeOrgId';
export const ACTIVE_ORG_STORAGE_KEY = ORG_STORAGE_KEY;
export const api = axios.create({
    baseURL: '/',
    withCredentials: true,
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
    },
});
api.interceptors.request.use((config) => {
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
