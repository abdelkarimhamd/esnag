import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMemo, useState } from 'react'
import { Alert, Image, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { optimizePickedAsset, persistAnnotationPayload, type AnnotationPoint } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { enqueueAttachmentUpload } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button, Card, ScreenContainer, SectionHeader } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'AnnotateAttachment'>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const AttachmentAnnotationScreen = ({ route, navigation }: Props) => {
  const theme = useAppTheme()
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
    return { x: normalizedX, y: normalizedY }
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

  const allStrokes = useMemo(() => [...strokes, ...(currentStroke.length > 1 ? [currentStroke] : [])], [strokes, currentStroke])

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
              backgroundColor: theme.colors.warning,
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
    <ScreenContainer scroll>
      <SectionHeader
        title="Offline Annotation"
        subtitle="Draw notes on the image and queue a markup JSON attachment."
      />

      <Card elevated>
        <View style={[styles.canvasWrapper, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} onLayout={onCanvasLayout}>
          <Image source={{ uri: route.params.assetUri }} style={[styles.image, { aspectRatio: imageAspectRatio }]} resizeMode="contain" />
          <View style={styles.overlay} {...panResponder.panHandlers}>
            {allStrokes.map((stroke, index) => (
              <View key={`stroke-${index}`} style={StyleSheet.absoluteFill}>
                {renderStrokeSegments(stroke, `stroke-${index}`)}
              </View>
            ))}
          </View>
        </View>

        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
          Draw with one finger. Use Undo/Clear before queueing.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Undo" variant="secondary" onPress={() => setStrokes((current) => current.slice(0, Math.max(0, current.length - 1)))} />
          <Button label="Clear" variant="ghost" onPress={() => setStrokes([])} />
          <Button label={saving ? 'Queueing...' : 'Queue Attachment + Annotation'} loading={saving} onPress={() => void saveAnnotatedAttachment()} />
        </View>
      </Card>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
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
    borderRadius: 3,
  },
})
