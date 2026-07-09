import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError, type MasterDataRecord } from '../api/client'
import type { ProjectSummary } from '../types'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Select } from '../ui'

type Tab = 'areas' | 'buildings' | 'categories'

const TABS: { key: Tab; label: string }[] = [
  { key: 'areas', label: 'Areas' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'categories', label: 'Categories' },
]

export const MasterDataAdminScreen = () => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const [tab, setTab] = useState<Tab>('areas')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [areas, setAreas] = useState<MasterDataRecord[]>([])
  const [buildings, setBuildings] = useState<MasterDataRecord[]>([])
  const [categories, setCategories] = useState<MasterDataRecord[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [buildingAreaId, setBuildingAreaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !activeOrganization) {
      return
    }
    apiClient.listProjects(token, activeOrganization.id)
      .then((r) => setProjects(r.data))
      .catch(() => setProjects([]))
  }, [token, activeOrganization?.id])

  const reload = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    setError(null)
    try {
      if (tab === 'categories') {
        const r = await apiClient.listSnagCategories(token, activeOrganization.id)
        setCategories(r.data)
      } else if (projectId) {
        const projectNumber = Number(projectId)
        const areaResponse = await apiClient.listAreas(token, activeOrganization.id, projectNumber)
        setAreas(areaResponse.data)
        if (tab === 'buildings') {
          const buildingResponse = await apiClient.listBuildings(token, activeOrganization.id, projectNumber)
          setBuildings(buildingResponse.data)
        }
      }
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load master data.').message)
    }
  }, [tab, projectId, token, activeOrganization?.id])

  useFocusEffect(useCallback(() => { void reload() }, [reload]))

  const add = async () => {
    if (!token || !activeOrganization || !name.trim()) {
      return
    }
    if ((tab === 'areas' || tab === 'buildings') && !projectId) {
      Alert.alert('Pick a project', 'Select a project before adding.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (tab === 'areas') {
        await apiClient.createArea(token, activeOrganization.id, { project_id: Number(projectId), name: name.trim(), code: code.trim() || null })
      } else if (tab === 'buildings') {
        await apiClient.createBuilding(token, activeOrganization.id, {
          project_id: Number(projectId),
          area_id: buildingAreaId ? Number(buildingAreaId) : null,
          name: name.trim(),
          code: code.trim() || null,
        })
      } else {
        await apiClient.createSnagCategory(token, activeOrganization.id, { name: name.trim(), code: code.trim() || null })
      }
      setName('')
      setCode('')
      setBuildingAreaId('')
      await reload()
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to add the record.').message)
    } finally {
      setBusy(false)
    }
  }

  const removeItem = (id: number) => {
    if (!token || !activeOrganization) {
      return
    }
    Alert.alert('Delete', 'Remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const call = tab === 'areas'
            ? apiClient.deleteArea(token, activeOrganization.id, id)
            : apiClient.deleteBuilding(token, activeOrganization.id, id)
          call.then(() => reload()).catch((e) => setError(normalizeMobileApiError(e, 'Unable to delete.').message))
        },
      },
    ])
  }

  const items = tab === 'areas' ? areas : tab === 'buildings' ? buildings : categories

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 20, color: theme.colors.text }}>Master data</Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', backgroundColor: on ? theme.colors.primary : theme.colors.surface, borderColor: on ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: on ? theme.colors.primaryContrast : theme.colors.textMuted }}>{t.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>{error}</Text> : null}

        {(tab === 'areas' || tab === 'buildings') && (
          <View>
            <Text style={styles.label(theme)}>PROJECT</Text>
            <Select
              value={projectId || null}
              onChange={(value) => setProjectId(String(value))}
              options={projects.map((p) => ({ value: String(p.id), label: p.code, helper: p.name }))}
            />
          </View>
        )}

        {tab === 'buildings' && (
          <View>
            <Text style={styles.label(theme)}>AREA (optional)</Text>
            <Select
              value={buildingAreaId || null}
              onChange={(value) => setBuildingAreaId(value ? String(value) : '')}
              options={[{ value: '', label: 'No area', helper: 'Optional' }, ...areas.map((a) => ({ value: String(a.id), label: a.name, helper: a.code ?? undefined }))]}
            />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={styles.label(theme)}>{`ADD ${tab.slice(0, -1).toUpperCase()}`}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]} />
          <TextInput value={code} onChangeText={setCode} placeholder="Code (optional)" placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { marginTop: 8, backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]} />
          <Pressable disabled={busy || !name.trim()} onPress={() => void add()}
            style={[styles.addBtn, { backgroundColor: theme.colors.primary, opacity: busy || !name.trim() ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color={theme.colors.primaryContrast} /> : <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansSemiBold, fontSize: 14 }}>Add</Text>}
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          {items.length === 0 ? (
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>Nothing here yet.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 14, color: theme.colors.text }} numberOfLines={1}>{item.name}</Text>
                  {item.code ? <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.textMuted }}>{item.code}</Text> : null}
                </View>
                {tab !== 'categories' && (
                  <Pressable onPress={() => removeItem(item.id)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>Delete</Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = {
  fill: { flex: 1 },
  label: (theme: ReturnType<typeof useAppTheme>) => ({ fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: theme.colors.textMuted, marginBottom: 6 }),
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 46, fontSize: 14.5 },
  addBtn: { marginTop: 10, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
} as const
