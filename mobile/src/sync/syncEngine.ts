import { apiClient } from '../api/client'
import {
  queueSyncConflict,
  getMetaValue,
  bindLocalSnagToServer,
  listPendingAttachments,
  listPendingOperations,
  markAttachmentFailed,
  markAttachmentUploaded,
  markAttachmentUploading,
  markOperationApplied,
  markOperationFailed,
  markOperationRejected,
  parseQueuePayload,
  reclaimStaleUploadingAttachments,
  setMetaValue,
  upsertServerBuildings,
  upsertServerAttachments,
  upsertServerComments,
  upsertServerDrawingLocationZones,
  upsertServerEquipment,
  upsertServerEquipmentLogs,
  upsertServerFloors,
  upsertServerLocations,
  upsertServerSnags,
} from '../db/store'
import { nowIso } from '../db/database'
import { uploadAttachmentInChunks } from './chunkUpload'
import type { ServerSnag } from '../types'

export interface SyncSummary {
  pulledSnags: number
  pulledComments: number
  pulledAttachments: number
  pulledEquipment: number
  pulledEquipmentLogs: number
  pulledBuildings: number
  pulledFloors: number
  pulledLocations: number
  pulledZones: number
  appliedOperations: number
  rejectedOperations: number
  failedOperations: number
  uploadedAttachments: number
  queuedConflicts: number
}

let syncInProgress = false

