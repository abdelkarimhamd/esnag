import * as FileSystem from 'expo-file-system'
import { apiClient } from '../api/client'
import type { LocalAttachmentRecord } from '../types'

const CHUNK_BASE64_SIZE = 256 * 1024

const alignedChunkSize = (size: number) => size - (size % 4)

const deriveMimeFromName = (name: string): string => {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.avi')) return 'video/x-msvideo'
  return 'application/octet-stream'
}

export const uploadAttachmentInChunks = async (
  token: string,
  organizationId: number,
  attachment: LocalAttachmentRecord,
) => {
  const fileInfo = await FileSystem.getInfoAsync(attachment.local_uri)
  if (!fileInfo.exists) {
    throw new Error('Attachment file does not exist on this device.')
  }

  const base64Content = await FileSystem.readAsStringAsync(attachment.local_uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const chunkSize = Math.max(4, alignedChunkSize(CHUNK_BASE64_SIZE))
  const totalChunks = Math.max(1, Math.ceil(base64Content.length / chunkSize))

  const initResponse = await apiClient.initChunkUpload(token, organizationId, {
    snag_id: attachment.snag_server_id,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type || deriveMimeFromName(attachment.file_name),
    total_chunks: totalChunks,
    file_size: attachment.file_size || ('size' in fileInfo ? Number(fileInfo.size ?? 0) : 0),
    client_uuid: attachment.client_uuid,
  })

  const sessionId = initResponse.data.upload_session_id
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize
    const end = Math.min(base64Content.length, start + chunkSize)
    const partBase64 = base64Content.slice(start, end)

    const tempUri = `${FileSystem.cacheDirectory ?? ''}esnag_chunk_${attachment.client_uuid}_${chunkIndex}.part`
    await FileSystem.writeAsStringAsync(tempUri, partBase64, {
      encoding: FileSystem.EncodingType.Base64,
    })

    await apiClient.uploadChunk(token, organizationId, sessionId, chunkIndex, {
      uri: tempUri,
      name: `chunk_${String(chunkIndex).padStart(5, '0')}.part`,
      type: 'application/octet-stream',
    })

    await FileSystem.deleteAsync(tempUri, { idempotent: true })
  }

  const completed = await apiClient.completeChunkUpload(token, organizationId, sessionId, attachment.client_uuid)

  return {
    serverAttachmentId: completed.data.id,
    remotePath: completed.data.file_path,
  }
}
