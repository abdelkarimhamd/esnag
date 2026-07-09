import { Platform } from 'react-native'
import type {
  AuthPayload,
  DrawingSummary,
  MobileAuthDeviceRecord,
  NotificationPreferenceRecord,
  NotificationRecord,
  OrganizationMemberRecord,
  ProjectSummary,
  ServerSnagDetail,
  SyncApplyResult,
} from '../types'
import type {
  InspectionDecision,
  InspectionSubmissionDetailResponse,
  InspectionSubmissionListResponse,
  ListInspectionSubmissionsParams,
  UpdateInspectionSubmissionPayload,
} from '../inspections/types'

// Serialize inspection list params into a query string, dropping undefined /
// empty values (keeps the request URL clean and matches the web caller which
// passes `undefined` for unset filters).
const buildQueryString = (params?: Record<string, string | number | undefined>): string => {
  if (!params) {
    return ''
  }
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

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

// Global search result rows (GET /api/search). Each list is capped at 10 and
// permission + org scoped server-side; under 2 query chars the server returns
// empty arrays.
export interface SearchSnagResult {
  id: number
  reference: string
  title: string
  project_id: number
  status: string
}

export interface SearchDrawingResult {
  id: number
  code: string
  title: string
  project_id: number
}

export interface SearchResults {
  snags: SearchSnagResult[]
  drawings: SearchDrawingResult[]
}

// Area / building / snag-category master-data rows for the create-snag pickers.
export interface MasterDataRecord {
  id: number
  name: string
  code: string | null
}

// ── Multi-party handover routing (Phase 2) ──
export interface HandoverParty {
  id: number
  name: string
  code: string | null
  type: string
}

export interface HandoverStageNode {
  stage_order: number
  stage_key: string
  name: string
  responsible_type: string
  permitted_actions: string[]
  forward_to_stage: number | null
  approve_to_stage: number | null
  return_to_stage: number | null
  is_final_authority: boolean
  is_loop_back: boolean
}

export interface HandoverEventRow {
  id: number
  action: string
  reason: string | null
  created_at: string
  prior_stage_order: number | null
  new_stage_order: number | null
  actor?: { id: number; name: string } | null
}

export interface HandoverSummary {
  current_stage_order: number | null
  current_stage_key: string | null
  current_stage_name: string | null
  status: string
  cycle_number: number
  viewer_permitted_actions: string[]
  gate_ready: boolean
  gate_missing: string[]
}

export interface HandoverRequestRow {
  id: number
  reference: string
  title: string
  status: string
  cycle_number: number
  current_stage_order: number | null
  responsible_company?: HandoverParty | null
  project?: { id: number; name: string; code?: string } | null
  updated_at?: string
}

export interface HandoverAttachment {
  id: number
  original_name: string
  mime_type?: string | null
  size_bytes?: number | null
  cycle_number: number
  created_at?: string
  uploader?: { id: number; name: string } | null
}

export interface HandoverComment {
  id: number
  body: string
  is_internal: boolean
  stage_order: number | null
  cycle_number: number
  created_at?: string
  user?: { id: number; name: string } | null
  source_company?: { id: number; name: string; type?: string } | null
}

export interface AuditEventRow {
  id: number
  action: string
  actor_role: string | null
  reason?: string | null
  subject_type?: string | null
  subject_id?: number | null
  created_at?: string
  actor?: { id: number; name: string } | null
  actor_company?: { id: number; name: string; type?: string } | null
}

export interface HandoverRequestDetail extends HandoverRequestRow {
  description?: string | null
  stage_graph_snapshot: HandoverStageNode[]
  assignee?: { id: number; name: string } | null
  events?: HandoverEventRow[]
  summary?: HandoverSummary
  attachments?: HandoverAttachment[]
  inspection_submissions?: { id: number; reference: string; status: string }[]
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

  // Email one-time-passcode sign-in for mobile (item 15). verify mints a token.
  requestMobileOtp: (email: string, password: string) =>
    request<{ data: { otp_sent: boolean; channel: string; destination?: string | null; expires_at?: string | null } }>('/api/auth/otp/mobile-request', {
      method: 'POST',
      body: { email, password },
    }),

  verifyMobileOtp: (email: string, password: string, code: string, deviceId?: string | null, trustDevice = true) =>
    request<AuthPayload & { token: string; token_type: string }>('/api/auth/otp/mobile-verify', {
      method: 'POST',
      body: {
        email,
        password,
        code,
        device_name: `${Platform.OS}-device`,
        device_id: deviceId || undefined,
        platform: Platform.OS,
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

  globalSearch: (token: string, organizationId: number, q: string) =>
    request<{ data: SearchResults }>(`/api/search?q=${encodeURIComponent(q)}`, {
      token,
      organizationId,
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

  // Location/category master data for the create-snag form (BR-FR-026/028/029).
  listAreas: (token: string, organizationId: number, projectId: number) =>
    request<{ data: MasterDataRecord[] }>(`/api/areas?project_id=${projectId}`, {
      token,
      organizationId,
    }),

  listBuildings: (token: string, organizationId: number, projectId: number, areaId?: number | null) =>
    request<{ data: MasterDataRecord[] }>(
      `/api/buildings?project_id=${projectId}` + (areaId ? `&area_id=${areaId}` : ''),
      { token, organizationId },
    ),

  listSnagCategories: (token: string, organizationId: number) =>
    request<{ data: MasterDataRecord[] }>('/api/snag-categories', {
      token,
      organizationId,
    }),

  // ── Master-data admin writes (§H / BR-FR-003/006/026/027). Gated server-side
  //    on the master-data manage permission. ──
  createArea: (token: string, organizationId: number, body: { project_id: number; name: string; code?: string | null }) =>
    request<{ data: MasterDataRecord }>('/api/areas', { method: 'POST', token, organizationId, body }),
  updateArea: (token: string, organizationId: number, id: number, body: { name?: string; code?: string | null }) =>
    request<{ data: MasterDataRecord }>(`/api/areas/${id}`, { method: 'PUT', token, organizationId, body }),
  deleteArea: (token: string, organizationId: number, id: number) =>
    request<{ data: { id: number; deleted: boolean } }>(`/api/areas/${id}`, { method: 'DELETE', token, organizationId }),

  createBuilding: (token: string, organizationId: number, body: { project_id: number; area_id?: number | null; name: string; code?: string | null }) =>
    request<{ data: MasterDataRecord }>('/api/buildings', { method: 'POST', token, organizationId, body }),
  updateBuilding: (token: string, organizationId: number, id: number, body: { area_id?: number | null; name?: string; code?: string | null }) =>
    request<{ data: MasterDataRecord }>(`/api/buildings/${id}`, { method: 'PUT', token, organizationId, body }),
  deleteBuilding: (token: string, organizationId: number, id: number) =>
    request<{ data: { id: number; deleted: boolean } }>(`/api/buildings/${id}`, { method: 'DELETE', token, organizationId }),

  createSnagCategory: (token: string, organizationId: number, body: { name: string; code?: string | null; project_id?: number | null; is_active?: boolean }) =>
    request<{ data: MasterDataRecord }>('/api/snag-categories', { method: 'POST', token, organizationId, body }),
  // Categories have no destroy route — deactivate via update (is_active=false).
  updateSnagCategory: (token: string, organizationId: number, id: number, body: { name?: string; code?: string | null; is_active?: boolean }) =>
    request<{ data: MasterDataRecord }>(`/api/snag-categories/${id}`, { method: 'PUT', token, organizationId, body }),

  listHandoverRequests: (token: string, organizationId: number, params: { project_id?: number; status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.project_id) qs.set('project_id', String(params.project_id))
    if (params.status) qs.set('status', params.status)
    qs.set('per_page', '50')
    return request<{ data: HandoverRequestRow[] }>(`/api/handovers/requests?${qs.toString()}`, { token, organizationId })
  },

  fetchHandoverRequest: (token: string, organizationId: number, id: number) =>
    request<{ data: HandoverRequestDetail }>(`/api/handovers/requests/${id}`, { token, organizationId }),

  createHandoverRequest: (
    token: string,
    organizationId: number,
    body: { project_id: number; title: string; description?: string; area_id?: number | null; building_id?: number | null; location_text?: string | null },
  ) =>
    request<{ data: HandoverRequestDetail }>('/api/handovers/requests', { method: 'POST', token, organizationId, body }),

  listHandoverAttachments: (token: string, organizationId: number, id: number) =>
    request<{ data: HandoverAttachment[] }>(`/api/handovers/requests/${id}/attachments`, { token, organizationId }),

  listHandoverComments: (token: string, organizationId: number, id: number) =>
    request<{ data: HandoverComment[] }>(`/api/handovers/requests/${id}/comments`, { token, organizationId }),

  // Unified cross-entity audit trail (item 9 / BR-FR-009/010).
  listAuditEvents: (token: string, organizationId: number, actionPrefix?: string) => {
    const qs = new URLSearchParams()
    if (actionPrefix) qs.set('action_prefix', actionPrefix)
    qs.set('per_page', '50')
    return request<{ data: AuditEventRow[] }>(`/api/audit/events?${qs.toString()}`, { token, organizationId })
  },

  postHandoverComment: (token: string, organizationId: number, id: number, body: string, isInternal: boolean) =>
    request<{ data: HandoverComment }>(`/api/handovers/requests/${id}/comments`, {
      method: 'POST',
      token,
      organizationId,
      body: { body, is_internal: isInternal },
    }),

  uploadHandoverAttachment: (
    token: string,
    organizationId: number,
    id: number,
    file: { uri: string; name: string; type: string },
  ) => {
    const form = new FormData()
    // React Native's FormData accepts this file descriptor shape.
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)
    return request<{ data: HandoverAttachment }>(`/api/handovers/requests/${id}/attachments`, {
      method: 'POST',
      token,
      organizationId,
      body: form,
    })
  },

  submitHandoverRequest: (token: string, organizationId: number, id: number) =>
    request<{ data: HandoverRequestDetail }>(`/api/handovers/requests/${id}/submit`, { method: 'POST', token, organizationId }),

  actHandoverRequest: (token: string, organizationId: number, id: number, action: string, reason?: string | null) =>
    request<{ data: HandoverRequestDetail }>(`/api/handovers/requests/${id}/act`, { method: 'POST', token, organizationId, body: { action, reason: reason ?? undefined } }),

  closeHandoverRequest: (token: string, organizationId: number, id: number, reason?: string | null) =>
    request<{ data: HandoverRequestDetail }>(`/api/handovers/requests/${id}/close`, { method: 'POST', token, organizationId, body: { reason: reason ?? undefined } }),

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

  fetchSnag: (token: string, organizationId: number, snagId: number) =>
    request<{ data: ServerSnagDetail }>(`/api/snags/${snagId}`, {
      token,
      organizationId,
    }),

  listNotifications: (token: string, organizationId: number, perPage = 50) =>
    request<{
      data: NotificationRecord[]
      meta: { current_page: number; last_page: number; per_page: number; total: number; unread_count: number }
    }>(`/api/notifications?per_page=${perPage}`, {
      token,
      organizationId,
    }),

  markNotificationRead: (token: string, organizationId: number, notificationId: string) =>
    request<{ message: string }>(`/api/notifications/${notificationId}/read`, {
      token,
      organizationId,
      method: 'POST',
    }),

  markAllNotificationsRead: (token: string, organizationId: number) =>
    request<{ message: string }>('/api/notifications/read-all', {
      token,
      organizationId,
      method: 'POST',
    }),

  fetchOrganizationMembers: (token: string, organizationId: number, projectId?: number | null) =>
    request<{ data: OrganizationMemberRecord[] }>(
      '/api/organizations/members' + (projectId ? `?project_id=${projectId}` : ''),
      {
        token,
        organizationId,
      },
    ),

  fetchSnagCloseout: (token: string, organizationId: number, snagId: number) =>
    request<{ data: Record<string, unknown> | null; meta: { templates: unknown[] } }>(
      `/api/snags/${snagId}/closeout`,
      {
        token,
        organizationId,
      },
    ),

  // Inspection (ITR) submissions. All endpoints sit behind the org's
  // `feature:inspections` flag on the backend; the client just calls them.

  // GET /api/inspections/submissions — paginated list with completion_percent
  // + status per row (template eager-loaded for the checklist donut).
  listInspectionSubmissions: (
    token: string,
    organizationId: number,
    params?: ListInspectionSubmissionsParams,
  ) =>
    request<InspectionSubmissionListResponse>(
      `/api/inspections/submissions${buildQueryString(params as Record<string, string | number | undefined>)}`,
      {
        token,
        organizationId,
      },
    ),

  // GET /api/inspections/submissions/{id} — full detail incl. template schema
  // (sections/fields) + saved form_data responses + approvals/signatures/requests.
  getInspectionSubmission: (token: string, organizationId: number, id: number) =>
    request<InspectionSubmissionDetailResponse>(`/api/inspections/submissions/${id}`, {
      token,
      organizationId,
    }),

  // PUT /api/inspections/submissions/{id} — save checklist responses. The
  // controller only accepts `form_data` and only while status is draft/in_review.
  updateInspectionSubmission: (
    token: string,
    organizationId: number,
    id: number,
    payload: UpdateInspectionSubmissionPayload,
  ) =>
    request<InspectionSubmissionDetailResponse>(`/api/inspections/submissions/${id}`, {
      token,
      organizationId,
      method: 'PUT',
      body: payload,
    }),

  // POST /api/inspections/submissions/{id}/submit — move a draft into review.
  submitInspection: (token: string, organizationId: number, id: number) =>
    request<InspectionSubmissionDetailResponse>(`/api/inspections/submissions/${id}/submit`, {
      token,
      organizationId,
      method: 'POST',
    }),

  // POST /api/inspections/submissions/{id}/approve — approve/reject the current
  // step (InspectionApprovalController@decide: { decision, notes? }).
  decideInspection: (
    token: string,
    organizationId: number,
    id: number,
    decision: InspectionDecision,
    note?: string | null,
  ) =>
    request<InspectionSubmissionDetailResponse>(`/api/inspections/submissions/${id}/approve`, {
      token,
      organizationId,
      method: 'POST',
      body: { decision, notes: note || undefined },
    }),

  drawingRevisionFileUrl: (revisionId: number) => `${API_URL}/api/drawing-revisions/${revisionId}/file`,

  authHeaders: (token: string, organizationId: number): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    'X-Organization-Id': String(organizationId),
    Accept: 'application/json',
  }),

  mediaUrl: (path: string) => `${API_URL}/storage/${path}`,
}

export const isNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('network') || message.includes('failed to fetch') || message.includes('timed out')
}
