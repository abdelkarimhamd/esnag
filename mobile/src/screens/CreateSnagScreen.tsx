import { useEffect, useMemo, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { apiClient } from '../api/client'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { enqueueOfflineSnagCreate } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import type { DrawingSummary, ProjectSummary } from '../types'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagCreate'>

export const CreateSnagScreen = ({ navigation, route }: Props) => {
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

  const submit = async () => {
    const parsedProjectId = Number(projectId)
    const parsedDrawingId = Number(drawingId)
    const parsedPinX = Number(pinX)
    const parsedPinY = Number(pinY)

    if (!Number.isFinite(parsedProjectId) || parsedProjectId <= 0) {
      Alert.alert('Missing project', 'Select a project id before creating a snag.')
      return
    }

    if (!Number.isFinite(parsedDrawingId) || parsedDrawingId <= 0) {
      Alert.alert('Missing drawing', 'Select a drawing id before creating a snag.')
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
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Create Offline Snag</Text>
      <Text style={styles.caption}>Queue the operation now. It syncs automatically when online.</Text>

      <Text style={styles.label}>Project ({selectedProjectLabel})</Text>
      <TextInput placeholder="Project ID" keyboardType="numeric" style={styles.input} value={projectId} onChangeText={setProjectId} />

      <Text style={styles.label}>Drawing</Text>
      <TextInput placeholder="Drawing ID" keyboardType="numeric" style={styles.input} value={drawingId} onChangeText={setDrawingId} />
      {drawings.length > 0 ? (
        <Text style={styles.helpText}>
          Drawings for project: {drawings.map((drawing) => `${drawing.id}:${drawing.code}`).slice(0, 6).join(' | ')}
        </Text>
      ) : null}

      <Text style={styles.label}>Title</Text>
      <TextInput placeholder="Snag title" style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        placeholder="Description"
        style={[styles.input, styles.multiline]}
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.label}>Priority</Text>
      <View style={styles.priorityRow}>
        {(['low', 'medium', 'high', 'critical'] as const).map((value) => (
          <Pressable key={value} style={[styles.priorityChip, priority === value && styles.priorityChipActive]} onPress={() => setPriority(value)}>
            <Text style={[styles.priorityText, priority === value && styles.priorityTextActive]}>{value}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Pin X (0..1)</Text>
      <TextInput placeholder="0.50" style={styles.input} keyboardType="decimal-pad" value={pinX} onChangeText={setPinX} />

      <Text style={styles.label}>Pin Y (0..1)</Text>
      <TextInput placeholder="0.50" style={styles.input} keyboardType="decimal-pad" value={pinY} onChangeText={setPinY} />

      <Text style={styles.label}>Building / Floor / Location (optional IDs)</Text>
      <View style={styles.inlineInputs}>
        <TextInput placeholder="Building" keyboardType="numeric" style={[styles.input, styles.inlineInput]} value={buildingId} onChangeText={setBuildingId} />
        <TextInput placeholder="Floor" keyboardType="numeric" style={[styles.input, styles.inlineInput]} value={floorId} onChangeText={setFloorId} />
        <TextInput placeholder="Location" keyboardType="numeric" style={[styles.input, styles.inlineInput]} value={locationId} onChangeText={setLocationId} />
      </View>

      <Pressable disabled={saving || !title.trim()} style={[styles.submit, (!title.trim() || saving) && styles.submitDisabled]} onPress={() => void submit()}>
        <Text style={styles.submitText}>{saving ? 'Queueing...' : 'Queue Snag'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  caption: {
    color: '#475569',
    marginBottom: 6,
  },
  label: {
    fontWeight: '700',
    color: '#334155',
    marginTop: 5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  helpText: {
    color: '#64748B',
    fontSize: 12,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  priorityChipActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  priorityText: {
    color: '#475569',
    textTransform: 'capitalize',
  },
  priorityTextActive: {
    color: '#0369A1',
    fontWeight: '700',
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  submit: {
    marginTop: 12,
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
})
