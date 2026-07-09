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
  LocalSnagStatusCount,
  QueueOperationRecord,
  ServerSnag,
  SyncConflictRecord,
  SyncPolicyRecord,
} from '../types'

const parsePayload = <T>(value: string): T => JSON.parse(value) as T

/**
 * Active organization scope for every per-org local read/write. Mirrored into
 * sync_meta ('active_org') so it survives an app reload before AuthProvider has
 * re-hydrated. Reads fall back to the mirror when the module was reloaded but
 * setActiveOrganizationId has not been called yet this session.
 */
let currentOrganizationId: number | null = null

const ORG_SCOPED_MUTABLE_TABLES = [
  'snags_local',
  'operations_queue',
  'comments_local',
  'attachments_local',
  'sync_conflicts',
  // equipment tables gained organization_id in v2 as well; backfill their
  // pre-v2 rows to the active org so listEquipment/listEquipmentLogs scope.
  'equipment_local',
  'equipment_logs_local',
] as const

const readActiveOrgFromMeta = (): number | null => {
  const raw = getMetaValue('active_org')
  if (!raw) {
    return null
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Resolve the active org id, preferring the in-memory value and falling back to
 * the sync_meta mirror after a JS reload. Returns null only when no org has ever
 * been set (fresh install, pre-login).
 */
export const getActiveOrganizationId = (): number | null => {
  if (currentOrganizationId !== null) {
    return currentOrganizationId
  }
  currentOrganizationId = readActiveOrgFromMeta()
  return currentOrganizationId
}

/**
 * Backfill existing NULL-org rows to the given org: the local cache built before
 * v2 belonged to whichever org was active. Runs once per table — after backfill
 * no NULL-org rows remain so the WHERE guard is a no-op on subsequent calls.
 */
const backfillNullOrgRows = (organizationId: number) => {
  for (const table of ORG_SCOPED_MUTABLE_TABLES) {
    db.runSync(
      `UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`,
      organizationId,
    )
  }
}

/**
 * Set the active organization scope. Stores it in-memory and mirrors it into
 * sync_meta so a reload can recover it. On first assignment of a concrete org it
 * backfills any pre-v2 NULL-org rows to that org so the existing offline cache
 * and queued operations are attributed correctly (never wiped).
 */
export const setActiveOrganizationId = (id: number | null) => {
  currentOrganizationId = id

  if (id !== null) {
    setMetaValue('active_org', String(id))
    backfillNullOrgRows(id)
  }
}

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
      INSERT INTO operations_queue (op_id, organization_id, type, payload, client_updated_at, status, retries, next_retry_at, last_error, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?)
    `,
    opId,
    getActiveOrganizationId(),
    type,
    JSON.stringify(payload),
    clientUpdatedAt,
    nowIso(),
  )

  return opId
}

// The sync PUSH must scope to the organization the running sync is for — NOT the
// module-global active org, which can flip mid-sync if the user switches orgs while
// a pull is in flight (that race could otherwise POST org B's ops under org A's
// header and bleed a snag into the wrong tenant). Callers in the sync engine pass
// the explicit organizationId; other callers fall back to the active org.
export const listPendingOperations = (limit = 40, organizationId?: number | null): QueueOperationRecord[] => {
  const now = nowIso()
  const orgId = organizationId !== undefined ? organizationId : getActiveOrganizationId()
  return db.getAllSync<QueueOperationRecord>(
    `
      SELECT *
      FROM operations_queue
      WHERE status = 'pending'
        AND organization_id = ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `,
    orgId,
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

export const listQueuedOperations = (): QueueOperationRecord[] => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return db.getAllSync<QueueOperationRecord>(
      'SELECT * FROM operations_queue WHERE organization_id = ? ORDER BY created_at ASC',
      orgId,
    )
  }
  return db.getAllSync<QueueOperationRecord>('SELECT * FROM operations_queue ORDER BY created_at ASC')
}

export const queueCount = (): number => {
  const orgId = getActiveOrganizationId()
  const row =
    orgId !== null
      ? db.getFirstSync<{ total: number }>(
          "SELECT COUNT(*) as total FROM operations_queue WHERE status = 'pending' AND organization_id = ?",
          orgId,
        )
      : db.getFirstSync<{ total: number }>(
          "SELECT COUNT(*) as total FROM operations_queue WHERE status = 'pending'",
        )
  return row?.total ?? 0
}

export const upsertServerSnags = (snags: ServerSnag[]) => {
  for (const snag of snags) {
    db.runSync(
      `
        INSERT INTO snags_local (
          server_id, client_uuid, organization_id, reference, title, description, status, priority,
          project_id, drawing_id, building_id, floor_id, location_id, equipment_id,
          pin_x, pin_y, snag_type, source_organization_id, assigned_to, due_date, trade, is_dlp, cluster, toc_reference,
          created_at, updated_at, is_dirty
        )
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(server_id) DO UPDATE SET
          organization_id = excluded.organization_id,
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
          snag_type = excluded.snag_type,
          source_organization_id = excluded.source_organization_id,
          assigned_to = excluded.assigned_to,
          due_date = excluded.due_date,
          trade = excluded.trade,
          is_dlp = excluded.is_dlp,
          cluster = excluded.cluster,
          toc_reference = excluded.toc_reference,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          is_dirty = 0
      `,
      snag.id,
      (snag.organization_id as number | null | undefined) ?? getActiveOrganizationId(),
      snag.reference,
      snag.title,
      snag.description ?? null,
      snag.status,
      snag.priority,
      snag.project_id,
      // Operational snags come down with null drawing/pin; store 0 sentinels to
      // satisfy the NOT NULL columns (snag_type distinguishes them).
      snag.drawing_id ?? 0,
      snag.building_id ?? null,
      snag.floor_id ?? null,
      snag.location_id ?? null,
      snag.equipment_id ?? null,
      snag.pin_x ?? 0,
      snag.pin_y ?? 0,
      snag.snag_type ?? 'construction',
      snag.source_organization_id ?? null,
      snag.assigned_to ?? null,
      snag.due_date ?? null,
      snag.trade ?? null,
      snag.is_dlp ? 1 : 0,
      snag.cluster ?? null,
      snag.toc_reference ?? null,
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
  // drawing_id / pin_x / pin_y are optional for operational snags. The columns are
  // NOT NULL locally, so operational snags store 0 sentinels; snag_type distinguishes.
  drawing_id?: number | null
  building_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  pin_x?: number | null
  pin_y?: number | null
  snag_type?: 'construction' | 'operational'
  source_organization_id?: number | null
  assigned_to?: number | null
  due_date?: string | null
  trade?: string | null
  is_dlp?: boolean
  cluster?: string | null
  toc_reference?: string | null
}) => {
  const now = nowIso()
  const result = db.runSync(
    `
      INSERT INTO snags_local (
        server_id, client_uuid, organization_id, reference, title, description, status, priority,
        project_id, drawing_id, building_id, floor_id, location_id, equipment_id,
        pin_x, pin_y, snag_type, source_organization_id, assigned_to, due_date, trade, is_dlp, cluster, toc_reference,
        created_at, updated_at, is_dirty
      )
      VALUES (NULL, ?, ?, NULL, ?, ?, 'new', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    payload.client_uuid,
    getActiveOrganizationId(),
    payload.title,
    payload.description ?? null,
    payload.priority,
    payload.project_id,
    payload.drawing_id ?? 0,
    payload.building_id ?? null,
    payload.floor_id ?? null,
    payload.location_id ?? null,
    payload.pin_x ?? 0,
    payload.pin_y ?? 0,
    payload.snag_type ?? 'construction',
    payload.source_organization_id ?? null,
    payload.assigned_to ?? null,
    payload.due_date ?? null,
    payload.trade ?? null,
    payload.is_dlp ? 1 : 0,
    payload.cluster ?? null,
    payload.toc_reference ?? null,
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

export interface LocalSnagFilters {
  project_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  status?: string
  priority?: string
  trade?: string
  isDlp?: boolean
  assignedTo?: number
  dueWindow?: 'overdue' | '7d'
  search?: string
}

const buildSnagFilterClauses = (filters?: LocalSnagFilters): { where: string; params: Array<number | string> } => {
  const conditions: string[] = []
  const params: Array<number | string> = []

  // Strict org scope: once the active org is set (and the v2 backfill has run)
  // every snags_local row carries an organization_id, so filtering by it keeps
  // one org's cache from bleeding into another after an org switch.
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    conditions.push('organization_id = ?')
    params.push(orgId)
  }

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

  if (filters?.status) {
    conditions.push('status = ?')
    params.push(filters.status)
  }

  if (filters?.priority) {
    conditions.push('priority = ?')
    params.push(filters.priority)
  }

  if (filters?.trade) {
    conditions.push('trade = ?')
    params.push(filters.trade)
  }

  if (typeof filters?.isDlp === 'boolean') {
    conditions.push('is_dlp = ?')
    params.push(filters.isDlp ? 1 : 0)
  }

  if (filters?.assignedTo) {
    conditions.push('assigned_to = ?')
    params.push(filters.assignedTo)
  }

  if (filters?.dueWindow === 'overdue') {
    conditions.push("due_date IS NOT NULL AND date(due_date) < date('now')")
  } else if (filters?.dueWindow === '7d') {
    conditions.push("due_date IS NOT NULL AND date(due_date) >= date('now') AND date(due_date) <= date('now', '+7 day')")
  }

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`
    conditions.push('(title LIKE ? OR reference LIKE ?)')
    params.push(term, term)
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

export const listLocalSnags = (filters?: LocalSnagFilters): LocalSnagRecord[] => {
  const { where, params } = buildSnagFilterClauses(filters)

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

export const listLocalSnagCountsByStatus = (filters?: LocalSnagFilters): LocalSnagStatusCount[] => {
  const { where, params } = buildSnagFilterClauses(filters)

  return db.getAllSync<LocalSnagStatusCount>(
    `
      SELECT status, COUNT(*) as count
      FROM snags_local
      ${where}
      GROUP BY status
      ORDER BY count DESC
    `,
    ...params,
  )
}

export const findLocalSnag = (localId: number): LocalSnagRecord | null => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return (
      db.getFirstSync<LocalSnagRecord>(
        'SELECT * FROM snags_local WHERE local_id = ? AND organization_id = ?',
        localId,
        orgId,
      ) ?? null
    )
  }
  return db.getFirstSync<LocalSnagRecord>('SELECT * FROM snags_local WHERE local_id = ?', localId) ?? null
}

export const findLocalSnagByServerId = (serverId: number): LocalSnagRecord | null => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return (
      db.getFirstSync<LocalSnagRecord>(
        'SELECT * FROM snags_local WHERE server_id = ? AND organization_id = ?',
        serverId,
        orgId,
      ) ?? null
    )
  }
  return db.getFirstSync<LocalSnagRecord>('SELECT * FROM snags_local WHERE server_id = ?', serverId) ?? null
}

export const updateLocalSnag = (
  serverId: number,
  patch: Partial<
    Pick<
      LocalSnagRecord,
      'title' | 'description' | 'priority' | 'assigned_to' | 'due_date' | 'equipment_id' | 'trade' | 'is_dlp' | 'cluster' | 'toc_reference'
    >
  >,
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
          trade = ?,
          is_dlp = ?,
          cluster = ?,
          toc_reference = ?,
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
    patch.trade ?? existing.trade,
    patch.is_dlp ?? existing.is_dlp,
    patch.cluster ?? existing.cluster,
    patch.toc_reference ?? existing.toc_reference,
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
        INSERT INTO comments_local (server_id, client_uuid, organization_id, snag_server_id, body, is_internal, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          organization_id = excluded.organization_id,
          body = excluded.body,
          is_internal = excluded.is_internal,
          updated_at = excluded.updated_at
      `,
      serverId,
      String(comment.client_uuid ?? `srv-${serverId}`),
      (comment.organization_id as number | null | undefined) ?? getActiveOrganizationId(),
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
      INSERT INTO comments_local (server_id, client_uuid, organization_id, snag_server_id, body, is_internal, created_at, updated_at)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)
    `,
    payload.client_uuid,
    getActiveOrganizationId(),
    payload.snag_server_id,
    payload.body,
    payload.is_internal ? 1 : 0,
    now,
    now,
  )
}

export const listCommentsForSnag = (snagServerId: number): LocalCommentRecord[] => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return db.getAllSync<LocalCommentRecord>(
      `
        SELECT *
        FROM comments_local
        WHERE snag_server_id = ?
          AND organization_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 200
      `,
      snagServerId,
      orgId,
    )
  }
  return db.getAllSync<LocalCommentRecord>(
    `
      SELECT *
      FROM comments_local
      WHERE snag_server_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 200
    `,
    snagServerId,
  )
}

export const upsertServerAttachments = (attachments: Array<Record<string, unknown>>) => {
  for (const attachment of attachments) {
    const serverId = Number(attachment.id ?? 0)
    const createdAt = String(attachment.created_at ?? nowIso())
    const updatedAt = String(attachment.updated_at ?? createdAt)
    db.runSync(
      `
        INSERT INTO attachments_local (
          server_id, client_uuid, organization_id, snag_server_id, local_uri, file_name, mime_type, file_size,
          upload_state, retries, next_retry_at, remote_path, error_message, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, '', ?, ?, ?, 'uploaded', 0, NULL, ?, NULL, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          organization_id = excluded.organization_id,
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          file_size = excluded.file_size,
          upload_state = 'uploaded',
          remote_path = excluded.remote_path,
          updated_at = excluded.updated_at
      `,
      serverId,
      String(attachment.client_uuid ?? `srv-att-${serverId}`),
      (attachment.organization_id as number | null | undefined) ?? getActiveOrganizationId(),
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
  snag_server_id?: number | null
  snag_client_uuid?: string | null
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
        server_id, client_uuid, organization_id, snag_server_id, snag_client_uuid, local_uri, file_name, mime_type, file_size,
        upload_state, retries, next_retry_at, remote_path, error_message, created_at, updated_at
      )
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
    `,
    payload.client_uuid,
    getActiveOrganizationId(),
    payload.snag_server_id ?? 0,
    payload.snag_client_uuid ?? null,
    payload.local_uri,
    payload.file_name,
    payload.mime_type,
    payload.file_size,
    now,
    now,
  )
}

export const findSnagServerIdByClientUuid = (clientUuid: string): number | null => {
  const row = db.getFirstSync<{ server_id: number | null }>(
    'SELECT server_id FROM snags_local WHERE client_uuid = ?',
    clientUuid,
  )
  return row?.server_id ?? null
}

export const bindAttachmentToServerSnag = (localId: number, snagServerId: number) => {
  db.runSync(
    `
      UPDATE attachments_local
      SET snag_server_id = ?,
          updated_at = ?
      WHERE local_id = ?
    `,
    snagServerId,
    nowIso(),
    localId,
  )
}

export const bindQueuedAttachmentsToServerSnag = (snagClientUuid: string, snagServerId: number) => {
  db.runSync(
    `
      UPDATE attachments_local
      SET snag_server_id = ?,
          updated_at = ?
      WHERE snag_client_uuid = ?
        AND snag_server_id <= 0
    `,
    snagServerId,
    nowIso(),
    snagClientUuid,
  )
}

// See listPendingOperations: the push must scope to the explicit sync org, not the
// (racy) module-global active org.
export const listPendingAttachments = (limit = 20, organizationId?: number | null): LocalAttachmentRecord[] => {
  const now = nowIso()
  const orgId = organizationId !== undefined ? organizationId : getActiveOrganizationId()
  return db.getAllSync<LocalAttachmentRecord>(
    `
      SELECT *
      FROM attachments_local
      WHERE upload_state IN ('pending', 'failed')
        AND organization_id = ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY datetime(created_at) ASC
      LIMIT ?
    `,
    orgId,
    now,
    limit,
  )
}

// Resolve a snag's building/floor/location IDs into a human label like
// "EC2 · L12 · Chiller Hall" from the org-scoped reference cache (cheap point
// lookups on indexed primary keys). Returns null when nothing resolves.
export const resolveLocationLabel = (
  buildingId: number | null,
  floorId: number | null,
  locationId: number | null,
): string | null => {
  const parts: string[] = []
  if (buildingId != null) {
    const b = db.getFirstSync<{ code: string; name: string }>(
      'SELECT code, name FROM buildings_local WHERE id = ?',
      buildingId,
    )
    if (b) parts.push(b.code || b.name)
  }
  if (floorId != null) {
    const f = db.getFirstSync<{ code: string; name: string; level: number | null }>(
      'SELECT code, name, level FROM floors_local WHERE id = ?',
      floorId,
    )
    if (f) parts.push(f.code || (f.level != null ? `L${f.level}` : f.name))
  }
  if (locationId != null) {
    const l = db.getFirstSync<{ code: string; name: string }>(
      'SELECT code, name FROM locations_local WHERE id = ?',
      locationId,
    )
    if (l) parts.push(l.name || l.code)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Reset attachments orphaned in the 'uploading' state back to 'failed' so they are
 * re-selected by listPendingAttachments. A row only stays in 'uploading' if the
 * process was killed (OS kill, crash, RN reload) between markAttachmentUploading and
 * the upload resolving — a normal upload error already transitions it to 'failed'.
 * Safe to run at the start of a sync because the syncInProgress guard prevents
 * concurrent syncs, so any 'uploading' row is necessarily from a dead prior run.
 */
export const reclaimStaleUploadingAttachments = () => {
  db.runSync(
    `
      UPDATE attachments_local
      SET upload_state = 'failed',
          next_retry_at = NULL,
          updated_at = ?
      WHERE upload_state = 'uploading'
    `,
    nowIso(),
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

export const listAttachmentsForSnag = (snagServerId: number): LocalAttachmentRecord[] => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return db.getAllSync<LocalAttachmentRecord>(
      `
        SELECT *
        FROM attachments_local
        WHERE snag_server_id = ?
          AND organization_id = ?
        ORDER BY datetime(created_at) DESC
      `,
      snagServerId,
      orgId,
    )
  }
  return db.getAllSync<LocalAttachmentRecord>(
    `
      SELECT *
      FROM attachments_local
      WHERE snag_server_id = ?
      ORDER BY datetime(created_at) DESC
    `,
    snagServerId,
  )
}

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

export const listOfflineFloors = (projectId?: number | null): OfflineFloorMapRow[] => {
  const orgId = getActiveOrganizationId()
  return db.getAllSync<OfflineFloorMapRow>(
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
      WHERE (? IS NULL OR f.organization_id = ?)
        AND (? IS NULL OR f.project_id = ?)
      ORDER BY f.project_id ASC, b.code ASC, COALESCE(f.level, 9999) ASC, COALESCE(f.sort_order, 9999) ASC, f.name ASC
    `,
    orgId,
    orgId,
    projectId ?? null,
    projectId ?? null,
  )
}

export const listOfflineFloorLocations = (floorId: number): OfflineFloorLocationRow[] => {
  const orgId = getActiveOrganizationId()
  return db.getAllSync<OfflineFloorLocationRow>(
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
        AND (? IS NULL OR l.organization_id = ?)
      ORDER BY l.name ASC
      LIMIT 500
    `,
    floorId,
    orgId,
    orgId,
  )
}

export const listOfflineFloorZones = (floorId: number): OfflineFloorZoneRow[] => {
  const orgId = getActiveOrganizationId()
  return db.getAllSync<OfflineFloorZoneRow>(
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
        AND (? IS NULL OR z.organization_id = ?)
      ORDER BY z.priority DESC, z.id ASC
      LIMIT 1000
    `,
    floorId,
    orgId,
    orgId,
  )
}

export const findOfflineLocationByBarcode = (barcode: string): OfflineLocationLookupRow | null => {
  const orgId = getActiveOrganizationId()
  return (
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
        AND (? IS NULL OR l.organization_id = ?)
      LIMIT 1
    `,
      barcode.trim(),
      orgId,
      orgId,
    ) ?? null
  )
}

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
        op_id, organization_id, entity_type, entity_id, operation_type, local_payload, server_payload, status, resolution, created_at, resolved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
      ON CONFLICT(op_id) DO UPDATE SET
        organization_id = excluded.organization_id,
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
    getActiveOrganizationId(),
    payload.entity_type,
    payload.entity_id,
    payload.operation_type,
    JSON.stringify(payload.local_payload),
    JSON.stringify(payload.server_payload),
    nowIso(),
  )
}

