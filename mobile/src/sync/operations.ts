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
  drawing_id: number
  building_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  title: string
  description?: string | null
  priority?: SnagPriority
  pin_x: number
  pin_y: number
  assigned_to?: number | null
  due_date?: string | null
}) => {
  const clientUuid = uuidv4()

  createLocalSnag({
    client_uuid: clientUuid,
    project_id: payload.project_id,
    drawing_id: payload.drawing_id,
    building_id: payload.building_id ?? null,
    floor_id: payload.floor_id ?? null,
    location_id: payload.location_id ?? null,
    title: payload.title,
    description: payload.description ?? null,
    priority: payload.priority ?? 'medium',
    pin_x: payload.pin_x,
    pin_y: payload.pin_y,
    assigned_to: payload.assigned_to ?? null,
    due_date: payload.due_date ?? null,
  })

  queueOperation('snag.create', {
    client_uuid: clientUuid,
    project_id: payload.project_id,
    drawing_id: payload.drawing_id,
    building_id: payload.building_id ?? null,
    floor_id: payload.floor_id ?? null,
    location_id: payload.location_id ?? null,
    title: payload.title,
    description: payload.description ?? null,
    priority: payload.priority ?? 'medium',
    pin_x: payload.pin_x,
    pin_y: payload.pin_y,
    assigned_to: payload.assigned_to ?? null,
    due_date: payload.due_date ?? null,
  })
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
  }>,
) => {
  updateLocalSnag(serverSnagId, patch)

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
      note: note ?? null,
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

export const enqueueAttachmentUpload = (payload: {
  snag_server_id: number
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