const nextRetryAt = (retries: number, overrideSeconds?: number | null): string => {
  const seconds =
    typeof overrideSeconds === 'number' && overrideSeconds > 0
      ? Math.min(60 * 60, Math.max(5, Math.round(overrideSeconds)))
      : Math.min(5 * 60, Math.max(5, 5 * 2 ** retries))
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export const syncNow = async (token: string, organizationId: number): Promise<SyncSummary> => {
  if (syncInProgress) {
    return {
      pulledSnags: 0,
      pulledComments: 0,
      pulledAttachments: 0,
      pulledEquipment: 0,
      pulledEquipmentLogs: 0,
      pulledBuildings: 0,
      pulledFloors: 0,
      pulledLocations: 0,
      pulledZones: 0,
      appliedOperations: 0,
      rejectedOperations: 0,
      failedOperations: 0,
      uploadedAttachments: 0,
      queuedConflicts: 0,
    }
  }

  syncInProgress = true

  try {
    const summary: SyncSummary = {
      pulledSnags: 0,
      pulledComments: 0,
      pulledAttachments: 0,
      pulledEquipment: 0,
      pulledEquipmentLogs: 0,
      pulledBuildings: 0,
      pulledFloors: 0,
      pulledLocations: 0,
      pulledZones: 0,
      appliedOperations: 0,
      rejectedOperations: 0,
      failedOperations: 0,
      uploadedAttachments: 0,
      queuedConflicts: 0,
    }

    const since = getMetaValue('last_sync_at')
    const pullResponse = await apiClient.pullSync(token, organizationId, since)

    const serverSnags = pullResponse.data.snags as Array<Record<string, unknown>>
    const serverComments = pullResponse.data.comments as Array<Record<string, unknown>>
    const serverAttachments = pullResponse.data.attachments as Array<Record<string, unknown>>
    const equipmentRows = pullResponse.data.equipment as Array<Record<string, unknown>>
    const equipmentLogs = pullResponse.data.equipment_logs as Array<Record<string, unknown>>
    const buildingRows = pullResponse.data.buildings as Array<Record<string, unknown>>
    const floorRows = pullResponse.data.floors as Array<Record<string, unknown>>
    const locationRows = pullResponse.data.locations as Array<Record<string, unknown>>
    const zoneRows = pullResponse.data.drawing_location_zones as Array<Record<string, unknown>>

    upsertServerSnags(serverSnags as unknown as ServerSnag[])
    upsertServerComments(serverComments)
    upsertServerAttachments(serverAttachments)
    upsertServerEquipment(equipmentRows)
    upsertServerEquipmentLogs(equipmentLogs)
    upsertServerBuildings(buildingRows)
    upsertServerFloors(floorRows)
    upsertServerLocations(locationRows)
    upsertServerDrawingLocationZones(zoneRows)

    summary.pulledSnags = serverSnags.length
    summary.pulledComments = serverComments.length
    summary.pulledAttachments = serverAttachments.length
    summary.pulledEquipment = equipmentRows.length
    summary.pulledEquipmentLogs = equipmentLogs.length
    summary.pulledBuildings = buildingRows.length
    summary.pulledFloors = floorRows.length
    summary.pulledLocations = locationRows.length
    summary.pulledZones = zoneRows.length

    const pendingOperations = listPendingOperations(50)
    if (pendingOperations.length > 0) {
      const payload = pendingOperations.map((operation) => ({
        op_id: operation.op_id,
        type: operation.type,
        payload: parseQueuePayload(operation),
        client_updated_at: operation.client_updated_at,
      }))

      const applyResponse = await apiClient.applySync(token, organizationId, payload)

      for (const result of applyResponse.data) {
        const operation = pendingOperations.find((candidate) => candidate.op_id === result.op_id)
        if (!operation) {
          continue
        }

        if (result.status === 'applied') {
          markOperationApplied(operation.op_id)
          summary.appliedOperations += 1

          const payloadRecord = parseQueuePayload(operation)
          if (operation.type === 'snag.create') {
            const clientUuid = String((payloadRecord.client_uuid as string | undefined) ?? '')
            const snagId = Number((result.result?.snag_id as number | undefined) ?? 0)
            const reference = (result.result?.reference as string | undefined) ?? null
            const status = (result.result?.status as string | undefined) ?? 'new'

            if (clientUuid && snagId > 0) {
              bindLocalSnagToServer(clientUuid, snagId, reference, status)
            }
          }

          const conflict = Boolean(result.result?.conflict)
          if (conflict && result.result?.server && operation.type === 'snag.update') {
            const server = result.result.server as Record<string, unknown>
            const localPayload = parseQueuePayload(operation)
            const snagId = Number(server.snag_id ?? localPayload.snag_id ?? 0)
            queueSyncConflict({
              op_id: operation.op_id,
              entity_type: 'snag',
              entity_id: snagId > 0 ? snagId : null,
              operation_type: operation.type,
              local_payload: localPayload,
              server_payload: server,
            })
            summary.queuedConflicts += 1
          }
          continue
        }

        if (result.status === 'rejected') {
          const errorMessage = Object.values(result.errors ?? {})
            .flatMap((messages) => messages)
            .join('; ')
          const resolvedMessage =
            errorMessage || result.message || (result.conflict_type === 'status_transition_guarded'
              ? 'Status transition must be validated by server workflow rules.'
              : 'Operation rejected by server.')

          if (result.retryable) {
            const retries = operation.retries + 1
            markOperationFailed(
              operation.op_id,
              retries,
              nextRetryAt(retries, result.retry_after_seconds),
              resolvedMessage,
            )
            summary.failedOperations += 1
          } else {
            markOperationRejected(operation.op_id, resolvedMessage)
            summary.rejectedOperations += 1
          }
          continue
        }

        const retries = operation.retries + 1
        markOperationFailed(
          operation.op_id,
          retries,
          nextRetryAt(retries, result.retry_after_seconds),
          result.message ?? 'Operation failed.',
        )
        summary.failedOperations += 1
      }
    }

    // Recover attachments stranded in 'uploading' by a crashed prior sync run before
    // listing pending uploads, otherwise they would be excluded from sync forever.
    reclaimStaleUploadingAttachments()

    const pendingAttachments = listPendingAttachments(20)
    for (const attachment of pendingAttachments) {
      try {
        markAttachmentUploading(attachment.local_id)
        const uploaded = await uploadAttachmentInChunks(token, organizationId, attachment)
        markAttachmentUploaded(attachment.local_id, uploaded.serverAttachmentId, uploaded.remotePath)
        summary.uploadedAttachments += 1
      } catch (error) {
        const retries = attachment.retries + 1
        markAttachmentFailed(
          attachment.local_id,
          retries,
          nextRetryAt(retries),
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    setMetaValue('last_sync_at', pullResponse.meta.server_time ?? nowIso())
    setMetaValue('last_sync_finished_at', nowIso())

    return summary
  } finally {
    syncInProgress = false
  }
}

export const isSyncRunning = () => syncInProgress
