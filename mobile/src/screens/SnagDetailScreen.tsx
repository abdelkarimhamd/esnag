import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Image, Pressable, Text, View } from 'react-native'
import { apiClient } from '../api/client'
import { optimizePickedAsset } from '../attachments/processing'
import type { SnagsStackParamList } from '../navigation/types'
import { findLocalSnag, findLocalSnagByServerId, listAttachmentsForSnag, listCommentsForSnag } from '../db/store'
import { useAuth } from '../providers/AuthProvider'
import type {
  LocalAttachmentRecord,
  LocalCommentRecord,
  LocalSnagRecord,
  OrganizationMemberRecord,
  SnagStatus,
} from '../types'
import {
  enqueueAttachmentUpload,
  enqueueOfflineCommentCreate,
  enqueueOfflineSnagTransition,
  enqueueOfflineSnagUpdate,
} from '../sync/operations'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { priorityMeta, statusMeta } from '../theme/tokens'
import {
  Button,
  Card,
  EmptyState,
  ListItem,
  ScreenContainer,
  SectionHeader,
  Select,
  StatusPill,
  TextField,
  formatStatusLabel,
} from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'SnagDetail'>

// Legal status transitions keyed by the snag's CURRENT status. Keep in sync
// with backend/app/Support/SnagWorkflow.php (the server re-validates anyway).
const TRANSITIONS: Record<SnagStatus, SnagStatus[]> = {
  new: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['ready_for_review', 'rejected'],
  ready_for_review: ['closed', 'in_progress', 'rejected'],
  rejected: ['assigned'],
  closed: [],
}

// Lifecycle stepper order — mirrors web/src/components/SnagDrawer.jsx
// LIFECYCLE_STEPS (ready_for_review renders as "Review").
const LIFECYCLE_STEPS: Array<{ status: SnagStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'ready_for_review', label: 'Review' },
  { status: 'closed', label: 'Closed' },
]

const DLP_NOTE_MIN_LENGTH = 30

// Two-letter mono initials for avatars, matching the SnagCard / web avatar idiom.
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || '?'

// Amber DLP marker shown next to the snag reference, mirroring the web badge.
const DlpBadge = () => {
  const theme = useAppTheme()
  return (
    <View
      style={{
        backgroundColor: theme.isDark ? 'rgba(217,169,78,0.16)' : 'rgba(192,138,35,0.13)',
        borderRadius: theme.radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: theme.colors.warning, fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 0.8 }}>
        DLP
      </Text>
    </View>
  )
}

// Metadata key/value row — mono label, semibold value (frame-2d metadata card /
// web SnagDrawer §3.5). Optional `valueColor` tints the value (e.g. overdue red).
const MetaRow = ({
  label,
  value,
  valueNode,
  mono = false,
  first = false,
  valueColor,
}: {
  label: string
  value?: string
  valueNode?: ReactNode
  mono?: boolean
  first?: boolean
  valueColor?: string
}) => {
  const theme = useAppTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 11,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.colors.divider,
      }}
    >
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: 11 }}>{label}</Text>
      {valueNode ?? (
        <Text
          style={{
            color: valueColor ?? theme.colors.text,
            fontFamily: mono ? theme.fonts.monoSemiBold : theme.fonts.sansSemiBold,
            fontSize: 13,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {value}
        </Text>
      )}
    </View>
  )
}

// Compact 5-step lifecycle position indicator — connected nodes matching frame-2d.
// A rejected snag sits outside the happy path, so no node is active.
const LifecycleStepper = ({ status }: { status: SnagStatus }) => {
  const theme = useAppTheme()
  const currentIndex = LIFECYCLE_STEPS.findIndex((step) => step.status === status)

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {LIFECYCLE_STEPS.map((step, index) => {
          const done = currentIndex >= 0 && index < currentIndex
          const active = index === currentIndex
          return (
            <View key={step.status} style={{ flexDirection: 'row', alignItems: 'center', flex: index === 0 ? 0 : 1 }}>
              {index > 0 ? (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: index <= currentIndex ? theme.colors.primary : theme.colors.border,
                  }}
                />
              ) : null}
              <View
                style={{
                  width: active ? 22 : 20,
                  height: active ? 22 : 20,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? theme.colors.primary : active ? theme.colors.secondary : theme.colors.surface,
                  borderWidth: done || active ? 0 : 2,
                  borderColor: theme.colors.border,
                }}
              >
                {done ? (
                  <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.sansBold, fontSize: 11 }}>✓</Text>
                ) : active ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {LIFECYCLE_STEPS.map((step, index) => {
          const active = index === currentIndex
          const done = currentIndex >= 0 && index < currentIndex
          return (
            <Text
              key={step.status}
              style={{
                flex: 1,
                textAlign: index === 0 ? 'left' : index === LIFECYCLE_STEPS.length - 1 ? 'right' : 'center',
                color: active ? theme.colors.secondary : done ? theme.colors.textMuted : theme.colors.border,
                fontFamily: active ? theme.fonts.sansSemiBold : theme.fonts.sans,
                fontSize: 10,
              }}
            >
              {step.label}
            </Text>
          )
        })}
      </View>
    </View>
  )
}

