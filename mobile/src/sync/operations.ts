import { v4 as uuidv4 } from 'uuid'
import {
  addLocalComment,
  createLocalSnag,
  queueLocalAttachment,
  queueOperation,
  updateLocalSnag,
  updateLocalSnagStatus,
} from '../db/store'
import { nowIso } from '../db/database'
import type { SnagPriority, SnagStatus } from '../types'

export const enqueueOfflineSnagCreate = (payload: {
  project_id: number
  drawing_id?: number | null
  building_id?: number | null
  area_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  location_text?: string | null
  category_id?: number | null
  source_organization_id?: number | null
  snag_type?: 'construction' | 'operational'
  severity?: 'major' | 'high' | 'medium' | 'low'
  title: string
  description?: string | null
  priority?: SnagPriority
  pin_x?: number | null
  pin_y?: number | null
  assigned_to?: number | null
  due_date?: string | null
  trade?: string | null
  is_dlp?: boolean
  cluster?: string | null
  toc_reference?: string | null
}) => {
  const clientUuid = uuidv4()

  const localId = createLocalSnag({
    client_uuid: clientUuid,
    project_id: payload.project_id,
    drawing_id: payload.drawing_id ?? null,
    building_id: payload.building_id ?? null,
    floor_id: payload.floor_id ?? null,
    location_id: payload.location_id ?? null,
    snag_type: payload.snag_type ?? 'construction',
    source_organization_id: payload.source_organization_id ?? null,
    title: payload.title,
    description: payload.description ?? null,
    priority: payload.priority ?? 'medium',
    pin_x: payload.pin_x ?? null,
    pin_y: payload.pin_y ?? null,
    assigned_to: payload.assigned_to ?? null,
    due_date: payload.due_date ?? null,
    trade: payload.trade ?? null,
    is_dlp: payload.is_dlp ?? false,
    cluster: payload.cluster ?? null,
    toc_reference: payload.toc_reference ?? null,
  })

  queueOperation('snag.create', {
    client_uuid: clientUuid,
    project_id: payload.project_id,
    // Operational snags carry no drawing/pin — send true nulls to the server.
    drawing_id: payload.drawing_id ?? null,
    building_id: payload.building_id ?? null,
    area_id: payload.area_id ?? null,
    floor_id: payload.floor_id ?? null,
    location_id: payload.location_id ?? null,
    location_text: payload.location_text ?? null,
    category_id: payload.category_id ?? null,
    source_organization_id: payload.source_organization_id ?? null,
    snag_type: payload.snag_type ?? 'construction',
    severity: payload.severity ?? null,
    title: payload.title,
    description: payload.description ?? null,
    priority: payload.priority ?? 'medium',
    pin_x: payload.pin_x ?? null,
    pin_y: payload.pin_y ?? null,
    assigned_to: payload.assigned_to ?? null,
    due_date: payload.due_date ?? null,
    trade: payload.trade ?? null,
    is_dlp: payload.is_dlp ?? false,
    cluster: payload.cluster ?? null,
    toc_reference: payload.toc_reference ?? null,
  })

  return { clientUuid, localId }
}

export const enqueueOfflineSnagUpdate = (
  serverSnagId: number,
  patch: Partial<{
    title: string
    description: string | null
    priority: SnagPriority
    assigned_to: number | null
    due_date: string | null
    equipment_id: number | null
    trade: string | null
    is_dlp: boolean
    cluster: string | null
    toc_reference: string | null
  }>,
) => {
  const { is_dlp: isDlp, ...rest } = patch
  updateLocalSnag(serverSnagId, {
    ...rest,
    ...(typeof isDlp === 'boolean' ? { is_dlp: isDlp ? 1 : 0 } : {}),
  })

  queueOperation(
    'snag.update',
    {
      snag_id: serverSnagId,
      ...patch,
    },
    nowIso(),
  )
}

export const enqueueOfflineSnagTransition = (serverSnagId: number, toStatus: SnagStatus, note?: string) => {
  updateLocalSnagStatus(serverSnagId, toStatus)
  queueOperation(
    'snag.transition',
    {
      snag_id: serverSnagId,
      to_status: toStatus,
      note: note && note.trim() ? note.trim() : 'Queued from mobile offline transition',
    },
    nowIso(),
  )
}

export const enqueueOfflineCommentCreate = (payload: {
  snag_server_id: number
  body: string
  is_internal?: boolean
}) => {
  const clientUuid = uuidv4()
  addLocalComment({
    snag_server_id: payload.snag_server_id,
    client_uuid: clientUuid,
    body: payload.body,
    is_internal: payload.is_internal ?? false,
  })

  queueOperation(
    'snag.comment.create',
    {
      snag_id: payload.snag_server_id,
      client_uuid: clientUuid,
      body: payload.body,
      is_internal: payload.is_internal ?? false,
    },
    nowIso(),
  )
}

/**
 * Queue an attachment upload. Pass snag_server_id when the snag is already synced.
 * For unsynced snags pass snag_client_uuid instead — the sync engine resolves the
 * server id once the snag.create operation applies and only then uploads the file.
 */
export const enqueueAttachmentUpload = (payload: {
  snag_server_id?: number | null
  snag_client_uuid?: string | null
  local_uri: string
  file_name: string
  mime_type: string
  file_size: number
}) => {
  queueLocalAttachment({
    ...payload,
    client_uuid: uuidv4(),
  })
}
