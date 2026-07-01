import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { optimizePickedAsset } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { findLocalSnag, findLocalSnagByServerId, listAttachmentsForSnag, listCommentsForSnag } from '../db/store'
import type { LocalAttachmentRecord, LocalCommentRecord, LocalSnagRecord, SnagStatus } from '../types'
import { enqueueAttachmentUpload, enqueueOfflineCommentCreate, enqueueOfflineSnagTransition } from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, Select, StatusPill, TextField } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagDetail'>

const transitionPath: SnagStatus[] = ['new', 'assigned', 'in_progress', 'ready_for_review', 'closed', 'rejected']

export const SnagDetailScreen = ({ route, navigation }: Props) => {
  const theme = useAppTheme()
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
      <ScreenContainer>
        <EmptyState title="Snag not found" message="The selected snag is not available in local storage." />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer scroll>
      <SectionHeader
        title={snag.title}
        subtitle={snag.reference ?? 'Offline draft'}
        right={<StatusPill label={snag.status.replaceAll('_', ' ')} tone={snag.status === 'closed' ? 'success' : 'info'} />}
      />
      <Text style={{ color: theme.colors.textMuted }}>
        Priority {snag.priority} • Dirty {snag.is_dirty ? 'yes' : 'no'}
      </Text>
      {snag.description ? <Text style={{ color: theme.colors.text }}>{snag.description}</Text> : null}

      <Card elevated>
        <SectionHeader title="Take Action" subtitle="Queue server-validated status transitions." />
        <Select
          value={nextStatus}
          onChange={(value) => setNextStatus(value as SnagStatus)}
          options={transitionPath.map((status) => ({ value: status, label: status.replaceAll('_', ' ') }))}
        />
        <Button label="Queue Transition" onPress={queueTransition} />
      </Card>

      <Card elevated>
        <SectionHeader title="Comments" subtitle={`${comments.length} local`} />
        <TextField
          placeholder="Add comment"
          value={commentBody}
          onChangeText={setCommentBody}
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
        <Button label="Queue Comment" variant="secondary" onPress={queueComment} />
        {comments.length === 0 ? (
          <EmptyState title="No comments" message="Sync first, then add discussion comments." />
        ) : (
          <View style={{ gap: 8 }}>
            {comments.map((comment) => (
              <ListItem
                key={comment.local_id}
                title={comment.body}
                subtitle={new Date(comment.created_at).toLocaleString()}
              />
            ))}
          </View>
        )}
      </Card>

      <Card elevated>
        <SectionHeader title="Attachments" subtitle={`${attachments.length} local`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Add Attachment" variant="secondary" size="sm" onPress={() => void addAttachment()} />
          <Button label="Add + Annotate" variant="secondary" size="sm" onPress={() => void addAnnotatedAttachment()} />
        </View>
        {attachments.length === 0 ? (
          <EmptyState title="No attachments" message="Attachments are queued and uploaded during sync." />
        ) : (
          <View style={{ gap: 8 }}>
            {attachments.map((attachment) => (
              <ListItem
                key={attachment.local_id}
                title={attachment.file_name}
                subtitle={`${attachment.upload_state} • retries ${attachment.retries}`}
              />
            ))}
          </View>
        )}
      </Card>
    </ScreenContainer>
  )
}
