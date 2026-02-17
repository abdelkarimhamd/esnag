import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { listLocalSnags } from '../db/store'
import type { LocalSnagRecord } from '../types'
import type { SnagsStackParamList } from '../navigation/types'
import { useSync } from '../sync/SyncProvider'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagsHome'>

const prettyStatus = (status: string) => status.replaceAll('_', ' ')

export const SnagsScreen = ({ navigation, route }: Props) => {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Snags</Text>
          <Text style={styles.subtitle}>
            {summary.open} open / {summary.total} total
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('FloorMap')}>
            <Text style={styles.secondaryButtonText}>Floors</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('SnagCreate')}>
            <Text style={styles.secondaryButtonText}>New</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void onRefresh()}>
            <Text style={styles.primaryButtonText}>{syncing ? 'Syncing...' : 'Sync'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>Queued ops: {queueSize}</Text>
        {route.params?.locationId ? (
          <Text style={styles.bannerFilter}>
            Filter: {route.params.locationName ?? `Location #${route.params.locationId}`}
          </Text>
        ) : null}
        {route.params?.locationId ? (
          <Pressable onPress={() => navigation.setParams({ projectId: undefined, floorId: undefined, locationId: undefined, locationName: undefined })}>
            <Text style={styles.clearFilter}>Clear filter</Text>
          </Pressable>
        ) : null}
        {lastSkipReason ? <Text style={styles.bannerHint}>{lastSkipReason}</Text> : null}
        {lastError ? <Text style={styles.bannerError}>{lastError}</Text> : null}
      </View>

      <FlatList
        data={snags}
        keyExtractor={(item) => String(item.local_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('SnagDetail', { localId: item.local_id, serverId: item.server_id ?? undefined })}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.cardRef}>{item.reference ?? 'Offline'}</Text>
              <Text style={styles.cardStatus}>{prettyStatus(item.status)}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>
              Priority: {item.priority} | Dirty: {item.is_dirty ? 'yes' : 'no'} | Updated {new Date(item.updated_at).toLocaleString()}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No local snags yet. Create one and sync when online.</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#0369A1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  banner: {
    marginHorizontal: 16,
    backgroundColor: '#ECFEFF',
    borderColor: '#A5F3FC',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  bannerText: {
    color: '#155E75',
    fontWeight: '600',
  },
  bannerFilter: {
    color: '#0E7490',
    marginTop: 3,
  },
  clearFilter: {
    color: '#0369A1',
    marginTop: 4,
    fontWeight: '700',
  },
  bannerHint: {
    color: '#0F766E',
    marginTop: 4,
    fontSize: 12,
  },
  bannerError: {
    color: '#B91C1C',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 5,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardRef: {
    color: '#334155',
    fontWeight: '700',
  },
  cardStatus: {
    textTransform: 'capitalize',
    color: '#0F766E',
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  empty: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 40,
  },
})
