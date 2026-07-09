import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { apiClient, normalizeMobileApiError, type HandoverComment, type HandoverRequestDetail } from '../api/client'
import type { SnagsStackParamList } from '../navigation/types'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { partyTypeLabel, statusMeta } from './HandoverRequestsScreen'

type Props = NativeStackScreenProps<SnagsStackParamList, 'HandoverDetail'>

const REASON_ACTIONS = ['return', 'reject', 'revise']
const GATED_ACTIONS = ['forward', 'approve']
const ACTION_ORDER = ['submit', 'forward', 'approve', 'consolidate', 'comment', 'revise', 'return', 'reject', 'close']
const ACTION_LABEL: Record<string, string> = {
  submit: 'Submit', forward: 'Forward', approve: 'Approve', consolidate: 'Consolidate',
  comment: 'Comment', revise: 'Revise', return: 'Return', reject: 'Reject', close: 'Close',
}

const Label = ({ children }: { children: string }) => {
  const theme = useAppTheme()
  return <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: theme.colors.textMuted, marginBottom: 6 }}>{children}</Text>
}

export const HandoverDetailScreen = ({ route }: Props) => {
  const theme = useAppTheme()
  const { token, activeOrganization } = useAuth()
  const { requestId } = route.params
  const [detail, setDetail] = useState<HandoverRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [comments, setComments] = useState<HandoverComment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentInternal, setCommentInternal] = useState(false)
  const [commentBusy, setCommentBusy] = useState(false)

  const loadComments = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    try {
      const response = await apiClient.listHandoverComments(token, activeOrganization.id, requestId)
      setComments(response.data)
    } catch {
      setComments([])
    }
  }, [token, activeOrganization?.id, requestId])

  const load = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }
    try {
      const response = await apiClient.fetchHandoverRequest(token, activeOrganization.id, requestId)
      setDetail(response.data)
      setError(null)
      void loadComments()
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to load the handover request.').message)
    } finally {
      setLoading(false)
    }
  }, [token, activeOrganization?.id, requestId, loadComments])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const postComment = async () => {
    if (!token || !activeOrganization || !detail || !commentBody.trim()) {
      return
    }
    setCommentBusy(true)
    try {
      await apiClient.postHandoverComment(token, activeOrganization.id, detail.id, commentBody.trim(), commentInternal)
      setCommentBody('')
      setCommentInternal(false)
      await loadComments()
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to post the comment.').message)
    } finally {
      setCommentBusy(false)
    }
  }

  const perform = async (action: string, reason: string | null) => {
    if (!token || !activeOrganization || !detail) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (action === 'submit') await apiClient.submitHandoverRequest(token, activeOrganization.id, detail.id)
      else if (action === 'close') await apiClient.closeHandoverRequest(token, activeOrganization.id, detail.id, reason)
      else await apiClient.actHandoverRequest(token, activeOrganization.id, detail.id, action, reason)
      setPendingAction(null)
      setReasonText('')
      await load()
    } catch (e) {
      setError(normalizeMobileApiError(e, `Unable to ${action} the request.`).message)
    } finally {
      setBusy(false)
    }
  }

  const onAction = (action: string) => {
    if (REASON_ACTIONS.includes(action)) {
      setReasonText('')
      setPendingAction(action)
    } else {
      void perform(action, null)
    }
  }

  const uploadDocument = async () => {
    if (!token || !activeOrganization || !detail) {
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Media library access is required to attach documents.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || result.assets.length === 0) {
      return
    }
    const asset = result.assets[0]
    setUploading(true)
    setError(null)
    try {
      await apiClient.uploadHandoverAttachment(token, activeOrganization.id, detail.id, {
        uri: asset.uri,
        name: asset.fileName ?? `handover-${detail.id}-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      })
      await load()
    } catch (e) {
      setError(normalizeMobileApiError(e, 'Unable to upload the document.').message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}><View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View></SafeAreaView>
  }
  if (!detail) {
    return <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}><View style={styles.centered}><Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans }}>{error ?? 'Not found.'}</Text></View></SafeAreaView>
  }

  const meta = statusMeta(theme, detail.status)
  const summary = detail.summary
  const permitted = summary?.viewer_permitted_actions ?? []
  const gateReady = summary?.gate_ready ?? true
  const snapshot = [...(detail.stage_graph_snapshot ?? [])].sort((a, b) => a.stage_order - b.stage_order)
  const cardSx = { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Overview */}
        <View style={[styles.card, cardSx]}>
          <Text style={{ fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: theme.colors.primary }}>{detail.reference}</Text>
          <Text style={{ fontFamily: theme.fonts.sansBold, fontSize: 17, color: theme.colors.text, marginTop: 3 }}>{detail.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <View style={[styles.chip, { backgroundColor: meta.color + '22' }]}>
              <View style={[styles.dot, { backgroundColor: meta.color }]} />
              <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 11.5, color: meta.color }}>{meta.label}</Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted }}>
              {detail.responsible_company?.name ?? partyTypeLabel(detail.responsible_company?.type)} · cycle {detail.cycle_number}
            </Text>
          </View>
        </View>

        {error ? <Text style={{ color: theme.colors.danger, fontFamily: theme.fonts.sans, fontSize: 12.5 }}>{error}</Text> : null}

        {/* Take action */}
        {permitted.length > 0 && (
          <View style={[styles.card, cardSx]}>
            <Label>TAKE ACTION</Label>
            {!gateReady && (summary?.gate_missing?.length ?? 0) > 0 && (
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.warning, marginBottom: 8 }}>
                Blocked — outstanding: {summary?.gate_missing.join(', ')}.
              </Text>
            )}
            {pendingAction ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: theme.colors.text }}>Reason for {ACTION_LABEL[pendingAction]?.toLowerCase()}</Text>
                <TextInput
                  value={reasonText}
                  onChangeText={setReasonText}
                  placeholder="Explain the decision…"
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  style={[styles.input, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => { setPendingAction(null); setReasonText('') }} style={[styles.btn, { borderWidth: 1, borderColor: theme.colors.border }]}>
                    <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={!reasonText.trim() || busy}
                    onPress={() => void perform(pendingAction, reasonText.trim())}
                    style={[styles.btn, { flex: 1, backgroundColor: theme.colors.primary, opacity: !reasonText.trim() || busy ? 0.5 : 1 }]}
                  >
                    <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansSemiBold, fontSize: 13 }}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ACTION_ORDER.filter((a) => permitted.includes(a)).map((a) => {
                  const disabled = busy || (GATED_ACTIONS.includes(a) && !gateReady)
                  const color = a === 'reject' ? theme.colors.danger : ['return', 'revise'].includes(a) ? theme.colors.warning : a === 'approve' || a === 'close' ? theme.colors.success : a === 'comment' ? theme.colors.surfaceElevated : theme.colors.primary
                  const fg = a === 'comment' ? theme.colors.textMuted : ['return', 'revise', 'reject'].includes(a) ? color : '#fff'
                  return (
                    <Pressable key={a} disabled={disabled} onPress={() => onAction(a)}
                      style={[styles.actionBtn, {
                        backgroundColor: ['return', 'revise', 'reject'].includes(a) ? color + '1F' : a === 'comment' ? theme.colors.surfaceElevated : color,
                        opacity: disabled ? 0.5 : 1,
                      }]}>
                      <Text style={{ color: fg, fontFamily: theme.fonts.sansSemiBold, fontSize: 12.5 }}>{ACTION_LABEL[a]}</Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* Stage tracker */}
        <View style={[styles.card, cardSx]}>
          <Label>{`ROUTING · STAGE ${detail.current_stage_order ?? '—'} OF ${snapshot.length}`}</Label>
          {snapshot.map((s) => {
            const current = s.stage_order === detail.current_stage_order
            const done = detail.current_stage_order != null && s.stage_order < detail.current_stage_order
            const dotColor = current ? theme.colors.primary : (done || detail.status === 'closed') ? theme.colors.success : theme.colors.border
            return (
              <View key={s.stage_order} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dotColor, marginTop: 3 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: current ? theme.fonts.sansBold : theme.fonts.sans, fontSize: 13, color: current ? theme.colors.text : done ? theme.colors.textMuted : theme.colors.textMuted }}>
                    <Text style={{ fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>{s.stage_order}  </Text>{s.name}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, color: theme.colors.textMuted }}>
                    {partyTypeLabel(s.responsible_type)}{s.is_final_authority ? ' · final' : ''}{s.is_loop_back ? ' · loop-back' : ''}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* Documents (C3) */}
        <View style={[styles.card, cardSx]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>DOCUMENTS</Label>
            <Pressable disabled={uploading} onPress={() => void uploadDocument()}
              style={[styles.actionBtn, { backgroundColor: theme.colors.primary, opacity: uploading ? 0.5 : 1 }]}>
              <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansSemiBold, fontSize: 12 }}>{uploading ? 'Uploading…' : '+ Upload'}</Text>
            </Pressable>
          </View>
          {(detail.attachments ?? []).length === 0 ? (
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12, color: theme.colors.textMuted, marginTop: 4 }}>No documents uploaded yet.</Text>
          ) : (
            (detail.attachments ?? []).map((att) => (
              <View key={att.id} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 12.5, color: theme.colors.text }} numberOfLines={1}>{att.original_name}</Text>
                <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>
                  {`cycle ${att.cycle_number}`}{att.uploader?.name ? `  ·  ${att.uploader.name}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Discussion by stage / org (F2) */}
        <View style={[styles.card, cardSx]}>
          <Label>DISCUSSION · BY STAGE</Label>
          {comments.length === 0 ? (
            <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12, color: theme.colors.textMuted, marginTop: 4 }}>No comments yet.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 12.5, color: theme.colors.text }}>
                  {c.user?.name ?? 'User'}
                  {c.source_company?.name ? <Text style={{ fontFamily: theme.fonts.sans, color: theme.colors.textMuted }}>{`  ·  ${c.source_company.name}`}</Text> : null}
                  {c.is_internal ? <Text style={{ fontFamily: theme.fonts.mono, fontSize: 9, color: theme.colors.warning }}>{'   INTERNAL'}</Text> : null}
                </Text>
                <Text style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 }}>{c.body}</Text>
                {c.stage_order != null ? (
                  <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>{`stage ${c.stage_order}`}</Text>
                ) : null}
              </View>
            ))
          )}
          <TextInput
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder="Add a comment…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={[styles.input, { marginTop: 10, backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.sans }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Pressable onPress={() => setCommentInternal((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: commentInternal ? theme.colors.primary : theme.colors.border, backgroundColor: commentInternal ? theme.colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {commentInternal ? <Text style={{ color: theme.colors.primaryContrast, fontSize: 10 }}>✓</Text> : null}
              </View>
              <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.textMuted }}>Internal to my party</Text>
            </Pressable>
            <Pressable disabled={commentBusy || !commentBody.trim()} onPress={() => void postComment()}
              style={[styles.actionBtn, { backgroundColor: theme.colors.primary, opacity: commentBusy || !commentBody.trim() ? 0.5 : 1 }]}>
              <Text style={{ color: theme.colors.primaryContrast, fontFamily: theme.fonts.sansSemiBold, fontSize: 12 }}>Post</Text>
            </Pressable>
          </View>
        </View>

        {/* Audit */}
        <View style={[styles.card, cardSx]}>
          <Label>ACTIVITY &amp; AUDIT</Label>
          {(detail.events ?? []).map((ev) => (
            <View key={ev.id} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <Text style={{ fontFamily: theme.fonts.sansSemiBold, fontSize: 12.5, color: theme.colors.text, textTransform: 'capitalize' }}>
                {String(ev.action).replace('_', ' ')}
                {ev.actor?.name ? <Text style={{ fontFamily: theme.fonts.sans, color: theme.colors.textMuted }}>{`  ·  ${ev.actor.name}`}</Text> : null}
              </Text>
              {ev.reason ? <Text style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 }}>“{ev.reason}”</Text> : null}
              {ev.prior_stage_order != null && ev.new_stage_order != null && ev.prior_stage_order !== ev.new_stage_order ? (
                <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>{`stage ${ev.prior_stage_order} → ${ev.new_stage_order}`}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actionBtn: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 11, padding: 12, minHeight: 76, textAlignVertical: 'top', fontSize: 14 },
})
