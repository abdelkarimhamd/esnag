import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  listPendingSyncConflicts,
  parseConflictPayload,
  resolveSyncConflict,
  updateLocalSnagFromConflict,
} from '../db/store'
import { enqueueOfflineSnagUpdate } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import type { SnagPriority, SyncConflictRecord } from '../types'

interface SnagPayload {
  snag_id?: number
  title?: string
  description?: string | null
  priority?: SnagPriority
  status?: string
  updated_at?: string
}

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

export const SyncConflictsScreen = () => {
  const { refreshQueueSize } = useSync()
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([])
  const [editingConflictId, setEditingConflictId] = useState<number | null>(null)
  const [mergeTitle, setMergeTitle] = useState('')
  const [mergeDescription, setMergeDescription] = useState('')
  const [mergePriority, setMergePriority] = useState<SnagPriority>('medium')

  const load = useCallback(() => {
    setConflicts(listPendingSyncConflicts())
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const conflictRows = useMemo(
    () =>
      conflicts.map((conflict) => {
        const local = parseConflictPayload<SnagPayload>(conflict.local_payload)
        const server = parseConflictPayload<SnagPayload>(conflict.server_payload)
        return {
          conflict,
          local,
          server,
        }
      }),
    [conflicts],
  )

  const applyServerVersion = (row: { conflict: SyncConflictRecord; server: SnagPayload }) => {
    const snagId = Number(row.server.snag_id ?? row.conflict.entity_id ?? 0)
    if (!snagId) {
      return
    }

    updateLocalSnagFromConflict(snagId, {
      title: asString(row.server.title),
      description: typeof row.server.description === 'string' ? row.server.description : null,
      priority: asString(row.server.priority, 'medium'),
      status: asString(row.server.status, 'new'),
      updated_at: asString(row.server.updated_at, new Date().toISOString()),
    })
    resolveSyncConflict(row.conflict.id, 'use_server')
    load()
  }

  const retryLocalVersion = (row: { conflict: SyncConflictRecord; local: SnagPayload }) => {
    const snagId = Number(row.local.snag_id ?? row.conflict.entity_id ?? 0)
    if (!snagId) {
      Alert.alert('Cannot retry', 'Missing snag identifier for this conflict.')
      return
    }

    enqueueOfflineSnagUpdate(snagId, {
      title: row.local.title,
      description: row.local.description ?? null,
      priority: row.local.priority,
    })
    resolveSyncConflict(row.conflict.id, 'retry_local')
    refreshQueueSize()
    load()
  }

  const openMergeEditor = (row: { conflict: SyncConflictRecord; local: SnagPayload; server: SnagPayload }) => {
    setEditingConflictId(row.conflict.id)
    setMergeTitle(asString(row.local.title, asString(row.server.title)))
    setMergeDescription(asString(row.local.description, asString(row.server.description)))
    setMergePriority((row.local.priority ?? row.server.priority ?? 'medium') as SnagPriority)
  }

  const applyMerge = () => {
    const target = conflictRows.find((row) => row.conflict.id === editingConflictId)
    if (!target) {
      return
    }

    const snagId = Number(target.local.snag_id ?? target.server.snag_id ?? target.conflict.entity_id ?? 0)
    if (!snagId) {
      Alert.alert('Cannot merge', 'Missing snag identifier for this conflict.')
      return
    }

    enqueueOfflineSnagUpdate(snagId, {
      title: mergeTitle.trim() || asString(target.server.title, asString(target.local.title)),
      description: mergeDescription.trim() || null,
      priority: mergePriority,
    })

    resolveSyncConflict(target.conflict.id, 'merge_local_server')
    refreshQueueSize()
    setEditingConflictId(null)
    load()
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Sync Conflicts</Text>
      <Text style={styles.subtitle}>Review server-vs-local collisions and choose how each snag should be resolved.</Text>

      {conflictRows.length === 0 ? <Text style={styles.empty}>No pending conflicts.</Text> : null}

      {conflictRows.map((row) => {
        const isEditing = editingConflictId === row.conflict.id
        return (
          <View key={row.conflict.id} style={styles.card}>
            <Text style={styles.cardTitle}>Conflict #{row.conflict.id}</Text>
            <Text style={styles.meta}>Operation: {row.conflict.operation_type}</Text>
            <Text style={styles.meta}>Local vs server update mismatch</Text>

            <View style={styles.comparisonBlock}>
              <Text style={styles.blockTitle}>Local</Text>
              <Text style={styles.line}>Title: {asString(row.local.title, '-')}</Text>
              <Text style={styles.line}>Priority: {asString(row.local.priority, '-')}</Text>
              <Text style={styles.line}>Description: {asString(row.local.description, '-')}</Text>
            </View>

            <View style={styles.comparisonBlock}>
              <Text style={styles.blockTitle}>Server</Text>
              <Text style={styles.line}>Title: {asString(row.server.title, '-')}</Text>
              <Text style={styles.line}>Priority: {asString(row.server.priority, '-')}</Text>
              <Text style={styles.line}>Description: {asString(row.server.description, '-')}</Text>
            </View>

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => applyServerVersion(row)}>
                <Text style={styles.secondaryButtonText}>Use Server</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => retryLocalVersion(row)}>
                <Text style={styles.secondaryButtonText}>Retry Local</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => openMergeEditor(row)}>
                <Text style={styles.secondaryButtonText}>Merge</Text>
              </Pressable>
            </View>

            {isEditing ? (
              <View style={styles.mergeEditor}>
                <Text style={styles.blockTitle}>Merge Fields</Text>
                <TextInput style={styles.input} value={mergeTitle} onChangeText={setMergeTitle} placeholder="Title" />
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  value={mergeDescription}
                  onChangeText={setMergeDescription}
                  placeholder="Description"
                />
                <View style={styles.row}>
                  {(['low', 'medium', 'high', 'critical'] as const).map((priority) => (
                    <Pressable
                      key={priority}
                      style={[styles.priorityChip, mergePriority === priority && styles.priorityChipActive]}
                      onPress={() => setMergePriority(priority)}
                    >
                      <Text style={[styles.priorityChipText, mergePriority === priority && styles.priorityChipTextActive]}>
                        {priority}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <Pressable style={styles.primaryButton} onPress={applyMerge}>
                    <Text style={styles.primaryButtonText}>Queue Merged Update</Text>
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setEditingConflictId(null)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
    backgroundColor: '#F8FAFC',
    paddingBottom: 28,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
  },
  empty: {
    color: '#64748B',
    marginTop: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '800',
    color: '#0F172A',
  },
  meta: {
    color: '#64748B',
    fontSize: 12,
  },
  comparisonBlock: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
    gap: 3,
    backgroundColor: '#F8FAFC',
  },
  blockTitle: {
    color: '#0F172A',
    fontWeight: '700',
  },
  line: {
    color: '#334155',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  mergeEditor: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  priorityChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priorityChipActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  priorityChipText: {
    color: '#475569',
    textTransform: 'capitalize',
  },
  priorityChipTextActive: {
    color: '#0369A1',
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#0369A1',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cancelButton: {
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#0F172A',
    fontWeight: '700',
  },
})
