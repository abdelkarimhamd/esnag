import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiClient } from '../api/client'
import {
  findOfflineLocationByBarcode,
  listLocalSnags,
  listOfflineFloorLocations,
  listOfflineFloors,
  listOfflineFloorZones,
} from '../db/store'
import type {
  LocalSnagRecord,
  OfflineFloorLocationRow,
  OfflineFloorMapRow,
  OfflineFloorZoneRow,
} from '../types'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { statusMeta } from '../theme/tokens'
import { Button, EmptyState, ListItem, StatusPill, TextField } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'FloorMap'>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// Teal draft-pin fill mirrors the web DrawingViewerPage pinDraft marker.
const DRAFT_PIN_FILL = 'rgba(47,143,190,0.25)'

// Pinch-zoom in the frame is represented here by discrete +/- steps on the
// canvas content transform. Purely presentational — pin math still resolves
// against the un-transformed contain rect, so placement stays correct.
const ZOOM_MIN = 1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.5

interface CanvasRect {
  left: number
  top: number
  width: number
  height: number
}

export const FloorMapScreen = ({ navigation }: Props) => {
  const theme = useAppTheme()
  const insets = useSafeAreaInsets()
  const { token, activeOrganization } = useAuth()
  const organizationId = activeOrganization?.id ?? null
  const [projectFilter, setProjectFilter] = useState('')
  const [barcode, setBarcode] = useState('')
  const [floors, setFloors] = useState<OfflineFloorMapRow[]>([])
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null)
  const [zones, setZones] = useState<OfflineFloorZoneRow[]>([])
  const [locations, setLocations] = useState<OfflineFloorLocationRow[]>([])
  const [floorSnags, setFloorSnags] = useState<LocalSnagRecord[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null)
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [imageNatural, setImageNatural] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(ZOOM_MIN)
  const [panelOpen, setPanelOpen] = useState(false)

  const loadFloorContext = useCallback((floor: Pick<OfflineFloorMapRow, 'id' | 'project_id'> | null) => {
    if (!floor) {
      setZones([])
      setLocations([])
      setFloorSnags([])
      return
    }

    setZones(listOfflineFloorZones(floor.id))
    setLocations(listOfflineFloorLocations(floor.id))
    setFloorSnags(listLocalSnags({ project_id: floor.project_id, floor_id: floor.id }))
  }, [])

  const loadFloors = useCallback(
    (nextProjectId?: number | null) => {
      const resolvedProjectId = nextProjectId ?? (projectFilter.trim() ? Number(projectFilter.trim()) : null)
      const projectId = Number.isFinite(resolvedProjectId) && (resolvedProjectId ?? 0) > 0 ? Number(resolvedProjectId) : null
      const rows = listOfflineFloors(projectId)
      setFloors(rows)

      if (rows.length === 0) {
        setSelectedFloorId(null)
        loadFloorContext(null)
        setSelectedLocationId(null)
        setSelectedZoneId(null)
        setDraftPin(null)
        return
      }

      const preferredFloor = rows.find((row) => row.id === selectedFloorId) ?? rows[0]
      setSelectedFloorId(preferredFloor.id)
      loadFloorContext(preferredFloor)
    },
    [loadFloorContext, projectFilter, selectedFloorId],
  )

  useFocusEffect(
    useCallback(() => {
      loadFloors()
    }, [loadFloors]),
  )

  const selectedFloor = useMemo(() => floors.find((floor) => floor.id === selectedFloorId) ?? null, [floors, selectedFloorId])
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  )

  // Resolve the drawing this floor maps onto: prefer the drawing referenced by
  // the cached zone rectangles, fall back to the drawing local snags point at.
  const resolvedDrawingId = useMemo(() => {
    const counts = new Map<number, number>()
    for (const zone of zones) {
      counts.set(zone.drawing_id, (counts.get(zone.drawing_id) ?? 0) + 1)
    }
    if (counts.size === 0) {
      for (const snag of floorSnags) {
        if (snag.drawing_id > 0) {
          counts.set(snag.drawing_id, (counts.get(snag.drawing_id) ?? 0) + 1)
        }
      }
    }

    let best: number | null = null
    let bestCount = 0
    for (const [id, count] of counts) {
      if (count > bestCount) {
        best = id
        bestCount = count
      }
    }
    return best
  }, [floorSnags, zones])

  // Current revision comes from the synced zone rows; without it (or offline
  // credentials) the canvas keeps the abstract grid fallback.
  const drawingImage = useMemo(() => {
    if (!token || !organizationId || !resolvedDrawingId) {
      return null
    }

    const revisionId =
      zones.find((zone) => zone.drawing_id === resolvedDrawingId && zone.drawing_revision_id !== null)?.drawing_revision_id ?? null
    if (!revisionId) {
      return null
    }

    return {
      revisionId,
      uri: apiClient.drawingRevisionFileUrl(revisionId),
      headers: apiClient.authHeaders(token, organizationId),
    }
  }, [organizationId, resolvedDrawingId, token, zones])

  const activeRevisionId = drawingImage?.revisionId ?? null

  useEffect(() => {
    setImageNatural(null)
    setImageStatus(activeRevisionId ? 'loading' : 'idle')
  }, [activeRevisionId])

  const pinSnags = useMemo(() => {
    // Operational snags have no drawing/pin (stored as 0 sentinels) — never plot
    // them on the floor map, or they would render at the origin.
    const withDrawing = floorSnags.filter((snag) => snag.drawing_id > 0)
    const source = resolvedDrawingId ? withDrawing.filter((snag) => snag.drawing_id === resolvedDrawingId) : withDrawing
    return source.filter((snag) => Number.isFinite(snag.pin_x) && Number.isFinite(snag.pin_y)).slice(0, 200)
  }, [floorSnags, resolvedDrawingId])

  const imageActive = imageStatus === 'ready' && imageNatural !== null && drawingImage !== null

  // Rendered rect of the contain-fitted image inside the canvas. When there is
  // no active image the overlay spans the whole canvas (abstract grid mode).
  const canvasRect = useMemo<CanvasRect | null>(() => {
    if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return null
    }

    if (imageActive && imageNatural) {
      const scale = Math.min(canvasSize.width / imageNatural.width, canvasSize.height / imageNatural.height)
      const width = imageNatural.width * scale
      const height = imageNatural.height * scale
      return {
        left: (canvasSize.width - width) / 2,
        top: (canvasSize.height - height) / 2,
        width,
        height,
      }
    }

    return { left: 0, top: 0, width: canvasSize.width, height: canvasSize.height }
  }, [canvasSize, imageActive, imageNatural])

  const selectFloor = (floor: OfflineFloorMapRow) => {
    setSelectedFloorId(floor.id)
    loadFloorContext(floor)
    setSelectedLocationId(null)
    setSelectedZoneId(null)
    setDraftPin(null)
    setZoom(ZOOM_MIN)
  }

  const resolveBarcode = () => {
    if (!barcode.trim()) {
      return
    }

    const match = findOfflineLocationByBarcode(barcode.trim())
    if (!match) {
      Alert.alert('Not found', 'No offline location cache found for this barcode yet.')
      return
    }

    setProjectFilter(String(match.project_id))
    loadFloors(match.project_id)
    setSelectedFloorId(match.floor_id)
    loadFloorContext({ id: match.floor_id, project_id: match.project_id })
    setSelectedLocationId(match.location_id)
    setSelectedZoneId(null)
    setDraftPin(null)
    setPanelOpen(false)
    Alert.alert('Location opened', `${match.location_name} (${match.location_code})`)
  }

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setCanvasSize({ width, height })
  }

  const placeDraftPin = (x: number, y: number) => {
    setDraftPin({ x: Number(clamp01(x).toFixed(6)), y: Number(clamp01(y).toFixed(6)) })
  }

  const onCanvasPress = (event: GestureResponderEvent) => {
    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
      return
    }

    const { locationX, locationY } = event.nativeEvent
    placeDraftPin((locationX - canvasRect.left) / canvasRect.width, (locationY - canvasRect.top) / canvasRect.height)
  }

  const onZonePress = (zone: OfflineFloorZoneRow, event: GestureResponderEvent) => {
    setSelectedZoneId(zone.id)
    setSelectedLocationId(zone.location_id)

    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
      return
    }

    // locationX/Y are relative to the zone rectangle; offset by the zone's
    // position inside the rendered image rect to get normalized coordinates.
    const { locationX, locationY } = event.nativeEvent
    placeDraftPin(
      (clamp01(zone.x_min) * canvasRect.width + locationX) / canvasRect.width,
      (clamp01(zone.y_min) * canvasRect.height + locationY) / canvasRect.height,
    )
  }

  const openSnagPin = (snag: LocalSnagRecord) => {
    navigation.navigate('SnagDetail', { localId: snag.local_id, serverId: snag.server_id ?? undefined })
  }

  const openFilteredSnags = () => {
    if (!selectedFloor || !selectedLocation) {
      return
    }

    navigation.navigate('SnagsHome', {
      projectId: selectedFloor.project_id,
      floorId: selectedFloor.id,
      locationId: selectedLocation.id,
      locationName: selectedLocation.name,
    })
  }

  const openCreateSnag = () => {
    if (!selectedFloor || !selectedLocation) {
      return
    }

    const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null
    const pinX = draftPin ? draftPin.x : selectedZone ? clamp01((selectedZone.x_min + selectedZone.x_max) / 2) : 0.5
    const pinY = draftPin ? draftPin.y : selectedZone ? clamp01((selectedZone.y_min + selectedZone.y_max) / 2) : 0.5

    navigation.navigate('SnagCreate', {
      prefill: {
        projectId: selectedFloor.project_id,
        buildingId: selectedFloor.building_id,
        floorId: selectedFloor.id,
        locationId: selectedLocation.id,
        pinX,
        pinY,
      },
    })
  }

  const hasCanvas = zones.length > 0 || pinSnags.length > 0
  const canCreate = Boolean(selectedFloor && selectedLocation)

  // Header centre — mono sheet reference + level/revision subline (frame 2g line 11).
  const sheetRef = selectedFloor ? `${selectedFloor.building_code}-${selectedFloor.code}` : 'Floor map'
  const sheetSub = selectedFloor
    ? `${selectedFloor.name}${activeRevisionId ? ` · Rev ${activeRevisionId}` : ''}`
    : 'Select a cached floor'

  // Floating location chip (frame 2g line 15).
  const chipLabel = selectedLocation
    ? `${selectedFloor?.code ?? ''}${selectedFloor ? ' · ' : ''}${selectedLocation.name}`.trim()
    : selectedFloor
      ? selectedFloor.name
      : 'No floor'

  // Footer status line (frame 2g line 42).
  const footerTitle = draftPin
    ? `Pin dropped${selectedLocation ? ` in ${selectedLocation.name}` : ''}`
    : selectedLocation
      ? `Location: ${selectedLocation.name}`
      : 'Tap the map to drop a pin'
  const footerSub = `${pinSnags.length} snag${pinSnags.length === 1 ? '' : 's'} on this sheet`

  const zoomIn = () => setZoom((value) => Math.min(ZOOM_MAX, Number((value + ZOOM_STEP).toFixed(2))))
  const zoomOut = () => setZoom((value) => Math.max(ZOOM_MIN, Number((value - ZOOM_STEP).toFixed(2))))

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.background }]}>
      {/* Header chrome — back / centred sheet ref / controls toggle (frame 2g lines 9-13). */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerBtn,
            { borderColor: theme.colors.border, opacity: pressed && !theme.reduceMotion ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.headerCentre}>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.monoSemiBold }]}
          >
            {sheetRef}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerSub, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}
          >
            {sheetSub}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open floor and location controls"
          hitSlop={8}
          onPress={() => setPanelOpen(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            { borderColor: theme.colors.border, opacity: pressed && !theme.reduceMotion ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="layers-outline" size={17} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {/* Drawing canvas (frame 2g line 14) — full-bleed, floating overlays. */}
      <View style={[styles.canvas, { backgroundColor: theme.colors.surfaceElevated }]} onLayout={onCanvasLayout}>
        {hasCanvas ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onCanvasPress}>
            <View
              pointerEvents="box-none"
              style={[StyleSheet.absoluteFill, !theme.reduceMotion && { transform: [{ scale: zoom }] }]}
            >
              {drawingImage && imageStatus !== 'error' ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Image
                    key={drawingImage.revisionId}
                    source={{ uri: drawingImage.uri, headers: drawingImage.headers }}
                    resizeMode="contain"
                    style={styles.drawingImage}
                    onLoad={(event) => {
                      const source = event.nativeEvent.source
                      if (source && source.width > 0 && source.height > 0) {
                        setImageNatural({ width: source.width, height: source.height })
                        setImageStatus('ready')
                      } else {
                        setImageStatus('error')
                      }
                    }}
                    onError={() => setImageStatus('error')}
                  />
                </View>
              ) : null}

              {canvasRect ? (
                <View
                  pointerEvents="box-none"
                  style={{
                    position: 'absolute',
                    left: canvasRect.left,
                    top: canvasRect.top,
                    width: canvasRect.width,
                    height: canvasRect.height,
                  }}
                >
                  {zones.map((zone) => (
                    <Pressable
                      key={zone.id}
                      style={[
                        styles.zone,
                        {
                          left: `${clamp01(zone.x_min) * 100}%`,
                          top: `${clamp01(zone.y_min) * 100}%`,
                          width: `${Math.max(2, clamp01(zone.x_max - zone.x_min) * 100)}%`,
                          height: `${Math.max(2, clamp01(zone.y_max - zone.y_min) * 100)}%`,
                          borderColor: selectedZoneId === zone.id ? theme.colors.success : theme.colors.secondary,
                          backgroundColor:
                            selectedZoneId === zone.id ? 'rgba(110,140,58,0.22)' : 'rgba(47,143,190,0.16)',
                        },
                      ]}
                      onPress={(event) => onZonePress(zone, event)}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.zoneLabel, { color: theme.colors.text, fontFamily: theme.fonts.monoSemiBold }]}
                      >
                        {zone.location_code}
                      </Text>
                    </Pressable>
                  ))}

                  {pinSnags.map((snag, index) => {
                    const meta = statusMeta(snag.status, theme.isDark)
                    return (
                      <Pressable
                        key={snag.local_id}
                        accessibilityLabel={`Open snag ${snag.reference ?? snag.title}`}
                        style={[styles.snagPin, { left: `${clamp01(snag.pin_x) * 100}%`, top: `${clamp01(snag.pin_y) * 100}%` }]}
                        onPress={() => openSnagPin(snag)}
                      >
                        <View
                          style={[
                            styles.snagPinHalo,
                            { backgroundColor: snag.status === 'rejected' ? 'rgba(178,59,59,0.16)' : 'rgba(15,23,42,0.10)' },
                          ]}
                        />
                        <View style={[styles.snagPinCore, { backgroundColor: meta.dot }]}>
                          <Text style={[styles.snagPinNumber, { fontFamily: theme.fonts.monoSemiBold }]}>{index + 1}</Text>
                        </View>
                      </Pressable>
                    )
                  })}

                  {draftPin ? (
                    <View
                      pointerEvents="none"
                      style={[styles.draftPin, { left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }]}
                    >
                      <View style={[styles.draftPinRing, { borderColor: theme.colors.secondary }]} />
                      <View style={[styles.draftPinCore, { borderColor: theme.colors.secondary }]} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <View style={styles.canvasEmpty} pointerEvents="box-none">
            <EmptyState
              title={selectedFloor ? 'No zone grid' : 'No floor cache'}
              message={
                selectedFloor
                  ? 'No cached zones for this floor yet. Open the controls to pick a location.'
                  : 'Run sync first to cache floors and zones, then open the controls.'
              }
            />
          </View>
        )}

        {/* Location chip — top-left (frame 2g line 15). */}
        <View
          pointerEvents="none"
          style={[styles.locationChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <Ionicons name="location-outline" size={13} color={theme.colors.secondary} />
          <Text numberOfLines={1} style={[styles.chipText, { color: theme.colors.textMuted, fontFamily: theme.fonts.sansSemiBold }]}>
            {chipLabel}
          </Text>
        </View>

        {/* Zoom controls — top-right stacked +/- (frame 2g line 16). */}
        {hasCanvas ? (
          <View style={[styles.zoomStack, { borderColor: theme.colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              onPress={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              style={({ pressed }) => [
                styles.zoomBtn,
                {
                  backgroundColor: theme.colors.surface,
                  borderBottomColor: theme.colors.border,
                  opacity: zoom >= ZOOM_MAX ? 0.4 : pressed && !theme.reduceMotion ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              onPress={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              style={({ pressed }) => [
                styles.zoomBtn,
                { backgroundColor: theme.colors.surface, opacity: zoom <= ZOOM_MIN ? 0.4 : pressed && !theme.reduceMotion ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="remove" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Status legend — bottom-left (frame 2g line 39). */}
        {hasCanvas ? (
          <View
            pointerEvents="none"
            style={[styles.legend, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.danger }]} />
              <Text style={[styles.legendText, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>Open</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.secondary }]} />
              <Text style={[styles.legendText, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>In prog</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
              <Text style={[styles.legendText, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>Closed</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Footer chrome — status line + primary CTA (frame 2g lines 41-44). */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.footerText}>
          <Text numberOfLines={1} style={[styles.footerTitle, { color: theme.colors.text, fontFamily: theme.fonts.sansSemiBold }]}>
            {footerTitle}
          </Text>
          <Text numberOfLines={1} style={[styles.footerSub, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>
            {footerSub}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add snag here"
          disabled={!canCreate}
          onPress={openCreateSnag}
          style={({ pressed }) => [
            styles.footerCta,
            {
              backgroundColor: theme.colors.primary,
              opacity: !canCreate ? 0.5 : pressed && !theme.reduceMotion ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.footerCtaText, { color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansBold }]}>
            Add snag here
          </Text>
        </Pressable>
      </View>

      {/* Controls sheet — project filter, barcode, floor + location pickers.
          Keeps the parity wiring reachable without disturbing the frame chrome. */}
      <Modal visible={panelOpen} transparent animationType="slide" onRequestClose={() => setPanelOpen(false)}>
        <Pressable style={[styles.sheetBackdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setPanelOpen(false)} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.sheetHandleWrap}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
          </View>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme.colors.text, fontFamily: theme.fonts.sansBold }]}>Floor & location</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close controls" hitSlop={8} onPress={() => setPanelOpen(false)}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              label="Project filter (optional ID)"
              placeholder="Project ID"
              keyboardType="numeric"
              value={projectFilter}
              onChangeText={setProjectFilter}
            />
            <View style={styles.sheetRow}>
              <TextField
                label="Barcode quick open"
                placeholder="Scan or enter barcode"
                value={barcode}
                onChangeText={setBarcode}
                autoCapitalize="characters"
                style={styles.flex}
              />
              <View style={styles.barcodeAction}>
                <Button label="Open" variant="secondary" onPress={resolveBarcode} />
              </View>
            </View>
            <Button label="Apply filter" onPress={() => loadFloors()} />

            <Text style={[styles.sheetLabel, { color: theme.colors.textMuted, fontFamily: theme.fonts.monoSemiBold }]}>
              FLOORS ({floors.length})
            </Text>
            {floors.length === 0 ? (
              <EmptyState title="No floor cache" message="Run sync first to cache floors and zones." />
            ) : (
              <View style={styles.list}>
                {floors.map((floor) => (
                  <ListItem
                    key={floor.id}
                    selected={selectedFloorId === floor.id}
                    onPress={() => selectFloor(floor)}
                    title={`${floor.building_code}-${floor.code}`}
                    subtitle={`${floor.open_snags} open / ${floor.total_snags} total`}
                  />
                ))}
              </View>
            )}

            {selectedFloor ? (
              <>
                <View style={styles.sheetLabelRow}>
                  <Text style={[styles.sheetLabel, { color: theme.colors.textMuted, fontFamily: theme.fonts.monoSemiBold }]}>
                    LOCATIONS ({locations.length})
                  </Text>
                  <StatusPill label={`${selectedFloor.open_snags} open`} tone="warning" />
                </View>
                <View style={styles.list}>
                  {locations.map((location) => (
                    <ListItem
                      key={location.id}
                      selected={selectedLocationId === location.id}
                      onPress={() => {
                        setSelectedLocationId(location.id)
                        setSelectedZoneId(null)
                      }}
                      title={`${location.code} - ${location.name}`}
                      subtitle={`${location.open_snags} open / ${location.total_snags} total${location.barcode ? ` • ${location.barcode}` : ''}`}
                    />
                  ))}
                  {locations.length === 0 ? (
                    <EmptyState title="No locations" message="No locations available on this floor." />
                  ) : null}
                </View>

                <Button label="View Location Snags" disabled={!canCreate} onPress={openFilteredSnags} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCentre: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  canvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  canvasEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  drawingImage: {
    width: '100%',
    height: '100%',
  },
  zone: {
    position: 'absolute',
    borderWidth: 1,
    padding: 2,
  },
  zoneLabel: {
    fontSize: 10,
  },
  snagPin: {
    position: 'absolute',
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snagPinHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  snagPinCore: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snagPinNumber: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
  },
  draftPin: {
    position: 'absolute',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftPinRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 2,
    opacity: 0.4,
  },
  draftPinCore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    backgroundColor: DRAFT_PIN_FILL,
  },
  locationChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '58%',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#0B1A33',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.16,
    elevation: 3,
  },
  chipText: {
    fontSize: 11.5,
  },
  zoomStack: {
    position: 'absolute',
    top: 14,
    right: 14,
    borderRadius: 11,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0B1A33',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.16,
    elevation: 3,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  legend: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#0B1A33',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.16,
    elevation: 3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 10.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  footerText: {
    flex: 1,
  },
  footerTitle: {
    fontSize: 13,
  },
  footerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  footerCta: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 13,
    shadowColor: '#24488F',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    shadowOpacity: 0.4,
    elevation: 4,
  },
  footerCtaText: {
    fontSize: 14,
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sheetTitle: {
    fontSize: 18,
    letterSpacing: -0.2,
  },
  sheetBody: {
    gap: 10,
    paddingBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sheetLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 6,
  },
  list: {
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  barcodeAction: {
    justifyContent: 'flex-end',
  },
})