export const SnagDetailScreen = ({ route, navigation }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const { refreshQueueSize } = useSync()
  const [snag, setSnag] = useState<LocalSnagRecord | null>(null)
  const [comments, setComments] = useState<LocalCommentRecord[]>([])
  const [attachments, setAttachments] = useState<LocalAttachmentRecord[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [nextStatus, setNextStatus] = useState<SnagStatus | null>(null)
  const [transitionNote, setTransitionNote] = useState('')
  const [closeoutPct, setCloseoutPct] = useState<number | null>(null)
  const [members, setMembers] = useState<OrganizationMemberRecord[] | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)

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

  const isDlp = Boolean(snag?.is_dlp)
  const priority = snag ? priorityMeta(snag.priority) : null

  // Legal targets for the current status; 'assigned' needs someone to assign
  // to, so it is hidden while the snag has no assignee (web parity).
  const availableTransitions = useMemo<SnagStatus[]>(() => {
    if (!snag) {
      return []
    }
    return TRANSITIONS[snag.status].filter((target) => target !== 'assigned' || snag.assigned_to != null)
  }, [snag])

  useEffect(() => {
    setNextStatus((current) => (current && availableTransitions.includes(current) ? current : availableTransitions[0] ?? null))
  }, [availableTransitions])

  const dlpReopenPending = isDlp && nextStatus === 'rejected'
  const reworkNoteLength = transitionNote.trim().length
  const dlpNoteTooShort = dlpReopenPending && reworkNoteLength < DLP_NOTE_MIN_LENGTH

  // Online enhancement: closeout completion summary. Offline or 404 → hidden.
  const loadCloseout = useCallback(async () => {
    if (!snag?.server_id || !token || !activeOrganization) {
      setCloseoutPct(null)
      return
    }

    try {
      const response = await apiClient.fetchSnagCloseout(token, activeOrganization.id, snag.server_id)
      const completion = response.data ? response.data.completion_percentage : null
      setCloseoutPct(typeof completion === 'number' ? completion : null)
    } catch {
      setCloseoutPct(null)
    }
  }, [activeOrganization, snag?.server_id, token])

  useEffect(() => {
    void loadCloseout()
  }, [loadCloseout])

  const assigneeName = useMemo(() => {
    if (!snag?.assigned_to) {
      return 'Unassigned'
    }
    const member = members?.find((candidate) => candidate.id === snag.assigned_to)
    return member ? member.name : `Member #${snag.assigned_to}`
  }, [members, snag?.assigned_to])

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

    if (!nextStatus) {
      return
    }

    if (dlpNoteTooShort) {
      Alert.alert(
        'Rework comment required',
        `DLP snags need a rework comment of at least ${DLP_NOTE_MIN_LENGTH} characters before they can be reopened.`,
      )
      return
    }

    const note = transitionNote.trim()
    enqueueOfflineSnagTransition(snag.server_id, nextStatus, note ? note : undefined)
    setTransitionNote('')
    refreshQueueSize()
    load()
  }

  // Online enhancement: reassignment. Loading the member list needs a network
  // round-trip; the assignment itself is queued offline-first.
  const toggleReassign = async () => {
    if (!snag?.server_id) {
      Alert.alert('Sync required', 'This snag is not synced yet. Reassign after the first sync.')
      return
    }

    if (memberPickerOpen) {
      setMemberPickerOpen(false)
      return
    }

    if (members) {
      setMemberPickerOpen(true)
      return
    }

    if (!token || !activeOrganization) {
      Alert.alert('Offline', 'Reassigning needs a connection to load the member list. Try again once online.')
      return
    }

    setMembersLoading(true)
    try {
      const response = await apiClient.fetchOrganizationMembers(token, activeOrganization.id, snag.project_id)
      setMembers(response.data)
      setMemberPickerOpen(true)
    } catch {
      Alert.alert('Offline', 'Reassigning needs a connection to load the member list. Try again once online.')
    } finally {
      setMembersLoading(false)
    }
  }

  const applyAssignee = (memberId: number | null) => {
    if (!snag?.server_id) {
      return
    }

    enqueueOfflineSnagUpdate(snag.server_id, { assigned_to: memberId })
    setMemberPickerOpen(false)
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

  const closeoutBlocksClose = closeoutPct !== null && closeoutPct < 100 && availableTransitions.includes('closed')
  const meta = statusMeta(snag.status, theme.isDark)
  const imageAttachments = attachments.filter((attachment) => attachment.mime_type.startsWith('image/'))

  // Location line built from the building/floor/location codes the record carries.
  const locationParts: string[] = []
  if (snag.building_id != null) {
    locationParts.push(`Bldg ${snag.building_id}`)
  }
  if (snag.floor_id != null) {
    locationParts.push(`Flr ${snag.floor_id}`)
  }
  if (snag.location_id != null) {
    locationParts.push(`Loc ${snag.location_id}`)
  }
  const locationLine = locationParts.join(' · ')

  return (
    <ScreenContainer scroll>
      {/* Reference + status band — frame-2d fixed header (back chevron/bell live
          in the native stack header, so we render the reference row + pill here). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 1 }}>
          <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.monoSemiBold, fontSize: 14 }}>
            {snag.reference ?? 'Offline draft'}
          </Text>
          {isDlp ? <DlpBadge /> : null}
          {snag.is_dirty ? (
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 12 }}>• Pending sync</Text>
          ) : null}
        </View>
        <StatusPill status={snag.status} />
      </View>

      {/* Evidence hero — frame-2d 172px media band with status overlay + carousel
          dots. Thumbnails come from local image attachments (offline-first). */}
      <View
        style={{
          height: 172,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {imageAttachments.length > 0 ? (
          <Image source={{ uri: imageAttachments[0].local_uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 13 }}>No evidence yet</Text>
        )}

        {/* Status overlay pill, bottom-left (frame-2d). */}
        <View
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingHorizontal: 11,
            paddingVertical: 5,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.overlay,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: meta.dot }} />
          <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.sansSemiBold, fontSize: 11.5 }}>
            {formatStatusLabel(snag.status)}
          </Text>
        </View>

        {/* Carousel dots, bottom-right — one per image attachment (frame-2d). */}
        {imageAttachments.length > 1 ? (
          <View style={{ position: 'absolute', right: 14, bottom: 14, flexDirection: 'row', gap: 5 }}>
            {imageAttachments.slice(0, 6).map((attachment, index) => (
              <View
                key={attachment.local_id}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* Title + priority pill + location — frame-2d. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <Text
          style={{
            flex: 1,
            color: theme.colors.text,
            fontFamily: theme.fonts.sansBold,
            fontSize: 19,
            lineHeight: 24,
            letterSpacing: -0.2,
          }}
        >
          {snag.title}
        </Text>
        {priority ? (
          <View
            style={{
              marginTop: 3,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.radius.pill,
              backgroundColor: `${priority.color}22`,
            }}
          >
            <Text style={{ color: priority.color, fontFamily: theme.fonts.sansSemiBold, fontSize: 11 }}>{priority.label}</Text>
          </View>
        ) : null}
      </View>
      {locationLine ? (
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 12.5, marginTop: -4 }}>
          {locationLine}
        </Text>
      ) : null}
      {snag.server_id ? (
        <Pressable
          onPress={() =>
            navigation.navigate('SnagInspection', {
              snagServerId: snag.server_id as number,
              reference: snag.reference ?? undefined,
              title: snag.title,
              status: snag.status,
              projectId: snag.project_id ?? null,
            })
          }
          style={{
            marginTop: 4,
            alignSelf: 'flex-start',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.sansSemiBold, fontSize: 12.5 }}>Inspect asset →</Text>
        </Pressable>
      ) : null}
      {snag.description ? (
        <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.sans, fontSize: 13.5, lineHeight: 20 }}>
          {snag.description}
        </Text>
      ) : null}

      {/* Lifecycle stepper — frame-2d connected node track. */}
      <Card elevated>
        <LifecycleStepper status={snag.status} />
      </Card>

      {/* Metadata card — frame-2d Assignee / Due date / Closeout rows. */}
      <Card elevated style={{ paddingVertical: 4, gap: 0 }}>
        <MetaRow
          first
          label="Assignee"
          valueNode={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {snag.assigned_to != null ? (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: theme.colors.success,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.monoSemiBold, fontSize: 8.5 }}>
                    {initialsOf(assigneeName)}
                  </Text>
                </View>
              ) : null}
              <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>
                {assigneeName}
              </Text>
            </View>
          }
        />
        {snag.trade ? <MetaRow label="Discipline" value={snag.trade} /> : null}
        {isDlp ? (
          <>
            <MetaRow label="DLP" value="Defects Liability Period" />
            <MetaRow label="Cluster" value={snag.cluster ?? '—'} />
            <MetaRow label="TOC" value={snag.toc_reference ?? '—'} mono />
          </>
        ) : null}
        {snag.due_date ? (
          <MetaRow label="Due date" value={new Date(snag.due_date).toLocaleDateString()} mono />
        ) : null}
        {closeoutPct !== null ? (
          <MetaRow
            label="Closeout"
            valueNode={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 60,
                    height: 6,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.surfaceElevated,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, closeoutPct))}%`,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.warning,
                    }}
                  />
                </View>
                <Text style={{ color: theme.colors.warning, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>
                  {`${closeoutPct}%`}
                </Text>
              </View>
            }
          />
        ) : null}
      </Card>

      {/* Reassign — preserved online-first member picker. */}
      <Card elevated>
        <SectionHeader title="Assignment" />
        <Button
          label={memberPickerOpen ? 'Close member list' : 'Reassign'}
          variant="secondary"
          size="sm"
          loading={membersLoading}
          onPress={() => void toggleReassign()}
        />
        {memberPickerOpen && members ? (
          <View style={{ gap: 8 }}>
            {members.length === 0 ? (
              <EmptyState title="No members" message="No organization members are available for this project." />
            ) : (
              <>
                <ListItem
                  title="Unassigned"
                  subtitle="Remove the current assignee"
                  selected={snag.assigned_to == null}
                  onPress={() => applyAssignee(null)}
                />
                {members.map((member) => (
                  <ListItem
                    key={member.id}
                    title={member.name}
                    subtitle={member.email}
                    selected={snag.assigned_to === member.id}
                    onPress={() => applyAssignee(member.id)}
                  />
                ))}
              </>
            )}
          </View>
        ) : null}
      </Card>

      {/* Comments — frame-2d avatar + name + date + body thread. */}
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
          <View style={{ gap: 14 }}>
            {comments.map((comment) => (
              <View key={comment.local_id} style={{ flexDirection: 'row', gap: 11 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.monoSemiBold, fontSize: 10 }}>
                    {initialsOf(comment.body)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>
                    {new Date(comment.created_at).toLocaleString()}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.fonts.sans,
                      fontSize: 12.5,
                      lineHeight: 18,
                      marginTop: 2,
                    }}
                  >
                    {comment.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Attachments — evidence list + capture entries (Add / Add + Annotate). */}
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

      {/* Take action — frame-2d "Move to <next>" primary action, keeping the
          server-validated transition Select + note + DLP reopen gate. */}
      <Card elevated>
        <SectionHeader title="Take Action" subtitle="Queue server-validated status transitions." />
        {availableTransitions.length === 0 ? (
          <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 13 }}>
            {snag.status === 'closed'
              ? 'This snag is closed — no further transitions.'
              : 'No transitions available. Assign the snag to unlock the next step.'}
          </Text>
        ) : (
          <>
            <Select
              label="Next status"
              value={nextStatus}
              onChange={(value) => setNextStatus(value as SnagStatus)}
              options={availableTransitions.map((status) => ({ value: status, label: formatStatusLabel(status) }))}
            />
            <TextField
              label={dlpReopenPending ? `Rework comment (required, min ${DLP_NOTE_MIN_LENGTH} chars)` : 'Transition note (optional)'}
              placeholder={dlpReopenPending ? 'Explain the rework required…' : 'Add context for this transition…'}
              value={transitionNote}
              onChangeText={setTransitionNote}
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
              helperText={
                dlpReopenPending && !dlpNoteTooShort
                  ? `${reworkNoteLength}/${DLP_NOTE_MIN_LENGTH} characters`
                  : undefined
              }
              errorText={
                dlpNoteTooShort
                  ? `${reworkNoteLength}/${DLP_NOTE_MIN_LENGTH} characters — explain the rework required`
                  : null
              }
            />
            {closeoutBlocksClose ? (
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sans, fontSize: 12 }}>
                Closeout must be 100% complete before closing.
              </Text>
            ) : null}
            <Button
              label={
                dlpReopenPending
                  ? 'Reopen for rework'
                  : nextStatus
                    ? `Move to ${formatStatusLabel(nextStatus)}`
                    : 'Queue Transition'
              }
              variant={dlpReopenPending ? 'danger' : 'primary'}
              disabled={!nextStatus || dlpNoteTooShort}
              onPress={queueTransition}
            />
          </>
        )}
      </Card>
    </ScreenContainer>
  )
}