export const listPendingSyncConflicts = (): SyncConflictRecord[] => {
  const orgId = getActiveOrganizationId()
  if (orgId !== null) {
    return db.getAllSync<SyncConflictRecord>(
      `
        SELECT *
        FROM sync_conflicts
        WHERE status = 'pending'
          AND organization_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 300
      `,
      orgId,
    )
  }
  return db.getAllSync<SyncConflictRecord>(
    `
      SELECT *
      FROM sync_conflicts
      WHERE status = 'pending'
      ORDER BY datetime(created_at) DESC
      LIMIT 300
    `,
  )
}

export const pendingSyncConflictsCount = (): number => {
  const orgId = getActiveOrganizationId()
  const row =
    orgId !== null
      ? db.getFirstSync<{ total: number }>(
          "SELECT COUNT(*) as total FROM sync_conflicts WHERE status = 'pending' AND organization_id = ?",
          orgId,
        )
      : db.getFirstSync<{ total: number }>(
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
        INSERT INTO equipment_local (id, organization_id, code, name, status, barcode, project_id, location_id, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
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
      (item.organization_id as number | null | undefined) ?? getActiveOrganizationId(),
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
        INSERT INTO equipment_logs_local (id, organization_id, equipment_id, snag_id, status, description, action_taken, occurred_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          equipment_id = excluded.equipment_id,
          snag_id = excluded.snag_id,
          status = excluded.status,
          description = excluded.description,
          action_taken = excluded.action_taken,
          occurred_at = excluded.occurred_at,
          updated_at = excluded.updated_at
      `,
      Number(log.id ?? 0),
      (log.organization_id as number | null | undefined) ?? getActiveOrganizationId(),
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

export const listEquipment = (): EquipmentRecord[] => {
  const orgId = getActiveOrganizationId()
  return db.getAllSync<EquipmentRecord>(
    `
      SELECT *
      FROM equipment_local
      WHERE (? IS NULL OR organization_id = ?)
      ORDER BY CASE status
        WHEN 'critical' THEN 1
        WHEN 'warn' THEN 2
        ELSE 3
      END, datetime(updated_at) DESC
      LIMIT 500
    `,
    orgId,
    orgId,
  )
}

export const listEquipmentLogs = (equipmentId: number): EquipmentLogRecord[] => {
  const orgId = getActiveOrganizationId()
  return db.getAllSync<EquipmentLogRecord>(
    `
      SELECT *
      FROM equipment_logs_local
      WHERE equipment_id = ?
        AND (? IS NULL OR organization_id = ?)
      ORDER BY datetime(occurred_at) DESC
      LIMIT 100
    `,
    equipmentId,
    orgId,
    orgId,
  )
}

export const parseQueuePayload = (operation: QueueOperationRecord): Record<string, unknown> =>
  parsePayload<Record<string, unknown>>(operation.payload)

export const parseConflictPayload = <T>(payload: string): T => {
  try {
    return parsePayload<T>(payload)
  } catch {
    return {} as T
  }
}
