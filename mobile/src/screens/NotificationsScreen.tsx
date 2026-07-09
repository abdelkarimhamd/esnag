import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { listQueuedOperations, pendingSyncConflictsCount } from '../db/store'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Card, EmptyState, ListItem, ScreenContainer, SectionHeader, StatusPill } from '../ui'

export const NotificationsScreen = () => {
  const theme = useAppTheme()
  const { lastError, lastSkipReason, queueSize, lastSyncAt } = useSync()
  const [conflicts, setConflicts] = useState(0)
  const [queued, setQueued] = useState(0)

  const refresh = useCallback(() => {
    const operations = listQueuedOperations()
    const queuedNow = operations.filter((operation) => operation.status === 'pending').length
    setQueued(queuedNow)
    setConflicts(pendingSyncConflictsCount())
  }, [])

  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh]),
  )

  const alerts = useMemo(() => {
    const rows: Array<{ id: string; title: string; subtitle: string; tone: 'info' | 'warning' | 'danger' }> = []
    if (conflicts > 0) {
      rows.push({
        id: 'conflicts',
        title: `${conflicts} sync conflict${conflicts === 1 ? '' : 's'} pending`,
        subtitle: 'Open Conflicts tab and resolve local/server differences.',
        tone: 'warning',
      })
    }
    if (queued > 0 || queueSize > 0) {
      rows.push({
        id: 'queue',
        title: `${Math.max(queued, queueSize)} queued operation${Math.max(queued, queueSize) === 1 ? '' : 's'}`,
        subtitle: 'Pending offline operations will be applied on next sync.',
        tone: 'info',
      })
    }
    if (lastError) {
      rows.push({
        id: 'error',
        title: 'Last sync reported an error',
        subtitle: lastError,
        tone: 'danger',
      })
    }
    if (lastSkipReason) {
      rows.push({
        id: 'skip',
        title: 'Sync was skipped by policy',
        subtitle: lastSkipReason,
        tone: 'info',
      })
    }
    return rows
  }, [conflicts, queued, queueSize, lastError, lastSkipReason])

  return (
    <ScreenContainer scroll>
      <SectionHeader
        title="Notifications"
        subtitle={`Last sync ${lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'not available yet'}`}
      />

      <Card elevated>
        <Text style={{ fontWeight: '700', color: theme.colors.text }}>Operational Alerts</Text>
        {alerts.length === 0 ? (
          <EmptyState
            title="All clear"
            message="No pending alerts. Sync is stable and queue is empty."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {alerts.map((alert) => (
              <ListItem
                key={alert.id}
                title={alert.title}
                subtitle={alert.subtitle}
                right={<StatusPill label={alert.tone} tone={alert.tone} />}
              />
            ))}
          </View>
        )}
      </Card>
    </ScreenContainer>
  )
}
