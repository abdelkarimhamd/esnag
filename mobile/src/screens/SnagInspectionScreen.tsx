import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ImagePicker from 'expo-image-picker'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import type { SnagsStackParamList } from '../navigation/types'
import type { AssetSummary, OrganizationMemberRecord, SnagInspectionRow, StakeholderSummary } from '../types'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagInspection'>

type PhotoUpload = { uri: string; name: string; type: string }
type OwnerType = 'none' | 'company' | 'team' | 'user'

const CONDITIONS = [
  { value: 'operational', label: 'Operational' },
  { value: 'needs_maintenance', label: 'Needs maintenance' },
  { value: 'under_maintenance', label: 'Under maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
  { value: 'resolved', label: 'Resolved' },
]
const conditionLabel = (value: string) => CONDITIONS.find((c) => c.value === value)?.label ?? value

export const SnagInspectionScreen = ({ route }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const { snagServerId, reference, title, status: snagStatus, projectId } = route.params

  const [assets, setAssets] = useState<AssetSummary[]>([])
  const [companies, setCompanies] = useState<StakeholderSummary[]>([])
  const [teams, setTeams] = useState<StakeholderSummary[]>([])
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([])
  const [history, setHistory] = useState<SnagInspectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState('operational')
  const [assetId, setAssetId] = useState<number | null>(null)
  const [newAssetName, setNewAssetName] = useState('')
  const [ownerType, setOwnerType] = useState<OwnerType>('none')
  const [ownerId, setOwnerId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<PhotoUpload[]>([])
  const [saving, setSaving] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!token || !activeOrganization) return
    try {
      const response = await apiClient.listSnagInspections(token, activeOrganization.id, snagServerId)
      setHistory(response.data)
    } catch {
      setHistory([])
    }
  }, [token, activeOrganization?.id, snagServerId])

  const load = useCallback(async () => {
    if (!token || !activeOrganization) return
    setLoading(true)
    try {
      const [assetsRes, companiesRes, teamsRes, membersRes] = await Promise.all([
        apiClient.listAssets(token, activeOrganization.id, projectId ?? undefined),
        apiClient.listStakeholderCompanies(token, activeOrganization.id, projectId ?? undefined),
        apiClient.listStakeholderTeams(token, activeOrganization.id, projectId ?? undefined),
        apiClient.fetchOrganizationMembers(token, activeOrganization.id, projectId ?? undefined),
      ])
      setAssets(assetsRes.data)
      setCompanies(companiesRes.data)
      setTeams(teamsRes.data)
      setMembers(membersRes.data)
      await loadHistory()
      setError(null)
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load the inspection form.').message)
    } finally {
      setLoading(false)
    }
  }, [token, activeOrganization?.id, projectId, loadHistory])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const ownerOptions = useMemo<StakeholderSummary[]>(() => {
    if (ownerType === 'company') return companies
    if (ownerType === 'team') return teams
    if (ownerType === 'user') return members.map((m) => ({ id: m.id, name: m.name }))
    return []
  }, [ownerType, companies, teams, members])

  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Media library access is required to attach photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.72,
      allowsMultipleSelection: true,
    })
    if (result.canceled) return
    const picked = result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `inspection-${Date.now()}-${index}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    }))
    setPhotos((current) => [...current, ...picked])
  }

  const submit = async () => {
    if (!token || !activeOrganization) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { status, notes: notes.trim() || undefined }
      if (assetId) {
        body.equipment_id = assetId
      } else if (newAssetName.trim()) {
        body.asset_name = newAssetName.trim()
        body.create_asset = true
      }
      if (ownerType === 'company' && ownerId) body.maintenance_company_id = ownerId
      if (ownerType === 'team' && ownerId) body.maintenance_team_id = ownerId
      if (ownerType === 'user' && ownerId) body.maintenance_user_id = ownerId

      const response = await apiClient.createSnagInspection(token, activeOrganization.id, snagServerId, body)
      const created = response.data
      for (const photo of photos) {
        try {
          await apiClient.uploadSnagInspectionAttachment(token, activeOrganization.id, created.id, photo, 'photo')
        } catch {
          // best-effort; the inspection is already recorded
        }
      }
      // Reset + refresh
      setStatus('operational')
      setAssetId(null)
      setNewAssetName('')
      setOwnerType('none')
      setOwnerId(null)
      setNotes('')
      setPhotos([])
      await loadHistory()
      Alert.alert('Recorded', `Inspection ${created.reference ?? ''} saved.`)
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to record the inspection.').message)
    } finally {
      setSaving(false)
    }
  }

  const chip = (active: boolean) => ({
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
    borderColor: active ? theme.colors.primary : theme.colors.border,
  })
  const chipText = (active: boolean) => ({
    fontFamily: theme.fonts.sansBold,
    fontSize: 12.5,
    color: active ? theme.colors.primaryContrast : theme.colors.textMuted,
  })
  const sectionLabel = { fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: theme.colors.textMuted, marginBottom: 8, marginTop: 4 }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}>
        {/* Snag context */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: theme.colors.primary }}>{reference ?? `Snag #${snagServerId}`}</Text>
          <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 15, color: theme.colors.text, marginTop: 2 }}>{title ?? 'Snag'}</Text>
          {snagStatus ? <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>Status: {snagStatus}</Text> : null}
        </View>

        {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>{error}</Text> : null}

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={theme.colors.primary} /></View>
        ) : (
          <>
            {/* Condition status */}
            <Text style={sectionLabel}>STATUS / CONDITION</Text>
            <View style={styles.row}>
              {CONDITIONS.map((c) => {
                const on = status === c.value
                return (
                  <Pressable key={c.value} onPress={() => setStatus(c.value)} style={chip(on)}>
                    <Text style={chipText(on)}>{c.label}</Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Asset select-or-create */}
            <Text style={sectionLabel}>ASSET</Text>
            <View style={styles.row}>
              {assets.map((asset) => {
                const on = assetId === asset.id
                return (
                  <Pressable key={asset.id} onPress={() => { setAssetId(on ? null : asset.id); setNewAssetName('') }} style={chip(on)}>
                    <Text style={chipText(on)}>{asset.name}</Text>
                  </Pressable>
                )
              })}
            </View>
            <TextInput
              value={newAssetName}
              onChangeText={(text) => { setNewAssetName(text); if (text) setAssetId(null) }}
              placeholder="…or type a new asset name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
            />

            {/* Maintenance owner */}
            <Text style={sectionLabel}>MAINTENANCE RESPONSIBLE</Text>
            <View style={styles.row}>
              {(['none', 'company', 'team', 'user'] as OwnerType[]).map((type) => {
                const on = ownerType === type
                const label = type === 'none' ? 'None' : type === 'user' ? 'Person' : type.charAt(0).toUpperCase() + type.slice(1)
                return (
                  <Pressable key={type} onPress={() => { setOwnerType(type); setOwnerId(null) }} style={chip(on)}>
                    <Text style={chipText(on)}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
            {ownerType !== 'none' ? (
              <View style={styles.row}>
                {ownerOptions.map((option) => {
                  const on = ownerId === option.id
                  return (
                    <Pressable key={option.id} onPress={() => setOwnerId(on ? null : option.id)} style={chip(on)}>
                      <Text style={chipText(on)}>{option.name}</Text>
                    </Pressable>
                  )
                })}
                {ownerOptions.length === 0 ? <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12, color: theme.colors.textMuted }}>None available.</Text> : null}
              </View>
            ) : null}

            {/* Notes */}
            <Text style={sectionLabel}>NOTES / FINDINGS</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What was found on inspection…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 84, textAlignVertical: 'top', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
            />

            {/* Photos */}
            <Text style={sectionLabel}>PHOTOS</Text>
            <View style={styles.row}>
              <Pressable onPress={() => void addPhoto()} style={[styles.addPhoto, { borderColor: theme.colors.border }]}>
                <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 22, color: theme.colors.textMuted }}>+</Text>
              </Pressable>
              {photos.map((photo, index) => (
                <Pressable key={`${photo.uri}-${index}`} onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11, color: theme.colors.textMuted }}>Tap a photo to remove it. Documents can be added on the web app.</Text>

            {/* Submit */}
            <Pressable
              onPress={() => void submit()}
              disabled={saving}
              style={{ marginTop: 12, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
            >
              <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 14, color: theme.colors.primaryContrast }}>{saving ? 'Recording…' : 'Record inspection'}</Text>
            </Pressable>

            {/* History */}
            <Text style={[sectionLabel, { marginTop: 18 }]}>{`INSPECTION HISTORY (${history.length})`}</Text>
            {history.length === 0 ? (
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>No inspections recorded yet.</Text>
            ) : (
              history.map((item) => (
                <View key={item.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: theme.colors.primary }}>{item.reference}</Text>
                    <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 12, color: theme.colors.text }}>{conditionLabel(item.status)}</Text>
                  </View>
                  {item.equipment?.name || item.asset_name ? (
                    <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.text, marginTop: 3 }}>Asset: {item.equipment?.name ?? item.asset_name}</Text>
                  ) : null}
                  {item.maintenance_company?.name || item.maintenance_team?.name || item.maintenance_user?.name ? (
                    <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                      Maintenance: {item.maintenance_company?.name ?? item.maintenance_team?.name ?? item.maintenance_user?.name}
                    </Text>
                  ) : null}
                  {item.notes ? <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted, marginTop: 4 }}>{item.notes}</Text> : null}
                  {(item.attachments ?? []).length > 0 ? (
                    <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.textMuted, marginTop: 4 }}>{`${item.attachments?.length} file(s) attached`}</Text>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 14, padding: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13.5 },
  addPhoto: { width: 56, height: 56, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 },
  thumb: { width: 56, height: 56, borderRadius: 12, marginRight: 8, marginBottom: 8 },
})
