import * as SecureStore from 'expo-secure-store'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import type { OrganizationSummary, UserSummary } from '../types'

const TOKEN_KEY = 'esnagging.mobile.token'
const ACTIVE_ORG_KEY = 'esnagging.mobile.activeOrgId'
const DEVICE_ID_KEY = 'esnagging.mobile.deviceId'

interface AuthContextValue {
  loading: boolean
  token: string | null
  user: UserSummary | null
  organizations: OrganizationSummary[]
  activeOrganization: OrganizationSummary | null
  login: (email: string, password: string, otpCode?: string | null, trustDevice?: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  selectOrganization: (organizationId: number) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const loadStoredOrgId = async (): Promise<number | null> => {
  const value = await SecureStore.getItemAsync(ACTIVE_ORG_KEY)
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserSummary | null>(null)
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [activeOrganizationId, setActiveOrganizationId] = useState<number | null>(null)

  const applySession = async (
    nextToken: string,
    payload: {
      user: UserSummary
      organizations: OrganizationSummary[]
    },
  ) => {
    setToken(nextToken)
    setUser(payload.user)
    setOrganizations(payload.organizations)

    await SecureStore.setItemAsync(TOKEN_KEY, nextToken)

    const storedOrgId = await loadStoredOrgId()
    const resolvedOrgId =
      payload.organizations.find((organization) => organization.id === storedOrgId)?.id ??
      payload.organizations[0]?.id ??
      null

    setActiveOrganizationId(resolvedOrgId)
    if (resolvedOrgId) {
      await SecureStore.setItemAsync(ACTIVE_ORG_KEY, String(resolvedOrgId))
    }
  }

  const resolveDeviceId = async (): Promise<string> => {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY)
    if (existing && existing.trim() !== '') {
      return existing
    }

    const generated = `mdev-${Date.now()}-${Math.random().toString(16).slice(2, 12)}`
    await SecureStore.setItemAsync(DEVICE_ID_KEY, generated)

    return generated
  }

  const clearSession = async () => {
    setToken(null)
    setUser(null)
    setOrganizations([])
    setActiveOrganizationId(null)
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    await SecureStore.deleteItemAsync(ACTIVE_ORG_KEY)
  }

  const refresh = async () => {
    if (!token) {
      return
    }

    const payload = await apiClient.me(token)
    setUser(payload.user)
    setOrganizations(payload.organizations)

    const storedOrgId = await loadStoredOrgId()
    const resolvedOrgId =
      payload.organizations.find((organization) => organization.id === storedOrgId)?.id ??
      payload.organizations[0]?.id ??
      null
    setActiveOrganizationId(resolvedOrgId)
  }

  const login = async (email: string, password: string, otpCode?: string | null, trustDevice = true) => {
    const deviceId = await resolveDeviceId()
    const payload = await apiClient.mobileLogin(email, password, undefined, deviceId, otpCode, trustDevice)
    await applySession(payload.token, payload)
  }

  const logout = async () => {
    if (token) {
      try {
        await apiClient.mobileLogout(token)
      } catch {
        // Ignore logout failures while clearing local session.
      }
    }

    await clearSession()
  }

  const selectOrganization = async (organizationId: number) => {
    setActiveOrganizationId(organizationId)
    await SecureStore.setItemAsync(ACTIVE_ORG_KEY, String(organizationId))
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY)
        const storedOrgId = await loadStoredOrgId()

        if (!storedToken) {
          setLoading(false)
          return
        }

        const payload = await apiClient.me(storedToken)
        setToken(storedToken)
        setUser(payload.user)
        setOrganizations(payload.organizations)

        const resolvedOrgId =
          payload.organizations.find((organization) => organization.id === storedOrgId)?.id ??
          payload.organizations[0]?.id ??
          null

        setActiveOrganizationId(resolvedOrgId)
      } catch {
        await clearSession()
      } finally {
        setLoading(false)
      }
    }

    void bootstrap()
  }, [])

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.id === activeOrganizationId) ?? null,
    [activeOrganizationId, organizations],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token,
      user,
      organizations,
      activeOrganization,
      login,
      logout,
      refresh,
      selectOrganization,
    }),
    [loading, token, user, organizations, activeOrganization],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
