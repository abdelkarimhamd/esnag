import { Platform } from 'react-native'
import type {
  AuthPayload,
  DrawingSummary,
  MobileAuthDeviceRecord,
  NotificationPreferenceRecord,
  ProjectSummary,
  SyncApplyResult,
} from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

interface RequestOptions {
  token?: string | null
  organizationId?: number | null
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export interface NormalizedMobileApiError {
  message: string
  fieldErrors: Record<string, string[]>
  requestId: string | null
  status: number | null
  code: string | null
  hint: string | null
  action: string | null
}

export class ApiError extends Error {
  status: number
  details: unknown
  normalized: NormalizedMobileApiError

  constructor(message: string, status: number, details: unknown, normalized: NormalizedMobileApiError) {
    super(message)
    this.status = status
    this.details = details
    this.normalized = normalized
  }
}

const createRequestId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to timestamp-random fallback.
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeApiErrorPayload = (
  payload: unknown,
  status: number,
  headerRequestId?: string | null,
): NormalizedMobileApiError => {
  const body = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {}
  const fieldErrors =
    body.errors && typeof body.errors === 'object'
      ? (body.errors as Record<string, string[]>)
      : {}
  const firstFieldError = Object.values(fieldErrors).flat().find((value) => typeof value === 'string')
  const requestId =
    (typeof body.request_id === 'string' && body.request_id) ||
    (typeof headerRequestId === 'string' && headerRequestId) ||
    null

  const messageFromBody = typeof body.message === 'string' ? body.message : null
  const messageBase =
    (typeof firstFieldError === 'string' && firstFieldError) ||
    messageFromBody ||
    `Request failed with ${status}`
  const message = requestId ? `${messageBase} (Ref: ${requestId})` : messageBase

  return {
    message,
    fieldErrors,
    requestId,
    status,
    code: typeof body.code === 'string' ? body.code : null,
    hint: typeof body.hint === 'string' ? body.hint : null,
    action: typeof body.action === 'string' ? body.action : null,
  }
}

export const normalizeMobileApiError = (error: unknown, fallback = 'Request failed.'): NormalizedMobileApiError => {
  if (error instanceof ApiError) {
    return error.normalized
  }

  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      fieldErrors: {},
      requestId: null,
      status: null,
      code: null,
      hint: null,
      action: null,
    }
  }

  return {
    message: fallback,
    fieldErrors: {},
    requestId: null,
    status: null,
    code: null,
    hint: null,
    action: null,
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': createRequestId(),
    ...options.headers,
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  if (options.organizationId) {
    headers['X-Organization-Id'] = String(options.organizationId)
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? (isFormData ? (options.body as BodyInit) : JSON.stringify(options.body)) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const normalized = normalizeApiErrorPayload(payload, response.status, response.headers.get('X-Request-Id'))
    throw new ApiError(normalized.message, response.status, payload, normalized)
  }

  return payload as T
}

