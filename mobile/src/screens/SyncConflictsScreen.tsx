import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { listPendingSyncConflicts, parseConflictPayload, resolveSyncConflict, updateLocalSnagFromConflict } from '../db/store'
import { enqueueOfflineSnagUpdate } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import type { SnagPriority, SyncConflictRecord } from '../types'
import { Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, Select, StatusPill, TextField } from '../ui'

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
  const theme = useAppTheme()
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
        return { conflict, local, server }
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
    resolveSyncConflict(row.conflict.id, 'keep_mine')
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
    <ScreenContainer scroll>
      <SectionHeader
        title="Sync Conflicts"
        subtitle="Choose Use server, Keep mine, or Review fields for each conflict."
      />
      {conflictRows.length === 0 ? (
        <EmptyState title="No pending conflicts" message="Your offline queue and server state are currently aligned." />
      ) : (
        conflictRows.map((row) => {
          const isEditing = editingConflictId === row.conflict.id
          return (
            <Card key={row.conflict.id} elevated>
              <SectionHeader title={`Conflict #${row.conflict.id}`} subtitle={row.conflict.operation_type} right={<StatusPill label="pending" tone="warning" />} />

              <ListItem
                title="Local version"
                subtitle={`Title: ${asString(row.local.title, '-')} • Priority: ${asString(row.local.priority, '-')}`}
              />
              <ListItem
                title="Server version"
                subtitle={`Title: ${asString(row.server.title, '-')} • Priority: ${asString(row.server.priority, '-')}`}
              />
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                Local description: {asString(row.local.description, '-')}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                Server description: {asString(row.server.description, '-')}
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Use Server" variant="secondary" size="sm" onPress={() => applyServerVersion(row)} />
                <Button label="Keep Mine" variant="secondary" size="sm" onPress={() => retryLocalVersion(row)} />
                <Button label="Review Fields" variant="ghost" size="sm" onPress={() => openMergeEditor(row)} />
              </View>

              {isEditing ? (
                <Card>
                  <SectionHeader title="Merge Fields" />
                  <TextField label="Title" value={mergeTitle} onChangeText={setMergeTitle} />
                  <TextField
                    label="Description"
                    value={mergeDescription}
                    onChangeText={setMergeDescription}
                    multiline
                    style={{ minHeight: 74, textAlignVertical: 'top' }}
                  />
                  <Select
                    label="Priority"
                    value={mergePriority}
                    onChange={(value) => setMergePriority(value as SnagPriority)}
                    options={(['low', 'medium', 'high', 'critical'] as const).map((priority) => ({ value: priority, label: priority }))}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Button label="Queue Merged Update" size="sm" onPress={applyMerge} />
                    <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditingConflictId(null)} />
                  </View>
                </Card>
              ) : null}
            </Card>
          )
        })
      )}
    </ScreenContainer>
  )
}
