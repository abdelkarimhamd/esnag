import { useEffect, useMemo, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ImagePicker from 'expo-image-picker'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiClient, type MasterDataRecord } from '../api/client'
import { optimizePickedAsset, type PreparedAttachment } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { enqueueAttachmentUpload, enqueueOfflineSnagCreate } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { PRIORITY, priorityMeta } from '../theme/tokens'
import type { DrawingSummary, OrganizationMemberRecord, ProjectSummary } from '../types'
import { Select } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagCreate'>

// Disciplines (Category) — mirrors web/src/components/CreateSnagDialog.jsx DISCIPLINES.
// Maps to the snag `trade` column.
const DISCIPLINES = [
  'Civil',
  'Structural',
  'Architectural',
  'Finishing',
  'Mechanical (HVAC)',
  'Electrical',
  'Plumbing',
  'Fire Alarm',
  'Fire Fighting',
  'ELV / CCTV',
  'ELV / Access Control',
  'Landscaping / Irrigation',
  'Safety',
  'Other',
]

const DLP_MIN_DESCRIPTION = 30

// Priority chip row — frame-2c renders four equal-width segmented buttons.
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

// Severity axis (BR-FR-027 / OD-07) — kept separate from category. Reuses the
// priority palette (major = critical red) for a consistent segmented look.
const SEVERITY_OPTIONS = [
  { value: 'major', label: 'Major', color: PRIORITY.critical },
  { value: 'high', label: 'High', color: PRIORITY.high },
  { value: 'medium', label: 'Med', color: PRIORITY.medium },
  { value: 'low', label: 'Low', color: PRIORITY.low },
] as const

// Frame section label — IBM Plex Mono overline (10px, tracked, muted).
const SectionLabel = ({ children }: { children: string }) => {
  const theme = useAppTheme()
  return (
    <Text
      style={{
        fontFamily: theme.fonts.monoSemiBold,
        fontSize: 10,
        letterSpacing: 1,
        color: theme.colors.textMuted,
        marginBottom: 9,
      }}
    >
      {children}
    </Text>
  )
}

