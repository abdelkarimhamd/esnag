import * as FileSystem from 'expo-file-system'
import type { ImagePickerAsset } from 'expo-image-picker'
import { v4 as uuidv4 } from 'uuid'

export interface PreparedAttachment {
  uri: string
  fileName: string
  mimeType: string
  fileSize: number
}

export interface AnnotationPoint {
  x: number
  y: number
}

interface ImageManipulatorModule {
  SaveFormat?: {
    JPEG?: string
    PNG?: string
    WEBP?: string
  }
  manipulateAsync?: (
    uri: string,
    actions: Array<Record<string, unknown>>,
    options: {
      compress?: number
      format?: string
    },
  ) => Promise<{
    uri: string
    width: number
    height: number
  }>
}

const extensionFromMime = (mimeType: string): string => {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'application/json') return 'json'
  if (mimeType.startsWith('image/')) return 'jpg'
  if (mimeType.startsWith('video/')) return 'mp4'
  return 'bin'
}

const deriveImageCompressionRatio = (bytes: number): number => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0.7
  }
  if (bytes > 8_000_000) return 0.38
  if (bytes > 5_000_000) return 0.5
  if (bytes > 2_000_000) return 0.62
  return 0.75
}

const loadImageManipulator = (): ImageManipulatorModule | null => {
  try {
    // Optional dependency at runtime; falls back gracefully if missing.
    return require('expo-image-manipulator') as ImageManipulatorModule
  } catch {
    return null
  }
}

export const optimizePickedAsset = async (asset: ImagePickerAsset): Promise<PreparedAttachment> => {
  const sourceMime = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
  const sourceFileName = asset.fileName ?? `attachment-${Date.now()}.${extensionFromMime(sourceMime)}`
  const sourceSize = Number(asset.fileSize ?? 0)

  if (!sourceMime.startsWith('image/')) {
    return {
      uri: asset.uri,
      fileName: sourceFileName,
      mimeType: sourceMime,
      fileSize: sourceSize,
    }
  }

  const manipulator = loadImageManipulator()
  if (!manipulator?.manipulateAsync) {
    return {
      uri: asset.uri,
      fileName: sourceFileName,
      mimeType: sourceMime,
      fileSize: sourceSize,
    }
  }

  const maxDimension = Math.max(asset.width ?? 0, asset.height ?? 0)
  const shouldResize = maxDimension > 1920
  const resizeTarget = shouldResize
    ? {
        resize:
          (asset.width ?? 0) >= (asset.height ?? 0)
            ? { width: 1920 }
            : { height: 1920 },
      }
    : null

  const quality = deriveImageCompressionRatio(sourceSize)
  const saveFormat =
    sourceMime === 'image/png'
      ? manipulator.SaveFormat?.PNG ?? 'png'
      : sourceMime === 'image/webp'
        ? manipulator.SaveFormat?.WEBP ?? 'webp'
        : manipulator.SaveFormat?.JPEG ?? 'jpeg'

  const result = await manipulator.manipulateAsync(
    asset.uri,
    resizeTarget ? [resizeTarget] : [],
    {
      compress: quality,
      format: saveFormat,
    },
  )

  const fileInfo = await FileSystem.getInfoAsync(result.uri)
  const outputMime = sourceMime === 'image/png' ? 'image/png' : sourceMime === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const outputFileName = sourceFileName.match(/\.(png|jpg|jpeg|webp)$/i)
    ? sourceFileName
    : `${sourceFileName}.${extensionFromMime(outputMime)}`

  return {
    uri: result.uri,
    fileName: outputFileName,
    mimeType: outputMime,
    fileSize: Number('size' in fileInfo ? fileInfo.size ?? sourceSize : sourceSize),
  }
}

export const persistAnnotationPayload = async (params: {
  imageUri: string
  imageFileName: string
  width: number
  height: number
  strokes: AnnotationPoint[][]
}) => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory
  if (!baseDir) {
    throw new Error('Unable to access local file storage for annotation payload.')
  }

  const payload = {
    version: 1,
    kind: 'offline_annotation',
    image_uri: params.imageUri,
    image_file_name: params.imageFileName,
    canvas_width: params.width,
    canvas_height: params.height,
    created_at: new Date().toISOString(),
    strokes: params.strokes,
  }

  const annotationName = `${params.imageFileName.replace(/\.[^.]+$/, '')}.annotation-${uuidv4()}.json`
  const annotationUri = `${baseDir}${annotationName}`
  const json = JSON.stringify(payload)
  await FileSystem.writeAsStringAsync(annotationUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const info = await FileSystem.getInfoAsync(annotationUri)

  return {
    payload,
    uri: annotationUri,
    fileName: annotationName,
    mimeType: 'application/json',
    fileSize: Number('size' in info ? info.size ?? json.length : json.length),
  }
}
