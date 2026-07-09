import { useEffect, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError, type MasterDataRecord } from '../api/client'
import type { SnagsStackParamList } from '../navigation/types'
import type { ProjectSummary } from '../types'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Select } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'HandoverCreate'>

const Label = ({ children }: { children: string }) => {
  const theme = useAppTheme()
  return <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: theme.colors.textMuted, marginBottom: 7 }}>{children}</Text>
}

export const HandoverCreateScreen = ({ navigation }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [areas, setAreas] = useState<MasterDataRecord[]>([])
  const [areaId, setAreaId] = useState('')
  const [buildings, setBuildings] = useState<MasterDataRecord[]>([])
  const [buildingId, setBuildingId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!token || !activeOrganization) {
        return
      }
      try {
        const response = await apiClient.listProjects(token, activeOrganization.id)
        setProjects(response.data)
      } catch (e) {
        setError(normalizeMobileApiError(e, 'Unable to load projects.').message)
      }
    }
    void run()
  }, [token, activeOrganization?.id])

  // Area list follows the selected project; building list follows the area (C5).
  useEffect(() => {
    setAreaId('')
    setBuildings([])
    setBuildingId('')
    if (!token || !activeOrganization || !projectId) {
      setAreas([])
      return
    }
    void apiClient.listAreas(token, activeOrganization.id, Number(projectId))
      .then((r) => setAreas(r.data))
      .catch(() => setAreas([]))
  }, [token, activeOrganization?.id, projectId])

  useEffect(() => {
    setBuildingId('')
    if (!token || !activeOrganization || !projectId) {
      setBuildings([])
      return
    }
    void apiClient.listBuildings(token, activeOrganization.id, Number(projectId), areaId ? Number(areaId) : null)
      .then((r) => setBuildings(r.data))
      .catch(() => setBuildings([]))
  }, [token, activeOrganization?.id, projectId, areaId])

  const canSubmit = Boolean(projectId) && Boolean(title.trim()) && !saving

  const submit = async () => {
    if (!token || !activeOrganization || !canSubmit) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await apiClient.createHandoverRequest(token, activeOrganization.id, {
        project_id: Number(projectId),
        title: title.trim(),
        description: description.trim() || undefined,
        area_id: areaId ? Number(areaId) : undefined,
        building_id: buildingId ? Number(buildingId) : undefined,
        location_text: locationText.trim() || undefined,
      })
      navigation.replace('HandoverDetail', { requestId: response.data.id })
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to create the handover request.').message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 20, color: theme.colors.text }}>New handover request</Text>

        {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>{error}</Text> : null}

        <View>
          <Label>PROJECT</Label>
          <Select
            value={projectId || null}
            onChange={(value) => setProjectId(String(value))}
            options={projects.map((p) => ({ value: String(p.id), label: p.code, helper: p.name }))}
          />
        </View>

        <View>
          <Label>TITLE</Label>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Energy centre handover"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
          />
        </View>

        <View>
          <Label>DESCRIPTION</Label>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Scope of the handover…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={[styles.input, styles.multiline, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
          />
        </View>

        <View>
          <Label>AREA</Label>
          <Select
            value={areaId || null}
            onChange={(value) => setAreaId(value ? String(value) : '')}
            options={[{ value: '', label: 'No area', helper: 'Optional' }, ...areas.map((a) => ({ value: String(a.id), label: a.name, helper: a.code ?? undefined }))]}
          />
        </View>

        <View>
          <Label>BUILDING</Label>
          <Select
            value={buildingId || null}
            onChange={(value) => setBuildingId(value ? String(value) : '')}
            options={[{ value: '', label: 'No building', helper: 'Optional' }, ...buildings.map((b) => ({ value: String(b.id), label: b.name, helper: b.code ?? undefined }))]}
          />
        </View>

        <View>
          <Label>LOCATION</Label>
          <TextInput
            value={locationText}
            onChangeText={setLocationText}
            placeholder="e.g. Level 2, near grid C4 (optional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={[styles.saveBtn, { backgroundColor: theme.colors.primary, opacity: !canSubmit ? 0.5 : 1 }]}
        >
          {saving ? <ActivityIndicator color={theme.colors.primaryContrast} /> : <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansBold, fontSize: 15 }}>Create request</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 14.5 },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  saveBtn: { paddingVertical: 15, borderRadius: 13, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
})
