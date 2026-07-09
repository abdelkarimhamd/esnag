import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient, normalizeMobileApiError, type RoleMatrix } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'

export const RoleMatrixScreen = () => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    setLoading(true)
    try {
      const response = await apiClient.getRoleMatrix(token, activeOrganization.id)
      setMatrix(response.data)
      setSelectedRole((current) => current ?? response.data.roles[0]?.name ?? null)
      setError(null)
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load the role matrix.').message)
    } finally {
      setLoading(false)
    }
  }, [token, activeOrganization?.id])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const role = useMemo(() => matrix?.roles.find((r) => r.name === selectedRole) ?? null, [matrix, selectedRole])
  const granted = useMemo(() => new Set(role?.permissions ?? []), [role])

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}>
        <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 20, color: theme.colors.text }}>Roles &amp; permissions</Text>
        <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>
          The permission set each role grants — defined in the platform catalog (read-only).
        </Text>

        {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>{error}</Text> : null}

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={theme.colors.primary} /></View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(matrix?.roles ?? []).map((r) => {
                const on = r.name === selectedRole
                return (
                  <Pressable key={r.name} onPress={() => setSelectedRole(r.name)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, backgroundColor: on ? theme.colors.primary : theme.colors.surface, borderColor: on ? theme.colors.primary : theme.colors.border }}>
                    <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 11.5, color: on ? theme.colors.primaryContrast : theme.colors.textMuted }}>{r.name}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: theme.colors.textMuted, marginTop: 6 }}>
              {`${role?.permissions.length ?? 0} OF ${matrix?.permissions.length ?? 0} PERMISSIONS GRANTED`}
            </Text>

            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {(matrix?.permissions ?? []).map((permission) => {
                const has = granted.has(permission)
                return (
                  <View key={permission} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 13, color: has ? theme.colors.success : theme.colors.border, width: 14, textAlign: 'center' }}>{has ? '✓' : '·'}</Text>
                    <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11.5, color: has ? theme.colors.text : theme.colors.textMuted }}>{permission}</Text>
                  </View>
                )
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
})