// Two-letter initials for the assignee avatar (frame shows "MK" style monogram).
const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const CreateSnagScreen = ({ navigation, route }: Props) => {
  const theme = useAppTheme()
  const insets = useSafeAreaInsets()
  const { token, activeOrganization } = useAuth()
  const { refreshQueueSize } = useSync()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [drawings, setDrawings] = useState<DrawingSummary[]>([])
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [projectId, setProjectId] = useState('')
  const [drawingId, setDrawingId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [trade, setTrade] = useState('')
  const [isDlp, setIsDlp] = useState(false)
  const [cluster, setCluster] = useState('')
  const [tocReference, setTocReference] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [photos, setPhotos] = useState<PreparedAttachment[]>([])
  const [pinX, setPinX] = useState('0.5')
  const [pinY, setPinY] = useState('0.5')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [severity, setSeverity] = useState<'major' | 'high' | 'medium' | 'low'>('medium')
  const [snagType, setSnagType] = useState<'construction' | 'operational'>('construction')
  const [categoryId, setCategoryId] = useState('')
  const [areas, setAreas] = useState<MasterDataRecord[]>([])
  const [buildings, setBuildings] = useState<MasterDataRecord[]>([])
  const [categories, setCategories] = useState<MasterDataRecord[]>([])

  useEffect(() => {
    const prefill = route.params?.prefill
    if (!prefill) {
      return
    }

    if (prefill.projectId) {
      setProjectId(String(prefill.projectId))
    }
    if (prefill.buildingId) {
      setBuildingId(String(prefill.buildingId))
    }
    if (prefill.floorId) {
      setFloorId(String(prefill.floorId))
    }
    if (prefill.locationId) {
      setLocationId(String(prefill.locationId))
    }
    if (typeof prefill.pinX === 'number') {
      setPinX(String(prefill.pinX))
    }
    if (typeof prefill.pinY === 'number') {
      setPinY(String(prefill.pinY))
    }
  }, [route.params?.prefill])

  useEffect(() => {
    const load = async () => {
      if (!token || !activeOrganization) {
        return
      }

      try {
        setLoading(true)
        const projectsResponse = await apiClient.listProjects(token, activeOrganization.id)
        setProjects(projectsResponse.data)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [token, activeOrganization?.id])

  useEffect(() => {
    const loadDrawings = async () => {
      if (!token || !activeOrganization || !projectId) {
        setDrawings([])
        return
      }

      const response = await apiClient.listDrawings(token, activeOrganization.id, Number(projectId))
      setDrawings(response.data)
    }

    void loadDrawings()
  }, [token, activeOrganization?.id, projectId])

  useEffect(() => {
    const loadMembers = async () => {
      if (!token || !activeOrganization) {
        setMembers([])
        return
      }

      try {
        const response = await apiClient.fetchOrganizationMembers(
          token,
          activeOrganization.id,
          projectId ? Number(projectId) : undefined,
        )
        setMembers(response.data)
      } catch {
        // Offline or unauthorized — hide the assignee picker silently.
        setMembers([])
      }
    }

    void loadMembers()
  }, [token, activeOrganization?.id, projectId])

  // Area list + configurable categories for the current project (online only).
  useEffect(() => {
    const loadMasterData = async () => {
      if (!token || !activeOrganization || !projectId) {
        setAreas([])
        setCategories([])
        return
      }
      try {
        const [areasResponse, categoriesResponse] = await Promise.all([
          apiClient.listAreas(token, activeOrganization.id, Number(projectId)),
          apiClient.listSnagCategories(token, activeOrganization.id),
        ])
        setAreas(areasResponse.data)
        setCategories(categoriesResponse.data)
      } catch {
        setAreas([])
        setCategories([])
      }
    }

    void loadMasterData()
  }, [token, activeOrganization?.id, projectId])

  // Buildings depend on the selected area (all project buildings when none picked).
  useEffect(() => {
    const loadBuildings = async () => {
      if (!token || !activeOrganization || !projectId) {
        setBuildings([])
        return
      }
      try {
        const response = await apiClient.listBuildings(
          token,
          activeOrganization.id,
          Number(projectId),
          areaId ? Number(areaId) : undefined,
        )
        setBuildings(response.data)
      } catch {
        setBuildings([])
      }
    }

    void loadBuildings()
  }, [token, activeOrganization?.id, projectId, areaId])

  const selectedProjectLabel = useMemo(
    () => projects.find((project) => project.id === Number(projectId))?.name ?? 'Not selected',
    [projects, projectId],
  )
  const selectedDrawingLabel = useMemo(
    () => drawings.find((drawing) => drawing.id === Number(drawingId))?.title ?? 'Not selected',
    [drawings, drawingId],
  )
  const selectedMember = useMemo(
    () => members.find((member) => String(member.id) === assigneeId) ?? null,
    [members, assigneeId],
  )

  // DLP snags require Cluster, TOC, a discipline, a >=30-char description and a
  // photo — mirrors the web CreateSnagDialog canSubmit gating (server enforced).
  const descriptionLength = description.trim().length
  const missingRequirements = useMemo(() => {
    const missing: string[] = []
    if (!title.trim()) {
      missing.push('title')
    }
    if (isDlp) {
      if (!cluster.trim()) {
        missing.push('cluster')
      }
      if (!tocReference.trim()) {
        missing.push('TOC reference')
      }
      if (!trade) {
        missing.push('discipline')
      }
      if (descriptionLength < DLP_MIN_DESCRIPTION) {
        missing.push(`description (min ${DLP_MIN_DESCRIPTION} characters)`)
      }
      if (photos.length === 0) {
        missing.push('at least one photo')
      }
    }
    return missing
  }, [title, isDlp, cluster, tocReference, trade, descriptionLength, photos.length])
  const canSubmit = missingRequirements.length === 0 && !saving

  const addPickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      const optimized = await optimizePickedAsset(asset)
      setPhotos((current) => [...current, optimized])
    } catch (error) {
      Alert.alert('Photo failed', error instanceof Error ? error.message : 'Unable to prepare the photo.')
    }
  }

  const captureFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Camera access is required to take photos.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.72 })
    if (result.canceled || result.assets.length === 0) {
      return
    }

    await addPickedAsset(result.assets[0])
  }

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Media library access is required to attach photos.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.72,
      allowsMultipleSelection: false,
    })
    if (result.canceled || result.assets.length === 0) {
      return
    }

    await addPickedAsset(result.assets[0])
  }

  const addPhoto = () => {
    Alert.alert('Add photo', 'Attach evidence from the camera or your photo library.', [
      { text: 'Take photo', onPress: () => void captureFromCamera() },
      { text: 'Choose from library', onPress: () => void chooseFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const removePhoto = (index: number) => {
    setPhotos((current) => current.filter((_, position) => position !== index))
  }

  const submit = async () => {
    const parsedProjectId = Number(projectId)
    const parsedDrawingId = Number(drawingId)
    const parsedPinX = Number(pinX)
    const parsedPinY = Number(pinY)
    const isOperational = snagType === 'operational'

    if (!Number.isFinite(parsedProjectId) || parsedProjectId <= 0) {
      Alert.alert('Missing project', 'Select a project before creating a snag.')
      return
    }

    // Operational snags (e.g. raised during an inspection) need no drawing/pin;
    // construction snags still require them.
    if (!isOperational) {
      if (!Number.isFinite(parsedDrawingId) || parsedDrawingId <= 0) {
        Alert.alert('Missing drawing', 'Select a drawing before creating a construction snag.')
        return
      }

      if (!Number.isFinite(parsedPinX) || parsedPinX < 0 || parsedPinX > 1 || !Number.isFinite(parsedPinY) || parsedPinY < 0 || parsedPinY > 1) {
        Alert.alert('Invalid pin', 'Pin coordinates must be between 0 and 1.')
        return
      }
    }

    setSaving(true)
    try {
      const { clientUuid } = enqueueOfflineSnagCreate({
        project_id: parsedProjectId,
        snag_type: snagType,
        drawing_id: isOperational ? null : parsedDrawingId,
        building_id: buildingId ? Number(buildingId) : null,
        area_id: areaId ? Number(areaId) : null,
        floor_id: floorId ? Number(floorId) : null,
        location_id: locationId ? Number(locationId) : null,
        location_text: locationText.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        severity,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        pin_x: isOperational ? null : parsedPinX,
        pin_y: isOperational ? null : parsedPinY,
        assigned_to: assigneeId ? Number(assigneeId) : null,
        trade: trade || null,
        is_dlp: isDlp,
        cluster: isDlp ? cluster.trim() : null,
        toc_reference: isDlp ? tocReference.trim() : null,
      })

      // Bind each photo to the unsynced snag via its client uuid — the sync
      // engine resolves the server id once the create applies, so this works
      // fully offline.
      photos.forEach((photo) => {
        enqueueAttachmentUpload({
          snag_client_uuid: clientUuid,
          local_uri: photo.uri,
          file_name: photo.fileName,
          mime_type: photo.mimeType,
          file_size: photo.fileSize,
        })
      })

      refreshQueueSize()
      navigation.navigate('SnagsHome')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    )
  }

  // DLP amber accents reused from the previous screen so the toggle keeps its
  // Defects-Liability treatment in both light and dark.
  const dlpBorder = theme.isDark ? 'rgba(217,169,78,0.45)' : 'rgba(192,138,35,0.4)'
  const dlpTint = theme.isDark ? 'rgba(217,169,78,0.12)' : 'rgba(192,138,35,0.08)'
  const photoRequired = isDlp && photos.length === 0
  const inputBorder = theme.colors.border
  const cardBorder = theme.colors.border

  // Auto-located location chip mirrors frame-2c — surfaces the prefilled pin /
  // location when we arrived from the floor map, otherwise prompts to place one.
  const hasPrefilledLocation = Boolean(locationId || route.params?.prefill?.pinX != null)
  const locationTitle = locationId ? `Location #${locationId}` : 'Tap on the plan to place'
  const locationSubtitle = hasPrefilledLocation
    ? `Auto-located · pin ${Number(pinX).toFixed(2)}, ${Number(pinY).toFixed(2)}`
    : 'Pin defaults to plan centre — adjust below'

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Fixed header — X close · title · Draft indicator (frame-2c). */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 14,
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.closeButton,
              { borderColor: cardBorder, opacity: pressed && !theme.reduceMotion ? 0.6 : 1 },
            ]}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: 18, fontFamily: theme.fonts.sans, lineHeight: 20 }}>
              ✕
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.sansBold }]}>
            New snag
          </Text>
          <Text style={[styles.headerHint, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>
            Draft
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* SNAG TYPE — operational snags skip the drawing/pin (BR-FR-018/019). */}
          <SectionLabel>SNAG TYPE</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            {(['construction', 'operational'] as const).map((t) => {
              const on = snagType === t
              return (
                <Pressable
                  key={t}
                  onPress={() => setSnagType(t)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', backgroundColor: on ? theme.colors.primary : theme.colors.surface, borderColor: on ? theme.colors.primary : theme.colors.border }}
                >
                  <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: on ? theme.colors.primaryContrast : theme.colors.textMuted, textTransform: 'capitalize' }}>{t}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* PROJECT / DRAWING — drawing_id required only for construction snags. */}
          <SectionLabel>PROJECT</SectionLabel>
          <View style={{ marginBottom: 18 }}>
            <Select
              value={projectId || null}
              onChange={(value) => {
                setProjectId(String(value))
                setDrawingId('')
              }}
              options={projects.map((project) => ({
                value: String(project.id),
                label: project.code,
                helper: project.name,
              }))}
            />
            <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>
              {`Selected: ${selectedProjectLabel}`}
            </Text>
          </View>

          {snagType === 'construction' ? (
            <>
              <SectionLabel>DRAWING</SectionLabel>
              <View style={{ marginBottom: 18 }}>
                <Select
                  value={drawingId || null}
                  onChange={(value) => setDrawingId(String(value))}
                  options={drawings.map((drawing) => ({
                    value: String(drawing.id),
                    label: drawing.code,
                    helper: drawing.title,
                  }))}
                />
                <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>
                  {drawings.length > 0 ? `Selected: ${selectedDrawingLabel}` : 'Select a project to load drawings.'}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans, marginBottom: 18 }]}>
              Operational snags are raised against equipment/location — no drawing or pin required.
            </Text>
          )}

          {/* PHOTOS — camera + library capture, queued by client uuid (offline). */}
          <SectionLabel>{isDlp ? 'PHOTOS · REQUIRED' : 'PHOTOS'}</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
            style={{ marginBottom: 18 }}
          >
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
                <Image
                  source={{ uri: photo.uri }}
                  accessibilityLabel={photo.fileName}
                  style={[styles.photoImage, { backgroundColor: theme.colors.surfaceElevated }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  hitSlop={8}
                  onPress={() => removePhoto(index)}
                  style={[styles.photoRemove, { backgroundColor: 'rgba(20,38,66,0.75)' }]}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 14, fontFamily: theme.fonts.sansBold }}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            {/* Camera / library capture tile — dark navy affordance in the frame. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              onPress={addPhoto}
              style={({ pressed }) => [
                styles.photoCapture,
                {
                  backgroundColor: photoRequired ? theme.colors.warning : theme.colors.text,
                  opacity: pressed && !theme.reduceMotion ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24, fontFamily: theme.fonts.sans }}>+</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: theme.fonts.sansSemiBold, marginTop: 3 }}>
                Camera
              </Text>
            </Pressable>
          </ScrollView>
          <Text
            style={[
              styles.helperTop,
              { color: photoRequired ? theme.colors.warning : theme.colors.textMuted, fontFamily: theme.fonts.sans },
            ]}
          >
            {photos.length > 0
              ? `${photos.length} photo${photos.length > 1 ? 's' : ''} will attach when the snag syncs.`
              : isDlp
                ? 'At least one photo is required for a DLP snag.'
                : 'Attach evidence now, or add photos from the snag later.'}
          </Text>

          {/* LOCATION — auto-located chip carrying the prefilled pin (frame-2c). */}
          <SectionLabel>LOCATION</SectionLabel>
          <View style={[styles.locationChip, { backgroundColor: theme.colors.surface, borderColor: cardBorder }]}>
            <View style={[styles.locationThumb, { backgroundColor: theme.colors.surfaceElevated }]}>
              <View style={[styles.locationPin, { backgroundColor: theme.colors.secondary, borderColor: theme.colors.surface }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: theme.colors.text, fontFamily: theme.fonts.sansSemiBold }} numberOfLines={1}>
                {locationTitle}
              </Text>
              <Text style={{ fontSize: 11.5, color: theme.colors.secondary, fontFamily: theme.fonts.sans, marginTop: 2 }} numberOfLines={1}>
                {locationSubtitle}
              </Text>
            </View>
          </View>
          {/* Pin coordinate inputs — the save gate validates these 0..1 values. */}
          <View style={styles.pinRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                placeholder="0.50"
                accessibilityLabel="Pin X (0 to 1)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                value={pinX}
                onChangeText={setPinX}
                style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
              />
              <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>Pin X</Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                placeholder="0.50"
                accessibilityLabel="Pin Y (0 to 1)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                value={pinY}
                onChangeText={setPinY}
                style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
              />
              <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>Pin Y</Text>
            </View>
          </View>

          {/* AREA / BUILDING — new location hierarchy (BR-FR-028) + open-text location. */}
          <View style={styles.pinRow}>
            <View style={{ flex: 1 }}>
              <SectionLabel>AREA</SectionLabel>
              <Select
                value={areaId || null}
                onChange={(value) => {
                  setAreaId(String(value))
                  setBuildingId('')
                }}
                options={[
                  { value: '', label: 'No area' },
                  ...areas.map((area) => ({ value: String(area.id), label: area.name, helper: area.code ?? undefined })),
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SectionLabel>BUILDING</SectionLabel>
              <Select
                value={buildingId || null}
                onChange={(value) => setBuildingId(String(value))}
                options={[
                  { value: '', label: 'No building' },
                  ...buildings.map((building) => ({ value: String(building.id), label: building.name, helper: building.code ?? undefined })),
                ]}
              />
            </View>
          </View>
          <View style={{ marginBottom: 18 }}>
            <SectionLabel>LOCATION · OPEN TEXT</SectionLabel>
            <TextInput
              placeholder="Or type a specific location…"
              accessibilityLabel="Open-text location"
              placeholderTextColor={theme.colors.textMuted}
              value={locationText}
              onChangeText={setLocationText}
              style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
            />
          </View>

          {/* TITLE. */}
          <SectionLabel>TITLE</SectionLabel>
          <TextInput
            placeholder="Cracked floor tile at lift entrance"
            accessibilityLabel="Snag title"
            placeholderTextColor={theme.colors.textMuted}
            value={title}
            onChangeText={setTitle}
            style={[
              styles.input,
              styles.titleInput,
              { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans },
            ]}
          />

          {/* DESCRIPTION — DLP gates a >=30-char body; live counter preserved. */}
          <SectionLabel>{isDlp ? 'DESCRIPTION · REQUIRED' : 'DESCRIPTION'}</SectionLabel>
          <TextInput
            placeholder="Describe the defect, condition and any risk…"
            accessibilityLabel="Description"
            placeholderTextColor={theme.colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans },
            ]}
          />
          {isDlp ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.helperTop,
                {
                  color: descriptionLength < DLP_MIN_DESCRIPTION ? theme.colors.warning : theme.colors.textMuted,
                  fontFamily: theme.fonts.sans,
                },
              ]}
            >
              {descriptionLength}/{DLP_MIN_DESCRIPTION} characters minimum
            </Text>
          ) : null}

          {/* PRIORITY — four-segment chip row (frame-2c). */}
          <View style={{ marginTop: 16 }}>
            <SectionLabel>PRIORITY</SectionLabel>
          </View>
          <View style={styles.priorityRow}>
            {PRIORITY_OPTIONS.map((option) => {
              const selected = priority === option.value
              const accent = PRIORITY[option.value]
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={priorityMeta(option.value).label}
                  accessibilityState={{ selected }}
                  onPress={() => setPriority(option.value)}
                  style={({ pressed }) => [
                    styles.priorityChip,
                    {
                      backgroundColor: selected ? accent : theme.colors.surface,
                      borderColor: selected ? accent : cardBorder,
                      opacity: pressed && !theme.reduceMotion ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: selected ? '#FFFFFF' : theme.colors.textMuted,
                      fontFamily: selected ? theme.fonts.sansBold : theme.fonts.sansSemiBold,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* SEVERITY — a separate axis from priority (BR-FR-027 / OD-07). */}
          <View style={{ marginTop: 16 }}>
            <SectionLabel>SEVERITY</SectionLabel>
          </View>
          <View style={styles.priorityRow}>
            {SEVERITY_OPTIONS.map((option) => {
              const selected = severity === option.value
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => setSeverity(option.value)}
                  style={({ pressed }) => [
                    styles.priorityChip,
                    {
                      backgroundColor: selected ? option.color : theme.colors.surface,
                      borderColor: selected ? option.color : cardBorder,
                      opacity: pressed && !theme.reduceMotion ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: selected ? '#FFFFFF' : theme.colors.textMuted,
                      fontFamily: selected ? theme.fonts.sansBold : theme.fonts.sansSemiBold,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* DLP toggle — Defects Liability Period marker; drives the gating above. */}
          <View style={{ marginTop: 16 }}>
            <SectionLabel>DEFECTS LIABILITY</SectionLabel>
          </View>
          <View
            style={[
              styles.dlpCard,
              {
                borderColor: isDlp ? dlpBorder : cardBorder,
                backgroundColor: isDlp ? dlpTint : theme.colors.surface,
              },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: theme.colors.text, fontFamily: theme.fonts.sansBold }}>DLP snag</Text>
              <Text
                style={{
                  fontSize: 11.5,
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.sans,
                  lineHeight: 16,
                  marginTop: 2,
                }}
              >
                Requires Cluster, TOC, a discipline, a photo and a {DLP_MIN_DESCRIPTION}-character description.
              </Text>
            </View>
            <Switch
              value={isDlp}
              onValueChange={setIsDlp}
              accessibilityLabel="DLP snag"
              trackColor={{ false: theme.colors.border, true: theme.colors.warning }}
              thumbColor={theme.colors.surface}
            />
          </View>

          {isDlp ? (
            <View style={styles.clusterRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="North Cluster"
                  accessibilityLabel="Cluster (required)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={cluster}
                  onChangeText={setCluster}
                  style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
                />
                <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>Cluster *</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="TOC-001"
                  accessibilityLabel="TOC reference (required)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={tocReference}
                  onChangeText={setTocReference}
                  style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: inputBorder, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
                />
                <Text style={[styles.helper, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>TOC *</Text>
              </View>
            </View>
          ) : null}

          {/* DISCIPLINE — required for DLP snags. */}
          <View style={{ marginTop: 16, marginBottom: 18 }}>
            <SectionLabel>{isDlp ? 'DISCIPLINE · REQUIRED' : 'DISCIPLINE'}</SectionLabel>
            <Select
              value={trade}
              onChange={(value) => setTrade(String(value))}
              options={[
                { value: '', label: 'No discipline' },
                ...DISCIPLINES.map((item) => ({ value: item, label: item })),
              ]}
            />
          </View>

          {/* CATEGORY — configurable master list (BR-FR-026), distinct from severity. */}
          {categories.length > 0 ? (
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>CATEGORY</SectionLabel>
              <Select
                value={categoryId}
                onChange={(value) => setCategoryId(String(value))}
                options={[
                  { value: '', label: 'No category' },
                  ...categories.map((category) => ({
                    value: String(category.id),
                    label: category.name,
                    helper: category.code ?? undefined,
                  })),
                ]}
              />
            </View>
          ) : null}

          {/* ASSIGN TO — chip mirrors frame-2c (avatar · name · company · chevron);
              tapping cycles the picker via the shared Select below. */}
          {members.length > 0 ? (
            <>
              <SectionLabel>ASSIGN TO</SectionLabel>
              <View style={[styles.assignChip, { backgroundColor: theme.colors.surface, borderColor: cardBorder }]}>
                <View style={[styles.avatar, { backgroundColor: selectedMember ? theme.colors.success : theme.colors.surfaceElevated }]}>
                  <Text
                    style={{
                      color: selectedMember ? '#FFFFFF' : theme.colors.textMuted,
                      fontSize: 10.5,
                      fontFamily: theme.fonts.monoSemiBold,
                    }}
                  >
                    {selectedMember ? initialsOf(selectedMember.name) : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, color: theme.colors.text, fontFamily: theme.fonts.sansSemiBold }} numberOfLines={1}>
                    {selectedMember ? selectedMember.name : 'Unassigned'}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontFamily: theme.fonts.sans }} numberOfLines={1}>
                    {selectedMember?.companies?.[0]?.name ?? selectedMember?.email ?? 'Tap to choose an assignee'}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <Select
                  value={assigneeId}
                  onChange={(value) => setAssigneeId(String(value))}
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...members.map((member) => ({
                      value: String(member.id),
                      label: member.name,
                      helper: member.companies?.[0]?.name ?? member.email,
                    })),
                  ]}
                />
              </View>
            </>
          ) : null}

          {missingRequirements.length > 0 ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.helperTop, { color: theme.colors.warning, fontFamily: theme.fonts.sans, marginTop: 12 }]}
            >
              Required before saving: {missingRequirements.join(', ')}.
            </Text>
          ) : null}
        </ScrollView>

        {/* Fixed footer — primary save + offline-sync reassurance (frame-2c). */}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving snag' : 'Save snag'}
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: theme.colors.primary,
                opacity: !canSubmit ? 0.5 : pressed && !theme.reduceMotion ? 0.9 : 1,
                shadowOpacity: theme.reduceMotion ? 0 : 0.35,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.primaryContrast} />
            ) : (
              <Text style={{ color: theme.colors.primaryContrast, fontSize: 15.5, fontFamily: theme.fonts.sansBold }}>
                Save snag
              </Text>
            )}
          </Pressable>
          <Text style={[styles.footerNote, { color: theme.colors.textMuted, fontFamily: theme.fonts.sans }]}>
            Saved on device · syncs when back online
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
  headerHint: {
    width: 34,
    fontSize: 12,
    textAlign: 'right',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  helper: {
    fontSize: 11.5,
    marginTop: 6,
  },
  helperTop: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  photoRow: {
    gap: 10,
    alignItems: 'center',
  },
  photoTile: {
    width: 92,
    height: 92,
  },
  photoImage: {
    width: 92,
    height: 92,
    borderRadius: 13,
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCapture: {
    width: 92,
    height: 92,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  locationThumb: {
    width: 58,
    height: 58,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  pinRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 13,
    minHeight: 48,
    fontSize: 14.5,
  },
  titleInput: {
    marginBottom: 4,
  },
  multiline: {
    minHeight: 96,
    paddingTop: 13,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 7,
  },
  priorityChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
  },
  dlpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  clusterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  saveButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: '#24488F',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
  },
  footerNote: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 10,
  },
})