export const apiClient = {
  mobileLogin: (
    email: string,
    password: string,
    deviceName = `${Platform.OS}-device`,
    deviceId?: string | null,
    otpCode?: string | null,
    trustDevice = true,
  ) =>
    request<AuthPayload & { token: string; token_type: string }>('/api/auth/mobile-login', {
      method: 'POST',
      body: {
        email,
        password,
        device_name: deviceName,
        device_id: deviceId || undefined,
        platform: Platform.OS,
        otp_code: otpCode || undefined,
        trust_device: trustDevice,
      },
    }),

  me: (token: string) =>
    request<AuthPayload>('/api/auth/me', {
      token,
    }),

  mobileLogout: (token: string) =>
    request<{ message: string }>('/api/auth/mobile-logout', {
      method: 'POST',
      token,
    }),

  mfaStatus: (token: string) =>
    request<{ data: { mfa_enabled: boolean; mfa_required_web: boolean; mfa_required_mobile: boolean } }>('/api/auth/mfa/status', {
      token,
    }),

  listProjects: (token: string, organizationId: number) =>
    request<{ data: ProjectSummary[] }>('/api/projects?per_page=200', {
      token,
      organizationId,
    }),

  listDrawings: (token: string, organizationId: number, projectId?: number | null) =>
    request<{ data: DrawingSummary[] }>('/api/drawings?per_page=200' + (projectId ? `&project_id=${projectId}` : ''), {
      token,
      organizationId,
    }),

  pullSync: (token: string, organizationId: number, since?: string | null) =>
    request<{
      data: {
        snags: unknown[]
        comments: unknown[]
        attachments: unknown[]
        equipment: unknown[]
        equipment_logs: unknown[]
        buildings: unknown[]
        floors: unknown[]
        locations: unknown[]
        drawing_location_zones: unknown[]
      }
      meta: { server_time: string; conflict_policy: string }
    }>(`/api/mobile/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`, {
      token,
      organizationId,
    }),

  applySync: (token: string, organizationId: number, operations: Array<Record<string, unknown>>) =>
    request<{
      data: SyncApplyResult[]
      meta: { server_time: string; retry_recommended_for: string[] }
    }>('/api/mobile/sync/apply', {
      token,
      organizationId,
      method: 'POST',
      body: { operations },
    }),

  registerPushToken: (
    token: string,
    organizationId: number,
    pushToken: string,
    appVersion: string,
    deviceName: string,
  ) =>
    request<{ data: { id: number } }>('/api/mobile/push-tokens', {
      token,
      organizationId,
      method: 'POST',
      body: {
        push_token: pushToken,
        platform: Platform.OS,
        app_version: appVersion,
        device_name: deviceName,
      },
    }),

  listMobileDevices: (token: string, organizationId: number) =>
    request<{ data: MobileAuthDeviceRecord[] }>('/api/mobile/devices', {
      token,
      organizationId,
    }),

  revokeMobileDevice: (token: string, organizationId: number, deviceId: number) =>
    request<{ message: string }>(`/api/mobile/devices/${deviceId}`, {
      token,
      organizationId,
      method: 'DELETE',
    }),

  fetchNotificationPreference: (token: string, organizationId: number) =>
    request<{ data: NotificationPreferenceRecord }>('/api/preferences/notifications', {
      token,
      organizationId,
    }),

  updateNotificationPreference: (
    token: string,
    organizationId: number,
    payload: Partial<NotificationPreferenceRecord>,
  ) =>
    request<{ data: NotificationPreferenceRecord }>('/api/preferences/notifications', {
      token,
      organizationId,
      method: 'PUT',
      body: payload,
    }),

  listEquipment: (token: string, organizationId: number, search?: string) =>
    request<{ data: unknown[] }>(
      '/api/equipment?per_page=200' + (search ? `&search=${encodeURIComponent(search)}` : ''),
      {
        token,
        organizationId,
      },
    ),

  listEquipmentLogs: (token: string, organizationId: number, equipmentId: number) =>
    request<{ data: unknown[] }>(`/api/equipment/${equipmentId}/logs?per_page=100`, {
      token,
      organizationId,
    }),

  createEquipmentLog: (
    token: string,
    organizationId: number,
    equipmentId: number,
    payload: {
      status: 'ok' | 'warn' | 'critical'
      snag_id?: number | null
      description?: string | null
      action_taken?: string | null
    },
  ) =>
    request<{ data: unknown }>(`/api/equipment/${equipmentId}/logs`, {
      token,
      organizationId,
      method: 'POST',
      body: payload,
    }),

  initChunkUpload: (
    token: string,
    organizationId: number,
    payload: {
      snag_id: number
      file_name: string
      mime_type: string
      total_chunks: number
      file_size: number
      client_uuid: string
    },
  ) =>
    request<{ data: { upload_session_id: number; upload_uuid: string; total_chunks: number } }>(
      '/api/mobile/attachments/chunked/init',
      {
        token,
        organizationId,
        method: 'POST',
        body: payload,
      },
    ),

  uploadChunk: (
    token: string,
    organizationId: number,
    sessionId: number,
    chunkIndex: number,
    chunkFile: { uri: string; name: string; type: string },
  ) => {
    const formData = new FormData()
    formData.append('chunk_index', String(chunkIndex))
    formData.append('chunk', chunkFile as unknown as Blob)

    return request<{ data: { received_count: number } }>(`/api/mobile/attachments/chunked/${sessionId}/chunk`, {
      token,
      organizationId,
      method: 'POST',
      body: formData,
      headers: {},
    })
  },

  completeChunkUpload: (token: string, organizationId: number, sessionId: number, clientUuid: string) =>
    request<{ data: { id: number; file_path: string } }>(`/api/mobile/attachments/chunked/${sessionId}/complete`, {
      token,
      organizationId,
      method: 'POST',
      body: { client_uuid: clientUuid },
    }),

  resolveLocationByBarcode: (token: string, organizationId: number, barcode: string) =>
    request<{ data: unknown }>('/api/locations/resolve?barcode=' + encodeURIComponent(barcode), {
      token,
      organizationId,
    }),

  mediaUrl: (path: string) => `${API_URL}/storage/${path}`,
}

export const isNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('network') || message.includes('failed to fetch') || message.includes('timed out')
}
