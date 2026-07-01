import { useEffect, useMemo, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ActivityIndicator, Alert, Text, View } from 'react-native'
import { apiClient } from '../api/client'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { enqueueOfflineSnagCreate } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import type { DrawingSummary, ProjectSummary } from '../types'
import { Button, Card, ScreenContainer, SectionHeader, Select, TextField } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagCreate'>

export const CreateSnagScreen = ({ navigation, route }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const { refreshQueueSize } = useSync()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [drawings, setDrawings] = useState<DrawingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [projectId, setProjectId] = useState('')
  const [drawingId, setDrawingId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [pinX, setPinX] = useState('0.5')
  const [pinY, setPinY] = useState('0.5')
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [locationId, setLocationId] = useState('')

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

  const selectedProjectLabel = useMemo(
    () => projects.find((project) => project.id === Number(projectId))?.name ?? 'Not selected',
    [projects, projectId],
  )
  const selectedDrawingLabel = useMemo(
    () => drawings.find((drawing) => drawing.id === Number(drawingId))?.title ?? 'Not selected',
    [drawings, drawingId],
  )

  const submit = async () => {
    const parsedProjectId = Number(projectId)
    const parsedDrawingId = Number(drawingId)
    const parsedPinX = Number(pinX)
    const parsedPinY = Number(pinY)

    if (!Number.isFinite(parsedProjectId) || parsedProjectId <= 0) {
      Alert.alert('Missing project', 'Select a project before creating a snag.')
      return
    }

    if (!Number.isFinite(parsedDrawingId) || parsedDrawingId <= 0) {
      Alert.alert('Missing drawing', 'Select a drawing before creating a snag.')
      return
    }

    if (!Number.isFinite(parsedPinX) || parsedPinX < 0 || parsedPinX > 1 || !Number.isFinite(parsedPinY) || parsedPinY < 0 || parsedPinY > 1) {
      Alert.alert('Invalid pin', 'Pin coordinates must be between 0 and 1.')
      return
    }

    setSaving(true)
    try {
      enqueueOfflineSnagCreate({
        project_id: parsedProjectId,
        drawing_id: parsedDrawingId,
        building_id: buildingId ? Number(buildingId) : null,
        floor_id: floorId ? Number(floorId) : null,
        location_id: locationId ? Number(locationId) : null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        pin_x: parsedPinX,
        pin_y: parsedPinY,
      })
      refreshQueueSize()
      navigation.navigate('SnagsHome')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer scroll>
      <SectionHeader
        title="Create Offline Snag"
        subtitle="Queue now and sync automatically when the device reconnects."
      />

      <Card elevated>
        <Select
          label={`Project (${selectedProjectLabel})`}
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

        <Select
          label={`Drawing (${selectedDrawingLabel})`}
          value={drawingId || null}
          onChange={(value) => setDrawingId(String(value))}
          options={drawings.map((drawing) => ({
            value: String(drawing.id),
            label: drawing.code,
            helper: drawing.title,
          }))}
        />
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {drawings.length > 0 ? 'Tap a drawing to select it.' : 'Select a project to load drawings.'}
        </Text>

        <TextField placeholder="Snag title" label="Title" value={title} onChangeText={setTitle} />
        <TextField
          placeholder="Description"
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />

        <Select
          label="Priority"
          horizontal={false}
          value={priority}
          onChange={(value) => setPriority(value as typeof priority)}
          options={(['low', 'medium', 'high', 'critical'] as const).map((value) => ({
            value,
            label: value,
          }))}
        />

        <TextField
          placeholder="0.50"
          label="Pin X (0..1)"
          keyboardType="decimal-pad"
          value={pinX}
          onChangeText={setPinX}
        />
        <TextField
          placeholder="0.50"
          label="Pin Y (0..1)"
          keyboardType="decimal-pad"
          value={pinY}
          onChangeText={setPinY}
        />
        <Button
          fullWidth
          label={saving ? 'Queueing...' : 'Queue Snag'}
          loading={saving}
          disabled={!title.trim()}
          onPress={() => void submit()}
        />
      </Card>
    </ScreenContainer>
  )
}
