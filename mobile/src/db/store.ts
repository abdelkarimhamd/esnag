import { v4 as uuidv4 } from 'uuid'
import { db, nowIso } from './database'
import type {
  EquipmentLogRecord,
  EquipmentRecord,
  LocalAttachmentRecord,
  LocalCommentRecord,
  OfflineFloorLocationRow,
  OfflineFloorMapRow,
  OfflineFloorZoneRow,
  OfflineLocationLookupRow,
  LocalSnagRecord,
  QueueOperationRecord,
  ServerSnag,
  SyncConflictRecord,
  SyncPolicyRecord,
} from '../types'

const parsePayload = <T>(value: string): T => JSON.parse(value) as T

export const defaultSyncPolicy: SyncPolicyRecord = {
  background_enabled: true,
  interval_seconds: 30,
  max_runs_per_minute: 6,
  window_start: null,
  window_end: null,
}

const parseSyncPolicyValue = (value: string | null): SyncPolicyRecord => {
  if (!value) {
    return defaultSyncPolicy
  }

  try {
    const decoded = JSON.parse(value) as Partial<SyncPolicyRecord>
    const interval = Number(decoded.interval_seconds ?? defaultSyncPolicy.interval_seconds)
    const maxRuns = Number(decoded.max_runs_per_minute ?? defaultSyncPolicy.max_runs_per_minute)

    return {
      background_enabled:
        typeof decoded.background_enabled === 'boolean'
          ? decoded.background_enabled
          : defaultSyncPolicy.background_enabled,
      interval_seconds: Number.isFinite(interval) ? Math.min(600, Math.max(15, Math.round(interval))) : 30,
      max_runs_per_minute: Number.isFinite(maxRuns) ? Math.min(60, Math.max(1, Math.round(maxRuns))) : 6,
      window_start:
        typeof decoded.window_start === 'string' && decoded.window_start.trim()
          ? decoded.window_start.trim()
          : null,
      window_end:
        typeof decoded.window_end === 'string' && decoded.window_end.trim()
          ? decoded.window_end.trim()
          : null,
    }
  } catch {
    return defaultSyncPolicy
  }
}

export const getMetaValue = (key: string): string | null => {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', key)
  return row?.value ?? null
}

