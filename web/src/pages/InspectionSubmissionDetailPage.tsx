import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { DynamicInspectionForm } from '../components/DynamicInspectionForm'
import { SignaturePad } from '../components/SignaturePad'
import { useAuth } from '../hooks/useAuth'
import { useFeatureTour } from '../hooks/useFeatureTour'
import { subscribeOrganizationChannel } from '../realtime/echo'
import type { InspectionApproval, InspectionApprovalMessage, InspectionSubmission } from '../types'

const statusColorMap: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  draft: 'default',
  submitted: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'error',
}

const extractError = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    const firstError = response?.data?.errors ? Object.values(response.data.errors).flat().at(0) : null
    return firstError ?? response?.data?.message ?? fallback
  }

  return fallback
}

export const InspectionSubmissionDetailPage = () => {
  const navigate = useNavigate()
  const { submissionId } = useParams<{ submissionId: string }>()
  const { activeOrganization, permissions } = useAuth()

  const canUpdate = permissions.includes('inspections.submissions.update')
  const canSubmit = permissions.includes('inspections.submissions.submit')
  const canReview = permissions.includes('inspections.approvals.review')
  const canSign = permissions.includes('inspections.signatures.sign')

  const [submission, setSubmission] = useState<InspectionSubmission | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [decisionNotes, setDecisionNotes] = useState('')
  const [approvalMessageBody, setApprovalMessageBody] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approvalsTourSteps = useMemo(
    () => [
      {
        id: 'approvals_timeline',
        title: 'Approval Timeline',
        text: 'Track each workflow step, acting role, and decision status.',
        attachTo: { element: '#approval-timeline', on: 'left' as const },
      },
      {
        id: 'approvals_actions',
        title: 'Approval Actions',
        text: 'Approve or reject the current step when your role is the active approver.',
        attachTo: { element: '#approval-actions', on: 'left' as const },
      },
      {
        id: 'approvals_signature',
        title: 'Digital Signature',
        text: 'Capture and upload signature for steps that require sign-off.',
        attachTo: { element: '#signature-panel', on: 'left' as const },
      },
    ],
    [],
  )

  useFeatureTour({
    tourKey: 'approvals',
    enabled: Boolean(submission),
    steps: approvalsTourSteps,
  })

  const numericSubmissionId = Number(submissionId)

  const loadSubmission = async () => {
    if (!numericSubmissionId) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await api.get<{ data: InspectionSubmission }>(`/api/inspections/submissions/${numericSubmissionId}`)
      setSubmission(response.data.data)
      setFormData((response.data.data.form_data as Record<string, unknown> | null) ?? {})
    } catch {
      setError('Unable to load inspection submission.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSubmission()
  }, [numericSubmissionId])

  useEffect(() => {
    if (!activeOrganization || !numericSubmissionId) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onInspection: (payload) => {
        if (Number(payload.inspection_submission_id ?? 0) === numericSubmissionId) {
          void loadSubmission()
        }
      },
    })

    return () => {
      unsubscribe()
    }
  }, [activeOrganization?.id, numericSubmissionId])

  const pendingApproval = useMemo<InspectionApproval | null>(() => {
    if (!submission?.approvals) {
      return null
    }

    return (
      [...submission.approvals]
        .sort((a, b) => a.step_order - b.step_order)
        .find((approval) => approval.status === 'pending') ?? null
    )
  }, [submission])

  const saveForm = async () => {
    if (!submission || !canUpdate) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const response = await api.put<{ data: InspectionSubmission }>(`/api/inspections/submissions/${submission.id}`, {
        form_data: formData,
      })
      setSubmission(response.data.data)
    } catch (requestError) {
      setError(extractError(requestError, 'Unable to update form data.'))
    } finally {
      setBusy(false)
    }
  }

  const submitForReview = async () => {
    if (!submission || !canSubmit) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const response = await api.post<{ data: InspectionSubmission }>(
        `/api/inspections/submissions/${submission.id}/submit`,
      )
      setSubmission(response.data.data)
    } catch (requestError) {
      setError(extractError(requestError, 'Unable to submit inspection.'))
    } finally {
      setBusy(false)
    }
  }

  const decide = async (decision: 'approve' | 'reject') => {
    if (!submission || !canReview) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const response = await api.post<{ data: InspectionSubmission }>(
        `/api/inspections/submissions/${submission.id}/approve`,
        {
          decision,
          notes: decisionNotes || undefined,
        },
      )
      setSubmission(response.data.data)
      setDecisionNotes('')
    } catch (requestError) {
      setError(extractError(requestError, `Unable to ${decision} this step.`))
    } finally {
      setBusy(false)
    }
  }

  const uploadSignature = async () => {
    if (!submission || !canSign || !signatureData) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const response = await api.post<{ data: InspectionSubmission }>(
        `/api/inspections/submissions/${submission.id}/signatures`,
        {
          signature_data: signatureData,
          approval_id: pendingApproval?.id,
          context: 'approval_step',
        },
      )
      setSubmission(response.data.data)
      setSignatureData(null)
    } catch (requestError) {
      setError(extractError(requestError, 'Unable to upload signature.'))
    } finally {
      setBusy(false)
    }
  }

  const postApprovalMessage = async () => {
    if (!submission || !approvalMessageBody.trim()) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await api.post(`/api/inspections/submissions/${submission.id}/approval-messages`, {
        body: approvalMessageBody,
        approval_id: pendingApproval?.id,
        message_type: 'comment',
      })
      setApprovalMessageBody('')
      await loadSubmission()
    } catch (requestError) {
      setError(extractError(requestError, 'Unable to post approval message.'))
    } finally {
      setBusy(false)
    }
  }

  const approvalMessages: InspectionApprovalMessage[] = submission?.approvalMessages ?? submission?.approval_messages ?? []

  if (!numericSubmissionId) {
    return <Alert severity="error">Invalid inspection submission id.</Alert>
  }

  if (loading && !submission) {
    return <Typography>Loading inspection submission...</Typography>
  }

  return (
    <Stack spacing={2}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {submission && (
        <>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
            <Box>
              <Typography variant="h4">{submission.reference}</Typography>
              <Typography color="text.secondary">
                {submission.template?.name} · {submission.project?.code ?? 'No project'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip color={statusColorMap[submission.status] ?? 'default'} label={submission.status} />
              <Button variant="outlined" onClick={() => navigate('/inspections/submissions')}>
                Back
              </Button>
              {canUpdate && (
                <Button variant="outlined" onClick={() => void saveForm()} disabled={busy}>
                  Save Draft
                </Button>
              )}
              {canSubmit && submission.status === 'draft' && (
                <Button variant="contained" onClick={() => void submitForReview()} disabled={busy}>
                  Submit
                </Button>
              )}
            </Stack>
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', lg: '1.4fr 0.8fr' }} gap={2}>
            <DynamicInspectionForm
              template={submission.template}
              value={formData}
              onChange={canUpdate ? setFormData : undefined}
              disabled={!canUpdate || !['draft', 'in_review'].includes(submission.status)}
            />

            <Stack spacing={1.5}>
              <Paper sx={{ p: 2 }} id="approval-timeline">
                <Typography variant="h6" gutterBottom>
                  Approvals Timeline
                </Typography>
                <List dense>
                  {(submission.approvals ?? []).map((approval) => (
                    <ListItem key={approval.id} sx={{ px: 0 }}>
                      <ListItemText
                        primary={`#${approval.step_order} ${approval.step_name ?? approval.role_name}`}
                        secondary={`${approval.role_name} · ${approval.status}${approval.acted_at ? ` · ${new Date(approval.acted_at).toLocaleString()}` : ''}`}
                      />
                      <Chip
                        size="small"
                        label={approval.status}
                        color={
                          approval.status === 'approved'
                            ? 'success'
                            : approval.status === 'rejected'
                              ? 'error'
                              : 'warning'
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Paper sx={{ p: 2 }} id="approval-actions">
                <Stack spacing={1.2}>
                  <Typography variant="h6">Approval Actions</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Current step:{' '}
                    {pendingApproval
                      ? `#${pendingApproval.step_order} ${pendingApproval.step_name ?? pendingApproval.role_name}`
                      : 'No pending step'}
                  </Typography>

                  <TextField
                    size="small"
                    label="Decision Notes"
                    value={decisionNotes}
                    onChange={(event) => setDecisionNotes(event.target.value)}
                    multiline
                    minRows={2}
                    disabled={!canReview || !pendingApproval || busy}
                  />

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="success"
                      disabled={!canReview || !pendingApproval || busy}
                      onClick={() => void decide('approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      disabled={!canReview || !pendingApproval || busy}
                      onClick={() => void decide('reject')}
                    >
                      Reject
                    </Button>
                  </Stack>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Stack spacing={1.2}>
                  <Typography variant="h6">Approval Chat Log</Typography>
                  <TextField
                    size="small"
                    label="Message"
                    value={approvalMessageBody}
                    onChange={(event) => setApprovalMessageBody(event.target.value)}
                    multiline
                    minRows={2}
                    disabled={busy}
                  />
                  <Button variant="outlined" disabled={!approvalMessageBody.trim() || busy} onClick={() => void postApprovalMessage()}>
                    Post Message
                  </Button>

                  <List dense>
                    {approvalMessages.length === 0 ? (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText primary="No chat messages yet." />
                      </ListItem>
                    ) : (
                      approvalMessages.map((message) => (
                        <ListItem key={message.id} sx={{ px: 0, alignItems: 'flex-start' }}>
                          <ListItemText
                            primary={`${message.user?.name ?? 'System'} · ${message.message_type}`}
                            secondary={`${message.body}${message.approval?.step_order ? ` · Step ${message.approval.step_order}` : ''} · ${new Date(message.created_at).toLocaleString()}`}
                          />
                        </ListItem>
                      ))
                    )}
                  </List>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2 }} id="signature-panel">
                <Stack spacing={1.2}>
                  <Typography variant="h6">Signature</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pendingApproval?.requires_signature
                      ? 'Current step requires digital signature.'
                      : 'No signature required for current step.'}
                  </Typography>

                  <SignaturePad onSignatureChange={setSignatureData} disabled={!canSign || !pendingApproval?.requires_signature || busy} />

                  <Button
                    variant="contained"
                    disabled={!canSign || !pendingApproval?.requires_signature || !signatureData || busy}
                    onClick={() => void uploadSignature()}
                  >
                    Upload Signature
                  </Button>

                  <Divider />

                  <Typography variant="subtitle2">Captured Signatures</Typography>
                  <List dense>
                    {(submission.signatures ?? []).map((signature) => (
                      <ListItem key={signature.id} sx={{ px: 0 }}>
                        <ListItemText
                          primary={`${signature.signer?.name ?? 'User'} · ${new Date(signature.signed_at).toLocaleString()}`}
                          secondary={signature.context}
                        />
                        <Button
                          size="small"
                          onClick={() => window.open(`/api/inspections/signatures/${signature.id}/download`, '_blank')}
                        >
                          Download
                        </Button>
                      </ListItem>
                    ))}
                  </List>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Typography variant="h6">Linked MIR/WIR/IR Requests</Typography>
                <List dense>
                  {(submission.requests ?? []).map((request) => (
                    <ListItem key={request.id} sx={{ px: 0 }}>
                      <ListItemText
                        primary={`${request.reference} · ${request.request_type.toUpperCase()} · ${request.status}`}
                        secondary={request.title}
                      />
                    </ListItem>
                  ))}
                </List>
                <Button size="small" variant="outlined" onClick={() => navigate('/inspections/requests')}>
                  Manage Requests
                </Button>
              </Paper>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  )
}
