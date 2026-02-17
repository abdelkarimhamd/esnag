import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useFeatureTour } from '../hooks/useFeatureTour'
import type {
  CloseoutInstance,
  CloseoutInstanceItem,
  CloseoutTemplate,
  Snag,
  SnagComment,
  SnagStatus,
  StakeholderCompany,
  StakeholderTeam,
  UserSummary,
} from '../types'

const transitionMap: Record<SnagStatus, SnagStatus[]> = {
  new: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['ready_for_review', 'rejected'],
  ready_for_review: ['closed', 'in_progress', 'rejected'],
  closed: [],
  rejected: ['assigned'],
}

interface SnagDrawerProps {
  snagId: number | null
  members: UserSummary[]
  companies: StakeholderCompany[]
  teams: StakeholderTeam[]
  canTransition: boolean
  canAssign: boolean
  canComment: boolean
  canAttach: boolean
  canCloseoutView?: boolean
  canCloseoutUpdate?: boolean
  canCloseoutReview?: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}

const errorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    const details = response?.data?.errors
    const firstError = details ? Object.values(details).flat().at(0) : null
    return firstError ?? response?.data?.message ?? fallback
  }

  return fallback
}

export const SnagDrawer = ({
  snagId,
  members,
  companies,
  teams,
  canTransition,
  canAssign,
  canComment,
  canAttach,
  canCloseoutView = false,
  canCloseoutUpdate = false,
  canCloseoutReview = false,
  onClose,
  onChanged,
}: SnagDrawerProps) => {
  const [snag, setSnag] = useState<Snag | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transitionTo, setTransitionTo] = useState<SnagStatus | ''>('')
  const [transitionNote, setTransitionNote] = useState('')
  const [transitionAssigneeId, setTransitionAssigneeId] = useState<string>('')
  const [transitionCompanyId, setTransitionCompanyId] = useState<string>('')
  const [transitionTeamId, setTransitionTeamId] = useState<string>('')
  const [commentBody, setCommentBody] = useState('')
  const [commentParentId, setCommentParentId] = useState<number | null>(null)
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([])
  const [mentionTeamIds, setMentionTeamIds] = useState<string[]>([])
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [watcherUserId, setWatcherUserId] = useState<string>('')
  const [attachmentType, setAttachmentType] = useState<'photo' | 'video' | 'markup'>('photo')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [closeout, setCloseout] = useState<CloseoutInstance | null>(null)
  const [templates, setTemplates] = useState<CloseoutTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({})
  const [evidenceFiles, setEvidenceFiles] = useState<Record<number, File | null>>({})
  const [busy, setBusy] = useState(false)

  const open = Boolean(snagId)
  const closeoutTourSteps = useMemo(
    () => [
      {
        id: 'closeout_panel',
        title: 'Closeout Tab',
        text: 'Each snag can run through a closeout checklist before closure.',
        attachTo: { element: '#closeout-panel', on: 'left' as const },
      },
      {
        id: 'closeout_template',
        title: 'Template Selection',
        text: 'Pick project or trade template defaults to seed checklist items.',
        attachTo: { element: '#closeout-template', on: 'left' as const },
      },
      {
        id: 'closeout_checklist',
        title: 'Checklist and Evidence',
        text: 'Mark required items and upload evidence to reach full completion.',
        attachTo: { element: '#closeout-checklist', on: 'left' as const },
      },
      {
        id: 'closeout_completion',
        title: 'Completion Guard',
        text: 'Snag closure is blocked until required closeout is fully satisfied.',
        attachTo: { element: '#closeout-completion', on: 'left' as const },
      },
    ],
    [],
  )

  useFeatureTour({
    tourKey: 'closeout',
    enabled: open && canCloseoutView && Boolean(snag),
    steps: closeoutTourSteps,
  })

  const loadSnag = async () => {
    if (!snagId) {
      setSnag(null)
      return
    }

    try {
      const response = await api.get<{ data: Snag }>(`/api/snags/${snagId}`)
      const loaded = response.data.data
      setSnag(loaded)
      setTransitionTo('')
      setTransitionNote('')
      setTransitionAssigneeId(loaded.assigned_to ? String(loaded.assigned_to) : '')
      setTransitionCompanyId(loaded.assigned_company_id ? String(loaded.assigned_company_id) : '')
      setTransitionTeamId(loaded.assigned_team_id ? String(loaded.assigned_team_id) : '')
      setCommentParentId(null)
      setMentionUserIds([])
      setMentionTeamIds([])
      setCommentFiles([])
      setWatcherUserId('')
      setError(null)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load snag details.'))
    }
  }

  const loadCloseout = async () => {
    if (!snagId || !canCloseoutView) {
      setCloseout(null)
      setTemplates([])
      return
    }

    try {
      const response = await api.get<{ data: CloseoutInstance | null; meta?: { templates?: CloseoutTemplate[] } }>(
        `/api/snags/${snagId}/closeout`,
      )
      const loaded = response.data.data
      const availableTemplates = response.data.meta?.templates ?? []

      setCloseout(loaded)
      setTemplates(availableTemplates)
      setSelectedTemplateId(String(loaded?.closeout_template_id ?? availableTemplates.find((item) => item.is_default)?.id ?? ''))

      const seededNotes: Record<number, string> = {}
      ;(loaded?.items ?? []).forEach((item) => {
        seededNotes[item.id] = item.notes ?? ''
      })
      setItemNotes(seededNotes)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load closeout data.'))
    }
  }

  useEffect(() => {
    void Promise.all([loadSnag(), loadCloseout()])
  }, [snagId, canCloseoutView])

  const availableTransitions = useMemo(() => {
    if (!snag) {
      return []
    }

    return transitionMap[snag.status]
  }, [snag])

  const availableTeams = useMemo(() => {
    if (!transitionCompanyId) {
      return teams
    }

    return teams.filter((team) => !team.company_id || team.company_id === Number(transitionCompanyId))
  }, [teams, transitionCompanyId])

  const watcherUsers = useMemo(() => {
    if (!snag) {
      return []
    }

    const direct = snag.watcherUsers ?? snag.watcher_users ?? []
    if (direct.length > 0) {
      return direct
    }

    return (snag.watchers ?? [])
      .map((watcher) => watcher.user)
      .filter((user): user is UserSummary => Boolean(user))
  }, [snag])

  const applyTransition = async () => {
    if (!snag || !transitionTo) {
      return
    }

    setBusy(true)

    try {
      await api.post(`/api/snags/${snag.id}/transition`, {
        to_status: transitionTo,
        note: transitionNote || undefined,
        assigned_to: canAssign && transitionAssigneeId ? Number(transitionAssigneeId) : undefined,
      })

      await Promise.all([loadSnag(), loadCloseout(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Transition failed.'))
    } finally {
      setBusy(false)
    }
  }

  const saveAssignment = async () => {
    if (!snag || !canAssign) {
      return
    }

    setBusy(true)

    try {
      await api.put(`/api/snags/${snag.id}`, {
        assigned_to: transitionAssigneeId ? Number(transitionAssigneeId) : null,
        assigned_company_id: transitionCompanyId ? Number(transitionCompanyId) : null,
        assigned_team_id: transitionTeamId ? Number(transitionTeamId) : null,
      })

      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to update stakeholder assignment.'))
    } finally {
      setBusy(false)
    }
  }

  const dispatchToPerson = async () => {
    if (!snag || !canAssign || !transitionAssigneeId) {
      return
    }

    setBusy(true)

    try {
      await api.post(`/api/snags/${snag.id}/dispatch`, {
        assigned_to: Number(transitionAssigneeId),
        note: transitionNote || undefined,
      })

      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to dispatch snag to person.'))
    } finally {
      setBusy(false)
    }
  }

  const addComment = async () => {
    if (!snag || !commentBody.trim()) {
      return
    }

    setBusy(true)

    try {
      const payloadUsesMultipart = commentFiles.length > 0
      if (payloadUsesMultipart) {
        const payload = new FormData()
        payload.append('body', commentBody)
        if (commentParentId) {
          payload.append('parent_id', String(commentParentId))
        }
        mentionUserIds.forEach((id) => payload.append('mention_user_ids[]', id))
        mentionTeamIds.forEach((id) => payload.append('mention_team_ids[]', id))
        commentFiles.forEach((file) => payload.append('attachments[]', file))

        await api.post(`/api/snags/${snag.id}/comments`, payload, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
      } else {
        await api.post(`/api/snags/${snag.id}/comments`, {
          body: commentBody,
          parent_id: commentParentId ?? undefined,
          mention_user_ids: mentionUserIds.length > 0 ? mentionUserIds.map((id) => Number(id)) : undefined,
          mention_team_ids: mentionTeamIds.length > 0 ? mentionTeamIds.map((id) => Number(id)) : undefined,
        })
      }

      setCommentBody('')
      setCommentParentId(null)
      setMentionUserIds([])
      setMentionTeamIds([])
      setCommentFiles([])
      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to add comment.'))
    } finally {
      setBusy(false)
    }
  }

  const addWatcher = async () => {
    if (!snag || !watcherUserId) {
      return
    }

    setBusy(true)

    try {
      await api.post(`/api/snags/${snag.id}/watchers`, {
        user_id: Number(watcherUserId),
      })
      setWatcherUserId('')
      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to add watcher.'))
    } finally {
      setBusy(false)
    }
  }

  const removeWatcher = async (userId: number) => {
    if (!snag) {
      return
    }

    setBusy(true)

    try {
      await api.delete(`/api/snags/${snag.id}/watchers/${userId}`)
      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to remove watcher.'))
    } finally {
      setBusy(false)
    }
  }

  const renderCommentThread = (comment: SnagComment, depth = 0): ReactNode => (
    <Box key={comment.id} sx={{ border: '1px solid #E2E8F0', borderRadius: 1.5, p: 1.2, ml: depth * 2 }}>
      <Stack spacing={0.8}>
        <Typography variant="body2" fontWeight={600}>
          {comment.user?.name ?? 'User'} - {new Date(comment.created_at).toLocaleString()}
        </Typography>
        <Typography variant="body2">{comment.body}</Typography>

        {(comment.mentions ?? []).length > 0 && (
          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
            {(comment.mentions ?? []).map((mention) => (
              <Chip
                key={mention.id}
                size="small"
                variant="outlined"
                label={
                  mention.mentionedUser?.name ??
                  mention.mentioned_user?.name ??
                  mention.mentionedTeam?.name ??
                  mention.mentioned_team?.name ??
                  mention.token ??
                  '@mention'
                }
              />
            ))}
          </Stack>
        )}

        {(comment.attachments ?? []).length > 0 && (
          <List dense sx={{ py: 0 }}>
            {(comment.attachments ?? []).map((attachment) => (
              <ListItem key={attachment.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={attachment.file_name}
                  secondary={
                    <a href={`/api/snag-comment-attachments/${attachment.id}/download`} target="_blank" rel="noreferrer">
                      Download attachment
                    </a>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}

        {canComment && (
          <Button
            size="small"
            variant={commentParentId === comment.id ? 'contained' : 'text'}
            onClick={() => setCommentParentId(commentParentId === comment.id ? null : comment.id)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {commentParentId === comment.id ? 'Cancel Reply' : 'Reply'}
          </Button>
        )}

        {(comment.replies ?? []).length > 0 && (
          <Stack spacing={1}>
            {(comment.replies ?? []).map((reply) => renderCommentThread(reply, depth + 1))}
          </Stack>
        )}
      </Stack>
    </Box>
  )

  const uploadAttachment = async () => {
    if (!snag) {
      return
    }

    const payload = new FormData()
    payload.append('type', attachmentType)

    if (attachmentType === 'markup') {
      payload.append('markup_data', JSON.stringify({ strokes: [], source: 'web' }))
    }

    if (attachmentFile) {
      payload.append('file', attachmentFile)
    }

    setBusy(true)

    try {
      await api.post(`/api/snags/${snag.id}/attachments`, payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setAttachmentFile(null)
      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Attachment upload failed.'))
    } finally {
      setBusy(false)
    }
  }

  const initializeCloseout = async () => {
    if (!snag || !canCloseoutUpdate) {
      return
    }

    setBusy(true)

    try {
      await api.put(`/api/snags/${snag.id}/closeout`, {
        template_id: selectedTemplateId ? Number(selectedTemplateId) : undefined,
      })
      await Promise.all([loadCloseout(), loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to initialize closeout.'))
    } finally {
      setBusy(false)
    }
  }

  const updateCloseoutItem = async (item: CloseoutInstanceItem, isCompleted: boolean) => {
    if (!canCloseoutUpdate) {
      return
    }

    setBusy(true)

    try {
      const response = await api.patch<{ data: CloseoutInstance }>(`/api/closeout/items/${item.id}`, {
        is_completed: isCompleted,
        notes: itemNotes[item.id] ?? null,
      })
      setCloseout(response.data.data)
      await Promise.all([loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to update closeout item.'))
    } finally {
      setBusy(false)
    }
  }

  const uploadCloseoutEvidence = async (item: CloseoutInstanceItem) => {
    if (!canCloseoutUpdate) {
      return
    }

    const file = evidenceFiles[item.id]
    if (!file) {
      return
    }

    const payload = new FormData()
    payload.append('file', file)

    setBusy(true)

    try {
      await api.post(`/api/closeout/items/${item.id}/evidence`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setEvidenceFiles((current) => ({ ...current, [item.id]: null }))
      await Promise.all([loadCloseout(), loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to upload closeout evidence.'))
    } finally {
      setBusy(false)
    }
  }

  const reviewCloseout = async () => {
    if (!snag || !canCloseoutReview) {
      return
    }

    setBusy(true)

    try {
      await api.post(`/api/snags/${snag.id}/closeout/review`)
      await Promise.all([loadCloseout(), loadSnag(), onChanged()])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to review closeout.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 460, p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {snag && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">{snag.reference}</Typography>
              <Typography variant="subtitle1" fontWeight={700}>
                {snag.title}
              </Typography>
              <Typography color="text.secondary">{snag.description}</Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Status: ${snag.status}`} color="primary" />
              <Chip label={`Priority: ${snag.priority}`} color="secondary" />
              {(snag.rootCauseCategory ?? snag.root_cause_category) && (
                <Chip
                  label={`Root Cause: ${(snag.rootCauseCategory ?? snag.root_cause_category)?.name}`}
                  variant="outlined"
                />
              )}
              {typeof snag.estimated_cost === 'number' && <Chip label={`Est. Cost: ${snag.estimated_cost.toFixed(2)}`} variant="outlined" />}
              {typeof snag.estimated_hours === 'number' && <Chip label={`Est. Hours: ${snag.estimated_hours.toFixed(2)}`} variant="outlined" />}
            </Stack>

            {(snag.assignedCompany || snag.assigned_company || snag.assignedTeam || snag.assigned_team || snag.dispatch_note) && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(snag.assignedCompany ?? snag.assigned_company) && (
                  <Chip size="small" label={`Company: ${(snag.assignedCompany ?? snag.assigned_company)?.name}`} variant="outlined" />
                )}
                {(snag.assignedTeam ?? snag.assigned_team) && (
                  <Chip size="small" label={`Team: ${(snag.assignedTeam ?? snag.assigned_team)?.name}`} variant="outlined" />
                )}
                {(snag.dispatchRecipient ?? snag.dispatch_recipient) && (
                  <Chip
                    size="small"
                    label={`Dispatched: ${(snag.dispatchRecipient ?? snag.dispatch_recipient)?.name}`}
                    variant="outlined"
                  />
                )}
                {snag.dispatch_note && <Chip size="small" label={snag.dispatch_note} />}
              </Stack>
            )}

            {canTransition && (
              <Stack spacing={1} id="status-panel">
                <Typography variant="subtitle2">Change Status</Typography>
                <FormControl size="small">
                  <InputLabel id="transition-select-label">To status</InputLabel>
                  <Select
                    labelId="transition-select-label"
                    value={transitionTo}
                    label="To status"
                    onChange={(event) => setTransitionTo(event.target.value as SnagStatus)}
                  >
                    {availableTransitions.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {canAssign && (
                  <>
                    <FormControl size="small">
                      <InputLabel id="company-transition-label">Company</InputLabel>
                      <Select
                        labelId="company-transition-label"
                        value={transitionCompanyId}
                        label="Company"
                        onChange={(event) => {
                          const value = String(event.target.value)
                          setTransitionCompanyId(value)
                          if (transitionTeamId) {
                            const team = teams.find((item) => item.id === Number(transitionTeamId))
                            if (team?.company_id && team.company_id !== Number(value || 0)) {
                              setTransitionTeamId('')
                            }
                          }
                        }}
                      >
                        <MenuItem value="">No company</MenuItem>
                        {companies.map((company) => (
                          <MenuItem key={company.id} value={company.id}>
                            {company.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small">
                      <InputLabel id="team-transition-label">Team</InputLabel>
                      <Select
                        labelId="team-transition-label"
                        value={transitionTeamId}
                        label="Team"
                        onChange={(event) => setTransitionTeamId(String(event.target.value))}
                      >
                        <MenuItem value="">No team</MenuItem>
                        {availableTeams.map((team) => (
                          <MenuItem key={team.id} value={team.id}>
                            {team.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small">
                      <InputLabel id="assignee-transition-label">Assignee</InputLabel>
                      <Select
                        labelId="assignee-transition-label"
                        value={transitionAssigneeId}
                        label="Assignee"
                        onChange={(event) => setTransitionAssigneeId(String(event.target.value))}
                      >
                        <MenuItem value="">Unassigned</MenuItem>
                        {members.map((member) => (
                          <MenuItem key={member.id} value={member.id}>
                            {member.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}

                <TextField
                  size="small"
                  label="Transition note"
                  value={transitionNote}
                  onChange={(event) => setTransitionNote(event.target.value)}
                />

                <Button onClick={() => void applyTransition()} variant="contained" disabled={!transitionTo || busy}>
                  Apply Transition
                </Button>

                {canAssign && (
                  <Stack direction="row" spacing={1}>
                    <Button onClick={() => void saveAssignment()} variant="outlined" disabled={busy}>
                      Save Assignment
                    </Button>
                    <Button
                      onClick={() => void dispatchToPerson()}
                      variant="outlined"
                      disabled={busy || !transitionAssigneeId || (!transitionCompanyId && !transitionTeamId)}
                    >
                      Dispatch
                    </Button>
                  </Stack>
                )}
              </Stack>
            )}

            <Divider />

            {canCloseoutView && (
              <Stack spacing={1.5} id="closeout-panel">
                <Typography variant="subtitle2">Closeout</Typography>

                <Stack direction="row" justifyContent="space-between" alignItems="center" id="closeout-completion">
                  <Typography variant="body2">
                    Completion: <strong>{closeout?.completion_percentage ?? 0}%</strong>
                  </Typography>
                  <Chip
                    size="small"
                    label={closeout?.status ?? 'not_started'}
                    color={closeout?.completion_percentage === 100 ? 'success' : 'default'}
                  />
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={closeout?.completion_percentage ?? 0}
                  sx={{ height: 8, borderRadius: 8 }}
                />

                {canCloseoutUpdate && (
                  <Stack spacing={1} id="closeout-template">
                    <FormControl size="small">
                      <InputLabel id="closeout-template-label">Template</InputLabel>
                      <Select
                        labelId="closeout-template-label"
                        value={selectedTemplateId}
                        label="Template"
                        onChange={(event) => setSelectedTemplateId(String(event.target.value))}
                      >
                        {templates.map((template) => (
                          <MenuItem key={template.id} value={template.id}>
                            {template.name}
                            {template.is_library ? ' (Library)' : ''}
                            {template.discipline ? ` - ${template.discipline}` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Button variant="outlined" onClick={() => void initializeCloseout()} disabled={busy}>
                      {closeout ? 'Update Template' : 'Initialize Closeout'}
                    </Button>
                  </Stack>
                )}

                <Stack spacing={1} id="closeout-checklist">
                  {(closeout?.items ?? []).map((item) => (
                    <Box key={item.id} sx={{ border: '1px solid #E2E8F0', borderRadius: 2, p: 1.2 }}>
                      <Stack spacing={1}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
                          <Typography variant="body2" fontWeight={600}>
                            {item.title}
                          </Typography>
                          <Chip
                            size="small"
                            label={item.is_satisfied ? 'satisfied' : 'pending'}
                            color={item.is_satisfied ? 'success' : 'warning'}
                          />
                        </Box>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {item.required && <Chip size="small" variant="outlined" label="Required" />}
                          {item.evidence_required && <Chip size="small" variant="outlined" label="Evidence Required" />}
                        </Stack>

                        <TextField
                          size="small"
                          label="Notes"
                          value={itemNotes[item.id] ?? ''}
                          onChange={(event) =>
                            setItemNotes((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          disabled={!canCloseoutUpdate}
                        />

                        {canCloseoutUpdate && (
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant={item.is_completed ? 'outlined' : 'contained'}
                              onClick={() => void updateCloseoutItem(item, !item.is_completed)}
                              disabled={busy}
                            >
                              {item.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
                            </Button>
                          </Stack>
                        )}

                        <List dense sx={{ py: 0 }}>
                          {(item.evidences ?? []).map((evidence) => (
                            <ListItem key={evidence.id} sx={{ px: 0 }}>
                              <ListItemText
                                primary={evidence.file_name}
                                secondary={
                                  <a href={`/api/closeout/evidence/${evidence.id}/download`} target="_blank" rel="noreferrer">
                                    Download evidence
                                  </a>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>

                        {canCloseoutUpdate && (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button size="small" variant="outlined" component="label">
                              {evidenceFiles[item.id]?.name ?? 'Choose evidence'}
                              <input
                                hidden
                                type="file"
                                accept="image/*,video/*,.pdf"
                                onChange={(event) =>
                                  setEvidenceFiles((current) => ({
                                    ...current,
                                    [item.id]: event.target.files?.[0] ?? null,
                                  }))
                                }
                              />
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={!evidenceFiles[item.id] || busy}
                              onClick={() => void uploadCloseoutEvidence(item)}
                            >
                              Upload
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>

                {canCloseoutReview && closeout && closeout.completion_percentage === 100 && closeout.status !== 'reviewed' && (
                  <Button variant="contained" onClick={() => void reviewCloseout()} disabled={busy}>
                    Mark Reviewed
                  </Button>
                )}
              </Stack>
            )}

            <Divider />

            {canComment && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Watchers</Typography>

                <Stack direction="row" spacing={1}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="watcher-select-label">Add watcher</InputLabel>
                    <Select
                      labelId="watcher-select-label"
                      value={watcherUserId}
                      label="Add watcher"
                      onChange={(event) => setWatcherUserId(String(event.target.value))}
                    >
                      <MenuItem value="">Select member</MenuItem>
                      {members.map((member) => (
                        <MenuItem key={member.id} value={member.id}>
                          {member.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button variant="outlined" onClick={() => void addWatcher()} disabled={!watcherUserId || busy}>
                    Watch
                  </Button>
                </Stack>

                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                  {watcherUsers.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No watchers yet.
                    </Typography>
                  ) : (
                    watcherUsers.map((watcher) => (
                      <Chip
                        key={watcher.id}
                        label={watcher.name}
                        onDelete={() => void removeWatcher(watcher.id)}
                        size="small"
                      />
                    ))
                  )}
                </Stack>

                <Divider />

                <Typography variant="subtitle2">Comments</Typography>
                {commentParentId && (
                  <Chip
                    size="small"
                    color="info"
                    label={`Replying to #${commentParentId}`}
                    onDelete={() => setCommentParentId(null)}
                    sx={{ alignSelf: 'flex-start' }}
                  />
                )}

                <TextField
                  multiline
                  minRows={2}
                  size="small"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add a comment (supports @user:123 and @team:45)"
                />

                <FormControl size="small">
                  <InputLabel id="mention-users-label">Mention users</InputLabel>
                  <Select
                    labelId="mention-users-label"
                    multiple
                    value={mentionUserIds}
                    label="Mention users"
                    onChange={(event) => setMentionUserIds(event.target.value as string[])}
                    renderValue={(selected) =>
                      (selected as string[])
                        .map((id) => members.find((member) => member.id === Number(id))?.name ?? id)
                        .join(', ')
                    }
                  >
                    {members.map((member) => (
                      <MenuItem key={member.id} value={String(member.id)}>
                        {member.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small">
                  <InputLabel id="mention-teams-label">Mention teams</InputLabel>
                  <Select
                    labelId="mention-teams-label"
                    multiple
                    value={mentionTeamIds}
                    label="Mention teams"
                    onChange={(event) => setMentionTeamIds(event.target.value as string[])}
                    renderValue={(selected) =>
                      (selected as string[]).map((id) => teams.find((team) => team.id === Number(id))?.name ?? id).join(', ')
                    }
                  >
                    {teams.map((team) => (
                      <MenuItem key={team.id} value={String(team.id)}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button variant="outlined" component="label">
                  {commentFiles.length > 0 ? `${commentFiles.length} file(s) selected` : 'Attach files'}
                  <input
                    hidden
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf"
                    onChange={(event) => setCommentFiles(Array.from(event.target.files ?? []))}
                  />
                </Button>
                <Button variant="outlined" onClick={() => void addComment()} disabled={!commentBody.trim() || busy}>
                  Add Comment
                </Button>
                <Stack spacing={1}>
                  {(snag.comments ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No comments yet.
                    </Typography>
                  ) : (
                    (snag.comments ?? []).map((comment) => renderCommentThread(comment))
                  )}
                </Stack>
              </Stack>
            )}

            <Divider />

            {canAttach && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Attachments</Typography>
                <FormControl size="small">
                  <InputLabel id="attachment-type-label">Type</InputLabel>
                  <Select
                    labelId="attachment-type-label"
                    value={attachmentType}
                    label="Type"
                    onChange={(event) => setAttachmentType(event.target.value as 'photo' | 'video' | 'markup')}
                  >
                    <MenuItem value="photo">Photo</MenuItem>
                    <MenuItem value="video">Video</MenuItem>
                    <MenuItem value="markup">Markup</MenuItem>
                  </Select>
                </FormControl>

                <Button variant="outlined" component="label" disabled={attachmentType === 'markup'}>
                  {attachmentFile ? attachmentFile.name : 'Choose file'}
                  <input
                    hidden
                    type="file"
                    accept={attachmentType === 'video' ? 'video/*' : 'image/*,.pdf'}
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                  />
                </Button>

                <Button
                  variant="contained"
                  onClick={() => void uploadAttachment()}
                  disabled={(attachmentType !== 'markup' && !attachmentFile) || busy}
                >
                  Upload Attachment
                </Button>

                <List dense>
                  {(snag.attachments ?? []).map((attachment) => (
                    <ListItem key={attachment.id}>
                      <ListItemText
                        primary={`${attachment.type.toUpperCase()} - ${attachment.file_name ?? 'markup json'}`}
                        secondary={
                          attachment.file_path ? `Path: ${attachment.file_path}` : JSON.stringify(attachment.markup_data ?? {})
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Stack>
            )}

            <Divider />

            <Stack spacing={1} id="history-panel">
              <Typography variant="subtitle2">Status History</Typography>
              <List dense>
                {(snag.statusHistory ?? snag.status_history ?? []).map((history) => (
                  <ListItem key={history.id}>
                    <ListItemText
                      primary={`${history.from_status ?? 'none'} -> ${history.to_status}`}
                      secondary={`${history.changedBy?.name ?? 'User'} - ${new Date(history.created_at).toLocaleString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  )
}
