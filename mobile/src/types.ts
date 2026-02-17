export type SnagStatus = 'new' | 'assigned' | 'in_progress' | 'ready_for_review' | 'closed' | 'rejected'
export type SnagPriority = 'low' | 'medium' | 'high' | 'critical'

export interface OrganizationSummary {
  id: number
  name: string
  code: string
  roles: string[]
}

export interface UserSummary {
  id: number
  name: string
  email: string
  mfa_enabled?: boolean
}

export interface AuthPayload {
  user: UserSummary
  organizations: OrganizationSummary[]
}

export interface ProjectSummary {
  id: number
  name: string
  code: string
}

export interface DrawingSummary {
  id: number
  code: string
  title: string
}

export interface BuildingLocalRecord {
  id: number
  organization_id: number
  project_id: number
  name: string
  code: string
  updated_at: string
}

export interface FloorLocalRecord {
  id: number
  organization_id: number
  building_id: number
  project_id: number
  name: string
  code: string
  level: number | null
  sort_order: number | null
  updated_at: string
}

export interface LocationLocalRecord {
  id: number
  organization_id: number
  floor_id: number
  building_id: number
  project_id: number
  name: string
  code: string
  type: string | null
  barcode: string | null
  updated_at: string
}

export interface DrawingLocationZoneLocalRecord {
  id: number
  organization_id: number
  drawing_id: number
  drawing_revision_id: number | null
  floor_id: number | null
  location_id: number
  zone_label: string | null
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  priority: number
  updated_at: string
}

export interface OfflineFloorMapRow {
  id: number
  organization_id: number
  building_id: number
  project_id: number
  name: string
  code: string
  level: number | null
  sort_order: number | null
  updated_at: string
  building_name: string
  building_code: string
  location_count: number
  zone_count: number
  total_snags: number
  open_snags: number
}

export interface OfflineFloorLocationRow {
  id: number
  organization_id: number
  floor_id: number
  building_id: number
  project_id: number
  name: string
  code: string
  type: string | null
  barcode: string | null
  updated_at: string
  total_snags: number
  open_snags: number
}

export interface OfflineFloorZoneRow {
  id: number
  organization_id: number
  drawing_id: number
  drawing_revision_id: number | null
  floor_id: number | null
  location_id: number
  zone_label: string | null
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  priority: number
  updated_at: string
  location_name: string
  location_code: string
  barcode: string | null
  total_snags: number
  open_snags: number
}

export interface OfflineLocationLookupRow {
  location_id: number
  location_name: string
  location_code: string
  barcode: string | null
  floor_id: number
  floor_name: string
  floor_code: string
  building_id: number
  building_name: string
  building_code: string
  project_id: number
}

export interface SyncPolicyRecord {
  background_enabled: boolean
  interval_seconds: number
  max_runs_per_minute: number
  window_start: string | null
  window_end: string | null
}

export interface SyncConflictRecord {
  id: number
  op_id: string
  entity_type: 'snag'
  entity_id: number | null
  operation_type: string
  local_payload: string
  server_payload: string
  status: 'pending' | 'resolved'
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export interface ServerSnag {
  id: number
  reference: string
  title: string
  description?: string | null
  status: SnagStatus
  priority: SnagPriority
  project_id: number
  drawing_id: number
  building_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  equipment_id?: number | null
  pin_x: number
  pin_y: number
  assigned_to?: number | null
  due_date?: string | null
  updated_at: string
  created_at: string
}

export interface LocalSnagRecord {
  local_id: number
  server_id: number | null
  client_uuid: string | null
  reference: string | null
  title: string
  description: string | null
  status: SnagStatus
  priority: SnagPriority
  project_id: number
  drawing_id: number
  building_id: number | null
  floor_id: number | null
  location_id: number | null
  equipment_id: number | null
  pin_x: number
  pin_y: number
  assigned_to: number | null
  due_date: string | null
  updated_at: string
  is_dirty: number
}

export interface LocalCommentRecord {
  local_id: number
  server_id: number | null
  client_uuid: string
  snag_server_id: number
  body: string
  is_internal: number
  created_at: string
  updated_at: string
}

export interface LocalAttachmentRecord {
  local_id: number
  server_id: number | null
  client_uuid: string
  snag_server_id: number
  local_uri: string
  file_name: string
  mime_type: string
  file_size: number
  upload_state: 'pending' | 'uploading' | 'uploaded' | 'failed'
  retries: number
  next_retry_at: string | null
  remote_path: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface QueueOperationRecord {
  id: number
  op_id: string
  type: 'snag.create' | 'snag.update' | 'snag.transition' | 'snag.comment.create'
  payload: string
  client_updated_at: string
  status: 'pending' | 'applied' | 'rejected' | 'failed'
  retries: number
  next_retry_at: string | null
  last_error: string | null
  created_at: string
}

export interface EquipmentRecord {
  id: number
  code: string
  name: string
  status: 'ok' | 'warn' | 'critical' | 'inactive'
  barcode?: string | null
  project_id?: number | null
  location_id?: number | null
  notes?: string | null
  updated_at: string
}

export interface EquipmentLogRecord {
  id: number
  equipment_id: number
  snag_id?: number | null
  status: 'ok' | 'warn' | 'critical'
  description?: string | null
  action_taken?: string | null
  occurred_at: string
  updated_at: string
}

export interface NotificationPreferenceRecord {
  id: number
  digest_frequency: 'off' | 'daily' | 'weekly' | 'monthly'
  email_enabled: boolean
  in_app_enabled: boolean
  push_enabled: boolean
  immediate_assignment: boolean
  immediate_status_change: boolean
  immediate_comment: boolean
  approval_needed: boolean
  signature_requested: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  timezone: string
}

export interface MobileAuthDeviceRecord {
  id: number
  user_id: number
  device_id: string
  device_name?: string | null
  platform: string
  app_version?: string | null
  is_active: boolean
  trusted_until?: string | null
  last_seen_at?: string | null
  last_ip?: string | null
  created_at: string
  updated_at: string
}

export interface SyncApplyResult {
  op_id: string
  status: 'applied' | 'rejected' | 'failed'
  result?: Record<string, unknown>
  errors?: Record<string, string[]>
  message?: string
}
