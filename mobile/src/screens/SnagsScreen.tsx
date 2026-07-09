import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { FlatList, RefreshControl, Text, View } from 'react-native'
import { listLocalSnags } from '../db/store'
import type { SnagsStackParamList } from '../navigation/types'
import { useSync } from '../sync/SyncProvider'
import type { LocalSnagRecord } from '../types'
import { useAppTheme } from '../theme/ThemeProvider'
import { Badge, Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, StatusPill } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagsHome'>

const prettyStatus = (status: string) => status.replaceAll('_', ' ')

const snagTone = (status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => {
  if (status === 'closed') {
    return 'success'
  }
  if (status === 'rejected') {
    return 'danger'
  }
  if (status === 'ready_for_review') {
    return 'warning'
  }
  return 'info'
}

export const SnagsScreen = ({ navigation, route }: Props) => {
  const theme = useAppTheme()
  const [snags, setSnags] = useState<LocalSnagRecord[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const { syncing, queueSize, lastError, lastSkipReason, runSync } = useSync()

  const load = useCallback(() => {
    setSnags(
      listLocalSnags({
        project_id: route.params?.projectId ?? null,
        floor_id: route.params?.floorId ?? null,
        location_id: route.params?.locationId ?? null,
      }),
    )
  }, [route.params?.projectId, route.params?.floorId, route.params?.locationId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await runSync({ force: true, reason: 'manual' })
    load()
    setRefreshing(false)
  }

  const summary = useMemo(() => {
    const open = snags.filter((snag) => !['closed', 'rejected'].includes(snag.status)).length
    return { total: snags.length, open }
  }, [snags])

  return (
    <ScreenContainer>
      <FlatList
        data={snags}
        keyExtractor={(item) => String(item.local_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <SectionHeader title="Snags" subtitle={`${summary.open} open of ${summary.total} total`} />
            <Card elevated>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <StatusPill label={`Queued ${queueSize}`} tone="info" />
                {route.params?.locationId ? (
                  <StatusPill label={`Filtered ${route.params.locationName ?? `Location #${route.params.locationId}`}`} tone="warning" />
                ) : null}
                {syncing ? <StatusPill label="Syncing" tone="success" /> : null}
                {!syncing && lastSkipReason ? <StatusPill label="Sync skipped" tone="warning" /> : null}
                <Badge value={queueSize} tone="info" />
              </View>

              {lastSkipReason ? <Text style={{ color: theme.colors.warning, fontSize: 12 }}>{lastSkipReason}</Text> : null}
              {lastError ? <Text style={{ color: theme.colors.danger, fontSize: 12 }}>{lastError}</Text> : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Floor map" variant="secondary" size="sm" onPress={() => navigation.navigate('FloorMap')} />
                <Button label="Create snag" variant="secondary" size="sm" onPress={() => navigation.navigate('SnagCreate')} />
                <Button label={syncing ? 'Syncing...' : 'Sync now'} size="sm" onPress={() => void onRefresh()} />
                {route.params?.locationId ? (
                  <Button
                    label="Clear filter"
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      navigation.setParams({ projectId: undefined, floorId: undefined, locationId: undefined, locationName: undefined })
                    }
                  />
                ) : null}
              </View>
            </Card>
          </View>
        }
        renderItem={({ item }) => (
          <ListItem
            title={item.reference ?? 'Offline draft'}
            subtitle={`${item.title} • Priority ${item.priority} • Updated ${new Date(item.updated_at).toLocaleString()}`}
            onPress={() => navigation.navigate('SnagDetail', { localId: item.local_id, serverId: item.server_id ?? undefined })}
            right={<StatusPill label={prettyStatus(item.status)} tone={snagTone(item.status)} />}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <EmptyState
            title="No snags yet"
            message="Create an offline snag and sync when network is available."
            actionLabel="Create snag"
            onAction={() => navigation.navigate('SnagCreate')}
          />
        }
      />
    </ScreenContainer>
  )
}