export const setMetaValue = (key: string, value: string) => {
  db.runSync(
    `
      INSERT INTO sync_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    key,
    value,
  )
}

export const getSyncPolicy = (): SyncPolicyRecord => {
  try {
    return parseSyncPolicyValue(getMetaValue('sync_policy'))
  } catch {
    return defaultSyncPolicy
  }
}

export const setSyncPolicy = (policy: SyncPolicyRecord) => {
  try {
    setMetaValue(
      'sync_policy',
      JSON.stringify({
        background_enabled: policy.background_enabled,
        interval_seconds: policy.interval_seconds,
        max_runs_per_minute: policy.max_runs_per_minute,
        window_start: policy.window_start,
        window_end: policy.window_end,
      }),
    )
  } catch {
    // Ignore write failures until sqlite is initialized.
  }
}

export const queueOperation = (
  type: QueueOperationRecord['type'],
  payload: Record<string, unknown>,
  clientUpdatedAt = nowIso(),
  opId = uuidv4(),
) => {
  db.runSync(
    `
      INSERT INTO operations_queue (op_id, type, payload, client_updated_at, status, retries, next_retry_at, last_error, created_at)
      VALUES (?, ?, ?, ?, 'pending', 0, NULL, NULL, ?)
    `,
    opId,
    type,
    JSON.stringify(payload),
    clientUpdatedAt,
    nowIso(),
  )

  return opId
}

export const listPendingOperations = (limit = 40): QueueOperationRecord[] => {
  const now = nowIso()
  return db.getAllSync<QueueOperationRecord>(
    `
      SELECT *
      FROM operations_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `,
    now,
    limit,
  )
}

export const markOperationApplied = (opId: string) => {
  db.runSync('UPDATE operations_queue SET status = ?, last_error = NULL WHERE op_id = ?', 'applied', opId)
}

export const markOperationRejected = (opId: string, errorMessage: string) => {
  db.runSync('UPDATE operations_queue SET status = ?, last_error = ? WHERE op_id = ?', 'rejected', errorMessage, opId)
}

export const markOperationFailed = (opId: string, retries: number, nextRetryAt: string, errorMessage: string) => {
  db.runSync(
    `
      UPDATE operations_queue
      SET status = ?,
          retries = ?,
          next_retry_at = ?,
          last_error = ?
      WHERE op_id = ?
    `,
    'pending',
    retries,
    nextRetryAt,
    errorMessage,
    opId,
  )
}

export const listQueuedOperations = (): QueueOperationRecord[] =>
  db.getAllSync<QueueOperationRecord>('SELECT * FROM operations_queue ORDER BY created_at ASC')

export const queueCount = (): number => {
  const row = db.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) as total FROM operations_queue WHERE status = 'pending'",
  )
  return row?.total ?? 0
}

export const upsertServerSnags = (snags: ServerSnag[]) => {
  for (const snag of snags) {
    db.runSync(
      `
        INSERT INTO snags_local (
          server_id, client_uuid, reference, title, description, status, priority,
          project_id, drawing_id, building_id, floor_id, location_id, equipment_id,
          pin_x, pin_y, assigned_to, due_date, created_at, updated_at, is_dirty
        )
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(server_id) DO UPDATE SET
          reference = excluded.reference,
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          priority = excluded.priority,
          project_id = excluded.project_id,
          drawing_id = excluded.drawing_id,
          building_id = excluded.building_id,
          floor_id = excluded.floor_id,
          location_id = excluded.location_id,
          equipment_id = excluded.equipment_id,
          pin_x = excluded.pin_x,
          pin_y = excluded.pin_y,
          assigned_to = excluded.assigned_to,
          due_date = excluded.due_date,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          is_dirty = 0
      `,
      snag.id,
      snag.reference,
      snag.title,
      snag.description ?? null,
      snag.status,
      snag.priority,
      snag.project_id,
      snag.drawing_id,
      snag.building_id ?? null,
      snag.floor_id ?? null,
      snag.location_id ?? null,
      snag.equipment_id ?? null,
      snag.pin_x,
      snag.pin_y,
      snag.assigned_to ?? null,
      snag.due_date ?? null,
      snag.created_at,
      snag.updated_at,
    )
  }
}

export const createLocalSnag = (payload: {
  client_uuid: string
  title: string
  description?: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  project_id: number
  drawing_id: number
  building_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  pin_x: number
  pin_y: number
  assigned_to?: number | null
  due_date?: string | null
}) => {
  const now = nowIso()
  const result = db.runSync(
    `
      INSERT INTO snags_local (
        server_id, client_uuid, reference, title, description, status, priority,
        project_id, drawing_id, building_id, floor_id, location_id, equipment_id,
        pin_x, pin_y, assigned_to, due_date, created_at, updated_at, is_dirty
      )
      VALUES (NULL, ?, NULL, ?, ?, 'new', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1)
    `,
    payload.client_uuid,
    payload.title,
    payload.description ?? null,
    payload.priority,
    payload.project_id,
    payload.drawing_id,
    payload.building_id ?? null,
    payload.floor_id ?? null,
    payload.location_id ?? null,
    payload.pin_x,
    payload.pin_y,
    payload.assigned_to ?? null,
    payload.due_date ?? null,
    now,
    now,
  ) as { lastInsertRowId: number }

  return result.lastInsertRowId
}

export const bindLocalSnagToServer = (clientUuid: string, serverId: number, reference?: string | null, status?: string) => {
  db.runSync(
    `
      UPDATE snags_local
      SET server_id = ?,
          reference = COALESCE(?, reference),
          status = COALESCE(?, status),
          updated_at = ?,
          is_dirty = 0
      WHERE client_uuid = ?
    `,
    serverId,
    reference ?? null,
    status ?? null,
    nowIso(),
    clientUuid,
  )
}

export const updateLocalSnagFromConflict = (
  serverSnagId: number,
  data: { title: string; description?: string | null; priority: string; status: string; updated_at: string },
) => {
  db.runSync(
    `
      UPDATE snags_local
      SET title = ?,
          description = ?,
          priority = ?,
          status = ?,
          updated_at = ?,
          is_dirty = 0
      WHERE server_id = ?
    `,
    data.title,
    data.description ?? null,
    data.priority,
    data.status,
    data.updated_at,
    serverSnagId,
  )
}

export const listLocalSnags = (filters?: {
  project_id?: number | null
  floor_id?: number | null
  location_id?: number | null
}): LocalSnagRecord[] => {
  const conditions: string[] = []
  const params: Array<number | string> = []

  if (filters?.project_id) {
    conditions.push('project_id = ?')
    params.push(filters.project_id)
  }

  if (filters?.floor_id) {
    conditions.push('floor_id = ?')
    params.push(filters.floor_id)
  }

  if (filters?.location_id) {
    conditions.push('location_id = ?')
    params.push(filters.location_id)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.getAllSync<LocalSnagRecord>(
    `
      SELECT *
      FROM snags_local
      ${where}
      ORDER BY datetime(updated_at) DESC
      LIMIT 500
    `,
    ...params,
  )
}

export const findLocalSnag = (localId: number): LocalSnagRecord | null =>
  db.getFirstSync<LocalSnagRecord>('SELECT * FROM snags_local WHERE local_id = ?', localId) ?? null

export const findLocalSnagByServerId = (serverId: number): LocalSnagRecord | null =>
  db.getFirstSync<LocalSnagRecord>('SELECT * FROM snags_local WHERE server_id = ?', serverId) ?? null

export const updateLocalSnag = (
  serverId: number,
  patch: Partial<Pick<LocalSnagRecord, 'title' | 'description' | 'priority' | 'assigned_to' | 'due_date' | 'equipment_id'>>,
) => {
  const existing = findLocalSnagByServerId(serverId)
  if (!existing) {
    return
  }

  db.runSync(
    `
      UPDATE snags_local
      SET title = ?,
          description = ?,
          priority = ?,
          assigned_to = ?,
          due_date = ?,
          equipment_id = ?,
          updated_at = ?,
          is_dirty = 1
      WHERE server_id = ?
    `,
    patch.title ?? existing.title,
    patch.description ?? existing.description,
    patch.priority ?? existing.priority,
    patch.assigned_to ?? existing.assigned_to,
    patch.due_date ?? existing.due_date,
    patch.equipment_id ?? existing.equipment_id,
    nowIso(),
    serverId,
  )
}

export const updateLocalSnagStatus = (serverId: number, status: string) => {
  db.runSync(
    `
      UPDATE snags_local
      SET status = ?,
          updated_at = ?,
          is_dirty = 1
      WHERE server_id = ?
    `,
    status,
    nowIso(),
    serverId,
  )
}

export const upsertServerComments = (comments: Array<Record<string, unknown>>) => {
  for (const comment of comments) {
    const serverId = Number(comment.id ?? 0)
    const createdAt = String(comment.created_at ?? nowIso())
    const updatedAt = String(comment.updated_at ?? createdAt)
    db.runSync(
      `
        INSERT INTO comments_local (server_id, client_uuid, snag_server_id, body, is_internal, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          body = excluded.body,
          is_internal = excluded.is_internal,
          updated_at = excluded.updated_at
      `,
      serverId,
      String(comment.client_uuid ?? `srv-${serverId}`),
      Number(comment.snag_id ?? 0),
      String(comment.body ?? ''),
      Number(comment.is_internal ? 1 : 0),
      createdAt,
      updatedAt,
    )
  }
}

export const addLocalComment = (payload: { snag_server_id: number; client_uuid: string; body: string; is_internal?: boolean }) => {
  const now = nowIso()
  db.runSync(
    `
      INSERT INTO comments_local (server_id, client_uuid, snag_server_id, body, is_internal, created_at, updated_at)
      VALUES (NULL, ?, ?, ?, ?, ?, ?)
    `,
    payload.client_uuid,
    payload.snag_server_id,
    payload.body,
    payload.is_internal ? 1 : 0,
    now,
    now,
  )
}

export const listCommentsForSnag = (snagServerId: number): LocalCommentRecord[] =>
  db.getAllSync<LocalCommentRecord>(
    `
      SELECT *
      FROM comments_local
      WHERE snag_server_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 200
    `,
    snagServerId,
  )

export const upsertServerAttachments = (attachments: Array<Record<string, unknown>>) => {
  for (const attachment of attachments) {
    const serverId = Number(attachment.id ?? 0)
    const createdAt = String(attachment.created_at ?? nowIso())
    const updatedAt = String(attachment.updated_at ?? createdAt)
    db.runSync(
      `
        INSERT INTO attachments_local (
          server_id, client_uuid, snag_server_id, local_uri, file_name, mime_type, file_size,
          upload_state, retries, next_retry_at, remote_path, error_message, created_at, updated_at
        )
        VALUES (?, ?, ?, '', ?, ?, ?, 'uploaded', 0, NULL, ?, NULL, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          file_size = excluded.file_size,
          upload_state = 'uploaded',
          remote_path = excluded.remote_path,
          updated_at = excluded.updated_at
      `,
      serverId,
      String(attachment.client_uuid ?? `srv-att-${serverId}`),
      Number(attachment.snag_id ?? 0),
      String(attachment.file_name ?? ''),
      String(attachment.mime_type ?? 'application/octet-stream'),
      Number(attachment.file_size ?? 0),
      String(attachment.file_path ?? ''),
      createdAt,
      updatedAt,
    )
  }
}

export const queueLocalAttachment = (payload: {
  snag_server_id: number
  local_uri: string
  file_name: string
  mime_type: string
  file_size: number
  client_uuid: string
}) => {
  const now = nowIso()
  db.runSync(
    `
      INSERT INTO attachments_local (
        server_id, client_uuid, snag_server_id, local_uri, file_name, mime_type, file_size,
        upload_state, retries, next_retry_at, remote_path, error_message, created_at, updated_at
      )
      VALUES (NULL, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
    `,
    payload.client_uuid,
    payload.snag_server_id,
    payload.local_uri,
    payload.file_name,
    payload.mime_type,
    payload.file_size,
    now,
    now,
  )
}

export const listPendingAttachments = (limit = 20): LocalAttachmentRecord[] => {
  const now = nowIso()
  return db.getAllSync<LocalAttachmentRecord>(
    `
      SELECT *
      FROM attachments_local
      WHERE upload_state IN ('pending', 'failed')
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY datetime(created_at) ASC
      LIMIT ?
    `,
    now,
    limit,
  )
}

export const markAttachmentUploading = (localId: number) => {
  db.runSync(
    `
      UPDATE attachments_local
      SET upload_state = 'uploading',
          error_message = NULL,
          updated_at = ?
      WHERE local_id = ?
    `,
    nowIso(),
    localId,
  )
}

export const markAttachmentUploaded = (localId: number, serverId: number, remotePath: string) => {
  db.runSync(
    `
      UPDATE attachments_local
      SET upload_state = 'uploaded',
          server_id = ?,
          remote_path = ?,
          error_message = NULL,
          updated_at = ?
      WHERE local_id = ?
    `,
    serverId,
    remotePath,
    nowIso(),
    localId,
  )
}

export const markAttachmentFailed = (localId: number, retries: number, nextRetryAt: string, errorMessage: string) => {
  db.runSync(
    `
      UPDATE attachments_local
      SET upload_state = 'failed',
          retries = ?,
          next_retry_at = ?,
          error_message = ?,
          updated_at = ?
      WHERE local_id = ?
    `,
    retries,
    nextRetryAt,
    errorMessage,
    nowIso(),
    localId,
  )
}

export const listAttachmentsForSnag = (snagServerId: number): LocalAttachmentRecord[] =>
  db.getAllSync<LocalAttachmentRecord>(
    `
      SELECT *
      FROM attachments_local
      WHERE snag_server_id = ?
      ORDER BY datetime(created_at) DESC
    `,
    snagServerId,
  )

export const upsertServerBuildings = (rows: Array<Record<string, unknown>>) => {
  for (const row of rows) {
    const id = Number(row.id ?? 0)
    const projectId = Number(row.project_id ?? 0)
    if (id <= 0 || projectId <= 0) {
      continue
    }

    db.runSync(
      `
        INSERT INTO buildings_local (id, organization_id, project_id, name, code, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          project_id = excluded.project_id,
          name = excluded.name,
          code = excluded.code,
          updated_at = excluded.updated_at
      `,
      id,
      Number(row.organization_id ?? 0),
      projectId,
      String(row.name ?? ''),
      String(row.code ?? ''),
      String(row.updated_at ?? nowIso()),
    )
  }
}

export const upsertServerFloors = (rows: Array<Record<string, unknown>>) => {
  for (const row of rows) {
    const id = Number(row.id ?? 0)
    const buildingId = Number(row.building_id ?? 0)
    const projectId = Number(row.project_id ?? 0)
    if (id <= 0 || buildingId <= 0 || projectId <= 0) {
      continue
    }

    db.runSync(
      `
        INSERT INTO floors_local (
          id, organization_id, building_id, project_id, name, code, level, sort_order, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          building_id = excluded.building_id,
          project_id = excluded.project_id,
          name = excluded.name,
          code = excluded.code,
          level = excluded.level,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `,
      id,
      Number(row.organization_id ?? 0),
      buildingId,
      projectId,
      String(row.name ?? ''),
      String(row.code ?? ''),
      row.level === null || row.level === undefined ? null : Number(row.level),
      row.sort_order === null || row.sort_order === undefined ? null : Number(row.sort_order),
      String(row.updated_at ?? nowIso()),
    )
  }
}

export const upsertServerLocations = (rows: Array<Record<string, unknown>>) => {
  for (const row of rows) {
    const id = Number(row.id ?? 0)
    const floorId = Number(row.floor_id ?? 0)
    const buildingId = Number(row.building_id ?? 0)
    const projectId = Number(row.project_id ?? 0)
    if (id <= 0 || floorId <= 0 || buildingId <= 0 || projectId <= 0) {
      continue
    }

    db.runSync(
      `
        INSERT INTO locations_local (
          id, organization_id, floor_id, building_id, project_id, name, code, type, barcode, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          floor_id = excluded.floor_id,
          building_id = excluded.building_id,
          project_id = excluded.project_id,
          name = excluded.name,
          code = excluded.code,
          type = excluded.type,
          barcode = excluded.barcode,
          updated_at = excluded.updated_at
      `,
      id,
      Number(row.organization_id ?? 0),
      floorId,
      buildingId,
      projectId,
      String(row.name ?? ''),
      String(row.code ?? ''),
      row.type ? String(row.type) : null,
      row.barcode ? String(row.barcode) : null,
      String(row.updated_at ?? nowIso()),
    )
  }
}

export const upsertServerDrawingLocationZones = (rows: Array<Record<string, unknown>>) => {
  for (const row of rows) {
    const id = Number(row.id ?? 0)
    const drawingId = Number(row.drawing_id ?? 0)
    const locationId = Number(row.location_id ?? 0)
    if (id <= 0 || drawingId <= 0 || locationId <= 0) {
      continue
    }

    db.runSync(
      `
        INSERT INTO floor_map_zones_local (
          id, organization_id, drawing_id, drawing_revision_id, floor_id, location_id, zone_label,
          x_min, y_min, x_max, y_max, priority, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          drawing_id = excluded.drawing_id,
          drawing_revision_id = excluded.drawing_revision_id,
          floor_id = excluded.floor_id,
          location_id = excluded.location_id,
          zone_label = excluded.zone_label,
          x_min = excluded.x_min,
          y_min = excluded.y_min,
          x_max = excluded.x_max,
          y_max = excluded.y_max,
          priority = excluded.priority,
          updated_at = excluded.updated_at
      `,
      id,
      Number(row.organization_id ?? 0),
      drawingId,
      row.drawing_revision_id === null || row.drawing_revision_id === undefined
        ? null
        : Number(row.drawing_revision_id),
      row.floor_id === null || row.floor_id === undefined ? null : Number(row.floor_id),
      locationId,
      row.zone_label ? String(row.zone_label) : null,
      Number(row.x_min ?? 0),
      Number(row.y_min ?? 0),
      Number(row.x_max ?? 0),
      Number(row.y_max ?? 0),
      Number(row.priority ?? 100),
      String(row.updated_at ?? nowIso()),
    )
  }
}

export const listOfflineFloors = (projectId?: number | null): OfflineFloorMapRow[] =>
  db.getAllSync<OfflineFloorMapRow>(
    `
      SELECT
        f.*,
        b.name as building_name,
        b.code as building_code,
        (SELECT COUNT(*) FROM locations_local l WHERE l.floor_id = f.id) as location_count,
        (SELECT COUNT(*) FROM floor_map_zones_local z WHERE z.floor_id = f.id) as zone_count,
        (SELECT COUNT(*) FROM snags_local s WHERE s.floor_id = f.id) as total_snags,
        (
          SELECT COUNT(*)
          FROM snags_local s
          WHERE s.floor_id = f.id
            AND s.status NOT IN ('closed', 'rejected')
        ) as open_snags
      FROM floors_local f
      INNER JOIN buildings_local b ON b.id = f.building_id
      WHERE (? IS NULL OR f.project_id = ?)
      ORDER BY f.project_id ASC, b.code ASC, COALESCE(f.level, 9999) ASC, COALESCE(f.sort_order, 9999) ASC, f.name ASC
    `,
    projectId ?? null,
    projectId ?? null,
  )

export const listOfflineFloorLocations = (floorId: number): OfflineFloorLocationRow[] =>
  db.getAllSync<OfflineFloorLocationRow>(
    `
      SELECT
        l.*,
        (SELECT COUNT(*) FROM snags_local s WHERE s.location_id = l.id) as total_snags,
        (
          SELECT COUNT(*)
          FROM snags_local s
          WHERE s.location_id = l.id
            AND s.status NOT IN ('closed', 'rejected')
        ) as open_snags
      FROM locations_local l
      WHERE l.floor_id = ?
      ORDER BY l.name ASC
      LIMIT 500
    `,
    floorId,
  )

export const listOfflineFloorZones = (floorId: number): OfflineFloorZoneRow[] =>
  db.getAllSync<OfflineFloorZoneRow>(
    `
      SELECT
        z.*,
        l.name as location_name,
        l.code as location_code,
        l.barcode as barcode,
        (SELECT COUNT(*) FROM snags_local s WHERE s.location_id = z.location_id) as total_snags,
        (
          SELECT COUNT(*)
          FROM snags_local s
          WHERE s.location_id = z.location_id
            AND s.status NOT IN ('closed', 'rejected')
        ) as open_snags
      FROM floor_map_zones_local z
      INNER JOIN locations_local l ON l.id = z.location_id
      WHERE z.floor_id = ?
      ORDER BY z.priority DESC, z.id ASC
      LIMIT 1000
    `,
    floorId,
  )

export const findOfflineLocationByBarcode = (barcode: string): OfflineLocationLookupRow | null =>
  db.getFirstSync<OfflineLocationLookupRow>(
    `
      SELECT
        l.id as location_id,
        l.name as location_name,
        l.code as location_code,
        l.barcode as barcode,
        f.id as floor_id,
        f.name as floor_name,
        f.code as floor_code,
        b.id as building_id,
        b.name as building_name,
        b.code as building_code,
        b.project_id as project_id
      FROM locations_local l
      INNER JOIN floors_local f ON f.id = l.floor_id
      INNER JOIN buildings_local b ON b.id = f.building_id
      WHERE LOWER(l.barcode) = LOWER(?)
      LIMIT 1
    `,
    barcode.trim(),
  ) ?? null

export const queueSyncConflict = (payload: {
  op_id: string
  entity_type: 'snag'
  entity_id: number | null
  operation_type: string
  local_payload: Record<string, unknown>
  server_payload: Record<string, unknown>
}) => {
  db.runSync(
    `
      INSERT INTO sync_conflicts (
        op_id, entity_type, entity_id, operation_type, local_payload, server_payload, status, resolution, created_at, resolved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
      ON CONFLICT(op_id) DO UPDATE SET
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        operation_type = excluded.operation_type,
        local_payload = excluded.local_payload,
        server_payload = excluded.server_payload,
        status = 'pending',
        resolution = NULL,
        resolved_at = NULL
    `,
    payload.op_id,
    payload.entity_type,
    payload.entity_id,
    payload.operation_type,
    JSON.stringify(payload.local_payload),
    JSON.stringify(payload.server_payload),
    nowIso(),
  )
}

export const listPendingSyncConflicts = (): SyncConflictRecord[] =>
  db.getAllSync<SyncConflictRecord>(
    `
      SELECT *
      FROM sync_conflicts
      WHERE status = 'pending'
      ORDER BY datetime(created_at) DESC
      LIMIT 300
    `,
  )

export const pendingSyncConflictsCount = (): number => {
  const row = db.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) as total FROM sync_conflicts WHERE status = 'pending'",
  )
  return row?.total ?? 0
}

export const resolveSyncConflict = (id: number, resolution: string) => {
  db.runSync(
    `
      UPDATE sync_conflicts
      SET status = 'resolved',
          resolution = ?,
          resolved_at = ?
      WHERE id = ?
    `,
    resolution,
    nowIso(),
    id,
  )
}

export const upsertServerEquipment = (equipmentRows: Array<Record<string, unknown>>) => {
  for (const item of equipmentRows) {
    db.runSync(
      `
        INSERT INTO equipment_local (id, code, name, status, barcode, project_id, location_id, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          status = excluded.status,
          barcode = excluded.barcode,
          project_id = excluded.project_id,
          location_id = excluded.location_id,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `,
      Number(item.id ?? 0),
      String(item.code ?? ''),
      String(item.name ?? ''),
      String(item.status ?? 'ok'),
      item.barcode ? String(item.barcode) : null,
      item.project_id ? Number(item.project_id) : null,
      item.location_id ? Number(item.location_id) : null,
      item.notes ? String(item.notes) : null,
      String(item.updated_at ?? nowIso()),
    )
  }
}

export const upsertServerEquipmentLogs = (logs: Array<Record<string, unknown>>) => {
  for (const log of logs) {
    db.runSync(
      `
        INSERT INTO equipment_logs_local (id, equipment_id, snag_id, status, description, action_taken, occurred_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          equipment_id = excluded.equipment_id,
          snag_id = excluded.snag_id,
          status = excluded.status,
          description = excluded.description,
          action_taken = excluded.action_taken,
          occurred_at = excluded.occurred_at,
          updated_at = excluded.updated_at
      `,
      Number(log.id ?? 0),
      Number(log.equipment_id ?? 0),
      log.snag_id ? Number(log.snag_id) : null,
      String(log.status ?? 'ok'),
      log.description ? String(log.description) : null,
      log.action_taken ? String(log.action_taken) : null,
      String(log.occurred_at ?? nowIso()),
      String(log.updated_at ?? nowIso()),
    )
  }
}

export const listEquipment = (): EquipmentRecord[] =>
  db.getAllSync<EquipmentRecord>(
    `
      SELECT *
      FROM equipment_local
      ORDER BY CASE status
        WHEN 'critical' THEN 1
        WHEN 'warn' THEN 2
        ELSE 3
      END, datetime(updated_at) DESC
      LIMIT 500
    `,
  )

export const listEquipmentLogs = (equipmentId: number): EquipmentLogRecord[] =>
  db.getAllSync<EquipmentLogRecord>(
    `
      SELECT *
      FROM equipment_logs_local
      WHERE equipment_id = ?
      ORDER BY datetime(occurred_at) DESC
      LIMIT 100
    `,
    equipmentId,
  )

export const parseQueuePayload = (operation: QueueOperationRecord): Record<string, unknown> =>
  parsePayload<Record<string, unknown>>(operation.payload)

export const parseConflictPayload = <T>(payload: string): T => {
  try {
    return parsePayload<T>(payload)
  } catch {
    return {} as T
  }
}
