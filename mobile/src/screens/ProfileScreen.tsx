import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'

// I1 Profile (UIspec_mobile A4/A5/I1, BR-BR-006, BR-FR-003/006). Lets a user who
// works across contexts see their identity and switch organization, role view and
// project. Organization + project selection are backed by AuthProvider so the
// choice persists and re-scopes the local DB / sync for the next screen.
const humanizeRole = (role: string) =>
  role
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')

export const ProfileScreen = () => {
  const theme = useAppTheme()
  const sectionLabel = {
    fontFamily: theme.fonts.monoSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: theme.colors.textMuted,
  } as const
  const {
    user,
    organizations,
    activeOrganization,
    activeRoleNames,
    projects,
    activeProject,
    selectOrganization,
    selectProject,
  } = useAuth()
  const [busy, setBusy] = useState(false)

  const onSelectOrganization = async (organizationId: number) => {
    if (busy || organizationId === activeOrganization?.id) {
      return
    }
    setBusy(true)
    try {
      await selectOrganization(organizationId)
    } finally {
      setBusy(false)
    }
  }

  const onSelectProject = async (projectId: number) => {
    if (busy || projectId === activeProject?.id) {
      return
    }
    setBusy(true)
    try {
      await selectProject(projectId)
    } finally {
      setBusy(false)
    }
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* Identity card */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 16, color: theme.colors.primaryContrast }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 17, color: theme.colors.text }}>{user?.name ?? '—'}</Text>
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>{user?.email ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* Active role(s) — A4: a user may hold more than one role in an org */}
        <View style={{ gap: 8 }}>
          <Text style={sectionLabel}>YOUR ROLE{activeRoleNames.length > 1 ? 'S' : ''} HERE</Text>
          {activeRoleNames.length === 0 ? (
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>No role assigned in this organization.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeRoleNames.map((role) => (
                <View key={role} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 11.5, color: theme.colors.primary }}>{humanizeRole(role)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Organization switcher — A4 */}
        <View style={{ gap: 8 }}>
          <Text style={sectionLabel}>ORGANIZATION</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, padding: 6 }]}>
            {organizations.length === 0 ? (
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted, padding: 8 }}>No organization memberships.</Text>
            ) : (
              organizations.map((organization, index) => {
                const on = organization.id === activeOrganization?.id
                return (
                  <Pressable
                    key={organization.id}
                    onPress={() => void onSelectOrganization(organization.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 14, color: theme.colors.text }}>{organization.name}</Text>
                      <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.textMuted }}>
                        {organization.code} · {(organization.roles ?? []).map(humanizeRole).join(', ') || 'No role'}
                      </Text>
                    </View>
                    {on ? <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 15, color: theme.colors.success }}>✓</Text> : null}
                  </Pressable>
                )
              })
            )}
          </View>
        </View>

        {/* Project switcher — A5 */}
        <View style={{ gap: 8 }}>
          <Text style={sectionLabel}>PROJECT</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, padding: 6 }]}>
            {projects.length === 0 ? (
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted, padding: 8 }}>No projects in this organization.</Text>
            ) : (
              projects.map((project, index) => {
                const on = project.id === activeProject?.id
                return (
                  <Pressable
                    key={project.id}
                    onPress={() => void onSelectProject(project.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 14, color: theme.colors.text }}>{project.name}</Text>
                      <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.textMuted }}>{project.code}</Text>
                    </View>
                    {on ? <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 15, color: theme.colors.success }}>✓</Text> : null}
                  </Pressable>
                )
              })
            )}
          </View>
          <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.textMuted }}>
            The active project pre-selects when you raise a snag and scopes your work views.
          </Text>
        </View>

        {busy ? (
          <View style={{ paddingVertical: 8, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
