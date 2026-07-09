import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError, type AuditEventRow } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'

const CATEGORIES: { key: string; label: string; prefix?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'snag', label: 'Snags', prefix: 'snag.' },
  { key: 'rbac', label: 'Roles', prefix: 'rbac.' },
  { key: 'area', label: 'Areas', prefix: 'area.' },
  { key: 'building', label: 'Buildings', prefix: 'building.' },
]

const shortSubject = (event: AuditEventRow): string => {
  if (!event.subject_type) {
    return ''
  }
  const name = String(event.subject_type).split('\\').pop() ?? ''
  return `${name}#${event.subject_id ?? '?'}`
}

const formatTime = (value?: string): string => {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const AuditTrailScreen = () => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const [rows, setRows] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('all')

  const load = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    setLoading(true)
    try {
      const prefix = CATEGORIES.find((c) => c.key === category)?.prefix
      const response = await apiClient.listAuditEvents(token, activeOrganization.id, prefix)
      setRows(response.data)
      setError(null)
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load the audit trail.').message)
    } finally {
      setLoading(false)
    }
  }, [token, activeOrganization?.id, category])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <View style={styles.headerRow}>
        <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 20, color: theme.colors.text }}>Audit trail</Text>
      </View>
      <View style={styles.filterRow}>
        {CATEGORIES.map((c) => {
          const on = c.key === category
          return (
            <Pressable key={c.key} onPress={() => setCategory(c.key)}
              style={[styles.chipFilter, { backgroundColor: on ? theme.colors.primary : theme.colors.surface, borderColor: on ? theme.colors.primary : theme.colors.border }]}>
              <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 12, color: on ? theme.colors.primaryContrast : theme.colors.textMuted }}>{c.label}</Text>
            </Pressable>
          )
        })}
      </View>
      {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5, paddingHorizontal: 16 }}>{error}</Text> : null}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ fontFamily: theme.fonts.sans, color: theme.colors.textMuted, textAlign: 'center', marginTop: 24 }}>No audit activity.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: theme.colors.primary }}>{item.action}</Text>
                <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.textMuted }}>{formatTime(item.created_at)}</Text>
              </View>
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.text, marginTop: 3 }}>
                {item.actor?.name ?? 'System'}
                {item.actor_role ? <Text style={{ color: theme.colors.textMuted }}>{`  ·  ${item.actor_role}`}</Text> : null}
                {item.actor_company?.name ? <Text style={{ color: theme.colors.textMuted }}>{`  ·  ${item.actor_company.name}`}</Text> : null}
              </Text>
              {shortSubject(item) ? <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 }}>{shortSubject(item)}</Text> : null}
              {item.reason ? <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 }}>“{item.reason}”</Text> : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  chipFilter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
})
