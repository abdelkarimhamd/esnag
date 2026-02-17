import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMemo, useState } from 'react'
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { optimizePickedAsset, persistAnnotationPayload, type AnnotationPoint } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { enqueueAttachmentUpload } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'

type Props = NativeStackScreenProps<SnagsStackParamList, 'AnnotateAttachment'>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const AttachmentAnnotationScreen = ({ route, navigation }: Props) => {
  const { refreshQueueSize } = useSync()
  const [strokes, setStrokes] = useState<AnnotationPoint[][]>([])
  const [currentStroke, setCurrentStroke] = useState<AnnotationPoint[]>([])
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 })
  const [saving, setSaving] = useState(false)

  const imageAspectRatio =
    route.params.width && route.params.height && route.params.width > 0 && route.params.height > 0
      ? route.params.width / route.params.height
      : 4 / 3

  const convertTouchToPoint = (x: number, y: number): AnnotationPoint => {
    const normalizedX = clamp(x / Math.max(1, canvasSize.width), 0, 1)
    const normalizedY = clamp(y / Math.max(1, canvasSize.height), 0, 1)
    return {
      x: normalizedX,
      y: normalizedY,
    }
  }

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const width = Math.max(1, event.nativeEvent.layout.width)
    const height = Math.max(1, event.nativeEvent.layout.height)
    setCanvasSize({ width, height })
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const point = convertTouchToPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)
          setCurrentStroke([point])
        },
        onPanResponderMove: (event) => {
          const point = convertTouchToPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)
          setCurrentStroke((current) => [...current, point])
        },
        onPanResponderRelease: () => {
          setCurrentStroke((current) => {
            if (current.length < 2) {
              return []
            }

            setStrokes((existing) => [...existing, current])
            return []
          })
        },
        onPanResponderTerminate: () => {
          setCurrentStroke([])
        },
      }),
    [canvasSize.width, canvasSize.height],
  )

  const allStrokes = useMemo(
    () => [...strokes, ...(currentStroke.length > 1 ? [currentStroke] : [])],
    [strokes, currentStroke],
  )

  const renderStrokeSegments = (stroke: AnnotationPoint[], keyPrefix: string) =>
    stroke.slice(1).map((point, index) => {
      const previous = stroke[index]
      const x1 = previous.x * canvasSize.width
      const y1 = previous.y * canvasSize.height
      const x2 = point.x * canvasSize.width
      const y2 = point.y * canvasSize.height
      const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1))
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI

      return (
        <View
          key={`${keyPrefix}-${index}`}
          style={[
            styles.segment,
            {
              left: x1,
              top: y1,
              width: length,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
        />
      )
    })

  const saveAnnotatedAttachment = async () => {
    setSaving(true)
    try {
      const optimized = await optimizePickedAsset({
        uri: route.params.assetUri,
        fileName: route.params.fileName,
        mimeType: route.params.mimeType,
        fileSize: route.params.fileSize,
        width: route.params.width ?? 0,
        height: route.params.height ?? 0,
        type: route.params.mimeType.startsWith('video/') ? 'video' : 'image',
        duration: null,
        exif: null,
        assetId: null,
        base64: null,
      })

      enqueueAttachmentUpload({
        snag_server_id: route.params.snagServerId,
        local_uri: optimized.uri,
        file_name: optimized.fileName,
        mime_type: optimized.mimeType,
        file_size: optimized.fileSize,
      })

      if (strokes.length > 0) {
        const annotation = await persistAnnotationPayload({
          imageUri: optimized.uri,
          imageFileName: optimized.fileName,
          width: canvasSize.width,
          height: canvasSize.height,
          strokes,
        })

        enqueueAttachmentUpload({
          snag_server_id: route.params.snagServerId,
          local_uri: annotation.uri,
          file_name: annotation.fileName,
          mime_type: annotation.mimeType,
          file_size: annotation.fileSize,
        })
      }

      refreshQueueSize()
      Alert.alert('Queued', strokes.length > 0 ? 'Attachment and annotation were queued for sync.' : 'Attachment was queued.')
      navigation.goBack()
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to queue attachment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Offline Annotation</Text>
      <Text style={styles.caption}>Draw notes on top of the image. A markup JSON file is queued with the attachment.</Text>

      <View style={styles.canvasWrapper} onLayout={onCanvasLayout}>
        <Image source={{ uri: route.params.assetUri }} style={[styles.image, { aspectRatio: imageAspectRatio }]} resizeMode="contain" />
        <View style={styles.overlay} {...panResponder.panHandlers}>
          {allStrokes.map((stroke, index) => (
            <View key={`stroke-${index}`} style={StyleSheet.absoluteFill}>
              {renderStrokeSegments(stroke, `stroke-${index}`)}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setStrokes((current) => current.slice(0, Math.max(0, current.length - 1)))}
        >
          <Text style={styles.secondaryButtonText}>Undo</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setStrokes([])}>
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.primaryButton, saving && styles.buttonDisabled]} disabled={saving} onPress={() => void saveAnnotatedAttachment()}>
        <Text style={styles.primaryButtonText}>{saving ? 'Queueing...' : 'Queue Attachment + Annotation'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  caption: {
    color: '#475569',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    backgroundColor: '#0F172A',
  },
  image: {
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  segment: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#F97316',
    borderRadius: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    borderColor: '#0EA5E9',
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#0369A1',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
})
