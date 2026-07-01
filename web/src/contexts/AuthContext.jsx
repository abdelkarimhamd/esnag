import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { ACTIVE_ORG_STORAGE_KEY, ensureCsrfCookie, getActiveOrganizationId, setActiveOrganizationId } from '../api/client';
import { api } from '../api/client';
export const AuthContext = createContext(undefined);
export const AuthProvider = ({ children }) => {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [organizations, setOrganizations] = useState([]);
    const [activeOrganizationId, setActiveOrganizationIdState] = useState(getActiveOrganizationId());
    const [projectPermissionCache, setProjectPermissionCache] = useState({});
    const applyPayload = useCallback((payload) => {
        setUser(payload.user);
        setOrganizations(payload.organizations);
        if (payload.organizations.length === 0) {
            setActiveOrganizationId(null);
            localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            return;
        }
        const storedOrgId = getActiveOrganizationId();
        const resolvedOrgId = payload.organizations.find((organization) => organization.id === storedOrgId)?.id ?? payload.organizations[0].id;
        setActiveOrganizationIdState(resolvedOrgId);
        setActiveOrganizationId(resolvedOrgId);
    }, []);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/auth/me');
            applyPayload(response.data);
        }
        catch {
            setUser(null);
            setOrganizations([]);
            setActiveOrganizationIdState(null);
            setProjectPermissionCache({});
        }
        finally {
            setLoading(false);
        }
    }, [applyPayload]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const login = useCallback(async (email, password, otpCode) => {
        await ensureCsrfCookie();
        const response = await api.post('/api/auth/login', {
            email,
            password,
            otp_code: otpCode || undefined,
        });
        applyPayload(response.data);
        setProjectPermissionCache({});
    }, [applyPayload]);
    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        }
        finally {
            setUser(null);
            setOrganizations([]);
            setActiveOrganizationIdState(null);
            setActiveOrganizationId(null);
            setProjectPermissionCache({});
        }
    }, []);
    const selectOrganization = useCallback((organizationId) => {
        setActiveOrganizationIdState(organizationId);
        setActiveOrganizationId(organizationId);
        setProjectPermissionCache({});
    }, []);
    const activeOrganization = useMemo(() => organizations.find((organization) => organization.id === activeOrganizationId) ?? null, [activeOrganizationId, organizations]);
    const activeRoleNames = useMemo(() => activeOrganization?.roles ?? [], [activeOrganization]);
    const permissions = useMemo(() => [...new Set([...(activeOrganization?.permissions ?? []), ...(activeOrganization?.project_permissions ?? [])])], [activeOrganization]);
    const resolveProjectPermissions = useCallback(async (projectId) => {
        if (!activeOrganization) {
            return [];
        }
        if (!projectId) {
            return permissions;
        }
        const cacheKey = `${activeOrganization.id}:${projectId}`;
        const cached = projectPermissionCache[cacheKey];
        if (cached) {
            return cached;
        }
        const response = await api.get('/api/rbac/context', {
            params: {
                project_id: projectId,
            },
        });
        const scopedPermissions = response.data.data.permissions ?? [];
        setProjectPermissionCache((current) => ({ ...current, [cacheKey]: scopedPermissions }));
        return scopedPermissions;
    }, [activeOrganization, permissions, projectPermissionCache]);
    const value = useMemo(() => ({
        loading,
        authenticated: Boolean(user),
        user,
        organizations,
        activeOrganization,
        activeRoleNames,
        permissions,
        login,
        logout,
        refresh,
        selectOrganization,
        resolveProjectPermissions,
    }), [
        loading,
        user,
        organizations,
        activeOrganization,
        activeRoleNames,
        permissions,
        login,
        logout,
        refresh,
        selectOrganization,
        resolveProjectPermissions,
    ]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
