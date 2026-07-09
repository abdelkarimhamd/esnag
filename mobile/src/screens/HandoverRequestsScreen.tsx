import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError, type HandoverRequestRow } from '../api/client'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import type { AppTheme } from '../theme/tokens'

type Props = NativeStackScreenProps<SnagsStackParamList, 'HandoverRequestsList'>

export const statusMeta = (theme: AppTheme, status: string): { color: string; label: string } => {
  const map: Record<string, { color: string; label: string }> = {
    draft: { color: theme.colors.textMuted, label: 'Draft' },
    in_progress: { color: theme.colors.primary, label: 'In progress' },
    returned: { color: theme.colors.warning, label: 'Returned' },
    revising: { color: theme.colors.warning, label: 'Revising' },
    consolidating: { color: theme.colors.secondary, label: 'Consolidating' },
    approved: { color: theme.colors.success, label: 'Approved' },
    closed: { color: theme.colors.success, label: 'Closed' },
    rejected: { color: theme.colors.danger, label: 'Rejected' },
  }
  return map[status] ?? { color: theme.colors.textMuted, label: status }
}

export const partyTypeLabel = (t?: string | null): string =>
  ({ contractor: 'Contractor', consultant: 'Consultant', authority: 'Authority', owner: 'Owner', fmmp: 'FMMP', service_provider: 'Service Provider', other: 'Other' } as Record<string, string>)[
    t ?? ''
  ] ?? (t ?? '—')

export const HandoverRequestsScreen = ({ navigation }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const [rows, setRows] = useState<HandoverRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    setLoading(true)
    try {
      const response = await apiClient.listHandoverRequests(token, activeOrganization.id, {})
      setRows(response.data)
      setError(null)
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load handover requests.').message)
    } finally {
      setLoading(false)
    }
  }, [token, activeOrganization?.id])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const renderItem = ({ item }: { item: HandoverRequestRow }) => {
    const meta = statusMeta(theme, item.status)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('HandoverDetail', { requestId: item.id })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed && !theme.reduceMotion ? 0.85 : 1 },
        ]}
      >
        <View style={styles.cardTop}>
          <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: theme.colors.primary }}>{item.reference}</Text>
          <View style={[styles.chip, { backgroundColor: meta.color + '22' }]}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 11, color: meta.color }}>{meta.label}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.sansBold, fontSize: 15, color: theme.colors.text, marginTop: 4 }}>{item.title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted, marginTop: 3 }}>
          {item.responsible_company?.name ?? partyTypeLabel(item.responsible_company?.type)}
          {item.current_stage_order != null ? ` · stage ${item.current_stage_order}` : ''}
          {item.cycle_number > 1 ? ` · cycle ${item.cycle_number}` : ''}
        </Text>
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <View style={styles.headerRow}>
        <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 20, color: theme.colors.text }}>Handovers</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Audit trail"
            onPress={() => navigation.navigate('AuditTrail')}
            style={({ pressed }) => [styles.newButton, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed && !theme.reduceMotion ? 0.9 : 1 }]}
          >
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>Audit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New handover request"
            onPress={() => navigation.navigate('HandoverCreate')}
            style={({ pressed }) => [styles.newButton, { backgroundColor: theme.colors.primary, opacity: pressed && !theme.reduceMotion ? 0.9 : 1 }]}
          >
            <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>+ New</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : error ? (
        <View style={styles.centered}><Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans }}>{error}</Text></View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}><Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans }}>No handover requests yet.</Text></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  newButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
})
