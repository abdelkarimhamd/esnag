import axios from 'axios'

const ORG_STORAGE_KEY = 'esnag.activeOrgId'

export const ACTIVE_ORG_STORAGE_KEY = ORG_STORAGE_KEY

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const activeOrgId = localStorage.getItem(ORG_STORAGE_KEY)

  if (activeOrgId) {
    if (config.headers && 'set' in config.headers) {
      config.headers.set('X-Organization-Id', activeOrgId)
    } else {
      config.headers = config.headers ?? {}
      ;(config.headers as Record<string, string>)['X-Organization-Id'] = activeOrgId
    }
  }

  return config
})

export const setActiveOrganizationId = (organizationId: number | null) => {
  if (!organizationId) {
    localStorage.removeItem(ORG_STORAGE_KEY)
    return
  }

  localStorage.setItem(ORG_STORAGE_KEY, String(organizationId))
}

export const getActiveOrganizationId = (): number | null => {
  const value = localStorage.getItem(ORG_STORAGE_KEY)
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export const ensureCsrfCookie = async () => {
  await api.get('/sanctum/csrf-cookie')
}

