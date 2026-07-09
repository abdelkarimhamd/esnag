import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
window.Pusher = Pusher;
let echoInstance = null;
const orgChannels = new Map();
const resolvePort = (value, fallback) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
};
export const getEcho = () => {
    if (echoInstance) {
        return echoInstance;
    }
    const scheme = (import.meta.env.VITE_WS_SCHEME ?? 'http').toLowerCase();
    const isSecure = scheme === 'https';
    echoInstance = new Echo({
        broadcaster: import.meta.env.VITE_WS_BROADCASTER ?? 'pusher',
        key: import.meta.env.VITE_WS_APP_KEY ?? 'esnagging-key',
        cluster: import.meta.env.VITE_WS_APP_CLUSTER ?? 'mt1',
        wsHost: import.meta.env.VITE_WS_HOST ?? window.location.hostname,
        wsPort: resolvePort(import.meta.env.VITE_WS_PORT, 6001),
        wssPort: resolvePort(import.meta.env.VITE_WS_PORT, 6001),
        forceTLS: isSecure,
        enabledTransports: ['ws', 'wss'],
        authEndpoint: '/broadcasting/auth',
        withCredentials: true,
        auth: {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            },
        },
    });
    return echoInstance;
};
const ensureOrganizationChannel = (organizationId) => {
    const existing = orgChannels.get(organizationId);
    if (existing) {
        return existing;
    }
    const channelName = `organization.${organizationId}`;
    const echo = getEcho();
    const channel = echo.private(channelName);
    const registry = {
        channelName,
        snagHandlers: new Set(),
        dashboardHandlers: new Set(),
        exportHandlers: new Set(),
        inspectionHandlers: new Set(),
    };
    channel.listen('.snag.realtime', (payload) => {
        registry.snagHandlers.forEach((handler) => handler(payload));
    });
    channel.listen('.dashboard.realtime', (payload) => {
        registry.dashboardHandlers.forEach((handler) => handler(payload));
    });
    channel.listen('.export.realtime', (payload) => {
        registry.exportHandlers.forEach((handler) => handler(payload));
    });
    channel.listen('.inspection.realtime', (payload) => {
        registry.inspectionHandlers.forEach((handler) => handler(payload));
    });
    orgChannels.set(organizationId, registry);
    return registry;
};
export const subscribeOrganizationChannel = (organizationId, handlers) => {
    const registry = ensureOrganizationChannel(organizationId);
    if (handlers.onSnag) {
        registry.snagHandlers.add(handlers.onSnag);
    }
    if (handlers.onDashboard) {
        registry.dashboardHandlers.add(handlers.onDashboard);
    }
    if (handlers.onExport) {
        registry.exportHandlers.add(handlers.onExport);
    }
    if (handlers.onInspection) {
        registry.inspectionHandlers.add(handlers.onInspection);
    }
    return () => {
        if (handlers.onSnag) {
            registry.snagHandlers.delete(handlers.onSnag);
        }
        if (handlers.onDashboard) {
            registry.dashboardHandlers.delete(handlers.onDashboard);
        }
        if (handlers.onExport) {
            registry.exportHandlers.delete(handlers.onExport);
        }
        if (handlers.onInspection) {
            registry.inspectionHandlers.delete(handlers.onInspection);
        }
        const hasNoHandlers = registry.snagHandlers.size === 0 &&
            registry.dashboardHandlers.size === 0 &&
            registry.exportHandlers.size === 0 &&
            registry.inspectionHandlers.size === 0;
        if (hasNoHandlers) {
            getEcho().leave(registry.channelName);
            orgChannels.delete(organizationId);
        }
    };
};
