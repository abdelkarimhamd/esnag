import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { optimizePickedAsset } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { findLocalSnag, findLocalSnagByServerId, listAttachmentsForSnag, listCommentsForSnag } from '../db/store'
import type { LocalAttachmentRecord, LocalCommentRecord, LocalSnagRecord, SnagStatus } from '../types'
import { enqueueAttachmentUpload, enqueueOfflineCommentCreate, enqueueOfflineSnagTransition } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagDetail'>

const transitionPath: SnagStatus[] = ['new', 'assigned', 'in_progress', 'ready_for_review', 'closed', 'rejected']

export const SnagDetailScreen = ({ route, navigation }: Props) => {
  const { refreshQueueSize } = useSync()
  const [snag, setSnag] = useState<LocalSnagRecord | null>(null)
  const [comments, setComments] = useState<LocalCommentRecord[]>([])
  const [attachments, setAttachments] = useState<LocalAttachmentRecord[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [nextStatus, setNextStatus] = useState<SnagStatus>('assigned')

  const load = useCallback(() => {
    const local = route.params.localId
      ? findLocalSnag(route.params.localId)
      : route.params.serverId
        ? findLocalSnagByServerId(route.params.serverId)
        : null

    if (!local) {
      setSnag(null)
      setComments([])
      setAttachments([])
      return
    }

    setSnag(local)

    if (local.server_id) {
      setComments(listCommentsForSnag(local.server_id))
      setAttachments(listAttachmentsForSnag(local.server_id))
    } else {
      setComments([])
      setAttachments([])
    }
  }, [route.params.localId, route.params.serverId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const queueComment = () => {
    if (!snag?.server_id) {
      Alert.alert('Sync required', 'This snag is not synced yet. Sync first, then add comments.')
      return
    }

    if (!commentBody.trim()) {
      return
    }

    enqueueOfflineCommentCreate({
      snag_server_id: snag.server_id,
      body: commentBody.trim(),
      is_internal: false,
    })
    setCommentBody('')
    refreshQueueSize()
    load()
  }

  const queueTransition = () => {
    if (!snag?.server_id) {
      Alert.alert('Sync required', 'This snag is not synced yet. Status transitions are server-validated.')
      return
    }

    enqueueOfflineSnagTransition(snag.server_id, nextStatus, 'Queued from mobile offline transition')
    refreshQueueSize()
    load()
  }

  const pickMediaAsset = async () => {
    if (!snag?.server_id) {
      Alert.alert('Sync required', 'Attachments require a synced server snag ID.')
      return null
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Media library access is required to attach photos/videos.')
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.72,
      allowsMultipleSelection: false,
    })

    if (result.canceled || result.assets.length === 0) {
      return null
    }

    return result.assets[0]
  }

  const addAttachment = async () => {
    const asset = await pickMediaAsset()
    if (!asset || !snag?.server_id) {
      return
    }

    try {
      const optimized = await optimizePickedAsset(asset)

      enqueueAttachmentUpload({
        snag_server_id: snag.server_id,
        local_uri: optimized.uri,
        file_name: optimized.fileName,
        mime_type: optimized.mimeType,
        file_size: optimized.fileSize,
      })

      refreshQueueSize()
      load()
    } catch (error) {
      Alert.alert('Attachment failed', error instanceof Error ? error.message : 'Unable to queue attachment.')
    }
  }

  const addAnnotatedAttachment = async () => {
    const asset = await pickMediaAsset()
    if (!asset || !snag?.server_id) {
      return
    }

    const fileName = asset.fileName ?? `attachment-${Date.now()}`
    const mimeType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
    const fileSize = Number(asset.fileSize ?? 0)

    navigation.navigate('AnnotateAttachment', {
      snagServerId: snag.server_id,
      assetUri: asset.uri,
      fileName,
      mimeType,
      fileSize,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    })
  }

  if (!snag) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Snag not found locally.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.reference}>{snag.reference ?? 'Offline Draft'}</Text>
      <Text style={styles.title}>{snag.title}</Text>
      <Text style={styles.meta}>
        {snag.status.replaceAll('_', ' ')} | priority {snag.priority} | dirty {snag.is_dirty ? 'yes' : 'no'}
      </Text>
      {snag.description ? <Text style={styles.description}>{snag.description}</Text> : null}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Queue Status Transition</Text>
        <View style={styles.chipWrap}>
          {transitionPath.map((status) => (
            <Pressable key={status} onPress={() => setNextStatus(status)} style={[styles.chip, nextStatus === status && styles.chipActive]}>
              <Text style={[styles.chipText, nextStatus === status && styles.chipTextActive]}>{status.replaceAll('_', ' ')}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.primaryButton} onPress={queueTransition}>
          <Text style={styles.primaryButtonText}>Queue Transition</Text>
        </Pressable>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Comments</Text>
        <TextInput
          placeholder="Add comment"
          style={[styles.input, styles.multiline]}
          multiline
          value={commentBody}
          onChangeText={setCommentBody}
        />
        <Pressable style={styles.secondaryButton} onPress={queueComment}>
          <Text style={styles.secondaryButtonText}>Queue Comment</Text>
        </Pressable>

        <View style={styles.stack}>
          {comments.length === 0 ? <Text style={styles.muted}>No local comments.</Text> : null}
          {comments.map((comment) => (
            <View key={comment.local_id} style={styles.itemCard}>
              <Text style={styles.itemText}>{comment.body}</Text>
              <Text style={styles.itemMeta}>{new Date(comment.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Attachments</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void addAttachment()}>
          <Text style={styles.secondaryButtonText}>Add Attachment (Optimized)</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void addAnnotatedAttachment()}>
          <Text style={styles.secondaryButtonText}>Add + Annotate Offline</Text>
        </Pressable>

        <View style={styles.stack}>
          {attachments.length === 0 ? <Text style={styles.muted}>No local attachments.</Text> : null}
          {attachments.map((attachment) => (
            <View key={attachment.local_id} style={styles.itemCard}>
              <Text style={styles.itemText}>{attachment.file_name}</Text>
              <Text style={styles.itemMeta}>
                {attachment.upload_state} | retries {attachment.retries}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  reference: {
    color: '#0369A1',
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  meta: {
    color: '#475569',
    textTransform: 'capitalize',
  },
  description: {
    color: '#334155',
  },
  block: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: '#0E7490',
    backgroundColor: '#CCFBF1',
  },
  chipText: {
    color: '#475569',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: '#115E59',
    fontWeight: '700',
  },
  input: {
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#0EA5E9',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  stack: {
    gap: 8,
  },
  itemCard: {
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  itemText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  itemMeta: {
    color: '#64748B',
    marginTop: 3,
    fontSize: 12,
  },
  muted: {
    color: '#64748B',
  },
})
